import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import {
  W, H, BALL_R, MARGIN, makeRng,
  planBouncePath, randomInStrip, randomStart, samplePath, pathDirection,
} from "./arenaPhysics";

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const SPIN_MS = 7000;
const DIR_MS = 900;
const WINNER_HOLD_MS = 3200;
const DEFAULT_CHIPS = [1, 5, 10, 25];
const CHIPS_KEY = "tonyx_arena_chips";
const COLORS = [
  "#22c55e", "#ef4444", "#f59e0b", "#06b6d4",
  "#a855f7", "#eab308", "#ec4899", "#14b8a6",
  "#f97316", "#3b82f6",
];

interface ArenaPlayer {
  telegramId: string; username: string | null; stake: number; chance: number; photoUrl?: string | null;
}
interface ArenaState {
  id: number; status: "waiting" | "starting" | "finished"; totalPool: number;
  players: ArenaPlayer[]; winnerId: string | null; winnerUsername: string | null; startAt: string | null;
  fair?: { serverSeed?: string | null; serverSeedHash?: string | null; clientSeed?: string | null; hash?: string | null; nonce?: number | null };
}
interface HistoryRoom {
  id: number; winnerId: string | null; winnerUsername: string | null; winnerPayout: number;
  totalPool: number; playerCount: number; players: ArenaPlayer[]; finishedAt: string | null;
  fair?: { serverSeed?: string | null; serverSeedHash?: string | null; clientSeed?: string | null; hash?: string | null };
}
type Phase = "lobby" | "spin" | "winner";
interface Props {
  telegramId: string; tonBalance: number; onBalanceChange?: (v?: number) => void;
  onClose: () => void; onOpenHistory?: () => void;
}
type Strip = ArenaPlayer & { color: string; index: number; share: number; x0: number; x1: number; midX: number };

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error" | "warning") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}
function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number) { return COLORS[i % COLORS.length]; }
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return list.map((p, i) => {
    const share = p.stake / total;
    const x0 = Math.round(acc * W * 1000) / 1000;
    acc += share;
    const x1 = i === list.length - 1 ? W : Math.round(acc * W * 1000) / 1000;
    return { ...p, color: colorFor(i), index: i, share, x0, x1, midX: (x0 + x1) / 2 };
  });
}
function loadChips(): number[] {
  try {
    const raw = localStorage.getItem(CHIPS_KEY);
    if (!raw) return [...DEFAULT_CHIPS];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 4 && arr.every((n) => typeof n === "number" && n > 0)) return arr;
  } catch { /* */ }
  return [...DEFAULT_CHIPS];
}
function animSeed(data: { id?: number; winnerId: string | null; totalPool: number; fair?: ArenaState["fair"]; players: ArenaPlayer[] }) {
  const stakes = data.players.map((p) => `${p.telegramId}:${p.stake}`).join("|");
  return [data.id ?? 0, data.winnerId ?? "", data.totalPool, data.fair?.hash ?? data.fair?.serverSeed ?? "", stakes].join("::");
}

const CSS = `
@keyframes arPulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes arPop{0%{opacity:0;transform:translateY(10px) scale(.96)}100%{opacity:1;transform:none}}
@keyframes arDir{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}
.ar-board{position:relative;border-radius:18px;overflow:hidden;background:#0a0a12}
.ar-board::before{content:"";position:absolute;inset:0;border-radius:18px;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),inset 0 0 0 5px rgba(0,0,0,.4);z-index:5}
.ar-strip-gloss{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,.04) 18%,transparent 42%,rgba(0,0,0,.12));pointer-events:none}
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
  const [winnerData, setWinnerData] = useState<{ name: string; payout: number; mult: number; photo?: string | null; color: string } | null>(null);
  const [freezeStrips, setFreezeStrips] = useState<Strip[] | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [boardZoom, setBoardZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [puckVisible, setPuckVisible] = useState(false);
  const [puckPos, setPuckPos] = useState({ x: W / 2, y: H / 2 });
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([]);
  const [dirAngle, setDirAngle] = useState(0);
  const [dirVisible, setDirVisible] = useState(false);
  const [winnerTag, setWinnerTag] = useState<string | null>(null);
  const [chips, setChips] = useState<number[]>(DEFAULT_CHIPS);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(0);
  const [editVal, setEditVal] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRoom[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fairInfo, setFairInfo] = useState<HistoryRoom | null>(null);
  const replayingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const trailId = useRef(0);
  const lastHitRef = useRef(0);
  const lastPosRef = useRef({ x: W / 2, y: H / 2 });

  useEffect(() => { setChips(loadChips()); }, []);
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
    setTimeout(() => setToast(null), 2000);
  };

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPuckPos({ x: W / 2, y: H / 2 });
    setWinnerData(null); setFreezeStrips(null); setFreezePool(0);
    setBoardZoom(1); setZoomOrigin("50% 50%");
    setPuckVisible(false); setTrail([]); setDirVisible(false); setWinnerTag(null);
  }

  function runSpinAnimation(data: {
    id?: number; players: ArenaPlayer[]; winnerId: string | null; winnerUsername: string | null;
    totalPool: number; fair?: ArenaState["fair"];
  }) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const strips = buildStrips(data.players);
    const winner = strips.find((s) => s.telegramId === data.winnerId) ?? strips[0];
    if (!winner) return;

    const rng = makeRng(animSeed(data));
    const start = randomStart(rng);
    const target = randomInStrip(winner, rng);
    const path = planBouncePath(start, target, rng);
    const dir = pathDirection(path);

    setFreezeStrips(strips); setFreezePool(data.totalPool);
    setPhase("spin"); setWinnerData(null); setBoardZoom(1);
    setPuckVisible(true); setTrail([]); setDirVisible(true); setDirAngle(dir);
    setWinnerTag(null); setPuckPos(start); lastPosRef.current = start;
    haptic("medium");

    const t0 = performance.now();
    let lastTrail = 0;
    let dirHidden = false;
    const winName = (data.winnerUsername || winner.username || winner.telegramId).replace(/^@/, "");

    const step = (now: number) => {
      const elapsed = now - t0;
      if (!dirHidden && elapsed > DIR_MS) { dirHidden = true; setDirVisible(false); }
      const play = Math.max(0, elapsed - DIR_MS * 0.55);
      const raw = Math.min(1, play / SPIN_MS);

      if (raw >= 1) {
        setPuckPos(target);
        setZoomOrigin(`${(target.x / W) * 100}% ${(target.y / H) * 100}%`);
        setBoardZoom(1.9);
        setPhase("winner"); setDirVisible(false); setWinnerTag(winName);
        hapticNotify("success");
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult = winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout, mult, photo: winner.photoUrl, color: winner.color,
        });
        rafRef.current = null;
        setTimeout(() => {
          if (!replayingRef.current) {
            setPhase("lobby"); resetAnim(); fetchState(); refreshBalance();
          } else {
            replayingRef.current = false; setPhase("lobby"); resetAnim();
          }
        }, WINNER_HOLD_MS);
        return;
      }

      const pos = samplePath(path, raw);
      const prev = lastPosRef.current;
      const near =
        pos.x <= MARGIN + BALL_R + 2 || pos.x >= W - MARGIN - BALL_R - 2 ||
        pos.y <= MARGIN + BALL_R + 2 || pos.y >= H - MARGIN - BALL_R - 2;
      if (near && Math.hypot(pos.x - prev.x, pos.y - prev.y) > 0.6 && now - lastHitRef.current > 100) {
        lastHitRef.current = now; haptic("light");
      }
      lastPosRef.current = pos;
      setPuckPos(pos);
      if (now - lastTrail > 36) {
        lastTrail = now;
        const id = ++trailId.current;
        setTrail((p) => [...p.slice(-20), { x: pos.x, y: pos.y, id }]);
      }
      if (raw > 0.72) {
        const k = (raw - 0.72) / 0.28;
        const ease = 1 - Math.pow(1 - k, 2);
        setZoomOrigin(`${(pos.x / W) * 100}% ${(pos.y / H) * 100}%`);
        setBoardZoom(1 + ease * 0.9);
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
      if (
        d.status === "finished" && d.winnerId &&
        !settledRef.current.has(d.id) && phaseRef.current === "lobby" && !replayingRef.current
      ) {
        settledRef.current.add(d.id);
        setArena(d);
        runSpinAnimation(d);
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
  const canBet = phase === "lobby" && (arena?.status === "waiting" || arena?.status === "starting");

  async function placeBet(amount: number) {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    if (!canBet) { flash("Сейчас нельзя ставить", "err"); return; }
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

  function openEdit() { setEditIdx(0); setEditVal(""); setEditOpen(true); }
  function applyEdit() {
    const n = parseFloat(editVal.replace(",", "."));
    if (isNaN(n) || n < MIN_STAKE) { flash(`Мин. ${MIN_STAKE}`, "err"); return; }
    const next = [...chips];
    next[editIdx] = Math.round(n * 1000) / 1000;
    setChips(next);
    try { localStorage.setItem(CHIPS_KEY, JSON.stringify(next)); } catch { /* */ }
    setEditOpen(false);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/mini/games/arena/history?limit=40");
      if (!r.ok) return;
      const d = await r.json();
      setHistory((d.rooms as HistoryRoom[]) ?? []);
    } catch { /* */ }
    finally { setHistoryLoading(false); }
  }
  function openHistory() { setShowHistory(true); setFairInfo(null); loadHistory(); }
  function replayRoom(room: HistoryRoom) {
    if (phase === "spin") return;
    if (!room.winnerId || !room.players?.length) return;
    setShowHistory(false); setFairInfo(null);
    replayingRef.current = true;
    settledRef.current.add(room.id);
    runSpinAnimation({
      id: room.id,
      players: room.players.map((p) => ({
        ...p,
        chance: room.totalPool > 0 ? Math.round((p.stake / room.totalPool) * 10000) / 100 : 0,
      })),
      winnerId: room.winnerId,
      winnerUsername: room.winnerUsername,
      totalPool: room.totalPool,
      fair: room.fair,
    });
  }

  const statusLabel =
    phase === "spin" ? "Шайба в игре…" :
    phase === "winner" ? "Победитель!" :
    arena?.status === "starting" ? (countdown > 0 ? `Старт через ${countdown}с` : "Скоро…") :
    (arena?.players.length ?? 0) < 2 ? "Ждём игроков…" : "Набор ставок";

  return (
    <div style={root}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 35% at 50% 0%, rgba(34,197,94,0.1), transparent 60%)" }} />
      <div style={header}>
        <button type="button" onClick={onClose} style={iconBtn}>←</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#86efac", fontWeight: 800, letterSpacing: "0.14em" }}>ARENA</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {pool.toFixed(2)} <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800 }}>TON</span>
          </div>
        </div>
        <button type="button" onClick={openHistory} style={iconBtn} title="История">⏱</button>
      </div>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <span style={{ ...statusPill, animation: phase === "spin" ? "arPulse 1s ease-in-out infinite" : undefined }}>{statusLabel}</span>
        {arena?.id != null && <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b", fontWeight: 700 }}>#{arena.id}</span>}
      </div>
      <div style={boardWrap}>
        <div className="ar-board" style={{
          width: W, height: H, transform: `scale(${boardZoom})`, transformOrigin: zoomOrigin,
          transition: phase === "winner" ? "transform 0.55s cubic-bezier(0.22,1,0.36,1)" : "none",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}>
          {strips.length === 0 ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontWeight: 700, fontSize: 14, zIndex: 2 }}>Сделайте первую ставку</div>
          ) : strips.map((s) => {
            const width = Math.max(2, s.x1 - s.x0);
            const av = Math.min(48, Math.max(22, width - 8));
            return (
              <div key={s.telegramId} style={{
                position: "absolute", left: s.x0, top: 0, width, height: "100%", background: s.color,
                borderRight: "1px solid rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", alignItems: "center",
                paddingTop: 12, boxSizing: "border-box", overflow: "hidden", zIndex: 1,
                transition: phase === "lobby" ? "left .3s ease, width .3s ease" : "none",
              }}>
                <div className="ar-strip-gloss" />
                <div style={{
                  width: av, height: av, borderRadius: "50%", border: "2.5px solid #fff", overflow: "hidden",
                  background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: av * 0.3, color: "#fff", flexShrink: 0, zIndex: 1, boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                }}>
                  {s.photoUrl ? <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(s.username, s.telegramId)}
                </div>
                {width > 40 && (
                  <>
                    <div style={{ marginTop: 6, fontSize: 11, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.5)", maxWidth: width - 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", zIndex: 1 }}>
                      {(s.username || s.telegramId).replace(/^@/, "").slice(0, 9)}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.95)", zIndex: 1 }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.75)", zIndex: 1 }}>{s.stake.toFixed(2)}</div>
                  </>
                )}
              </div>
            );
          })}
          {(puckVisible || phase === "spin" || phase === "winner") && (
            <>
              <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}>
                <defs>
                  <radialGradient id="puckG" cx="35%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#fff" /><stop offset="45%" stopColor="#e8e8ef" /><stop offset="100%" stopColor="#9ca3af" />
                  </radialGradient>
                  <marker id="arrH" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#111" />
                  </marker>
                </defs>
                {trail.map((t, i) => {
                  const k = (i + 1) / Math.max(1, trail.length);
                  return <circle key={t.id} cx={t.x} cy={t.y} r={1.5 + k * 4} fill="#fff" opacity={0.04 + k * 0.32} />;
                })}
                {dirVisible && (
                  <g style={{ animation: "arDir .35s ease-out" }}>
                    <line x1={puckPos.x} y1={puckPos.y} x2={puckPos.x + Math.cos(dirAngle) * 40} y2={puckPos.y + Math.sin(dirAngle) * 40}
                      stroke="#111" strokeWidth={3} strokeLinecap="round" markerEnd="url(#arrH)" opacity={0.95} />
                  </g>
                )}
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R + 5} fill="rgba(0,0,0,0.18)" />
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R} fill="url(#puckG)" stroke="rgba(0,0,0,0.22)" strokeWidth={1} />
                <circle cx={puckPos.x} cy={puckPos.y} r={2.4} fill="#111" />
                <circle cx={puckPos.x} cy={puckPos.y} r={1.1} fill="#fff" />
                <ellipse cx={puckPos.x - 3} cy={puckPos.y - 4} rx={4} ry={2.8} fill="rgba(255,255,255,0.72)" />
              </svg>
              {winnerTag && (
                <div style={{
                  position: "absolute", left: puckPos.x, top: puckPos.y - BALL_R - 24, transform: "translateX(-50%)", zIndex: 8, pointerEvents: "none",
                  background: "rgba(0,0,0,0.8)", color: "#fff", fontWeight: 800, fontSize: 12, padding: "4px 11px", borderRadius: 8, whiteSpace: "nowrap",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.45)", animation: "arPop .35s ease-out",
                }}>{winnerTag}</div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={playersCard}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 4 }}>ИГРОКИ · {strips.length}</div>
        <div style={{ maxHeight: 100, overflowY: "auto" }}>
          {strips.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Пока никого</div>
          ) : strips.map((s) => (
            <div key={s.telegramId} style={playerRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: s.telegramId === telegramId ? "#4ade80" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(s.username || s.telegramId).replace(/^@/, "").slice(0, 12)}{s.telegramId === telegramId ? " (вы)" : ""}
                </span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>{s.stake.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{(s.chance || s.share * 100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={betBar}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {chips.map((v, i) => (
            <button key={i} type="button" disabled={busy || !canBet} onClick={() => placeBet(v)}
              style={{ ...chip, opacity: busy || !canBet ? 0.45 : 1, cursor: busy || !canBet ? "not-allowed" : "pointer" }}>{v}</button>
          ))}
          <button type="button" onClick={openEdit} style={editBtn} title="Изменить">✎</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
          Баланс: <span style={{ color: "#4ade80", fontWeight: 800 }}>{balanceTon.toFixed(2)} TON</span>{meIn ? " · докид" : ""}
        </div>
      </div>

      {editOpen && (
        <div style={overlay} onClick={() => setEditOpen(false)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#86efac", letterSpacing: "0.1em", marginBottom: 12 }}>ИЗМЕНИТЬ КНОПКУ</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "center" }}>
              {chips.map((v, i) => (
                <button key={i} type="button" onClick={() => { setEditIdx(i); setEditVal(""); }}
                  style={{ ...chip, minWidth: 56, outline: editIdx === i ? "2px solid #4ade80" : "none", background: editIdx === i ? "rgba(34,197,94,0.25)" : chip.background }}>{v}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>Сумма для кнопки #{editIdx + 1}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={editVal} inputMode="decimal" placeholder="0.1" onChange={(e) => setEditVal(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => setEditVal("")} style={{ ...chip, minWidth: 52, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(127,29,29,0.25)"}}>⌫</button>
            </div>
            <button type="button" onClick={applyEdit} style={{ ...chip, width: "100%", marginTop: 14, padding: "14px" }}>Применить</button>
          </div>
        </div>
      )}

      {phase === "winner" && winnerData && (
        <div style={overlay}>
          <div style={{ ...sheet, animation: "arPop .4s ease-out" }}>
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: "#86efac", letterSpacing: "0.12em" }}>ПОБЕДИТЕЛЬ</div>
            <div style={{ margin: "12px auto 0", width: 60, height: 60, borderRadius: "50%", border: `3px solid ${winnerData.color}`, overflow: "hidden", background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20, color: "#fff" }}>
              {winnerData.photo ? <img src={winnerData.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(winnerData.name, "?")}
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontWeight: 900, fontSize: 17 }}>{winnerData.name.replace(/^@/, "")}</div>
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 26, fontWeight: 900, color: "#4ade80" }}>+{winnerData.payout.toFixed(2)} TON</div>
            <div style={{ textAlign: "center", marginTop: 2, fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>×{winnerData.mult}</div>
          </div>
        </div>
      )}

      {showHistory && !fairInfo && (
        <div style={overlay} onClick={() => setShowHistory(false)}>
          <div style={{ ...sheet, maxHeight: "80vh", overflow: "auto", animation: "arPop .3s ease-out" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>История игр</div>
              <button type="button" onClick={() => setShowHistory(false)} style={{ ...iconBtn, width: 36, height: 36 }}>✕</button>
            </div>
            {historyLoading && <div style={{ color: "#94a3b8", fontWeight: 600 }}>Загрузка…</div>}
            {!historyLoading && history.length === 0 && <div style={{ color: "#64748b", fontWeight: 600 }}>Пока пусто</div>}
            {history.map((room) => {
              const wp = room.players?.find((p) => p.telegramId === room.winnerId);
              const chance = wp && room.totalPool > 0 ? (wp.stake / room.totalPool) * 100 : 0;
              const mult = wp && wp.stake > 0 ? room.winnerPayout / wp.stake : 0;
              return (
                <div key={room.id} style={histCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ background: "rgba(59,130,246,0.2)", color: "#93c5fd", fontWeight: 900, fontSize: 13, padding: "4px 10px", borderRadius: 10 }}>{mult.toFixed(2)}x</div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>#{room.id}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: colorFor(0), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", overflow: "hidden", flexShrink: 0 }}>
                      {wp?.photoUrl ? <img src={wp.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(room.winnerUsername, room.winnerId || "?")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{(room.winnerUsername || room.winnerId || "?").replace(/^@/, "").slice(0, 16)}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{room.finishedAt ? new Date(room.finishedAt).toLocaleString() : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "#e2e8f0" }}>{room.winnerPayout.toFixed(3)} TON</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Шанс {chance.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => replayRoom(room)} style={histBtn}>Открыть повтор</button>
                    <button type="button" onClick={() => setFairInfo(room)} style={{ ...histBtn, background: "#3b82f6", color: "#fff", border: "none" }}>Проверка честности</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fairInfo && (
        <div style={overlay} onClick={() => setFairInfo(null)}>
          <div style={{ ...sheet, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Игра #{fairInfo.id}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{fairInfo.finishedAt ? new Date(fairInfo.finishedAt).toLocaleString() : ""}</div>
              </div>
              <button type="button" onClick={() => setFairInfo(null)} style={{ ...iconBtn, width: 36, height: 36 }}>✕</button>
            </div>
            {fairInfo.fair && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, wordBreak: "break-all" }}>
                <div>Хеш: {fairInfo.fair.hash || fairInfo.fair.serverSeedHash || "—"}</div>
                <div style={{ marginTop: 4 }}>Сид: {fairInfo.fair.serverSeed || "—"}</div>
              </div>
            )}
            {fairInfo.players?.map((p) => {
              const isW = p.telegramId === fairInfo.winnerId;
              const ch = fairInfo.totalPool > 0 ? (p.stake / fairInfo.totalPool) * 100 : 0;
              return (
                <div key={p.telegramId} style={{ ...histCard, marginBottom: 8, border: isW ? "1px solid rgba(74,222,128,0.45)" : histCard.border, background: isW ? "rgba(22,101,52,0.25)" : histCard.background }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{(p.username || p.telegramId).replace(/^@/, "")}{isW && <span style={{ color: "#4ade80", marginLeft: 8, fontSize: 12 }}>Победитель</span>}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{ch.toFixed(2)}%</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{p.stake.toFixed(2)} TON</div>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => replayRoom(fairInfo)} style={{ ...chip, width: "100%", marginTop: 8 }}>Открыть повтор</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ ...toastStyle, background: toast.type === "ok" ? "rgba(22,101,52,0.95)" : "rgba(127,29,29,0.95)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

const root: CSSProperties = { position: "relative", minHeight: "100%", paddingBottom: 140, color: "#fff", fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', overflowX: "hidden" };
const header: CSSProperties = { display: "flex", alignItems: "center", padding: "10px 12px 2px", position: "relative", zIndex: 2 };
const iconBtn: CSSProperties = { width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const statusPill: CSSProperties = { display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", color: "#86efac", fontWeight: 800, fontSize: 12 };
const boardWrap: CSSProperties = { display: "flex", justifyContent: "center", margin: "0 12px 4px", position: "relative", zIndex: 1 };
const playersCard: CSSProperties = { margin: "10px 14px 0", background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))", borderRadius: 16, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 1 };
const playerRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };
const betBar: CSSProperties = { position: "fixed", left: 0, right: 0, bottom: 56, zIndex: 40, padding: "10px 14px 8px", background: "linear-gradient(180deg, transparent, rgba(8,8,15,0.92) 30%, #08080f)", borderTop: "1px solid rgba(255,255,255,0.06)" };
const chip: CSSProperties = { padding: "12px 15px", borderRadius: 14, border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.14)", color: "#4ade80", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit", minWidth: 50 };
const editBtn: CSSProperties = { ...chip, minWidth: 44, padding: "12px", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500 };
const sheet: CSSProperties = { width: "100%", maxWidth: 420, background: "linear-gradient(180deg,#12141c,#0a0c12)", borderRadius: "22px 22px 0 0", padding: "20px 16px 32px" };
const inputStyle: CSSProperties = { padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.35)", color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "inherit" };
const toastStyle: CSSProperties = { position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 16px", borderRadius: 12, fontWeight: 700, zIndex: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" };
const histCard: CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 14, marginBottom: 12 };
const histBtn: CSSProperties = { flex: 1, padding: "10px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
