import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

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
  winnerSector: { startDeg: number; endDeg: number } | null;
  startAt: string | null;
  serverSeedHash?: string | null;
  clientSeed?: string | null;
}

type Phase = "lobby" | "arrow" | "travel" | "winner";

interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange?: (v?: number) => void;
  onClose: () => void;
  onOpenHistory?: () => void;
}

const COLORS = [
  "#3b82f6", "#a855f7", "#22d3ee", "#f59e0b", "#ef4444",
  "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#eab308",
];
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.14, 10];

function initials(name: string | null | undefined, id: string) {
  const s = (name || id || "?").replace(/^@/, "");
  return s.slice(0, 2).toUpperCase();
}

function colorFor(i: number) {
  return COLORS[i % COLORS.length];
}

function buildSectors(players: ArenaPlayer[]) {
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return players.map((p, i) => {
    const share = p.stake / total;
    const start = acc * 360;
    acc += share;
    const end = acc * 360;
    const mid = (start + end) / 2;
    return { ...p, share, start, end, mid, color: colorFor(i), index: i };
  });
}

function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function ArenaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
  onClose,
  onOpenHistory,
}: Props) {
  const { photoUrl } = useTelegram();
  const qc = useQueryClient();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  } as Parameters<typeof useGetUserProfile>[1]);
  const balance = Number(
    (profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0,
  );

  const refreshBalance = useCallback(() => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    onBalanceChange?.();
  }, [qc, telegramId, onBalanceChange]);

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [boardRot, setBoardRot] = useState(0);
  const [ballAngle, setBallAngle] = useState(0);
  const [ballR, setBallR] = useState(0);
  const [arrowRot, setArrowRot] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [winnerData, setWinnerData] = useState<{ name: string; payout: number; mult: number } | null>(null);

  const [bets, setBets] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("arena_bets");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return DEFAULT_BETS;
  });
  const [hideAllIn, setHideAllIn] = useState(false);
  const [showBetEdit, setShowBetEdit] = useState(false);
  const [editIdx, setEditIdx] = useState(0);
  const [editVal, setEditVal] = useState("");

  const [showAuto, setShowAuto] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [autoStake, setAutoStake] = useState(1);
  const [autoLeft, setAutoLeft] = useState(0);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [fairItem, setFairItem] = useState<any | null>(null);
  const [replaying, setReplaying] = useState(false);

  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const myPhoto = photoUrl;

  useEffect(() => {
    if (phase === "lobby") {
      setBallR(0);
      setBallAngle(0);
      setArrowRot(0);
      setZoom(1);
    }
  }, [phase]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const d = (await r.json()) as ArenaState;
      setArena(d);
      if (
        d.status === "finished" &&
        d.winnerId &&
        !settledRef.current.has(d.id) &&
        phase === "lobby" &&
        !replaying
      ) {
        settledRef.current.add(d.id);
        runSpinAnimation(d);
      }
    } catch { /* ignore */ }
  }, [phase, replaying]);

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 1500);
    return () => {
      clearInterval(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fetchState]);

  useEffect(() => {
    if (!autoOn || autoLeft <= 0 || phase !== "lobby" || busy) return;
    const a = arena;
    if (!a || a.status === "finished") return;
    const me = a.players.find((p) => p.telegramId === telegramId);
    if (me) return;
    (async () => {
      await placeBet(autoStake);
      setAutoLeft((n) => {
        const next = n - 1;
        if (next <= 0) setAutoOn(false);
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, autoLeft, phase, arena?.id, busy]);

  const sectors = useMemo(() => buildSectors(arena?.players ?? []), [arena?.players]);

  const conic = useMemo(() => {
    if (!sectors.length) return "conic-gradient(from -90deg, #1e293b 0deg 360deg)";
    let acc = 0;
    const parts = sectors.map((s) => {
      const a = acc;
      acc += s.share * 360;
      return `${s.color} ${a}deg ${acc}deg`;
    });
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }, [sectors]);

  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const secs = buildSectors(data.players);
    const winner = secs.find((s) => s.telegramId === data.winnerId) ?? secs[0];
    if (!winner) return;

    let mid = winner.mid;
    if (data.winnerSector) {
      mid = (data.winnerSector.startDeg + data.winnerSector.endDeg) / 2;
    }
    const spins = 5;
    const targetRot = spins * 360 + (360 - (mid % 360));

    setPhase("arrow");
    setZoom(1);
    setBallR(0.15);
    setBallAngle(0);
    setBoardRot(0);
    setArrowRot(0);
    setWinnerData(null);

    const arrowMs = 1400;
    const travelMs = 4200;
    const t0 = performance.now();

    const tick = (now: number) => {
      const elapsed = now - t0;
      if (elapsed < arrowMs) {
        const t = elapsed / arrowMs;
        setArrowRot(t * 720 + Math.sin(t * 20) * 30);
        setBallR(0.12 + t * 0.05);
        setPhase("arrow");
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const te = elapsed - arrowMs;
      if (te < travelMs) {
        const t = easeOutCubic(te / travelMs);
        setPhase("travel");
        setBoardRot(targetRot * t);
        setBallR(0.18 + 0.28 * Math.sin(t * Math.PI * 0.92));
        setBallAngle(mid);
        setZoom(1 + 0.25 * t);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      setBoardRot(targetRot);
      setBallR(0.32);
      setBallAngle(mid);
      setZoom(1.35);
      setPhase("winner");
      const pay = payoutOf(winner.stake, data.totalPool);
      const mult = winner.stake > 0 ? Math.round((pay / winner.stake) * 100) / 100 : 0;
      setWinnerData({
        name: data.winnerUsername || winner.username || winner.telegramId,
        payout: pay,
        mult,
      });
      if (!replaying) {
        setTimeout(() => {
          setPhase("lobby");
          setWinnerData(null);
          setZoom(1);
          setBoardRot(0);
          setBallR(0);
          fetchState();
          refreshBalance();
        }, 4500);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function placeBet(amount: number) {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    if (!amount || amount < MIN_STAKE) { flash(`Мин. ${MIN_STAKE} TON`, "err"); return; }
    if (amount > balance + 1e-9) { flash("Недостаточно TON", "err"); return; }
    setBusy(true);
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount }
        : { telegramId, stake: amount };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d);
      flash(me ? "Ставка увеличена" : "Вы в игре!", "ok");
      refreshBalance();
    } catch {
      flash("Сеть недоступна", "err");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    try {
      const r = await fetch("/api/mini/games/arena/history?limit=30");
      const d = await r.json();
      setHistory(Array.isArray(d) ? d : d.items ?? d.history ?? d.rooms ?? []);
    } catch {
      setHistory([]);
    }
  }

  async function openFair(id: number) {
    try {
      const r = await fetch(`/api/mini/games/arena/fair/${id}`);
      setFairItem(await r.json());
    } catch {
      flash("Не удалось загрузить", "err");
    }
  }

  function replayFromHistory(item: any) {
    const players: ArenaPlayer[] = (item.players ?? []).map((p: any) => ({
      telegramId: p.telegramId,
      username: p.username ?? null,
      stake: Number(p.stake),
      chance: Number(p.chance ?? 0),
      photoUrl: p.photoUrl ?? null,
    }));
    if (!players.length) return;
    const fake: ArenaState = {
      id: item.id ?? item.gameId ?? 0,
      status: "finished",
      totalPool: Number(item.totalPool ?? players.reduce((s, p) => s + p.stake, 0)),
      players,
      winnerId: item.winnerId ?? item.winnerTelegramId ?? players[0].telegramId,
      winnerUsername: item.winnerUsername ?? null,
      winnerSector: null,
      startAt: null,
    };
    setShowHistory(false);
    setReplaying(true);
    runSpinAnimation(fake);
    setTimeout(() => {
      setReplaying(false);
      setPhase("lobby");
      setWinnerData(null);
      setZoom(1);
      setBoardRot(0);
      setBallR(0);
    }, 7000);
  }

  const pool = arena?.totalPool ?? 0;
  const my = arena?.players.find((p) => p.telegramId === telegramId);
  const winnerPayoutPreview = pool > 0 ? Math.round(pool * (1 - COMMISSION) * 1000) / 1000 : 0;
  const countdown = arena?.startAt
    ? Math.max(0, Math.ceil((new Date(arena.startAt).getTime() - Date.now()) / 1000))
    : null;
  const isLive = arena?.status === "starting" || phase === "arrow" || phase === "travel";
  const showFx = phase === "arrow" || phase === "travel" || phase === "winner";

  function avatarStyle(midDeg: number, share: number): CSSProperties {
    const rad = ((midDeg - 90) * Math.PI) / 180;
    const r = 0.28 + Math.min(0.12, share * 0.25);
    const size = Math.max(28, Math.min(72, 28 + share * 90));
    const x = 50 + Math.cos(rad) * r * 100;
    const y = 50 + Math.sin(rad) * r * 100;
    return {
      position: "absolute",
      left: `${x}%`,
      top: `${y}%`,
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2px solid rgba(255,255,255,0.85)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
      background: "#0f172a",
      zIndex: 5,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.32,
      fontWeight: 800,
      color: "#e2e8f0",
    };
  }

  const ballRad = ((ballAngle - 90) * Math.PI) / 180;
  const ballX = 50 + Math.cos(ballRad) * ballR * 100;
  const ballY = 50 + Math.sin(ballRad) * ballR * 100;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "#0a0c12", color: "#e2e8f0",
      display: "flex", flexDirection: "column", fontFamily: "Inter, system-ui, sans-serif",
      overflow: "hidden", overscrollBehavior: "none",
    }}>
      <style>{`@keyframes arenaPop { from{transform:scale(.6);opacity:0} to{transform:scale(1);opacity:1} }`}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={btnGhost}>← Назад</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>⚔ PvP Арена</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Комиссия 20% · Provably Fair</div>
        </div>
        <button type="button" onClick={() => { setShowHistory(true); loadHistory(); onOpenHistory?.(); }} style={btnGhost}>История</button>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748b" }}>Баланс</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa" }}>{balance.toFixed(3)} TON</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0", flexShrink: 0 }}>
        <div style={pill}>Тотал <b style={{ color: "#38bdf8", marginLeft: 6 }}>{pool.toFixed(3)}</b><span style={{ marginLeft: 4, color: "#38bdf8" }}>TON</span></div>
        <div style={pill}>
          {isLive ? <span style={{ color: "#4ade80" }}>● LIVE</span>
            : countdown != null && countdown > 0 ? <span>Начало через {countdown}с</span>
            : <span style={{ color: "#94a3b8" }}>Ожидание ставок</span>}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, maxHeight: "min(52vh, 340px)", padding: "8px 12px" }}>
        <div style={{
          width: "min(100%, 300px)", height: "min(100%, 300px)", aspectRatio: "1 / 1",
          maxWidth: "min(92vw, 300px)", maxHeight: "min(52vh, 300px)",
          position: "relative", borderRadius: 22, overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.55)",
          transform: `scale(${zoom})`, transition: phase === "winner" ? "transform 0.4s ease" : "none",
        }}>
          <div style={{ position: "absolute", inset: 0, background: conic, transform: `rotate(${boardRot}deg)` }}>
            {sectors.map((s) => (
              <div key={s.telegramId} style={avatarStyle(s.mid, s.share)}>
                {s.photoUrl || (s.telegramId === telegramId ? myPhoto : null) ? (
                  <img src={(s.photoUrl || (s.telegramId === telegramId ? myPhoto : null))!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initials(s.username, s.telegramId)}
              </div>
            ))}
            {showFx && ballR > 0 && (
              <div style={{
                position: "absolute", left: `${ballX}%`, top: `${ballY}%`, width: 22, height: 22,
                marginLeft: -11, marginTop: -11, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, #fff 0%, #94a3b8 40%, #334155 100%)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.5)", zIndex: 8, border: "2px solid rgba(255,255,255,0.7)",
              }} />
            )}
          </div>

          {showFx && (
            <div style={{
              position: "absolute", left: "50%", top: "50%", width: 36, height: 36,
              marginLeft: -18, marginTop: -18, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.55)", background: "rgba(15,23,42,0.25)",
              zIndex: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)" }} />
            </div>
          )}

          {phase === "arrow" && (
            <div style={{
              position: "absolute", left: "50%", top: "50%", width: 70, height: 70,
              marginLeft: -35, marginTop: -35, zIndex: 13, transform: `rotate(${arrowRot}deg)`, pointerEvents: "none",
            }}>
              <div style={{
                position: "absolute", left: "50%", top: 0, width: 0, height: 0, marginLeft: -8,
                borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
                borderBottom: "22px solid #f8fafc", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
              }} />
            </div>
          )}

          {!sectors.length && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14, fontWeight: 600, zIndex: 4 }}>
              Ждём игроков…
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 14px 8px", flex: "0 0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
          <span>Игроки · {arena?.players.length ?? 0}</span>
          <span>Игра #{arena?.id ?? "—"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {sectors.slice().sort((a, b) => b.stake - a.stake).map((s) => (
            <div key={s.telegramId} style={{
              display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)",
              borderRadius: 12, padding: "8px 10px",
              border: s.telegramId === telegramId ? "1px solid rgba(56,189,248,0.45)" : "1px solid transparent",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {s.telegramId === telegramId ? "Вы" : `@${s.username || s.telegramId}`}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{(s.share * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{s.stake.toFixed(3)} TON</div>
            </div>
          ))}
        </div>
        {pool > 0 && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, textAlign: "center" }}>
            Победитель заберёт ~{winnerPayoutPreview.toFixed(3)} TON (после 20%)
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, background: "rgba(8,10,16,0.95)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={iconBtn} onClick={() => setShowBetEdit(true)}>✎</button>
          {bets.map((b) => (
            <button key={b} type="button" disabled={busy || showFx} onClick={() => placeBet(b)} style={betBtn}>
              {b} TON
            </button>
          ))}
          {!hideAllIn && (
            <button
              type="button"
              disabled={busy || showFx || balance < MIN_STAKE}
              onClick={() => placeBet(Math.floor(balance * 1000) / 1000)}
              style={{ ...betBtn, background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.4)" }}
            >
              Ва-банк
            </button>
          )}
          <button type="button" style={iconBtn} onClick={() => setShowAuto(true)}>↻</button>
        </div>
        {my && (
          <div style={{ fontSize: 12, color: "#38bdf8", marginTop: 8, textAlign: "center" }}>
            Ваша ставка: {my.stake.toFixed(3)} TON · можно докинуть
          </div>
        )}
        {autoOn && (
          <div style={{ fontSize: 11, color: "#a3e635", marginTop: 6, textAlign: "center" }}>
            Автоставка: {autoStake} TON · осталось {autoLeft}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "absolute", top: 64, left: 16, right: 16, zIndex: 50,
          background: toast.type === "ok" ? "rgba(5,150,105,0.95)" : "rgba(220,38,38,0.95)",
          color: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 600, textAlign: "center",
        }}>{toast.msg}</div>
      )}

      {phase === "winner" && winnerData && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(5,8,14,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}>
          <div style={{
            width: "100%", maxWidth: 360, background: "linear-gradient(180deg,#14532d 0%,#0f172a 100%)",
            borderRadius: 20, padding: "20px 16px", textAlign: "center", animation: "arenaPop 0.35s ease",
            border: "1px solid rgba(74,222,128,0.35)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>@{winnerData.name} выиграл</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#4ade80" }}>{winnerData.payout} TON</div>
            <div style={{ fontSize: 13, color: "#86efac", marginTop: 4 }}>×{winnerData.mult}</div>
          </div>
        </div>
      )}

      {showHistory && (
        <Sheet onClose={() => setShowHistory(false)} title="История игр">
          {history.length === 0 && <div style={{ color: "#64748b", textAlign: "center", padding: 24 }}>Пусто</div>}
          {history.map((item: any) => {
            const id = item.id ?? item.gameId;
            return (
              <div key={id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, color: "#4ade80" }}>{item.multiplier ?? item.mult ?? "—"}x</span>
                  <span style={{ color: "#64748b", fontSize: 12 }}>#{id}</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>@{item.winnerUsername ?? item.winnerId ?? "?"}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={smallBtn} onClick={() => replayFromHistory(item)}>Открыть повтор</button>
                  <button type="button" style={smallBtn} onClick={() => openFair(id)}>Проверка честности</button>
                </div>
              </div>
            );
          })}
        </Sheet>
      )}

      {fairItem && (
        <Sheet onClose={() => setFairItem(null)} title={`Игра #${fairItem.id ?? ""}`}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Хеш: {fairItem.serverSeedHash ?? fairItem.hash ?? "—"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>Сид: {fairItem.serverSeed ?? fairItem.seed ?? "—"}</div>
          {(fairItem.players ?? []).map((p: any) => (
            <div key={p.telegramId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
              <span>@{p.username || p.telegramId}{p.telegramId === fairItem.winnerId && <span style={{ color: "#4ade80", marginLeft: 6 }}>Победитель</span>}</span>
              <span>{Number(p.stake).toFixed(3)} TON</span>
            </div>
          ))}
          <button type="button" style={{ ...betBtn, width: "100%", marginTop: 16 }} onClick={() => setFairItem(null)}>Legit Check</button>
        </Sheet>
      )}

      {showBetEdit && (
        <Sheet onClose={() => setShowBetEdit(false)} title="Настроить кнопки">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {bets.map((b, i) => (
              <button key={i} type="button" onClick={() => { setEditIdx(i); setEditVal(String(b)); }}
                style={{ ...betBtn, borderColor: editIdx === i ? "#38bdf8" : "rgba(255,255,255,0.1)" }}>{b}</button>
            ))}
          </div>
          <input value={editVal} onChange={(e) => setEditVal(e.target.value.replace(",", "."))} inputMode="decimal" style={inputStyle} placeholder="Сумма TON" />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}>
            <input type="checkbox" checked={hideAllIn} onChange={(e) => setHideAllIn(e.target.checked)} />
            Скрывать «Ва-банк»
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" style={betBtn} onClick={() => { setBets(DEFAULT_BETS); setHideAllIn(false); }}>Сбросить</button>
            <button type="button" style={{ ...betBtn, background: "#2563eb", borderColor: "#2563eb", flex: 1 }} onClick={() => {
              const n = parseFloat(editVal);
              if (!n || n <= 0) { flash("Сумма должна быть больше 0", "err"); return; }
              const next = [...bets];
              next[editIdx] = Math.round(n * 1000) / 1000;
              setBets(next);
              localStorage.setItem("arena_bets", JSON.stringify(next));
              setShowBetEdit(false);
            }}>Сохранить</button>
          </div>
        </Sheet>
      )}

      {showAuto && (
        <Sheet onClose={() => setShowAuto(false)} title="Автоигра">
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>Размер одной ставки</div>
          <input value={String(autoStake)} onChange={(e) => setAutoStake(parseFloat(e.target.value) || 0)} inputMode="decimal" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[0.5, 1, 2, 5, 10].map((v) => (
              <button key={v} type="button" style={smallBtn} onClick={() => setAutoStake(v)}>{v}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", margin: "14px 0 8px" }}>Количество игр</div>
          <input value={String(autoLeft || 10)} onChange={(e) => setAutoLeft(parseInt(e.target.value || "0", 10))} inputMode="numeric" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" style={betBtn} onClick={() => { setAutoOn(false); setAutoLeft(0); setShowAuto(false); }}>Сбросить</button>
            <button type="button" style={{ ...betBtn, background: "#2563eb", borderColor: "#2563eb", flex: 1 }} onClick={() => {
              if (autoStake < MIN_STAKE) { flash(`Мин. ${MIN_STAKE}`, "err"); return; }
              setAutoOn(true);
              if (autoLeft <= 0) setAutoLeft(10);
              setShowAuto(false);
            }}>Запустить</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{
        width: "100%", maxHeight: "78%", overflowY: "auto", background: "#0f141c",
        borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 16px 28px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button type="button" onClick={onClose} style={btnGhost}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "7px 12px",
  color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const pill: CSSProperties = {
  background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "8px 12px", fontSize: 13, fontWeight: 600,
};
const betBtn: CSSProperties = {
  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12, padding: "12px 8px", color: "#e2e8f0", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const iconBtn: CSSProperties = { ...betBtn, flex: "0 0 42px", padding: "12px 0" };
const smallBtn: CSSProperties = {
  background: "rgba(37,99,235,0.25)", border: "1px solid rgba(37,99,235,0.45)", borderRadius: 10,
  padding: "8px 12px", color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const inputStyle: CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, padding: "12px 14px", color: "#f1f5f9", fontSize: 16, fontWeight: 700,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
