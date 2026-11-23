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
  const [stakeDetail, setStakeDetail] = useState<(ArenaPlayer & { color?: string; share?: number }) | null>(null);
  const [chips, setChips] = useState<number[]>(DEFAULT_CHIPS);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(0);
  const [editVal, setEditVal] = useState("");
  const [gifts, setGifts] = useState<Array<{ id: number; itemId: string; nameRu: string; valueTon: number; imageUrl: string | null }>>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [selectedGiftIds, setSelectedGiftIds] = useState<number[]>([]);
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
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

  const loadGifts = useCallback(async () => {
    if (!telegramId) return;
    setGiftsLoading(true);
    try {
      const r = await fetch(`/api/mini/inventory?telegramId=${encodeURIComponent(telegramId)}`);
      if (!r.ok) return;
      const d = await r.json();
      const items = (d.items ?? d.inventory ?? []).filter((x: any) => x && (x.valueTon > 0 || x.itemId));
      setGifts(items.map((x: any) => ({
        id: Number(x.id ?? x.inventoryId),
        itemId: String(x.itemId ?? ""),
        nameRu: String(x.nameRu ?? x.name ?? "NFT"),
        valueTon: Number(x.valueTon ?? 0),
        imageUrl: x.imageUrl ?? null,
      })));
    } catch { /* */ }
    finally { setGiftsLoading(false); }
  }, [telegramId]);

  useEffect(() => { loadGifts(); }, [loadGifts]);

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
    if (!data.winnerId || !data.players.length) return;
    setPhase("spin");
    setWinnerData(null);
    const built = buildStrips(data.players, data.id ?? 0);
    setFreezeStrips(built);
    setFreezePool(data.totalPool);
    const seed = animSeed(data);
    const rng = makeRng(seed);
    const winnerStrip = built.find((s) => s.telegramId === data.winnerId) ?? built[0];
    const path = planBouncePath(winnerStrip, rng);
    const samples = samplePath(path, SPIN_MS);
    setPuckVisible(true);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      const idx = Math.min(samples.length - 1, Math.floor(t * (samples.length - 1)));
      const pt = samples[idx];
      setPuckPos({ x: pt.x, y: pt.y });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPuckVisible(false);
        const wp = data.players.find((p) => p.telegramId === data.winnerId);
        const payout = wp ? payoutOf(wp.stake, data.totalPool) : data.totalPool;
        const mult = wp && wp.stake > 0 ? payout / wp.stake : 1;
        setWinnerData({
          name: "@" + (data.winnerUsername || data.winnerId || "winner").replace(/^@/, ""),
          payout, mult,
          photo: avatarSrc(wp?.photoUrl, data.winnerUsername),
          color: winnerStrip.color,
          prizes: (wp?.nftStakes ?? []).map((n) => ({ name: n.nameRu || n.itemId, valueTon: n.valueTon, imageUrl: n.imageUrl })),
        });
        setPhase("winner");
        hapticNotify("success");
        window.setTimeout(() => {
          replayingRef.current = false;
          setPhase("lobby");
          setFreezeStrips(null);
          setWinnerData(null);
          refreshBalance();
        }, WINNER_HOLD_MS);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    if (!arena || arena.status !== "finished" || !arena.winnerId) return;
    if (settledRef.current.has(arena.id)) return;
    if (phaseRef.current === "spin") return;
    settledRef.current.add(arena.id);
    runSpinAnimation({
      id: arena.id,
      players: arena.players,
      winnerId: arena.winnerId,
      winnerUsername: arena.winnerUsername,
      totalPool: arena.totalPool,
      fair: arena.fair,
    });
  }, [arena?.id, arena?.status, arena?.winnerId]);

  async function placeBet(amount: number) {
    if (busy || phase === "spin") return;
    if (amount < MIN_STAKE) { flash(`Мин. ${MIN_STAKE}`, "err"); return; }
    if (amount > balanceTon + 1e-9) { flash("Недостаточно TON", "err"); return; }
    setBusy(true);
    try {
      const me = arena?.players?.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount }
        : { telegramId, stake: amount };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { flash(d.error || d.message || `Ошибка ${r.status}`, "err"); return; }
      flash(me ? `Докид ${amount} TON` : `Ставка ${amount} TON`, "ok");
      haptic("medium");
      refreshBalance();
      await poll();
    } catch { flash("Сеть", "err"); }
    finally { setBusy(false); }
  }

  async function placeGiftBet() {
    if (busy || !selectedGiftIds.length) return;
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/arena/join-nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, inventoryIds: selectedGiftIds }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { flash(d.error || d.message || `Ошибка ${r.status}`, "err"); return; }
      flash("NFT ставка", "ok");
      setSelectedGiftIds([]);
      setGiftPickerOpen(false);
      refreshBalance();
      loadGifts();
      await poll();
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

  const playerCount = arena?.players.length ?? strips.length;
  const statusLabel =
    phase === "spin" ? "Шайба в игре…" :
    phase === "winner" ? "Победитель!" :
    arena?.status === "starting" ? (countdown > 0 ? `Старт через ${countdown}с` : "Скоро…") :
    playerCount < 2 ? `Ожидание игроков ${playerCount}/2` : "Набор ставок";
  const poolLabel = (() => {
    const v = Number(pool) || 0;
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
  })();

  const root: CSSProperties = {
    position: "fixed", inset: 0, zIndex: 50, background: "#07070c", color: "#f1f5f9",
    display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "inherit",
  };
  const header: CSSProperties = {
    display: "flex", alignItems: "center", padding: "52px 12px 8px", position: "relative", zIndex: 2,
  };
  const iconBtn: CSSProperties = {
    width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontWeight: 800, cursor: "pointer",
  };
  const chip: CSSProperties = {
    padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  };
  const betBar: CSSProperties = {
    position: "fixed", left: 0, right: 0, bottom: 62, zIndex: 40,
    padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
    background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 30%)",
    display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap",
  };
  const overlay: CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500,
  };
  const sheet: CSSProperties = {
    width: "100%", maxWidth: 420, background: "linear-gradient(180deg,#12141c,#0a0c12)",
    borderRadius: "22px 22px 0 0", padding: "20px 16px 32px",
  };
  const inputStyle: CSSProperties = {
    padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)", color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "inherit",
  };

  return (
    <div style={root}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 35% at 50% 0%, rgba(99,102,241,0.12), transparent 60%)" }} />
      <div style={header}>
        <button type="button" onClick={onClose} style={iconBtn}>←</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 900, fontSize: 16, letterSpacing: "0.04em" }}>ARENA</div>
        <button type="button" onClick={openHistory} style={iconBtn} title="История">⏱</button>
      </div>

      <div style={{ margin: "0 14px 10px", borderRadius: 22, background: "#0c0c12", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 16px 40px rgba(0,0,0,0.45)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
          <span>{statusLabel}</span>
          <span style={{ color: "#e2e8f0" }}>🏦 {poolLabel} TON</span>
        </div>
        <div className="ar-board" style={{ position: "relative", width: "100%", aspectRatio: `${W}/${H}`, background: "#05050a" }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
            {strips.map((s) => (
              <polygon key={s.telegramId} points={s.poly.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={s.color} fillOpacity={0.55} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
            ))}
            {strips.map((s) => (
              <g key={`av-${s.telegramId}`}>
                <circle cx={s.cx} cy={s.cy} r={22} fill="rgba(0,0,0,0.35)" />
                <text x={s.cx} y={s.cy + 5} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800}>
                  {initials(s.username, s.telegramId)}
                </text>
              </g>
            ))}
            {puckVisible && (
              <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R} fill="#f8fafc" stroke="#94a3b8" strokeWidth={2} />
            )}
          </svg>
          {!strips.length && (
            <div style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", display: "flex", color: "rgba(255,255,255,0.35)", fontWeight: 800 }}>
              Ждём игроков…
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 14px 120px" }}>
        {strips.map((s) => (
          <button key={s.telegramId} type="button" onClick={() => setStakeDetail(s)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 8,
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
            color: "#e2e8f0", cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: s.color }} />
            <div style={{ flex: 1, fontWeight: 700 }}>@{(s.username || s.telegramId).replace(/^@/, "")}</div>
            <div style={{ fontWeight: 900 }}>{s.stake.toFixed(2)} TON</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{(s.share * 100).toFixed(1)}%</div>
          </button>
        ))}
      </div>

      {phase === "lobby" && (
        <div style={betBar}>
          {chips.map((c, i) => (
            <button key={i} type="button" disabled={busy} onClick={() => placeBet(c)} style={chip}>{c}</button>
          ))}
          <button type="button" onClick={openEdit} style={{ ...chip, minWidth: 38 }}>✎</button>
          <button type="button" onClick={() => { setGiftPickerOpen(true); loadGifts(); }} style={chip}>🎁</button>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 700,
          padding: "10px 16px", borderRadius: 12, fontWeight: 700,
          background: toast.type === "ok" ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)", color: "#fff",
        }}>{toast.msg}</div>
      )}

      {phase === "winner" && winnerData && (
        <WinnerModal
          name={winnerData.name}
          payout={winnerData.payout}
          mult={winnerData.mult}
          photo={winnerData.photo}
          color={winnerData.color}
          prizes={winnerData.prizes || []}
        />
      )}

      {showHistory && (
        <div style={overlay} onClick={() => setShowHistory(false)}>
          <div style={{ ...sheet, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>История</div>
              <button type="button" onClick={() => setShowHistory(false)} style={{ ...iconBtn, width: 36, height: 36 }}>✕</button>
            </div>
            {historyLoading && <div style={{ opacity: 0.6 }}>Загрузка…</div>}
            {!historyLoading && history.length === 0 && <div style={{ opacity: 0.6 }}>Пока пусто</div>}
            {history.map((room) => (
              <div key={room.id} style={{
                padding: 12, borderRadius: 14, marginBottom: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ fontWeight: 800 }}>#{room.id} · @{(room.winnerUsername || room.winnerId || "?").replace(/^@/, "")}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {room.winnerPayout?.toFixed?.(2) ?? room.totalPool} TON · {room.playerCount} игроков
                </div>
                <button type="button" onClick={() => replayRoom(room)} style={{ ...chip, marginTop: 8, width: "100%" }}>
                  Открыть повтор
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editOpen && (
        <div style={overlay} onClick={() => setEditOpen(false)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Чипы ставки</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {chips.map((c, i) => (
                <button key={i} type="button" onClick={() => setEditIdx(i)} style={{
                  ...chip, flex: 1, background: editIdx === i ? "rgba(59,130,246,0.35)" : chip.background,
                }}>{c}</button>
              ))}
            </div>
            <input value={editVal} inputMode="decimal" placeholder="0.1" onChange={(e) => setEditVal(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            <button type="button" onClick={applyEdit} style={{ ...chip, width: "100%", marginTop: 14, padding: "14px" }}>Применить</button>
          </div>
        </div>
      )}

      {giftPickerOpen && (
        <div style={overlay} onClick={() => setGiftPickerOpen(false)}>
          <div style={{ ...sheet, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>NFT ставка</div>
            {giftsLoading && <div style={{ opacity: 0.6 }}>Загрузка…</div>}
            {!giftsLoading && gifts.length === 0 && <div style={{ opacity: 0.6 }}>Нет NFT</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {gifts.map((g) => {
                const on = selectedGiftIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => {
                    setSelectedGiftIds((prev) => on ? prev.filter((x) => x !== g.id) : [...prev, g.id]);
                  }} style={{
                    width: 72, height: 72, borderRadius: 14, overflow: "hidden", position: "relative",
                    border: on ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)", padding: 0, cursor: "pointer",
                  }}>
                    {g.imageUrl ? <img src={g.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>🎁</span>}
                    <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000" }}>{g.valueTon}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={!selectedGiftIds.length || busy} onClick={placeGiftBet} style={{ ...chip, width: "100%", marginTop: 14, padding: "14px", opacity: selectedGiftIds.length ? 1 : 0.5 }}>
              Поставить выбранные
            </button>
          </div>
        </div>
      )}

      {stakeDetail && (
        <div onClick={() => setStakeDetail(null)} style={{
          position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 320, borderRadius: 22,
            background: "linear-gradient(180deg,#1a1a24,#0f0f18)", border: "1px solid rgba(255,255,255,0.1)", padding: "16px",
          }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>@{(stakeDetail.username || stakeDetail.telegramId || "").replace(/^@/, "")}</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>{Number(stakeDetail.stake).toFixed(2)} TON</div>
            <button type="button" onClick={() => setStakeDetail(null)} style={{ ...chip, width: "100%" }}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
