import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { translations, type Lang } from "@/lib/i18n";

/* ─────────────────────────────────────────
   Toast
───────────────────────────────────────── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg =
    type === "success" ? "rgba(22,163,74,0.95)"
    : type === "error" ? "rgba(220,38,38,0.95)"
    : "rgba(30,64,175,0.95)";
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
    }}>{msg}</div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PvP АРЕНА
═══════════════════════════════════════════════════════════ */

interface ArenaPlayer { telegramId: string; username: string | null; stake: number; chance: number }

interface ArenaRoom {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  players: ArenaPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
  finishedAt: string | null;
  fair?: FairData;
  winnerSector?: { startDeg: number; endDeg: number } | null;
}

const ARENA_COLORS = [
  "#1d4ed8","#dc2626","#15803d","#b45309","#6d28d9",
  "#0e7490","#be185d","#065f46","#92400e","#3730a3",
];

const ARENA_QUICK_BETS = [1, 5, 10, 50];
const MIN_ARENA_BET = 0.1;

function buildSquarePath(cx: number, cy: number, hw: number, hh: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  
  const pts: [number, number][] = [[cx, cy]];
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / steps;
    const rad = toRad(a);
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const t = ax < 1e-9 ? hh / ay : ay < 1e-9 ? hw / ax : Math.min(hw / ax, hh / ay);
    pts.push([cx + t * dx, cy + t * dy]);
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function squareSectorCentroid(cx: number, cy: number, hw: number, hh: number, startDeg: number, endDeg: number): [number, number] {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const N = 24;
  let sx = cx, sy = cy; let count = 1;
  for (let i = 0; i <= N; i++) {
    const a = startDeg + (endDeg - startDeg) * i / N;
    const rad = toRad(a);
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const t = ax < 1e-9 ? hh / ay : ay < 1e-9 ? hw / ax : Math.min(hw / ax, hh / ay);
    sx += cx + t * dx; sy += cy + t * dy; count++;
  }
  return [sx / count, sy / count];
}

function ArenaBoard({ players, spinning, winnerId, winnerSector }: {
  players: ArenaPlayer[]; spinning: boolean; winnerId?: string | null; winnerSector?: { startDeg: number; endDeg: number } | null;
}) {
  const [ballPos, setBallPos] = useState({ x: 250, y: 250 });
  const ballStoppedRef = useRef(false);
  const ballTargetRef = useRef<{ x: number; y: number } | null>(null);
  const ballVelRef = useRef({ vx: 0, vy: 0 });
  const ballStartTimeRef = useRef<number | null>(null);
  const ballRafRef = useRef<number | null>(null);

  const SQ = 500; const CX = SQ / 2; const CY = SQ / 2; const HW = SQ / 2; const HH = SQ / 2; const BALL_R = 8; const INNER_R = 40;

  if (players.length === 0) {
    return (
      <div style={{ width: SQ, height: SQ, margin: "0 auto", background: "linear-gradient(135deg,#0f172a,#1e293b)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Ожидание игроков...</div>
        </div>
      </div>
    );
  }

  const totalPool = players.reduce((s, p) => s + p.stake, 0);
  let angle = 0;
  const sectors = players.map((p, i) => {
    const frac = totalPool > 0 ? p.stake / totalPool : 1 / players.length;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    const mid = start + frac * 180;
    const midRad = (mid - 90) * Math.PI / 180;
    const ax = CX + (HW * 0.55) * Math.sin(midRad);
    const ay = CY - (HH * 0.55) * Math.cos(midRad);
    return {
      points: buildSquarePath(CX, CY, HW, HH, start, end),
      color: ARENA_COLORS[i % ARENA_COLORS.length],
      ax, ay, p, start, end,
      centroid: squareSectorCentroid(CX, CY, HW, HH, start, end),
    };
  });

  useEffect(() => {
    if (spinning && winnerId && winnerSector) {
      ballTargetRef.current = sectors.find(s => s.p.telegramId === winnerId)?.centroid ?? null;
      ballStoppedRef.current = false;
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 1.5;
      ballVelRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
      ballStartTimeRef.current = performance.now();

      let active = true;
      const EDGE = 2;
      const ATTRACT_MS = 3500;

      const step = () => {
        if (!active) return;
        const elapsed = ballStartTimeRef.current ? performance.now() - ballStartTimeRef.current : 0;
        const pos = ballPos;
        let { vx, vy } = ballVelRef.current;

        if (elapsed >= ATTRACT_MS && ballTargetRef.current && !ballStoppedRef.current) {
          const dx = ballTargetRef.current.x - pos.x;
          const dy = ballTargetRef.current.y - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 2) {
            ballStoppedRef.current = true;
            setBallPos(ballTargetRef.current);
            return;
          }
          vx = dx * 0.12; vy = dy * 0.12;
          ballVelRef.current = { vx, vy };
          setBallPos({ x: pos.x + vx, y: pos.y + vy });
          ballRafRef.current = requestAnimationFrame(step);
          return;
        }

        vx *= 0.993; vy *= 0.993;
        let nx = pos.x + vx; let ny = pos.y + vy;
        if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx); }
        if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx); }
        if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy); }
        if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy); }
        ballVelRef.current = { vx, vy };
        setBallPos({ x: nx, y: ny });
        ballRafRef.current = requestAnimationFrame(step);
      };

      ballRafRef.current = requestAnimationFrame(step);
      return () => {
        active = false;
        if (ballRafRef.current) cancelAnimationFrame(ballRafRef.current);
      };
    }
  }, [spinning, winnerId, winnerSector]);

  return (
    <div style={{ width: SQ, height: SQ, margin: "0 auto", position: "relative", borderRadius: 12, overflow: "hidden", boxShadow: "0 0 40px rgba(245,158,11,0.3)" }}>
      <svg width={SQ} height={SQ} style={{ display: "block" }}>
        <rect x={0} y={0} width={SQ} height={SQ} fill="#0f172a" />
        {sectors.map((s, i) => (
          <polygon key={i} points={s.points} fill={s.color} opacity={0.85} stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
        ))}
        <circle cx={CX} cy={CY} r={INNER_R} fill="#050814" stroke="rgba(245,158,11,0.4)" strokeWidth="2" />
        {players.length > 0 && (
          <>
            <circle cx={ballPos.x} cy={ballPos.y} r={BALL_R + 4} fill="white" opacity="0.15" />
            <circle cx={ballPos.x} cy={ballPos.y} r={BALL_R} fill="white" stroke="rgba(255,255,255,0.5)" strokeWidth="1" style={{ filter: "drop-shadow(0 0 12px rgba(255,255,255,0.7))" }} />
          </>
        )}
      </svg>
      {sectors.map((s, i) => (
        <div key={i} style={{
          position: "absolute",
          left: s.ax - 16, top: s.ay - 16,
          width: 32, height: 32, borderRadius: "50%",
          background: s.color + (s.p.telegramId === winnerId ? "ff" : "40"),
          border: `2px solid ${s.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#fff",
          boxShadow: s.p.telegramId === winnerId ? `0 0 16px ${s.color}` : "none",
        }}>
          {(s.p.username ?? s.p.telegramId).slice(0, 1).toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function ArenaGame({ telegramId, tonBalance, onBalanceChange, onClose, onOpenHistory }: {
  telegramId: string; tonBalance: number; onBalanceChange: () => void; onClose: () => void; onOpenHistory?: () => void;
}) {
  const [room, setRoom] = useState<ArenaRoom | null>(null);
  const [stake, setStake] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [showFairness, setShowFairness] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const prevIdRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const handleUpdate = (fresh: ArenaRoom) => {
    const prev = prevStatusRef.current;
    const prevId = prevIdRef.current;
    if (
      fresh.status === "finished" && fresh.winnerId &&
      (prev === "starting" || prev === "waiting") &&
      prevId === fresh.id && !resolvedRef.current
    ) {
      resolvedRef.current = true;
      setSpinning(true);
      setTimeout(() => {
        setSpinning(false);
        const won = fresh.winnerId === telegramId;
        hapticNotify(won ? "success" : "error");
        if (won) flash(`🏆 Победа! +${fresh.players.find(p => p.telegramId === fresh.winnerId)?.stake ?? 0} TON`, "success");
        else flash("Другой игрок выиграл 💔", "info");
        onBalanceChange();
        setTimeout(() => { resolvedRef.current = false; }, 5000);
      }, 4200);
    }
    if (fresh.status !== "finished") prevIdRef.current = fresh.id;
    prevStatusRef.current = fresh.status;
    setRoom(fresh);
    if (fresh.status === "starting" && fresh.startAt) {
      setCountdown(Math.max(0, Math.ceil((new Date(fresh.startAt).getTime() - Date.now()) / 1000)));
    } else if (fresh.status !== "starting") {
      setCountdown(null);
    }
  };

  const fetchState = async () => {
    try { const r = await fetch("/api/mini/games/arena/state"); if (r.ok) handleUpdate(await r.json()); }
    catch { /* offline */ }
  };

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) {
        fetchState();
        const t1 = setTimeout(fetchState, 500);
        const t2 = setTimeout(fetchState, 1000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null && c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const joinArena = async () => {
    if (stake < MIN_ARENA_BET) { flash("Мин. 0.1 TON", "error"); return; }
    if (stake > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/arena/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d); onBalanceChange(); hapticNotify("success");
      flash("✅ Ставка сделана!", "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  const players = room?.players ?? [];
  const isIn = players.some(p => p.telegramId === telegramId);
  const myP = players.find(p => p.telegramId === telegramId);
  const othersPool = players.filter(p => p.telegramId !== telegramId).reduce((s, p) => s + p.stake, 0);
  const myWinPayout = myP ? Math.round((myP.stake + othersPool * 0.80) * 1000) / 1000 : 0;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0", marginBottom: 12 }}>
        <button onClick={onClose} style={{ background: "#151C26", border: "1px solid #222C3A", borderRadius: 10, padding: "7px 14px", color: "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ← Назад
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#E5E7EB" }}>⚔️ PvP Арена</div>
        <button onClick={() => setShowFairness(true)} style={{ marginLeft: "auto", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, padding: "6px 12px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
          🔐 Честность
        </button>
        <button onClick={onOpenHistory} style={{ background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, padding: "6px 12px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
          📋 История
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, paddingX: 16 }}>
        {[
          { label: "БАНК", val: (room?.totalPool ?? 0).toFixed(3) + " TON", col: "#fbbf24" },
          { label: "ИГРОКОВ", val: String(players.length), col: "#22d3ee" },
          { label: "МОЙ ШАНС", val: myP ? myP.chance.toFixed(1) + "%" : "—", col: "#4ade80" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 11, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {room?.status === "starting" && countdown !== null && (
        <div style={{ textAlign: "center", marginBottom: 12, paddingX: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>Спин через</div>
          <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: countdown <= 5 ? "#f87171" : "#60a5fa" }}>{countdown}</div>
        </div>
      )}

      <div style={{ paddingX: 16, marginBottom: 12 }}>
        <ArenaBoard players={players} spinning={spinning} winnerId={room?.winnerId} winnerSector={room?.winnerSector} />
      </div>

      {isIn && myP && players.length >= 2 && (
        <div style={{ background: "rgba(30,58,143,0.1)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, marginX: 16 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>💡 Если победишь</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Твоя ставка: <span style={{ color: "#94a3b8" }}>{myP.stake} TON</span></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Чужие (−20%): <span style={{ color: "#94a3b8" }}>{(othersPool * 0.80).toFixed(3)} TON</span></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>+{myWinPayout} TON</div>
          </div>
        </div>
      )}

      {!isIn && (
        <div style={{ marginBottom: 12, paddingX: 16 }}>
          <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>⚔️ Сделать ставку</div>
              <div style={{ fontSize: 12, color: "#334155" }}>Баланс: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{tonBalance.toFixed(3)} TON</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {ARENA_QUICK_BETS.map(v => (
                <button key={v} onClick={() => { haptic("light"); setStake(v); }} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit",
                  background: stake === v ? "linear-gradient(135deg,#d97706,#f59e0b)" : "rgba(30,45,69,0.8)",
                  color: stake === v ? "#fff" : "#64748b",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  boxShadow: stake === v ? "0 0 14px rgba(245,158,11,0.4)" : "none",
                  transition: "all 0.15s",
                }}>{v}</button>
              ))}
            </div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input value={stake} onChange={e => setStake(Math.max(MIN_ARENA_BET, parseFloat(e.target.value) || 0))}
                type="number" step="0.1" placeholder="Своя сумма..."
                style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 60px 10px 14px", color: "#f1f5f9", fontFamily: "inherit" }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#475569", fontWeight: 700 }}>TON</span>
            </div>
            <div style={{ background: "rgba(30,58,143,0.08)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#475569" }}>💡 Комиссия 20% только с чужих монет. Своя ставка возвращается всегда.</div>
            </div>
          </div>
          <button onClick={joinArena} disabled={busy || stake > tonBalance || stake < MIN_ARENA_BET} style={{
            width: "100%", padding: "16px 0", borderRadius: 13, border: "none", fontFamily: "inherit",
            background: stake > tonBalance ? "rgba(30,45,69,0.5)" : "linear-gradient(135deg,#d97706,#f59e0b)",
            color: stake > tonBalance ? "#334155" : "#fff",
            fontSize: 16, fontWeight: 800, cursor: stake > tonBalance ? "not-allowed" : "pointer",
            boxShadow: stake <= tonBalance ? "0 0 28px rgba(245,158,11,0.4)" : "none",
          }}>
            {busy ? "⏳..." : stake > tonBalance ? "Недостаточно TON" : `⚔️ Вступить · ${stake} TON`}
          </button>
        </div>
      )}

      {players.length > 0 && (
        <div style={{ paddingX: 16 }}>
          <div style={{ fontSize: 11, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", margin: "14px 0 8px" }}>
            УЧАСТНИКИ ({players.length})
          </div>
          {players.map((p, i) => {
            const isMe = p.telegramId === telegramId;
            const isWin = room?.winnerId === p.telegramId;
            return (
              <div key={p.telegramId} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(15,23,42,0.95)",
                border: `1px solid ${isWin ? "rgba(74,222,128,0.45)" : isMe ? "rgba(34,211,238,0.35)" : "rgba(30,58,143,0.2)"}`,
                borderRadius: 13, padding: "10px 14px", marginBottom: 7,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: ARENA_COLORS[i % ARENA_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff" }}>
                  {(p.username ?? p.telegramId).slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isWin ? "#4ade80" : "#e2e8f0" }}>
                    {p.username ? "@" + p.username : "#" + p.telegramId.slice(-5)}
                    {isMe && <span style={{ color: "#22d3ee" }}> · ты</span>}
                    {isWin && " 🏆"}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 4, height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(30,45,69,0.6)" }}>
                    <div style={{ width: `${p.chance}%`, background: ARENA_COLORS[i % ARENA_COLORS.length], borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{p.stake} TON</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{p.chance.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showFairness && room?.fair && (
        <FairnessModal
          fair={room.fair}
          status={room.status}
          gameType="arena"
          gameId={room.id}
          onClose={() => setShowFairness(false)}
          onClientSeedChanged={(seed) => setRoom(r => r ? { ...r, fair: { ...r.fair!, clientSeed: seed } } : r)}
        />
      )}
    </div>
  );
}

export default ArenaGame;
