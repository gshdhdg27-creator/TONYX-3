import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
} from "@workspace/api-client-react";

const W = 352;
const H = 352;
const BALL_R = 13;
const MARGIN = 6;
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 2, 5, 10];
const SPIN_MS = 7200;
const COLORS = [
  "#22c55e", "#ef4444", "#f59e0b", "#06b6d4",
  "#a855f7", "#eab308", "#ec4899", "#14b8a6",
  "#f97316", "#3b82f6",
];

interface ArenaPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
}
interface ArenaState {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  players: ArenaPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
}
type Phase = "lobby" | "spin" | "winner";
interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange?: (v?: number) => void;
  onClose: () => void;
  onOpenHistory?: () => void;
}
type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
};

function haptic(type: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type); } catch { /* */ }
}
function hapticNotify(type: "success" | "error" | "warning") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type); } catch { /* */ }
}
function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number) { return COLORS[i % COLORS.length]; }
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = players.filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return list.map((p, i) => {
    const share = p.stake / total;
    const x0 = acc * W;
    acc += share;
    const x1 = i === list.length - 1 ? W : acc * W;
    return { ...p, color: colorFor(i), index: i, share, x0, x1, midX: (x0 + x1) / 2 };
  });
}

const CSS = `
@keyframes arPulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes arPop{0%{opacity:0;transform:translateY(16px) scale(.94)}100%{opacity:1;transform:none}}
.ar-board{position:relative;border-radius:22px;overflow:hidden;background:#08080f}
.ar-board::before{content:"";position:absolute;inset:0;border-radius:22px;pointer-events:none;box-shadow:inset 0 0 0 3px rgba(255,255,255,.12),inset 0 0 0 6px rgba(0,0,0,.35);z-index:4}
.ar-strip-gloss{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.05) 18%,transparent 42%,rgba(0,0,0,.12));pointer-events:none}
.ar-puck-shadow{position:absolute;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%);pointer-events:none;z-index:5;transform:translate(-50%,-50%)}
`;

export default function ArenaGame({ telegramId, tonBalance, onBalanceChange, onClose }: Props) {
  const qc = useQueryClient();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  } as Parameters<typeof useGetUserProfile>[1]);
  const balanceTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0);
  const refreshBalance = useCallback(() => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    onBalanceChange?.();
  }, [qc, telegramId, onBalanceChange]);

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [winnerData, setWinnerData] = useState<{
    name: string; payout: number; mult: number; photo?: string | null; color: string;
  } | null>(null);
  const [freezeStrips, setFreezeStrips] = useState<Strip[] | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [boardZoom, setBoardZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [puckVisible, setPuckVisible] = useState(false);
  const [puckPos, setPuckPos] = useState({ x: W / 2, y: H / 2 });
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([]);
  const [flashWall, setFlashWall] = useState(false);

  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const trailId = useRef(0);
  const lastHitRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { arenaIdRef.current = arena?.id ?? null; }, [arena?.id]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) { setCountdown(0); return; }
    const update = () => {
      const ms = new Date(arena.startAt!).getTime() - Date.now();
      setCountdown(Math.max(0, Math.ceil(ms / 1000)));
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [arena?.status, arena?.startAt]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPuckPos({ x: W / 2, y: H / 2 });
    setWinnerData(null); setFreezeStrips(null); setFreezePool(0);
    setBoardZoom(1); setZoomOrigin("50% 50%");
    setPuckVisible(false); setTrail([]); setFlashWall(false);
  }

  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const strips = buildStrips(data.players);
    const winner = strips.find((s) => s.telegramId === data.winnerId) ?? strips[0];
    if (!winner) return;
    setFreezeStrips(strips); setFreezePool(data.totalPool);
    setPhase("spin"); setWinnerData(null); setBoardZoom(1);
    setPuckVisible(true); setTrail([]); haptic("medium");

    const pad = 14;
    const stripW = Math.max(8, winner.x1 - winner.x0);
    const tx = winner.x0 + Math.min(stripW / 2, pad) + Math.random() * Math.max(4, stripW - Math.min(stripW / 2, pad) * 2);
    const ty = pad + Math.random() * (H - pad * 2);
    let x = MARGIN + BALL_R + Math.random() * (W - 2 * (MARGIN + BALL_R));
    let y = MARGIN + BALL_R + Math.random() * (H - 2 * (MARGIN + BALL_R));
    const dir = Math.random() * Math.PI * 2;
    let vx = Math.cos(dir) * (18 + Math.random() * 6);
    let vy = Math.sin(dir) * (18 + Math.random() * 6);
    setPuckPos({ x, y });

    const startTime = performance.now();
    let last = startTime;
    let lastTrail = 0;
    const lo = MARGIN + BALL_R;
    const hiX = W - MARGIN - BALL_R;
    const hiY = H - MARGIN - BALL_R;

    const hitWall = () => {
      const now = performance.now();
      if (now - lastHitRef.current > 80) {
        lastHitRef.current = now; haptic("light");
        setFlashWall(true); setTimeout(() => setFlashWall(false), 70);
      }
    };

    const step = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.min(1, elapsed / SPIN_MS);
      if (raw >= 1) {
        setPuckPos({ x: tx, y: ty });
        setZoomOrigin(`${(tx / W) * 100}% ${(ty / H) * 100}%`);
        setBoardZoom(1.65); setPhase("winner"); hapticNotify("success");
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult = winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout, mult, photo: winner.photoUrl, color: winner.color,
        });
        rafRef.current = null;
        setTimeout(() => { setPhase("lobby"); resetAnim(); fetchState(); refreshBalance(); }, 3800);
        return;
      }
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      let friction = 0.999;
      if (raw > 0.35) friction = 0.994;
      if (raw > 0.55) friction = 0.985;
      if (raw > 0.72) friction = 0.955;
      if (raw > 0.88) friction = 0.88;
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);
      if (raw < 0.7) {
        const spd = Math.hypot(vx, vy);
        const minSpd = 8 - raw * 6;
        if (spd < minSpd && spd > 0.1) { vx = (vx / spd) * minSpd; vy = (vy / spd) * minSpd; }
      }
      if (raw > 0.68) {
        const t = (raw - 0.68) / 0.32;
        const pull = t * t * 4.5;
        const dx = tx - x; const dy = ty - y;
        const dist = Math.hypot(dx, dy) || 1;
        vx += (dx / dist) * pull; vy += (dy / dist) * pull;
      }
      x += vx * dt * 60; y += vy * dt * 60;
      if (x < lo) { x = lo; vx = Math.abs(vx) * 0.96; hitWall(); }
      if (x > hiX) { x = hiX; vx = -Math.abs(vx) * 0.96; hitWall(); }
      if (y < lo) { y = lo; vy = Math.abs(vy) * 0.96; hitWall(); }
      if (y > hiY) { y = hiY; vy = -Math.abs(vy) * 0.96; hitWall(); }
      setPuckPos({ x, y });
      if (now - lastTrail > 28) {
        lastTrail = now;
        const id = ++trailId.current;
        setTrail((prev) => [...prev.slice(-28), { x, y, id }]);
      }
      if (raw > 0.8) {
        const k = (raw - 0.8) / 0.2;
        const ease = 1 - Math.pow(1 - k, 2);
        setZoomOrigin(`${(x / W) * 100}% ${(y / H) * 100}%`);
        setBoardZoom(1 + ease * 0.6);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const d = (await r.json()) as ArenaState;
      if (phaseRef.current === "lobby") setArena(d);
      else if (d.status === "finished" && d.id === arenaIdRef.current) setArena(d);
      if (d.status === "finished" && d.winnerId && !settledRef.current.has(d.id) && phaseRef.current === "lobby") {
        settledRef.current.add(d.id); setArena(d); runSpinAnimation(d);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 700);
    return () => { clearInterval(t); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [fetchState]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) return;
    const ms = new Date(arena.startAt).getTime() - Date.now();
    if (ms > 35000) return;
    const t = setTimeout(() => fetchState(), Math.max(0, ms + 80));
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  const liveStrips = useMemo(() => buildStrips(arena?.players ?? []), [arena?.players]);
  const strips = freezeStrips ?? liveStrips;
  const pool = freezeStrips ? freezePool : (arena?.totalPool ?? 0);
  const meIn = arena?.players.some((p) => p.telegramId === telegramId);

  async function placeBet(amount: number) {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    if (phase !== "lobby") { flash("Дождитесь окончания", "err"); return; }
    if (arena?.status === "finished") { flash("Игра завершена…", "err"); return; }
    if (!amount || amount < MIN_STAKE) { flash(`Мин. ${MIN_STAKE}`, "err"); return; }
    if (amount > balanceTon + 1e-9) { flash("Недостаточно TON", "err"); return; }
    setBusy(true); haptic("light");
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me ? { telegramId, additionalStake: amount } : { telegramId, stake: amount };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d as ArenaState); refreshBalance();
      flash(me ? `+${amount} TON` : `Ставка ${amount} TON`, "ok");
    } catch { flash("Сеть", "err"); }
    finally { setBusy(false); }
  }

  const statusLabel =
    phase === "spin" ? "Шайба в игре…" :
    phase === "winner" ? "Победитель!" :
    arena?.status === "starting" ? (countdown > 0 ? `Старт через ${countdown}с` : "Скоро старт…") :
    (arena?.players.length ?? 0) < 2 ? "Ждём игроков…" : "Набор ставок";
  const canBet = phase === "lobby" && arena?.status !== "finished";

  return (
    <div style={root}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(34,197,94,0.12), transparent 60%)" }} />
      <div style={header}>
        <button type="button" onClick={onClose} style={backBtn}>←</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#86efac", fontWeight: 800, letterSpacing: "0.14em" }}>ARENA</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.1 }}>
            {pool.toFixed(2)}
            <span style={{ color: "#4ade80", fontSize: 13, marginLeft: 6, fontWeight: 800 }}>TON</span>
          </div>
        </div>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ ...statusPill, animation: phase === "spin" ? "arPulse 1s ease-in-out infinite" : undefined }}>{statusLabel}</span>
      </div>
      <div style={boardWrap}>
        <div className="ar-board" style={{
          width: W, height: H, transform: `scale(${boardZoom})`, transformOrigin: zoomOrigin,
          transition: phase === "winner" ? "transform 0.55s cubic-bezier(0.22,1,0.36,1)" : "none",
          boxShadow: flashWall ? "0 0 0 2px rgba(255,255,255,0.45)" : "0 0 0 1px rgba(255,255,255,0.1), 0 24px 60px rgba(0,0,0,0.55)",
        }}>
          {strips.length === 0 ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontWeight: 700, fontSize: 14, zIndex: 2 }}>
              Сделайте первую ставку
            </div>
          ) : strips.map((s) => {
            const width = Math.max(2, s.x1 - s.x0);
            const av = Math.min(52, Math.max(26, width - 10));
            return (
              <div key={s.telegramId} style={{
                position: "absolute", left: s.x0, top: 0, width, height: "100%",
                background: `linear-gradient(180deg, ${s.color}, ${s.color}cc)`,
                borderRight: "1px solid rgba(0,0,0,0.28)", display: "flex", flexDirection: "column",
                alignItems: "center", paddingTop: 14, boxSizing: "border-box", overflow: "hidden", zIndex: 1,
                transition: phase === "lobby" ? "left .35s ease, width .35s ease" : "none",
              }}>
                <div className="ar-strip-gloss" />
                <div style={{
                  width: av, height: av, borderRadius: "50%", border: "3px solid #fff", overflow: "hidden",
                  background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: av * 0.32, color: "#fff", flexShrink: 0, zIndex: 1,
                }}>
                  {s.photoUrl ? <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(s.username, s.telegramId)}
                </div>
                {width > 48 && (
                  <>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: "#fff", maxWidth: width - 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", zIndex: 1 }}>
                      {(s.username || s.telegramId).replace(/^@/, "").slice(0, 10)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: "#fff", zIndex: 1 }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.75)", zIndex: 1 }}>{s.stake.toFixed(2)}</div>
                  </>
                )}
              </div>
            );
          })}
          {(puckVisible || phase === "spin" || phase === "winner") && (
            <>
              <div className="ar-puck-shadow" style={{ left: puckPos.x, top: puckPos.y + BALL_R + 4, width: BALL_R * 2.4, height: BALL_R * 0.7 }} />
              <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}>
                <defs>
                  <radialGradient id="puckGrad" cx="35%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#fff" /><stop offset="55%" stopColor="#e8e8ef" /><stop offset="100%" stopColor="#9ca3af" />
                  </radialGradient>
                </defs>
                {trail.map((t, i) => {
                  const k = (i + 1) / trail.length;
                  return <circle key={t.id} cx={t.x} cy={t.y} r={2 + k * 5} fill="#fff" opacity={0.05 + k * 0.4} />;
                })}
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R + 8} fill="rgba(255,255,255,0.12)" />
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R} fill="url(#puckGrad)" stroke="rgba(0,0,0,0.2)" strokeWidth={1.2} />
                <ellipse cx={puckPos.x - 3} cy={puckPos.y - 4} rx={5} ry={3.5} fill="rgba(255,255,255,0.75)" />
              </svg>
            </>
          )}
        </div>
      </div>

      <div style={playersCard}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.08em", marginBottom: 6 }}>ИГРОКИ · {strips.length}</div>
        {strips.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Пока никого</div>
        ) : strips.map((s) => (
          <div key={s.telegramId} style={playerRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: s.telegramId === telegramId ? "#4ade80" : "#e2e8f0" }}>
                {(s.username || s.telegramId).replace(/^@/, "").slice(0, 14)}{s.telegramId === telegramId ? " (вы)" : ""}
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{s.stake.toFixed(2)} TON</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>

      <div style={betRow}>
        {DEFAULT_BETS.map((v) => (
          <button key={v} type="button" disabled={busy || !canBet} onClick={() => placeBet(v)}
            style={{ ...chip, opacity: busy || !canBet ? 0.45 : 1, cursor: busy || !canBet ? "not-allowed" : "pointer" }}>
            {v}
          </button>
        ))}
      </div>
      <div style={balanceLine}>
        Баланс: <span style={{ color: "#4ade80", fontWeight: 800 }}>{balanceTon.toFixed(2)} TON</span>
        {meIn ? " · можно докинуть" : ""}
      </div>

      {phase === "winner" && winnerData && (
        <div style={winnerOverlay}>
          <div style={{ ...winnerSheet, animation: "arPop 0.4s ease-out" }}>
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: "#86efac", letterSpacing: "0.12em" }}>ПОБЕДИТЕЛЬ</div>
            <div style={{ margin: "14px auto 0", width: 64, height: 64, borderRadius: "50%", border: `3px solid ${winnerData.color}`, overflow: "hidden", background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 22, color: "#fff" }}>
              {winnerData.photo ? <img src={winnerData.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(winnerData.name, "?")}
            </div>
            <div style={{ textAlign: "center", marginTop: 10, fontWeight: 900, fontSize: 18 }}>{winnerData.name.replace(/^@/, "")}</div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 28, fontWeight: 900, color: "#4ade80" }}>+{winnerData.payout.toFixed(2)} TON</div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>×{winnerData.mult}</div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ ...toastStyle, background: toast.type === "ok" ? "rgba(22,101,52,0.95)" : "rgba(127,29,29,0.95)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

const root: CSSProperties = { position: "relative", minHeight: "100%", paddingBottom: 28, color: "#fff", fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', overflowX: "hidden" };
const header: CSSProperties = { display: "flex", alignItems: "center", padding: "12px 12px 4px", position: "relative", zIndex: 2 };
const backBtn: CSSProperties = { width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const statusPill: CSSProperties = { display: "inline-block", padding: "6px 14px", borderRadius: 999, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", color: "#86efac", fontWeight: 800, fontSize: 12 };
const boardWrap: CSSProperties = { display: "flex", justifyContent: "center", margin: "0 12px 6px", position: "relative", zIndex: 1 };
const playersCard: CSSProperties = { margin: "16px 14px 0", background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))", borderRadius: 18, padding: 14, border: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 1 };
const playerRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };
const betRow: CSSProperties = { margin: "16px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 1 };
const chip: CSSProperties = { padding: "12px 15px", borderRadius: 14, border: "1px solid rgba(34,197,94,0.28)", background: "rgba(34,197,94,0.12)", color: "#4ade80", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const balanceLine: CSSProperties = { textAlign: "center", marginTop: 12, fontSize: 12, color: "#94a3b8", fontWeight: 600, position: "relative", zIndex: 1 };
const winnerOverlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500 };
const winnerSheet: CSSProperties = { width: "100%", maxWidth: 420, background: "linear-gradient(180deg,#0f1f16,#0a120e)", borderRadius: "24px 24px 0 0", padding: "26px 18px 40px" };
const toastStyle: CSSProperties = { position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "11px 18px", borderRadius: 14, fontWeight: 700, zIndex: 700, boxShadow: "0 10px 30px rgba(0,0,0,0.4)" };
