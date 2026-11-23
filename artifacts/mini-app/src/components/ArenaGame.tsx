import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import {
  W, H, BALL_R, POINT_R, MARGIN, makeRng,
  planBouncePath, randomInStrip, randomStart, samplePath, pathDirection, pointInPoly,
} from "./arenaPhysics";
import WinnerModal from "./WinnerModal";

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const SPIN_MS = 9500;
const DIR_MS = 350;
const WINNER_HOLD_MS = 4500;
const DEFAULT_CHIPS = [5, 10, 100];
const CHIPS_KEY = "tonyx_arena_chips_v2";
const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
  "#f97316", "#8b5cf6", "#14b8a6", "#eab308", "#f43f5e", "#0ea5e9", "#d946ef", "#10b981",
];

function TonIcon({ size = 16 }: { size?: number }) {
  return (
    <img src="/toncoin.png" alt="TON" width={size} height={size} style={{
      width: size, height: size, objectFit: "cover", display: "inline-block",
      verticalAlign: "middle", borderRadius: Math.round(size * 0.22),
    }} draggable={false} />
  );
}

function TonChip({ amount, size = 56 }: { amount: number | string; size?: number }) {
  const label = typeof amount === "number"
    ? (Math.abs(amount - Math.round(amount)) < 1e-9 ? String(Math.round(amount)) : amount.toFixed(2))
    : String(amount);
  const badgeFs = Math.max(11, Math.round(size * 0.22));
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      boxShadow: "0 4px 14px rgba(37,99,235,0.4)", position: "relative", flexShrink: 0,
      overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)",
    }}>
      <img src="/toncoin.png" alt="TON" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block",
      }} draggable={false} />
      <div style={{
        position: "absolute", left: "50%", bottom: Math.round(size * 0.07), transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,0.45)", borderRadius: 999,
        padding: `2px ${Math.max(7, Math.round(size * 0.12))}px`, border: "1px solid rgba(255,255,255,0.25)",
        backdropFilter: "blur(4px)",
      }}>
        <span style={{ fontWeight: 900, fontSize: badgeFs, color: "#fff", lineHeight: 1.2 }}>{label}</span>
      </div>
    </div>
  );
}

interface NftStakeInfo {
  inventoryId: number; itemId: string; valueTon: number; nameRu?: string; imageUrl?: string | null;
}
interface ArenaPlayer {
  telegramId: string; username: string | null; stake: number; chance: number; photoUrl?: string | null;
  nftStakes?: NftStakeInfo[];
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
type Pt = { x: number; y: number };
type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
  poly: Pt[]; cx: number; cy: number; shape: string;
};

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error" | "warning") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}
function avatarSrc(photoUrl?: string | null, username?: string | null): string | null {
  if (photoUrl && String(photoUrl).startsWith("http")) return photoUrl;
  const u = (username || "").replace(/^@/, "").trim();
  if (u) return `https://t.me/i/userpic/320/${encodeURIComponent(u)}.jpg`;
  return null;
}
function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number, seed = 0) {
  const n = COLORS.length;
  const start = Math.abs(seed) % n;
  const step = Math.max(3, Math.floor(n / 2) - 1);
  return COLORS[(start + i * step) % n];
}
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function buildStrips(players: ArenaPlayer[], roomSeed = 0): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0).sort((a, b) => String(a.telegramId).localeCompare(String(b.telegramId)));
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  if (n === 0) return [];
  const mk = (p: ArenaPlayer, i: number, share: number, poly: Pt[], shape: string): Strip => {
    let a = 0, cx = 0, cy = 0;
    const nn = poly.length;
    for (let k = 0; k < nn; k++) {
      const j = (k + 1) % nn;
      const cross = poly[k].x * poly[j].y - poly[j].x * poly[k].y;
      a += cross; cx += (poly[k].x + poly[j].x) * cross; cy += (poly[k].y + poly[j].y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) > 1e-3) { cx /= (6 * a); cy /= (6 * a); }
    else {
      let sx = 0, sy = 0;
      for (const q of poly) { sx += q.x; sy += q.y; }
      cx = sx / Math.max(1, nn); cy = sy / Math.max(1, nn);
    }
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs);
    return { ...p, color: colorFor(i, roomSeed), index: i, share, x0, x1, midX: (x0 + x1) / 2, poly, cx, cy, shape };
  };
  if (n === 1) {
    return [mk(list[0], 0, 1, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], "rect")];
  }
  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total; const sb = b.stake / total;
    const seed = hash01([a.telegramId, b.telegramId].map(String).sort().join("|"));
    const CORNER_MAX = 0.22;
    const smallIsA = sa <= sb; const ss = Math.min(sa, sb); const ls = Math.max(sa, sb);
    if (ss < CORNER_MAX) {
      const f = Math.min(0.95, Math.max(0.06, Math.sqrt(2 * ss)));
      const corner = Math.floor(seed * 4);
      let polyS: Pt[]; let polyL: Pt[];
      if (corner === 0) {
        polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
        polyL = [{ x: f * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: f * H }];
      } else if (corner === 1) {
        polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
        polyL = [{ x: 0, y: 0 }, { x: (1 - f) * W, y: 0 }, { x: W, y: f * H }, { x: W, y: H }, { x: 0, y: H }];
      } else if (corner === 2) {
        polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
        polyL = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: (1 - f) * H }, { x: (1 - f) * W, y: H }, { x: 0, y: H }];
      } else {
        polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
        polyL = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: f * W, y: H }, { x: 0, y: (1 - f) * H }];
      }
      const stripS = mk(smallIsA ? a : b, smallIsA ? 0 : 1, ss, polyS, "corner");
      const stripL = mk(smallIsA ? b : a, smallIsA ? 1 : 0, ls, polyL, "main");
      return smallIsA ? [stripS, stripL] : [stripL, stripS];
    }
    const maxTilt = Math.min(sa, sb) * 0.35;
    const tilt = (seed - 0.5) * 2 * maxTilt;
    const minCut = Math.max(2 / W, 0.004); const maxCut = 1 - minCut;
    let cutTop = Math.max(minCut, Math.min(maxCut, sa + tilt));
    let cutBot = Math.max(minCut, Math.min(maxCut, sa - tilt));
    const mean = (cutTop + cutBot) / 2;
    if (Math.abs(mean - sa) > 1e-6) {
      const d = sa - mean;
      cutTop = Math.max(minCut, Math.min(maxCut, cutTop + d));
      cutBot = Math.max(minCut, Math.min(maxCut, cutBot + d));
    }
    return [
      mk(a, 0, sa, [{ x: 0, y: 0 }, { x: cutTop * W, y: 0 }, { x: cutBot * W, y: H }, { x: 0, y: H }], "wedge"),
      mk(b, 1, sb, [{ x: cutTop * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: cutBot * W, y: H }], "wedge"),
    ];
  }
  {
    const CORNER_MAX = 0.22;
    const withShare = list.map((p, i) => ({ p, i, share: p.stake / total }));
    const smalls = withShare.filter((x) => x.share < CORNER_MAX).sort((a, b) => a.share - b.share);
    const bigs = withShare.filter((x) => x.share >= CORNER_MAX).sort((a, b) => b.share - a.share);
    const cornerOrder = [0, 2, 1, 3];
    const usedCorners = new Set<number>();
    const result: Strip[] = [];
    for (let si = 0; si < smalls.length; si++) {
      const { p, i, share } = smalls[si];
      const f = Math.min(0.92, Math.max(0.08, Math.sqrt(2 * share)));
      let corner = cornerOrder[si % 4];
      for (let k = 0; k < 4; k++) {
        const c = cornerOrder[(si + k) % 4];
        if (!usedCorners.has(c)) { corner = c; break; }
      }
      usedCorners.add(corner);
      let polyS: Pt[];
      if (corner === 0) polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
      else if (corner === 1) polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
      else if (corner === 2) polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
      else polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
      result.push(mk(p, i, share, polyS, "corner"));
    }
    if (bigs.length === 0) return result;
    if (bigs.length === 1) {
      const { p, i, share } = bigs[0];
      result.push(mk(p, i, share, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], "main"));
      return result;
    }
    const bigTotal = bigs.reduce((s, x) => s + x.share, 0) || 1;
    const cuts: number[] = [0];
    let acc = 0;
    for (let bi = 0; bi < bigs.length; bi++) {
      acc += bigs[bi].share / bigTotal;
      cuts.push(bi === bigs.length - 1 ? 1 : Math.min(0.999, Math.max(0.001, acc)));
    }
    const bn = bigs.length;
    const topX: number[] = []; const botX: number[] = [];
    for (let i = 0; i <= bn; i++) {
      if (i === 0) { topX.push(0); botX.push(0); continue; }
      if (i === bn) { topX.push(W); botX.push(W); continue; }
      const base = cuts[i];
      const seed = hash01(bigs[i - 1].p.telegramId + "|" + bigs[i].p.telegramId + "|" + i + "|" + roomSeed);
      const tilt = (seed - 0.5) * 0.12;
      const shareL = cuts[i] - cuts[i - 1]; const shareR = cuts[i + 1] - cuts[i];
      const maxT = Math.min(shareL, shareR) * 0.45;
      const tt = Math.max(-maxT, Math.min(maxT, tilt));
      topX.push(Math.max(0, Math.min(W, (base + tt) * W)));
      botX.push(Math.max(0, Math.min(W, (base - tt) * W)));
    }
    for (let bi = 0; bi < bn; bi++) {
      const { p, i, share } = bigs[bi];
      result.push(mk(p, i, share, [
        { x: topX[bi], y: 0 }, { x: topX[bi + 1], y: 0 }, { x: botX[bi + 1], y: H }, { x: botX[bi], y: H },
      ], "wedge"));
    }
    return result;
  }
}

function loadChips(): number[] {
  try {
    const raw = localStorage.getItem(CHIPS_KEY);
    if (!raw) return [...DEFAULT_CHIPS];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 3 && arr.every((n) => typeof n === "number" && n > 0)) return arr;
  } catch { /* */ }
  return [...DEFAULT_CHIPS];
}
function animSeed(data: { id?: number; winnerId: string | null; totalPool: number; fair?: ArenaState["fair"]; players: ArenaPlayer[] }) {
  const stakes = [...data.players].map((p) => `${p.telegramId}:${p.stake}`).sort().join("|");
  return [data.id ?? 0, data.winnerId ?? "", data.totalPool, data.fair?.hash ?? data.fair?.serverSeed ?? "", stakes].join("::");
}

const CSS = `
@keyframes arPulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes arPop{0%{opacity:0;transform:translateY(10px) scale(.96)}100%{opacity:1;transform:none}}
.ar-board{position:relative;border-radius:0;overflow:hidden;background:#05050a}
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
    prizes: { name: string; valueTon: number; imageUrl?: string | null }[];
  } | null>(null);
  const [freezeStrips, setFreezeStrips] = useState<Strip[] | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [puckVisible, setPuckVisible] = useState(false);
  const [puckPos, setPuckPos] = useState({ x: W / 2, y: H / 2 });
  const [chips, setChips] = useState<number[]>(DEFAULT_CHIPS);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRoom[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const replayingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");

  useEffect(() => { setChips(loadChips()); }, []);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) { setCountdown(0); return; }
    const update = () => {
      const ms = new Date(arena.startAt!).getTime() - Date.now();
      setCountdown(Math.max(0, Math.ceil(ms / 1000)));
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [arena?.status, arena?.startAt]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2200);
  };

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const raw = await r.json();
      const d = (raw?.room ?? raw?.arena ?? raw) as ArenaState;
      if (!d || !d.id) return;
      if (phaseRef.current === "lobby") setArena(d);
      else if (d.status === "finished") setArena(d);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [poll]);

  const strips = useMemo(() => {
    if (freezeStrips) return freezeStrips;
    if (!arena?.players?.length) return [];
    return buildStrips(arena.players, arena.id ?? 0);
  }, [arena?.players, arena?.id, freezeStrips]);

  const pool = freezeStrips ? freezePool : (arena?.totalPool ?? 0);

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
  function openHistory() { setShowHistory(true); loadHistory(); }

  function replayRoom(room: HistoryRoom) {
    if (phase === "spin") return;
    if (!room.winnerId || !room.players?.length) return;
    setShowHistory(false);
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

  function runSpinAnimation(data: {
    id?: number; players: ArenaPlayer[]; winnerId: string | null; winnerUsername: string | null;
    totalPool: number; fair?: ArenaState["fair"];
  }) {
    if (!data.winnerId || !data.players?.length) return;
    const seed = animSeed(data);
    const rng = makeRng(seed);
    const built = buildStrips(data.players, data.id ?? 0);
    setFreezeStrips(built);
    setFreezePool(data.totalPool);
    setPhase("spin");
    setPuckVisible(true);
    const winnerStrip = built.find((s) => String(s.telegramId) === String(data.winnerId)) ?? built[0];
    const path = planBouncePath(rng, winnerStrip.poly, SPIN_MS);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      const pt = samplePath(path, t);
      setPuckPos(pt);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPhase("winner");
        const wName = data.winnerUsername || data.winnerId || "?";
        const wStake = data.players.find((p) => String(p.telegramId) === String(data.winnerId))?.stake ?? 0;
        const pay = payoutOf(wStake, data.totalPool);
        const mult = wStake > 0 ? Math.round((pay / wStake) * 100) / 100 : 0;
        setWinnerData({
          name: wName, payout: pay, mult, photo: null, color: winnerStrip.color,
          prizes: [],
        });
        hapticNotify("success");
        window.setTimeout(() => {
          setPhase("lobby");
          setWinnerData(null);
          setFreezeStrips(null);
          setPuckVisible(false);
          replayingRef.current = false;
          poll();
          refreshBalance();
        }, WINNER_HOLD_MS);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (!arena || phase !== "lobby" || replayingRef.current) return;
    if (arena.status === "finished" && arena.winnerId && !settledRef.current.has(arena.id)) {
      settledRef.current.add(arena.id);
      runSpinAnimation(arena);
    }
  }, [arena, phase]);

  async function placeBet(amount: number) {
    if (busy || amount < MIN_STAKE) return;
    if (balanceTon < amount) { flash("Недостаточно TON", "err"); return; }
    setBusy(true);
    try {
      const me = arena?.players?.find((p) => String(p.telegramId) === String(telegramId));
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { flash(d.error || d.message || "Ошибка ставки", "err"); return; }
      haptic("medium");
      flash("Ставка принята");
      refreshBalance();
      await poll();
    } catch { flash("Сеть", "err"); }
    finally { setBusy(false); }
  }

  const me = arena?.players?.find((p) => String(p.telegramId) === String(telegramId));
  const canBet = phase === "lobby" && (!arena || arena.status === "waiting" || arena.status === "starting");

  return (
    <div style={{ minHeight: "100%", background: "#0a0a12", color: "#fff", padding: "12px 12px 100px", position: "relative" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button type="button" onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 10, fontSize: 16, cursor: "pointer" }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Арена</div>
        <button type="button" onClick={openHistory} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 10, fontSize: 16, cursor: "pointer" }} title="История">⏱</button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 10, fontSize: 13, opacity: 0.85 }}>
        Банк: <b>{pool.toFixed(2)}</b> TON · Игроков: {arena?.players?.length ?? 0}
        {countdown > 0 && <span> · Старт через {countdown}с</span>}
      </div>

      <div className="ar-board" style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: `${W}/${H}`, position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
        {strips.map((s, i) => (
          <div key={s.telegramId + i} style={{
            position: "absolute", inset: 0,
            clipPath: `polygon(${s.poly.map((q) => `${(q.x / W) * 100}% ${(q.y / H) * 100}%`).join(", ")})`,
            background: s.color,
            opacity: 0.85,
          }} />
        ))}
        {puckVisible && (
          <div style={{
            position: "absolute",
            left: `${(puckPos.x / W) * 100}%`,
            top: `${(puckPos.y / H) * 100}%`,
            width: 18, height: 18, marginLeft: -9, marginTop: -9,
            borderRadius: "50%", background: "#fff", boxShadow: "0 0 12px rgba(255,255,255,0.8)",
            border: "2px solid rgba(0,0,0,0.3)", zIndex: 5,
          }} />
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        {chips.map((v, i) => (
          <button key={i} type="button" disabled={busy || !canBet} onClick={() => placeBet(v)}
            style={{ background: "transparent", border: "none", padding: 0, cursor: canBet && !busy ? "pointer" : "not-allowed", opacity: canBet && !busy ? 1 : 0.5 }}>
            <TonChip amount={v} size={56} />
          </button>
        ))}
        <button type="button" disabled={busy || !canBet || balanceTon < MIN_STAKE}
          onClick={() => placeBet(Math.floor(balanceTon * 1000) / 1000)}
          style={{ background: "rgba(37,99,235,0.25)", border: "1px solid rgba(37,99,235,0.5)", color: "#fff", borderRadius: 12, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
          ALL
        </button>
      </div>

      {me && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, opacity: 0.9 }}>
          Твоя ставка: <b>{me.stake.toFixed(2)}</b> TON ({me.chance}%)
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", left: "50%", bottom: 100, transform: "translateX(-50%)",
          background: toast.type === "err" ? "#7f1d1d" : "#14532d", color: "#fff",
          padding: "10px 16px", borderRadius: 12, zIndex: 400, fontWeight: 600,
        }}>{toast.msg}</div>
      )}

      {winnerData && (
        <WinnerModal
          name={winnerData.name}
          payout={winnerData.payout}
          mult={winnerData.mult}
          photo={winnerData.photo}
          color={winnerData.color}
          prizes={winnerData.prizes}
          onClose={() => setWinnerData(null)}
        />
      )}

      {showHistory && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setShowHistory(false)}>
          <div style={{
            width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto",
            background: "#12121a", borderRadius: "16px 16px 0 0", padding: 16,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <b>История</b>
              <button type="button" onClick={() => setShowHistory(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            {historyLoading && <div style={{ opacity: 0.6 }}>Загрузка…</div>}
            {!historyLoading && history.length === 0 && <div style={{ opacity: 0.6 }}>Пока пусто</div>}
            {history.map((room) => (
              <div key={room.id} style={{
                background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>#{room.id} · {room.playerCount} игр.</span>
                  <span>{room.totalPool?.toFixed(2)} TON</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>Победитель: {room.winnerUsername || room.winnerId}</div>
                <button type="button" onClick={() => replayRoom(room)}
                  style={{ marginTop: 8, background: "rgba(37,99,235,0.3)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                  Повтор
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
