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
import WinnerModal from "./WinnerModal";

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const SPIN_MS = 7000;
const DIR_MS = 350;
const WINNER_HOLD_MS = 4500;
const DEFAULT_CHIPS = [1, 5, 10, 25];
const CHIPS_KEY = "tonyx_arena_chips";
const COLORS = [
  "#22c55e", "#ef4444", "#f59e0b", "#06b6d4",
  "#a855f7", "#eab308", "#ec4899", "#14b8a6",
  "#f97316", "#3b82f6",
];

/** Blue diamond icon (like Portals / gift style) */
function DiamondIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ display: "block" }}>
      <path d="M24 6L38 20L24 42L10 20L24 6Z" fill="white" />
      <path d="M24 6L38 20H10L24 6Z" fill="rgba(255,255,255,0.55)" />
      <path d="M18 20H30L24 42L18 20Z" fill="rgba(200,220,255,0.35)" />
      <path d="M34 12l1.2 2.4 2.4 1.2-2.4 1.2L34 19l-1.2-2.4-2.4-1.2 2.4-1.2L34 12z" fill="white" />
    </svg>
  );
}

/** Small diamond for bet chips / mode toggle */
function TonIcon({ size = 16 }: { size?: number }) {
  return <DiamondIcon size={size} />;
}

/** Stake chip: blue card + diamond + amount badge at bottom (as on screenshots) */
function TonChip({ amount, size = 56 }: { amount: number | string; size?: number }) {
  const label = typeof amount === "number"
    ? (Math.abs(amount - Math.round(amount)) < 1e-9 ? String(Math.round(amount)) : amount.toFixed(2))
    : String(amount);
  const badgeFs = Math.max(10, Math.round(size * 0.20));
  const iconSize = Math.round(size * 0.48);
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.22),
      background: "linear-gradient(160deg,#4da3ff 0%,#2563eb 55%,#1d4ed8 100%)",
      border: "1px solid rgba(255,255,255,0.25)",
      boxShadow: "0 4px 14px rgba(37,99,235,0.4)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      flexShrink: 0,
      overflow: "hidden",
      paddingBottom: Math.round(size * 0.14),
    }}>
      <DiamondIcon size={iconSize} />
      <div style={{
        position: "absolute",
        left: "50%",
        bottom: Math.round(size * 0.06),
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: "rgba(15,23,42,0.55)",
        borderRadius: 999,
        padding: `2px ${Math.max(6, Math.round(size * 0.1))}px`,
        border: "1px solid rgba(255,255,255,0.2)",
      }}>
        <span style={{
          fontWeight: 900,
          fontSize: badgeFs,
          color: "#fff",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
        }}>{label}</span>
        <svg width={badgeFs} height={badgeFs} viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5L13 7L8 14.5L3 7L8 1.5Z" fill="white" />
        </svg>
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
  poly: Pt[];
  cx: number; cy: number;
  shape: string;
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
function colorFor(i: number) { return COLORS[i % COLORS.length]; }
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
/**
 * Portals-style territories:
 * - 1 player -> full board
 * - 2 players -> diagonal split, area ~ stake %
 * - 3+ -> corner triangles + main zone for leader
 */
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  if (n === 0) return [];

  const mk = (
    p: ArenaPlayer,
    i: number,
    share: number,
    poly: Pt[],
    shape: string,
    place?: Pt,
  ): Strip => {
    let a = 0, cx = 0, cy = 0;
    const nn = poly.length;
    for (let k = 0; k < nn; k++) {
      const j = (k + 1) % nn;
      const cross = poly[k].x * poly[j].y - poly[j].x * poly[k].y;
      a += cross;
      cx += (poly[k].x + poly[j].x) * cross;
      cy += (poly[k].y + poly[j].y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) > 1e-3) { cx /= (6 * a); cy /= (6 * a); }
    else {
      let sx = 0, sy = 0;
      for (const q of poly) { sx += q.x; sy += q.y; }
      cx = sx / Math.max(1, nn); cy = sy / Math.max(1, nn);
    }
    if (place) { cx = place.x; cy = place.y; }
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    return {
      ...p, color: colorFor(i), index: i, share,
      x0, x1, midX: (x0 + x1) / 2, poly, cx, cy, shape,
    };
  };

  if (n === 1) {
    const p = list[0];
    return [mk(p, 0, 1, [
      { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H },
    ], "rect")];
  }

  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total;
    const sb = b.stake / total;
    const seed = hash01(a.telegramId + "|" + b.telegramId);

    // Small share → corner triangle (not a thin full-height strip)
    const CORNER_MAX = 0.22;
    const smallIsA = sa <= sb;
    const ss = Math.min(sa, sb);
    const ls = Math.max(sa, sb);

    if (ss < CORNER_MAX) {
      // isosceles right triangle: area = (f*W)*(f*H)/2 ⇒ share = f²/2 ⇒ f = √(2·share)
      const f = Math.min(0.95, Math.max(0.06, Math.sqrt(2 * ss)));
      const corner = Math.floor(seed * 4); // 0=TL 1=TR 2=BR 3=BL
      let polyS: Pt[];
      let polyL: Pt[];
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

    // Balanced 2-way: diagonal wedge, area ≈ share
    const maxTilt = Math.min(sa, sb) * 0.35;
    const tilt = (seed - 0.5) * 2 * maxTilt;
    const minCut = Math.max(2 / W, 0.004);
    const maxCut = 1 - minCut;
    let cutTop = Math.max(minCut, Math.min(maxCut, sa + tilt));
    let cutBot = Math.max(minCut, Math.min(maxCut, sa - tilt));
    const mean = (cutTop + cutBot) / 2;
    if (Math.abs(mean - sa) > 1e-6) {
      const d = sa - mean;
      cutTop = Math.max(minCut, Math.min(maxCut, cutTop + d));
      cutBot = Math.max(minCut, Math.min(maxCut, cutBot + d));
    }
    const polyA: Pt[] = [
      { x: 0, y: 0 }, { x: cutTop * W, y: 0 }, { x: cutBot * W, y: H }, { x: 0, y: H },
    ];
    const polyB: Pt[] = [
      { x: cutTop * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: cutBot * W, y: H },
    ];
    return [mk(a, 0, sa, polyA, "wedge"), mk(b, 1, sb, polyB, "wedge")];
  }


  // 3+ : any small share → corner triangle; remaining area split among larges
  {
    const CORNER_MAX3 = 0.25;
    const withShare = list.map((p, i) => ({ p, i, share: p.stake / total }));
    const smalls = withShare.filter((x) => x.share < CORNER_MAX3).sort((a, b) => a.share - b.share);
    const larges = withShare.filter((x) => x.share >= CORNER_MAX3).sort((a, b) => b.share - a.share);

    // 1..4 smalls + ≥1 large → smalls in corners (not thin wall strips)
    if (smalls.length >= 1 && smalls.length <= 4 && larges.length >= 1) {
      const seed0 = hash01(list.map((p) => p.telegramId).join("|"));
      const startCorner = Math.floor(seed0 * 4);
      const order = [0, 2, 1, 3];
      const used: Record<number, number> = {};
      const strips: Strip[] = new Array(n);

      smalls.forEach((s, k) => {
        const corner = (startCorner + order[k % 4]) % 4;
        const f = Math.min(0.55, Math.max(0.08, Math.sqrt(2 * s.share)));
        used[corner] = Math.max(used[corner] ?? 0, f);
        let polyS: Pt[];
        if (corner === 0) {
          polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
        } else if (corner === 1) {
          polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
        } else if (corner === 2) {
          polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
        } else {
          polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
        }
        strips[s.i] = mk(s.p, s.i, s.share, polyS, "corner");
      });

      if (larges.length === 1) {
        const u0 = used[0] ?? 0, u1 = used[1] ?? 0, u2 = used[2] ?? 0, u3 = used[3] ?? 0;
        const mainPts: Pt[] = [];
        if (u0 > 0) { mainPts.push({ x: 0, y: u0 * H }, { x: u0 * W, y: 0 }); }
        else mainPts.push({ x: 0, y: 0 });
        if (u1 > 0) { mainPts.push({ x: (1 - u1) * W, y: 0 }, { x: W, y: u1 * H }); }
        else mainPts.push({ x: W, y: 0 });
        if (u2 > 0) { mainPts.push({ x: W, y: (1 - u2) * H }, { x: (1 - u2) * W, y: H }); }
        else mainPts.push({ x: W, y: H });
        if (u3 > 0) { mainPts.push({ x: u3 * W, y: H }, { x: 0, y: (1 - u3) * H }); }
        else mainPts.push({ x: 0, y: H });
        strips[larges[0].i] = mk(larges[0].p, larges[0].i, larges[0].share, mainPts, "main");
        return strips.filter(Boolean) as Strip[];
      }

      // 2+ larges: vertical split; corner strips stay in array and render on top
      const largeTotal = larges.reduce((s, x) => s + x.share, 0) || 1;
      let acc = 0;
      const cuts: number[] = [0];
      larges.forEach((L, idx) => {
        acc += L.share / largeTotal;
        cuts.push(idx === larges.length - 1 ? 1 : acc);
      });
      larges.forEach((L, idx) => {
        const left = cuts[idx] * W;
        const right = cuts[idx + 1] * W;
        const poly: Pt[] = [
          { x: left, y: 0 }, { x: right, y: 0 },
          { x: right, y: H }, { x: left, y: H },
        ];
        strips[L.i] = mk(L.p, L.i, L.share, poly, "main");
      });
      return strips.filter(Boolean) as Strip[];
    }
  }

  // Fallback: sequential diagonal wedges by cumulative share
  const cuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += list[i].stake / total;
    cuts.push(i === n - 1 ? 1 : Math.min(0.999, acc));
  }
  const topX: number[] = [];
  const botX: number[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0) { topX.push(0); botX.push(0); continue; }
    if (i === n) { topX.push(W); botX.push(W); continue; }
    const base = cuts[i];
    const seed = hash01(list[i - 1].telegramId + "|" + list[i].telegramId + "|" + i);
    const tilt = (seed - 0.5) * 0.12;
    const shareL = cuts[i] - cuts[i - 1];
    const shareR = cuts[i + 1] - cuts[i];
    const maxT = Math.min(shareL, shareR) * 0.45;
    const tt = Math.max(-maxT, Math.min(maxT, tilt));
    topX.push(Math.max(0, Math.min(W, (base + tt) * W)));
    botX.push(Math.max(0, Math.min(W, (base - tt) * W)));
  }
  return list.map((p, i) => {
    const share = p.stake / total;
    const poly: Pt[] = [
      { x: topX[i], y: 0 },
      { x: topX[i + 1], y: 0 },
      { x: botX[i + 1], y: H },
      { x: botX[i], y: H },
    ];
    return mk(p, i, share, poly, "wedge");
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
/** Same seed string on every client for a finished room */
function animSeed(data: { id?: number; winnerId: string | null; totalPool: number; fair?: ArenaState["fair"]; players: ArenaPlayer[] }) {
  const stakes = data.players.map((p) => `${p.telegramId}:${p.stake}`).join("|");
  return [
    data.id ?? 0,
    data.winnerId ?? "",
    data.totalPool,
    data.fair?.hash ?? data.fair?.serverSeed ?? "",
    stakes,
  ].join("::");
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
  const [winnerData, setWinnerData] = useState<{
    name: string; payout: number; mult: number; photo?: string | null; color: string; prizes: { name: string; valueTon: number; imageUrl?: string | null }[];
  } | null>(null);
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
  const [stakeDetail, setStakeDetail] = useState<(ArenaPlayer & { color?: string; share?: number }) | null>(null);

  const [chips, setChips] = useState<number[]>(DEFAULT_CHIPS);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(0);
  const [editVal, setEditVal] = useState("");
  const [betMode, setBetMode] = useState<"ton" | "gift">("ton");
  const [gifts, setGifts] = useState<Array<{ id: number; itemId: string; nameRu: string; valueTon: number; imageUrl: string | null }>>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [selectedGiftIds, setSelectedGiftIds] = useState<number[]>([]);
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);

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

    // DETERMINISTIC — identical path on every device
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
      // direction marker phase
      if (!dirHidden && elapsed > DIR_MS) { dirHidden = true; setDirVisible(false); }
      const play = Math.max(0, elapsed - DIR_MS * 0.25);
      const raw = Math.min(1, play / SPIN_MS);
      const eased = raw >= 1 ? 1 : 1 - Math.pow(1 - raw, 3.8);

      if (raw >= 1) {
        setPuckPos(target);
        setTrail([]);
        setZoomOrigin(`${(target.x / W) * 100}% ${(target.y / H) * 100}%`);
        setBoardZoom(2);
        setPhase("winner"); setDirVisible(false); setWinnerTag(winName);
        hapticNotify("success");
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult = winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
        const prizes: { name: string; valueTon: number; imageUrl?: string | null }[] = [];
        for (const pl of data.players) {
          if (pl.telegramId === winner.telegramId) continue;
          for (const n of (pl.nftStakes ?? [])) {
            prizes.push({ name: n.nameRu || n.itemId || "NFT", valueTon: Number(n.valueTon) || 0, imageUrl: n.imageUrl });
          }
        }
        const totalPure = data.players.reduce((s, pl) => {
          const nftSum = (pl.nftStakes ?? []).reduce((a, n) => a + (Number(n.valueTon) || 0), 0);
          return s + Math.max(0, pl.stake - nftSum);
        }, 0);
        const othersPool = Math.max(0, data.totalPool - winner.stake);
        const burned = totalPure + 1e-9 < othersPool * COMMISSION;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout, mult, photo: winner.photoUrl, color: winner.color,
          prizes: burned ? [] : prizes,
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

      const pos = samplePath(path, eased);
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
      if (raw > 0.35) {
        const k = (raw - 0.35) / 0.65;
        const ease = 1 - Math.pow(1 - k, 2);
        setZoomOrigin(`${(pos.x / W) * 100}% ${(pos.y / H) * 100}%`);
        setBoardZoom(1 + ease * 1.0);
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

  async function loadGifts(autoSelectCheapest = false) {
    setGiftsLoading(true);
    try {
      const res = await fetch("/api/mini/inventory");
      const data = await res.json().catch(() => ({}));
      const inv = Array.isArray(data.inventory) ? data.inventory : [];
      const list = inv
        .filter((x: { itemType?: string }) => {
          const t = String(x.itemType || "").toLowerCase();
          return t.includes("nft") || t.includes("gift");
        })
        .map((x: { id: number; itemId: string; nameRu?: string; valueTon?: number; imageUrl?: string | null; meta?: Record<string, unknown> }) => {
          const m = (x.meta || {}) as Record<string, unknown>;
          return {
            id: x.id,
            itemId: x.itemId,
            nameRu: String(x.nameRu || m.giftName || m.nameRu || x.itemId),
            valueTon: Number(x.valueTon) || Number(m.valueTon) || Number(m.priceTon) || 0,
            imageUrl: (x.imageUrl || m.imageUrl || m.photoUrl || null) as string | null,
            locked: m.listed === true || m.spinLocked === true || m.arenaLocked === true,
          };
        })
        .filter((g: { locked: boolean }) => !g.locked)
        .sort((a: { valueTon: number }, b: { valueTon: number }) => a.valueTon - b.valueTon);
      setGifts(list);
      if (autoSelectCheapest && list.length > 0 && selectedGiftIds.length === 0) {
        setSelectedGiftIds([list[0].id]);
      }
    } catch {
      setGifts([]);
    } finally {
      setGiftsLoading(false);
    }
  }

  function toggleGift(id: number) {
    setSelectedGiftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const selectedGifts = gifts.filter((g) => selectedGiftIds.includes(g.id));
  const giftStakeTotal = selectedGifts.reduce((s, g) => s + (g.valueTon || 0), 0);

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

  async function placeGiftBet() {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    if (!canBet) { flash("Сейчас нельзя ставить", "err"); return; }
    if (selectedGiftIds.length === 0) { flash("Выбери NFT", "err"); return; }
    setBusy(true); haptic("light");
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          giftInventoryIds: selectedGiftIds,
          giftInventoryId: selectedGiftIds[0],
        }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d as ArenaState);
      setSelectedGiftIds([]);
      setGiftPickerOpen(false);
      refreshBalance();
      loadGifts();
      flash(me ? `Докид NFT +${giftStakeTotal.toFixed(2)} TON` : `Ставка ${giftStakeTotal.toFixed(2)} TON (NFT)`, "ok");
    } catch { flash("Сеть", "err"); }
    finally { setBusy(false); }
  }

  function openEdit() {
    setEditIdx(0);
    setEditVal("");
    setEditOpen(true);
  }
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
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontWeight: 700, fontSize: 14, zIndex: 2 }}>
              Сделайте первую ставку
            </div>
          ) : [...strips].sort((a, b) => (a.shape === "corner" ? 1 : 0) - (b.shape === "corner" ? 1 : 0)).map((s) => {
            const isCorner = s.shape === "corner";
            // Avatar scales with territory so it stays inside small corner triangles
            let av: number;
            if (isCorner) {
              const f = Math.sqrt(2 * Math.max(0.008, s.share));
              const maxFit = Math.floor(f * Math.min(W, H) * 0.38);
              av = Math.max(14, Math.min(34, maxFit));
            } else {
              av = Math.round(Math.min(88, Math.max(36, 28 + s.share * 90)));
            }
            const clip = (s.poly && s.poly.length)
              ? `polygon(${s.poly.map((q) => `${(q.x / W) * 100}% ${(q.y / H) * 100}%`).join(", ")})`
              : undefined;
            const pad = av / 2 + 2;
            const ax = Math.max(pad, Math.min(W - pad, s.cx || W / 2));
            const ay = Math.max(pad, Math.min(H - pad, s.cy || H / 2));
            return (
              <div key={s.telegramId} style={{
                position: "absolute", left: 0, top: 0, width: W, height: H,
                background: s.color,
                clipPath: clip,
                WebkitClipPath: clip,
                overflow: "hidden",
                // Corners must sit above full-height large strips or they vanish
                zIndex: isCorner ? 5 : 1,
                transition: phase === "lobby" ? "clip-path .45s ease" : "none",
              }}>
                <div className="ar-strip-gloss" />
                <div style={{
                  position: "absolute",
                  left: ax - av / 2,
                  top: ay - av / 2,
                  width: av, height: av, borderRadius: "50%",
                  border: `${av < 22 ? 2 : 3}px solid rgba(255,255,255,0.95)`, overflow: "hidden",
                  background: "rgba(10,10,18,0.55)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: av * 0.32, color: "#fff", zIndex: 2,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                }}>
                  {avatarSrc(s.photoUrl, s.username)
                    ? <img
                        src={avatarSrc(s.photoUrl, s.username)!}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.style.display = "none";
                          if (el.parentElement) el.parentElement.textContent = initials(s.username, s.telegramId);
                        }}
                      />
                    : initials(s.username, s.telegramId)}
                </div>
                {(isCorner || s.share >= 0.10) && (
                  <div style={{
                    position: "absolute", left: ax, top: ay + av / 2 + 4,
                    transform: "translateX(-50%)", textAlign: "center", zIndex: 2,
                    textShadow: "0 1px 4px rgba(0,0,0,.55)", pointerEvents: "none",
                  }}>
                    <div style={{ fontSize: isCorner ? 10 : 11, fontWeight: 900, color: "#fff", maxWidth: isCorner ? 72 : 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(s.username || s.telegramId).replace(/^@/, "").slice(0, 10)}
                    </div>
                    <div style={{ fontSize: isCorner ? 11 : 12, fontWeight: 800, color: "rgba(255,255,255,.95)" }}>
                      {(s.chance || s.share * 100).toFixed(1)}%
                    </div>
                  </div>
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
                {/* direction only at start */}
                {dirVisible && (
                  <g style={{ animation: "arDir .35s ease-out" }}>
                    <line
                      x1={puckPos.x} y1={puckPos.y}
                      x2={puckPos.x + Math.cos(dirAngle) * 40}
                      y2={puckPos.y + Math.sin(dirAngle) * 40}
                      stroke="#111" strokeWidth={3} strokeLinecap="round" markerEnd="url(#arrH)" opacity={0.95}
                    />
                  </g>
                )}
                {/* glass target puck — white ring + cross */}
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R + 3} fill="rgba(0,0,0,0.22)" />
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R + 0.5} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.95)" strokeWidth={3.4} />
                <circle cx={puckPos.x} cy={puckPos.y} r={BALL_R - 3.4} fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.45)" strokeWidth={1.1} />
                <line x1={puckPos.x - (BALL_R - 2)} y1={puckPos.y} x2={puckPos.x + (BALL_R - 2)} y2={puckPos.y} stroke="rgba(255,255,255,0.92)" strokeWidth={2.2} strokeLinecap="round" />
                <line x1={puckPos.x} y1={puckPos.y - (BALL_R - 2)} x2={puckPos.x} y2={puckPos.y + (BALL_R - 2)} stroke="rgba(255,255,255,0.92)" strokeWidth={2.2} strokeLinecap="round" />
                <circle cx={puckPos.x} cy={puckPos.y} r={2.0} fill="rgba(255,255,255,0.95)" />
              </svg>
              {winnerTag && (
                <div style={{
                  position: "absolute", left: puckPos.x, top: puckPos.y - BALL_R - 24,
                  transform: "translateX(-50%)", zIndex: 8, pointerEvents: "none",
                  background: "rgba(0,0,0,0.8)", color: "#fff", fontWeight: 800, fontSize: 12,
                  padding: "4px 11px", borderRadius: 8, whiteSpace: "nowrap",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.45)", animation: "arPop .35s ease-out",
                }}>
                  {winnerTag}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={playersCard}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 4 }}>
          ИГРОКИ · {strips.length}
        </div>
        <div>
          {strips.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Пока никого</div>
          ) : strips.map((s) => {
            const nfts = s.nftStakes ?? [];
            const isNft = nfts.length > 0;
            return (
              <button type="button" key={s.telegramId} onClick={() => setStakeDetail(s)} style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14, padding: "10px 12px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    border: `2px solid ${s.color}`, background: "#0a0a12",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 11, color: "#fff",
                  }}>
                    {avatarSrc(s.photoUrl, s.username)
                      ? <img
                          src={avatarSrc(s.photoUrl, s.username)!}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = "none";
                            if (el.parentElement) el.parentElement.textContent = initials(s.username, s.telegramId);
                          }}
                        />
                      : initials(s.username, s.telegramId)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: 800, fontSize: 14,
                      color: s.telegramId === telegramId ? "#4ade80" : "#e2e8f0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      @{(s.username || s.telegramId).replace(/^@/, "").slice(0, 16)}
                      {s.telegramId === telegramId ? " (вы)" : ""}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, color: "#94a3b8" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      {(s.chance || s.share * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 16, flexShrink: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                    {(() => {
                      const v = Number(s.stake);
                      return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
                    })()} TON
                  </div>
                </div>
                {(() => {
                  const nftSum = nfts.reduce((a, n) => a + (Number(n.valueTon) || 0), 0);
                  const pureTon = Math.max(0, Math.round((Number(s.stake) - nftSum) * 1000) / 1000);
                  if (pureTon < 1e-9 && nfts.length === 0) return null;
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {pureTon > 1e-9 && <TonChip amount={pureTon} size={56} />}
                      {nfts.map((n) => (
                        <div key={n.inventoryId} style={{
                          width: 56, height: 56, borderRadius: 14, overflow: "hidden", position: "relative",
                          background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {n.imageUrl
                            ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 18 }}>🎁</span>}
                          <span style={{
                            position: "absolute", left: 5, bottom: 4, fontSize: 11, fontWeight: 900, color: "#fff",
                            textShadow: "0 1px 2px #000",
                          }}>{n.valueTon}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed bets ABOVE bottom menu */}
      <div style={betBar}>
        {/* Ряд 1: переключатель 🎁 / TON в общей «пилюле» */}
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 2, padding: 3,
            borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          }}>
            <button type="button" disabled={busy || !canBet}
              onClick={() => { setBetMode("gift"); loadGifts(true); }}
              style={{
                width: 40, height: 30, borderRadius: 999, border: "none", cursor: canBet && !busy ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                background: betMode === "gift" ? "#3b82f6" : "transparent",
                color: betMode === "gift" ? "#fff" : "rgba(255,255,255,0.55)",
                opacity: canBet && !busy ? 1 : 0.5,
              }}>🎁</button>
            <button type="button" disabled={busy || !canBet}
              onClick={() => setBetMode("ton")}
              style={{
                width: 40, height: 30, borderRadius: 999, border: "none", cursor: canBet && !busy ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                background: betMode === "ton" ? "#3b82f6" : "transparent",
                color: betMode === "ton" ? "#fff" : "rgba(255,255,255,0.55)",
                opacity: canBet && !busy ? 1 : 0.5,
              }}><TonIcon size={22} /></button>
          </div>
        </div>

        {betMode === "ton" ? (
          <>
            {/* Ряд 2: ✎ 1 5 10 25 Ва-банк — аккуратные чипы с фоном */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
              <button type="button" onClick={openEdit} style={{
                flex: "0 0 auto", width: 57, height: 57, padding: 0, fontSize: 18,
                borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)",
                background: "#0a0a0f", color: "#cbd5e1",
                cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }} title="Изменить">✎</button>
              {chips.map((v, i) => (
                <button key={i} type="button" disabled={busy || !canBet} onClick={() => placeBet(v)}
                  style={{
                    flex: "1 1 0", minWidth: 0, height: 57, opacity: busy || !canBet ? 0.45 : 1,
                    cursor: busy || !canBet ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                    padding: "0 4px", borderRadius: 14, fontWeight: 900, fontSize: 16,
                    background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.14)",
                    color: "#f1f5f9", fontFamily: "inherit",
                  }}>
                  {v}<span style={{ marginLeft: 4, display: "inline-flex", alignItems: "center" }}><TonIcon size={15} /></span>
                </button>
              ))}
              <button type="button" disabled={busy || !canBet || balanceTon < MIN_STAKE}
                onClick={() => placeBet(Math.floor(balanceTon * 1000) / 1000)}
                style={{
                  flex: "1.25 1 0", minWidth: 0, height: 57,
                  opacity: busy || !canBet || balanceTon < MIN_STAKE ? 0.45 : 1,
                  cursor: busy || !canBet ? "not-allowed" : "pointer",
                  padding: "0 6px", borderRadius: 14, fontWeight: 900, fontSize: 14,
                  background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f1f5f9", whiteSpace: "nowrap", fontFamily: "inherit",
                }}>
                Ва-банк
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              Баланс: <span style={{ color: "#4ade80", fontWeight: 800 }}>{balanceTon.toFixed(2)} TON</span>
              {meIn ? " · докид" : ""}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
            <button type="button" disabled={!canBet || busy}
              onClick={() => { setGiftPickerOpen(true); loadGifts(true); }}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 999, border: "none",
                background: "#f1f5f9", color: "#0f172a", fontWeight: 800, fontSize: 14,
                cursor: canBet && !busy ? "pointer" : "not-allowed", opacity: canBet && !busy ? 1 : 0.5,
              }}>
              Выбрать гифты{selectedGiftIds.length > 1 ? ` (${selectedGiftIds.length})` : ""}
            </button>
            <button type="button" disabled={busy || !canBet || selectedGiftIds.length === 0}
              onClick={placeGiftBet}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)",
                background: "#2a2a32", color: "#e2e8f0", fontWeight: 800, fontSize: 13,
                cursor: busy || !canBet || !selectedGiftIds.length ? "not-allowed" : "pointer",
                opacity: selectedGiftIds.length ? 1 : 0.55,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                minHeight: 44,
              }}>
              {busy ? "…" : (
                <>
                  <span style={{ fontWeight: 800 }}>{meIn ? "Добавить" : "Поставить"}</span>
                  {selectedGifts.length === 1 && selectedGifts[0].imageUrl ? (
                    <img src={selectedGifts[0].imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", background: "#111" }} />
                  ) : selectedGifts.length > 1 ? (
                    <span style={{ fontSize: 15 }}>🎁×{selectedGifts.length}</span>
                  ) : selectedGifts.length === 1 ? (
                    <span style={{ fontSize: 16 }}>🎁</span>
                  ) : null}
                  {giftStakeTotal > 0 && (
                    <span style={{ fontWeight: 900, color: "#fff" }}>{giftStakeTotal.toFixed(2)}</span>
                  )}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {giftPickerOpen && (
        <div style={overlay} onClick={() => setGiftPickerOpen(false)}>
          <div style={{ ...sheet, maxHeight: "75vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Выбрать гифты</div>
              <button type="button" onClick={() => setGiftPickerOpen(false)} style={{ ...iconBtn, width: 36, height: 36 }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              Можно несколько. По умолчанию — самый дешёвый.
            </div>
            {giftsLoading ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>Загрузка…</div>
            ) : gifts.length === 0 ? (
              <div style={{ fontSize: 13 }}>Нет доступных NFT</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {gifts.map((g) => {
                  const on = selectedGiftIds.includes(g.id);
                  return (
                    <button key={g.id} type="button" onClick={() => toggleGift(g.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14,
                        cursor: "pointer", textAlign: "left",
                        border: on ? "1px solid rgba(59,130,246,0.7)" : "1px solid rgba(255,255,255,0.08)",
                        background: on ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)", color: "#f1f5f9",
                      }}>
                      {g.imageUrl
                        ? <img src={g.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                        : <span style={{ fontSize: 24 }}>🎁</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nameRu}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{g.valueTon} TON</div>
                      </div>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: on ? "none" : "2px solid rgba(255,255,255,0.25)",
                        background: on ? "#3b82f6" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900,
                      }}>{on ? "✓" : ""}</div>
                    </button>
                  );
                })}
              </div>
            )}
            <button type="button" disabled={selectedGiftIds.length === 0}
              onClick={() => setGiftPickerOpen(false)}
              style={{
                width: "100%", marginTop: 14, padding: "14px", borderRadius: 14, border: "none",
                background: selectedGiftIds.length ? "linear-gradient(135deg,#3b82f6,#60a5fa)" : "rgba(255,255,255,0.08)",
                color: "#fff", fontWeight: 900, fontSize: 14, cursor: selectedGiftIds.length ? "pointer" : "default",
              }}>
              {selectedGiftIds.length
                ? `Готово · ${selectedGiftIds.length} · ${giftStakeTotal.toFixed(2)} TON`
                : "Выбери хотя бы один"}
            </button>
          </div>
        </div>
      )}


      {/* Edit chips — pick button + amount + clear + apply */}
      {editOpen && (
        <div style={overlay} onClick={() => setEditOpen(false)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#86efac", letterSpacing: "0.1em", marginBottom: 12 }}>ИЗМЕНИТЬ КНОПКУ</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "center" }}>
              {chips.map((v, i) => (
                <button key={i} type="button" onClick={() => { setEditIdx(i); setEditVal(""); }}
                  style={{
                    ...chip, minWidth: 56,
                    outline: editIdx === i ? "2px solid #4ade80" : "none",
                    background: editIdx === i ? "rgba(34,197,94,0.25)" : chip.background,
                  }}>
                  {v}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>Сумма для кнопки #{editIdx + 1}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={editVal}
                inputMode="decimal"
                placeholder="0.1"
                onChange={(e) => setEditVal(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" onClick={() => setEditVal("")} style={{ ...chip, minWidth: 52, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(127,29,29,0.25)" }}>
                ⌫
              </button>
            </div>
            <button type="button" onClick={applyEdit} style={{ ...chip, width: "100%", marginTop: 14, padding: "14px" }}>
              Применить
            </button>
          </div>
        </div>
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

      {/* History — Portals-like cards */}
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
                    <div style={{
                      background: "rgba(59,130,246,0.2)", color: "#93c5fd", fontWeight: 900, fontSize: 13,
                      padding: "4px 10px", borderRadius: 10,
                    }}>
                      {mult.toFixed(2)}x
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>#{room.id}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", background: colorFor(0),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, color: "#fff", overflow: "hidden", flexShrink: 0,
                    }}>
                      {wp?.photoUrl
                        ? <img src={wp.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : initials(room.winnerUsername, room.winnerId || "?")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {(room.winnerUsername || room.winnerId || "?").replace(/^@/, "").slice(0, 16)}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        {room.finishedAt ? new Date(room.finishedAt).toLocaleString() : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "#e2e8f0" }}>{room.winnerPayout.toFixed(3)} TON</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Шанс {chance.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => replayRoom(room)} style={histBtn}>Открыть повтор</button>
                    <button type="button" onClick={() => setFairInfo(room)} style={{ ...histBtn, background: "#3b82f6", color: "#fff", border: "none" }}>
                      Проверка честности
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fairness detail */}
      {fairInfo && (
        <div style={overlay} onClick={() => setFairInfo(null)}>
          <div style={{ ...sheet, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Игра #{fairInfo.id}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {fairInfo.finishedAt ? new Date(fairInfo.finishedAt).toLocaleString() : ""}
                </div>
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
                <div key={p.telegramId} style={{
                  ...histCard, marginBottom: 8,
                  border: isW ? "1px solid rgba(74,222,128,0.45)" : histCard.border,
                  background: isW ? "rgba(22,101,52,0.25)" : histCard.background,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>
                        {(p.username || p.telegramId).replace(/^@/, "")}
                        {isW && <span style={{ color: "#4ade80", marginLeft: 8, fontSize: 12 }}>Победитель</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{ch.toFixed(2)}%</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{p.stake.toFixed(2)} TON</div>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => replayRoom(fairInfo)} style={{ ...chip, width: "100%", marginTop: 8 }}>
              Открыть повтор
            </button>
          </div>
        </div>
      )}


      {stakeDetail && (
        <div onClick={() => setStakeDetail(null)} style={{
          position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 320, borderRadius: 22,
            background: "linear-gradient(180deg,#1a1a24,#0f0f18)",
            border: "1px solid rgba(255,255,255,0.1)", padding: "16px 16px 18px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                Ставка @{(stakeDetail.username || stakeDetail.telegramId || "").replace(/^@/, "")}
              </div>
              <button type="button" onClick={() => setStakeDetail(null)}
                style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 16, letterSpacing: "-0.02em" }}>
              {(() => {
                const v = Number(stakeDetail.stake);
                return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
              })()} TON
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(() => {
                const nfts = stakeDetail.nftStakes ?? [];
                const nftSum = nfts.reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
                const pureTon = Math.max(0, Math.round((Number(stakeDetail.stake) - nftSum) * 1000) / 1000);
                return (
                  <>
                    {pureTon > 1e-9 && (
                      <TonChip amount={pureTon} size={88} />
                    )}
                    {nfts.map((n) => (
                      <div key={n.inventoryId} style={{
                        width: 88, height: 88, borderRadius: 18, overflow: "hidden", position: "relative",
                        background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {n.imageUrl
                          ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 28 }}>🎁</span>}
                        <span style={{
                          position: "absolute", left: 7, bottom: 5, fontSize: 12, fontWeight: 900, color: "#fff",
                          textShadow: "0 1px 3px #000",
                        }}>{n.valueTon}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

            {toast && (
        <div style={{ ...toastStyle, background: toast.type === "ok" ? "rgba(22,101,52,0.95)" : "rgba(127,29,29,0.95)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

const root: CSSProperties = {
  position: "relative", minHeight: "100%", paddingBottom: 200, color: "#fff",
  fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', overflowX: "hidden",
};
const header: CSSProperties = {
  display: "flex", alignItems: "center", padding: "52px 12px 8px", position: "relative", zIndex: 2,
};
const iconBtn: CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: "none",
  background: "transparent", color: "#fff", fontSize: 18, fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const statusPill: CSSProperties = {
  display: "inline-block", padding: "5px 12px", borderRadius: 999,
  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)",
  color: "#86efac", fontWeight: 800, fontSize: 12,
};
const boardWrap: CSSProperties = { display: "flex", justifyContent: "center", margin: "0 auto 4px", position: "relative", zIndex: 1, width: W, height: H, overflow: "hidden", borderRadius: 18 };
const playersCard: CSSProperties = {
  margin: "10px 14px 12px", background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))",
  borderRadius: 16, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 1,
  // List grows with players; page scrolls down (no cramped inner scrollbar)
  maxHeight: "none", overflow: "visible",
};
const playerRow: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
};
const betBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 62, zIndex: 40,
  padding: "6px 12px 10px",
  background: "transparent",
  borderTop: "none",
};
const chip: CSSProperties = {
  padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)",
  background: "#0a0a0f", color: "#f1f5f9", fontWeight: 900, fontSize: 14,
  cursor: "pointer", fontFamily: "inherit", minWidth: 50,
};
const editBtn: CSSProperties = {
  ...chip, minWidth: 38, width: 38, height: 38, padding: 0, color: "#cbd5e1",
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
const toastStyle: CSSProperties = {
  position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", color: "#fff",
  padding: "10px 16px", borderRadius: 12, fontWeight: 700, zIndex: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};
const histCard: CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16, padding: 14, marginBottom: 12,
};
const histBtn: CSSProperties = {
  flex: 1, padding: "10px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "inherit",
};
