import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

/* Portals arena v3 — full paint, no center hole, smooth 6s puck */
const SQ = 300;
const CX = SQ / 2;
const CY = SQ / 2;
const BALL_R = 10;

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
}

type Phase = "lobby" | "spin" | "winner";

interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange?: (v?: number) => void;
  onClose: () => void;
  onOpenHistory?: () => void;
}

const COLORS = [
  "#5BE12C", "#FF4136", "#FF9F00", "#00C0FF",
  "#B044FF", "#FFEB3B", "#FF69B4", "#00FFB2",
  "#FF6E40", "#39CCCC",
];

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 5, 10];

function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number) {
  return COLORS[i % COLORS.length];
}


type Point = [number, number];

function clipPolygon(poly: Point[], a: number, b: number, c: number): Point[] {
  if (!poly.length) return [];
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = a * cur[0] + b * cur[1] <= c + 1e-7;
    const prevIn = a * prev[0] + b * prev[1] <= c + 1e-7;
    if (curIn !== prevIn) {
      const dx = cur[0] - prev[0];
      const dy = cur[1] - prev[1];
      const den = a * dx + b * dy;
      if (Math.abs(den) > 1e-9) {
        const t = (c - a * prev[0] - b * prev[1]) / den;
        out.push([prev[0] + t * dx, prev[1] + t * dy]);
      }
    }
    if (curIn) out.push(cur);
  }
  return out;
}

function polygonCenter(poly: Point[]): Point {
  if (!poly.length) return [CX, CY];
  return [
    poly.reduce((sum, p) => sum + p[0], 0) / poly.length,
    poly.reduce((sum, p) => sum + p[1], 0) / poly.length,
  ];
}

function polygonContains(poly: Point[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function createSeededRandom(seedText: string) {
  // A stable PRNG means every client derives the same spin parameters for this round.
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInZone(zone: ReturnType<typeof buildSectors>[number], random: () => number) {
  const poly = zone.polygon;
  if (!poly?.length) return { x: zone.ax, y: zone.ay };
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  for (let i = 0; i < 1200; i++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    if (polygonContains(poly, x, y)) return { x, y };
  }
  return { x: zone.ax, y: zone.ay };
}

function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function buildSectors(players: ArenaPlayer[], roundId = 0) {
  const total = players.reduce((s, p) => s + Math.max(0, p.stake), 0) || 1;
  const sites = players.map((p, i) => {
    const random = createSeededRandom(`zone:${roundId}:${p.telegramId}`);
    return {
      x: 22 + random() * (SQ - 44),
      y: 22 + random() * (SQ - 44),
      weight: 0,
      index: i,
    };
  });

  // Iteratively tune power-diagram weights until each cell's area tracks
  // its share of the pool. Fixed sites keep zones stable while bets change.
  const makePolygons = () => sites.map((site, i) => {
    let polygon: Point[] = [[0, 0], [SQ, 0], [SQ, SQ], [0, SQ]];
    for (let j = 0; j < sites.length && polygon.length; j++) {
      if (j === i) continue;
      const other = sites[j];
      const a = 2 * (other.x - site.x);
      const b = 2 * (other.y - site.y);
      const limit = other.x * other.x + other.y * other.y -
        site.x * site.x - site.y * site.y + site.weight - other.weight;
      polygon = clipPolygon(polygon, a, b, limit);
    }
    return polygon;
  };

  for (let iteration = 0; iteration < 32 && players.length > 1; iteration++) {
    const polygons = makePolygons();
    const areas = polygons.map(polygonArea);
    const areaTotal = areas.reduce((sum, area) => sum + area, 0) || 1;
    for (let i = 0; i < sites.length; i++) {
      const targetShare = Math.max(0, players[i].stake) / total;
      const actualShare = areas[i] / areaTotal;
      sites[i].weight += (targetShare - actualShare) * 24000;
    }
    // Keep the weights centered to avoid unbounded drift; only differences matter.
    const mean = sites.reduce((sum, site) => sum + site.weight, 0) / sites.length;
    for (const site of sites) site.weight -= mean;
  }

  const polygons = makePolygons();
  return players.map((p, i) => {
    const site = sites[i];
    let polygon = polygons[i];
    if (polygon.length < 3 || polygonArea(polygon) < 1) {
      // Keep a visible fallback for degenerate cells rather than emitting invalid SVG.
      polygon = [[site.x - 1, site.y - 1], [site.x + 1, site.y - 1], [site.x, site.y + 1]];
    }
    const [ax, ay] = polygonCenter(polygon);
    const share = Math.max(0, p.stake) / total;
    const startDeg = 0;
    const endDeg = 360;
    const size = Math.max(30, Math.min(48, 28 + share * 36));
    return {
      ...p, share, startDeg, endDeg, midDeg: 0,
      color: colorFor(i), index: i, ax, ay, size, polygon,
      points: polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    };
  });
}
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}

export default function ArenaGame({
  telegramId, tonBalance, onBalanceChange, onClose, onOpenHistory,
}: Props) {
  const { photoUrl } = useTelegram();
  const qc = useQueryClient();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  } as Parameters<typeof useGetUserProfile>[1]);
  const balanceTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0);
  const balanceTonyx = Number(
    (profile as { tonyxCoins?: string | number; tonyx?: string | number } | undefined)?.tonyxCoins ??
      (profile as { tonyx?: string | number } | undefined)?.tonyx ?? 0,
  );
  const [betCurrency, setBetCurrency] = useState<"ton" | "tonyx">("ton");
  const balance = betCurrency === "ton" ? balanceTon : balanceTonyx;
  const refreshBalance = useCallback(() => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    onBalanceChange?.();
  }, [qc, telegramId, onBalanceChange]);

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [winnerData, setWinnerData] = useState<{ name: string; payout: number; mult: number; photo?: string | null } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [customBet, setCustomBet] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoStake, setAutoStake] = useState(0.1);
  const [boardZoom, setBoardZoom] = useState(1);
  const [arrowAngle, setArrowAngle] = useState(0);
  const [arrowOn, setArrowOn] = useState(false);
  const autoPlayRef = useRef(false);
  const autoStakeRef = useRef(0.1);

  const ballRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const arrowRef = useRef<SVGGElement | null>(null);
  const posRef = useRef({ x: CX, y: CY });
  const velRef = useRef({ vx: 0, vy: 0 });
  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const myPhoto = photoUrl;

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { arenaIdRef.current = arena?.id ?? null; }, [arena?.id]);
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);
  useEffect(() => { autoStakeRef.current = autoStake; }, [autoStake]);

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

  function placeBall(nx: number, ny: number, ang?: number) {
    posRef.current = { x: nx, y: ny };
    ballRef.current?.setAttribute("cx", nx.toFixed(2));
    ballRef.current?.setAttribute("cy", ny.toFixed(2));
    glowRef.current?.setAttribute("cx", nx.toFixed(2));
    glowRef.current?.setAttribute("cy", ny.toFixed(2));
    if (ang !== undefined && arrowRef.current) {
      arrowRef.current.setAttribute("transform", `translate(${nx.toFixed(2)},${ny.toFixed(2)}) rotate(${ang.toFixed(1)})`);
    }
  }

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    placeBall(CX, CY);
    setWinnerData(null);
    setFreezeSectors(null);
    setFreezePool(0);
    setBoardZoom(1);
    setArrowOn(false);
  }

  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const secs = buildSectors(data.players, data.id);
    const winner = secs.find((s) => s.telegramId === data.winnerId) ?? secs[0];
    if (!winner) return;

    setFreezeSectors(secs);
    setFreezePool(data.totalPool);
    setPhase("spin");
    setWinnerData(null);
    setBoardZoom(1);
    setArrowOn(true);

    const random = createSeededRandom(`${data.id}:${data.winnerId ?? winner.telegramId}`);
    const target = randomInZone(winner, random);
    const startAng = random() * Math.PI * 2;
    const startR = 8 + random() * 18;
    const sx = CX + Math.cos(startAng) * startR;
    const sy = CY + Math.sin(startAng) * startR;
    const dir = random() * Math.PI * 2;
    const speed = 9.5 + random() * 3.5;
    placeBall(sx, sy, (dir * 180) / Math.PI);
    velRef.current = { vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed };

    const startTime = performance.now();
    const TOTAL_MS = 6200;
    const EDGE = 4;
    let last = startTime;
    let stopped = false;

    const step = (now: number) => {
      if (stopped) return;
      const elapsed = now - startTime;
      // Hard deadline: stop the physics before another movement frame can run.
      if (elapsed >= TOTAL_MS) {
        // Stop in one frame: do not tween from the current point to the target,
        // because that late correction visibly slows down and reverses the ball.
        stopped = true;
        placeBall(target.x, target.y);
        velRef.current = { vx: 0, vy: 0 };
        setArrowOn(false);
        setBoardZoom(1.22);
        setPhase("winner");
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult = winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
        setWinnerData({ name: data.winnerUsername || winner.username || winner.telegramId, payout, mult, photo: winner.photoUrl });
        rafRef.current = null;
        setTimeout(() => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
          if (autoPlayRef.current && autoStakeRef.current > 0) setTimeout(() => placeBet(autoStakeRef.current), 700);
        }, 3200);
        return;
      }
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const raw = elapsed / TOTAL_MS;
      const pos = posRef.current;
      let { vx, vy } = velRef.current;

      let friction: number;
      if (raw < 0.35) friction = 0.997;
      else if (raw < 0.55) friction = 0.988;
      else if (raw < 0.72) friction = 0.97;
      else if (raw < 0.88) friction = 0.94;
      else friction = 0.88;

      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);

      if (raw > 0.42) {
        // Apply a bounded steering acceleration instead of a growing spring force.
        // The old spring could overshoot the target, reverse direction, then accelerate
        // back again, which looked like a sudden chaotic change of direction.
        const pull = Math.min(1, Math.max(0, (raw - 0.42) / 0.58));
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const distance = Math.hypot(dx, dy);
        const desiredSpeed = 2.2 + (1 - pull) * 2.8;
        const desiredVx = distance > 0.001 ? (dx / distance) * desiredSpeed : 0;
        const desiredVy = distance > 0.001 ? (dy / distance) * desiredSpeed : 0;
        const steerLimit = (2.5 + pull * 4) * dt;
        const steerX = desiredVx - vx;
        const steerY = desiredVy - vy;
        const steerLength = Math.hypot(steerX, steerY);
        if (steerLength > steerLimit && steerLength > 0) {
          vx += (steerX / steerLength) * steerLimit;
          vy += (steerY / steerLength) * steerLimit;
        } else {
          vx = desiredVx;
          vy = desiredVy;
        }
      }

      let nx = pos.x + vx * dt * 60;
      let ny = pos.y + vy * dt * 60;

      if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx) * 0.92; }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx) * 0.92; }
      if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy) * 0.92; }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy) * 0.92; }

      velRef.current = { vx, vy };
      const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
      placeBall(nx, ny, ang);
      setArrowAngle(ang);

      if (raw > 0.78) setBoardZoom(1 + ((raw - 0.78) / 0.22) * 0.22);

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
        settledRef.current.add(d.id);
        setArena(d);
        runSpinAnimation(d);
      }
    } catch { /* ignore */ }
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
    const t = setTimeout(() => fetchState(), Math.max(0, ms + 60));
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  const liveSectors = useMemo(() => buildSectors(arena?.players ?? [], arena?.id ?? 0), [arena?.players, arena?.id]);
  const sectors = freezeSectors ?? liveSectors;
  const pool = freezeSectors ? freezePool : (arena?.totalPool ?? 0);

  async function placeBet(amount: number) {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    if (phase !== "lobby") { flash("Дождитесь окончания игры", "err"); return; }
    if (arena?.status === "finished") { flash("Игра завершена, подождите…", "err"); return; }
    if (!amount || amount < MIN_STAKE) { flash(`Мин. ${MIN_STAKE}`, "err"); return; }
    if (amount > balance + 1e-9) { flash("Недостаточно средств", "err"); return; }
    setBusy(true);
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount, currency: betCurrency }
        : { telegramId, stake: amount, currency: betCurrency };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d);
      flash(me ? "Ставка увеличена" : "Вы в игре!", "ok");
      refreshBalance();
    } catch { flash("Сеть недоступна", "err"); }
    finally { setBusy(false); }
  }

  function playerPhoto(s: ReturnType<typeof buildSectors>[0]) {
    if (s.telegramId === telegramId && myPhoto) return myPhoto;
    return s.photoUrl ?? null;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0a0a12", color: "#f1f1f8", display: "flex", flexDirection: "column", fontFamily: "Inter, system-ui, sans-serif" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999, padding: "10px 18px", borderRadius: 12, background: toast.type === "ok" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)", color: "#fff", fontWeight: 700, fontSize: 13 }}>{toast.msg}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#a0a0c0", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>⚔️ Арена</div>
        <button type="button" onClick={() => onOpenHistory?.()} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#c4b5fd", fontSize: 11, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>История</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setBetCurrency("ton")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, border: betCurrency === "ton" ? "1.5px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)", background: betCurrency === "ton" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ color: "#60a5fa" }}>◆</span>{balanceTon.toFixed(2)}
          </button>
          <button type="button" onClick={() => setBetCurrency("tonyx")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, border: betCurrency === "tonyx" ? "1.5px solid #a855f7" : "1px solid rgba(255,255,255,0.1)", background: betCurrency === "tonyx" ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ color: "#c084fc" }}>●</span>{balanceTonyx.toFixed(0)}
          </button>
        </div>
        <div style={{ padding: "6px 14px", borderRadius: 12, background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))", border: "1px solid rgba(167,139,250,0.35)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, letterSpacing: 0.5 }}>БАНК</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{pool > 0 ? pool.toFixed(2) : "0.00"} TON</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "2px 14px 8px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: phase === "spin" ? "#fbbf24" : arena?.status === "starting" ? "#34d399" : "#94a3b8" }}>
          {phase === "spin" ? "Крутим…" : phase === "winner" ? "Победитель" : arena?.status === "starting" ? "Старт" : "Набор"}
        </span>
        {arena?.status === "starting" && countdown > 0 && phase === "lobby" && (
          <span style={{ fontSize: 18, fontWeight: 900, color: countdown <= 5 ? "#ef4444" : "#f1f5f9", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "center" }}>⏱ {countdown}с</span>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>{sectors.length} игр.</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 16px" }}>
          <div style={{ width: SQ, height: SQ, maxWidth: "100%", position: "relative", borderRadius: 16, overflow: "hidden", transform: `scale(${boardZoom})`, transformOrigin: "center center", transition: phase === "spin" ? "none" : "transform 400ms ease", boxShadow: phase === "spin" ? "0 0 0 2px rgba(251,191,36,0.45), 0 16px 40px rgba(0,0,0,0.55)" : "0 0 0 1px #1F2937, 0 16px 40px rgba(0,0,0,0.55)" }}>
            <svg width={SQ} height={SQ} style={{ display: "block" }}>
              <rect x={0} y={0} width={SQ} height={SQ} fill={sectors[0]?.color ?? "#111827"} />
              {sectors.map((s) => (
                <polygon key={s.telegramId} points={s.points} fill={s.color} stroke="#0a0a12" strokeWidth={1.5} strokeLinejoin="round" />
              ))}
              <circle ref={glowRef} cx={CX} cy={CY} r={BALL_R + 6} fill="white" opacity={0.12} />
              <circle ref={ballRef} cx={CX} cy={CY} r={BALL_R} fill="white" stroke="rgba(0,0,0,0.25)" strokeWidth={1} style={{ filter: "drop-shadow(0 2px 10px rgba(255,255,255,0.75))" }} />
              {arrowOn && (
                <g ref={arrowRef} transform={`translate(${CX},${CY}) rotate(${arrowAngle})`}>
                  <polygon points="18,-5 32,0 18,5" fill="#fbbf24" stroke="#fff" strokeWidth={0.8} opacity={0.95} />
                </g>
              )}
            </svg>
            {sectors.map((s) => {
              const isWin = phase === "winner" && s.telegramId === arena?.winnerId;
              const photo = playerPhoto(s);
              return (
                <div key={s.telegramId} style={{ position: "absolute", left: s.ax - s.size / 2, top: s.ay - s.size / 2, width: s.size, height: s.size, borderRadius: "50%", background: s.color, border: isWin ? "3px solid #fff" : "2px solid rgba(255,255,255,0.5)", boxShadow: isWin ? `0 0 0 3px ${s.color}, 0 4px 14px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(10, s.size * 0.3), fontWeight: 800, color: "#fff", overflow: "hidden", zIndex: isWin ? 20 : 10 }}>
                  {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(s.username, s.telegramId)}
                </div>
              );
            })}
            {phase === "winner" && winnerData && (
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 30, textAlign: "center", pointerEvents: "none", background: "rgba(0,0,0,0.8)", borderRadius: 14, padding: "10px 16px", border: "1px solid rgba(251,191,36,0.45)" }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>🏆 {winnerData.name}</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 2 }}>+{winnerData.payout} · ×{winnerData.mult}</div>
              </div>
            )}
            {!sectors.length && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 14, fontWeight: 600 }}>Ожидание игроков…</div>
            )}
          </div>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          {sectors.map((s) => (
            <div key={s.telegramId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {s.username || s.telegramId}
                {s.telegramId === telegramId && <span style={{ color: "#a78bfa", fontSize: 11, marginLeft: 6 }}>вы</span>}
              </div>
              <div style={{ fontSize: 12, color: "#a0a0c0" }}>{s.stake} · {(s.share * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
      {phase === "lobby" && (
        <div style={{ padding: "10px 14px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,10,18,0.95)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <button type="button" onClick={() => setAutoPlay((v) => !v)} style={{ padding: "8px 12px", borderRadius: 10, border: autoPlay ? "1.5px solid #34d399" : "1px solid rgba(255,255,255,0.12)", background: autoPlay ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)", color: autoPlay ? "#34d399" : "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{autoPlay ? "● Авто" : "○ Авто"}</button>
            <input type="number" inputMode="decimal" min={MIN_STAKE} step={0.1} placeholder="Своя ставка" value={customBet} onChange={(e) => setCustomBet(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, fontWeight: 600, outline: "none" }} />
            <button type="button" disabled={busy} onClick={() => { const v = parseFloat(customBet); if (!Number.isFinite(v)) { flash("Введите сумму", "err"); return; } setAutoStake(v); placeBet(v); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Ставка</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {DEFAULT_BETS.map((b) => (
              <button key={b} type="button" disabled={busy} onClick={() => { setAutoStake(b); placeBet(b); }} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", minWidth: 72 }}>
                {b} {betCurrency === "ton" ? "TON" : "TONYX"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
