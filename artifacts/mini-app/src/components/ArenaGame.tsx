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
const SQ = 340;
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
  });

  for (let iteration = 0; iteration < 32 && players.length > 1; iteration++) {
    const polygons = makePolygons();
    const areas = polygons.map(polygonArea);
    const areaTotal = areas.reduce((sum, area) => sum + area, 0) || 1;
    for (let i = 0; i < sites.length; i++) {
      const targetShare = Math.max(0, players[i].stake) / total;
      const actualShare = areas[i] / areaTotal;
      sites[i].weight += (targetShare - actualShare) * 24000;
    }
    const mean = sites.reduce((sum, site) => sum + site.weight, 0) / sites.length;
    for (const site of sites) site.weight -= mean;
  }

  const polygons = makePolygons();
  return players.map((p, i) => {
    const site = sites[i];
    let polygon = polygons[i];
    if (polygon.length < 3 || polygonArea(polygon) < 1) {
      polygon = [[site.x - 1, site.y - 1], [site.x + 1, site.y - 1], [site.x, site.y + 1]];
    }
    const [ax, ay] = polygonCenter(polygon);
    const share = Math.max(0, p.stake) / total;
    const size = Math.max(30, Math.min(48, 28 + share * 36));
    return {
      ...p, share, startDeg: 0, endDeg: 360, midDeg: 0,
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
  const [waitingCountdown, setWaitingCountdown] = useState(15);
  const [spinCountdown, setSpinCountdown] = useState(0);
  const [spinEndsAt, setSpinEndsAt] = useState<number | null>(null);
  const [displayBalanceTon, setDisplayBalanceTon] = useState(balanceTon);
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
  useEffect(() => { if (phase === "lobby") setDisplayBalanceTon(balanceTon); }, [balanceTon, phase]);
  useEffect(() => {
    if (phase !== "spin" || !spinEndsAt) { setSpinCountdown(0); return; }
    const update = () => setSpinCountdown(Math.max(0, Math.ceil((spinEndsAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [phase, spinEndsAt]);
  useEffect(() => { arenaIdRef.current = arena?.id ?? null; }, [arena?.id]);
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);
  useEffect(() => { autoStakeRef.current = autoStake; }, [autoStake]);

  useEffect(() => {
    const enoughPlayers = (arena?.players.length ?? 0) >= 2;
    if (arena?.status !== "waiting" || !enoughPlayers) {
      setWaitingCountdown(15);
      return;
    }
    const endAt = Date.now() + 15000;
    const update = () => setWaitingCountdown(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [arena?.status, arena?.id, (arena?.players.length ?? 0) >= 2]);

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
    setSpinEndsAt(null);
    setSpinCountdown(0);
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
    setSpinEndsAt(Date.now() + 6200);
    setSpinCountdown(7);
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
      const raw = Math.min(1, elapsed / TOTAL_MS);

      if (raw >= 1) {
        stopped = true;
        // Keep the exact last physics position; never snap the ball to a target at round end.
        velRef.current = { vx: 0, vy: 0 };
        setArrowOn(false);
        setBoardZoom(1);
        setPhase("winner");
        setSpinCountdown(0);
        setSpinEndsAt(null);
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
      const pos = posRef.current;
      let nx = pos.x;
      let ny = pos.y;

      // Только физика отскоков на протяжении всего раунда: нет переключения траектории,
      // резкого доворачивания или скачка позиции в последние секунды.
      let { vx, vy } = velRef.current;
      const progress = raw;
      const friction = 0.998 - progress * 0.012;
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);

      nx = pos.x + vx * dt * 60;
      ny = pos.y + vy * dt * 60;

      if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx) * 0.96; }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx) * 0.96; }
      if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy) * 0.96; }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy) * 0.96; }

      velRef.current = { vx, vy };

      const ang = Math.hypot(nx - pos.x, ny - pos.y) > 0.05
        ? (Math.atan2(ny - pos.y, nx - pos.x) * 180) / Math.PI
        : arrowAngle;
      placeBall(nx, ny, ang);
      setArrowAngle(ang);
      // Keep the board fixed during the spin; scaling during motion can look like jitter.
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
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0a0a12", color: "#f1f1f8", display: "flex", flexDirection: "column", height: "100dvh", minHeight: 0, overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          background: toast.type === "ok" ? "rgba(5,150,105,0.95)" : "rgba(220,38,38,0.95)",
          color: "#fff", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700,
        }}>{toast.msg}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
        <button type="button" onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "none", color: "#cbd5e1",
          borderRadius: 10, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}>✕ Закрыть</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: "#fbbf24",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 999, padding: "5px 10px",
          }}>{displayBalanceTon.toFixed(3)} TON</span>
          {onOpenHistory && (
            <button type="button" onClick={onOpenHistory} style={{
              background: "rgba(255,255,255,0.06)", border: "none", color: "#94a3b8",
              borderRadius: 10, padding: "8px 10px", cursor: "pointer",
            }}>🕐</button>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{
          display: "inline-block", background: "rgba(91,225,44,0.12)", border: "1px solid rgba(91,225,44,0.35)",
          borderRadius: 999, padding: "8px 18px", fontWeight: 800, fontSize: 14, color: "#b8f5a0",
        }}>Банк {pool.toFixed(3)} TON</div>
        {arena?.status === "waiting" && phase === "lobby" && (
          (arena?.players.length ?? 0) >= 2 ? (
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>
              Старт через: 00:{String(waitingCountdown).padStart(2, "0")}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
              Таймер начнётся после ставок 2 игроков
            </div>
          )
        )}
        {arena?.status === "starting" && countdown > 0 && phase === "lobby" && (
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>Старт через 00:{String(countdown).padStart(2, "0")}</div>
        )}
        {phase === "spin" && (
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>До результата: 00:{String(spinCountdown).padStart(2, "0")}</div>
        )}
      </div>

      <div style={{
        width: `min(${SQ}px, calc(100vw - 24px))`, aspectRatio: "1 / 1", height: "auto", flexShrink: 0, margin: "0 auto", borderRadius: 18, overflow: "hidden",
        transform: `scale(${boardZoom})`, transition: "transform 0.35s ease",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.08)",
        background: "#12121c", position: "relative",
      }}>
        <svg viewBox={`0 0 ${SQ} ${SQ}`} width="100%" height="100%" style={{ display: "block" }}>
          {sectors.map((s) => (
            <polygon key={s.telegramId} points={s.points} fill={s.color} opacity={0.88} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} />
          ))}
          {!sectors.length && (
            <rect x={0} y={0} width={SQ} height={SQ} fill="#1a1a28" />
          )}
          <circle ref={glowRef} cx={CX} cy={CY} r={BALL_R + 6} fill="rgba(255,255,255,0.12)" opacity={phase === "lobby" ? 0 : 1} />
          <circle ref={ballRef} cx={CX} cy={CY} r={BALL_R} fill="url(#ballGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} opacity={phase === "lobby" ? 0 : 1} />
          <defs>
            <radialGradient id="ballGrad" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#94a3b8" />
            </radialGradient>
          </defs>
          {arrowOn && phase !== "lobby" && (
            <g ref={arrowRef} transform={`translate(${CX},${CY})`}>
              <polygon points="14,0 -6,-5 -6,5" fill="#fbbf24" opacity={0.9} />
            </g>
          )}
        </svg>
        {sectors.map((s) => {
          const photo = playerPhoto(s);
          return (
            <div key={`av-${s.telegramId}`} style={{
              position: "absolute", left: s.ax, top: s.ay,
              width: s.size, height: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2,
              borderRadius: "50%", overflow: "hidden", border: `2.5px solid ${s.color}`,
              boxShadow: "0 2px 10px rgba(0,0,0,0.5)", background: s.color, pointerEvents: "none",
            }}>
              {photo ? (
                <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: "100%", height: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff",
                }}>{initials(s.username, s.telegramId)}</div>
              )}
            </div>
          );
        })}
      </div>

      {phase === "winner" && winnerData && (
        <div style={{
          margin: "14px 16px 0", padding: 16, borderRadius: 16, textAlign: "center",
          background: "linear-gradient(135deg, rgba(91,225,44,0.2), rgba(0,192,255,0.12))",
          border: "1px solid rgba(91,225,44,0.45)",
        }}>
          <div style={{ fontSize: 12, color: "#86efac", fontWeight: 800 }}>Победитель</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>@{winnerData.name.replace(/^@/, "")}</div>
          <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 900, marginTop: 6 }}>
            +{winnerData.payout.toFixed(3)} TON · x{winnerData.mult}
          </div>
        </div>
      )}

      {phase === "lobby" && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
            {DEFAULT_BETS.map((v) => (
              <button key={v} type="button" disabled={busy} onClick={() => placeBet(v)} style={{
                flex: 1, maxWidth: 64, padding: "12px 0", borderRadius: 14,
                border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,30,45,0.95)",
                color: "#e2e8f0", fontWeight: 900, fontSize: 13, cursor: "pointer",
              }}>{v}</button>
            ))}
            <button type="button" disabled={busy} onClick={() => placeBet(Math.max(MIN_STAKE, Math.floor(balance * 1000) / 1000))} style={{
              flex: 1.2, maxWidth: 80, padding: "12px 0", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#5BE12C,#00C0FF)", color: "#0a0a12",
              fontWeight: 900, fontSize: 13, cursor: "pointer",
            }}>All</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={customBet} onChange={(e) => setCustomBet(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="Своя ставка" style={{
                flex: 1, padding: "12px 14px", borderRadius: 14,
                border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,15,25,0.95)",
                color: "#f1f5f9", fontSize: 14, fontWeight: 700, outline: "none",
              }} />
            <button type="button" disabled={busy} onClick={() => placeBet(Number(customBet) || 0)} style={{
              padding: "12px 16px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a0a00",
              fontWeight: 900, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
            }}>+ Ставка</button>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <button type="button" onClick={() => setAutoPlay((v) => !v)} style={{
              padding: "8px 14px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.25)",
              background: autoPlay ? "rgba(91,225,44,0.2)" : "rgba(30,30,45,0.8)",
              color: autoPlay ? "#5BE12C" : "#94a3b8", fontWeight: 800, fontSize: 12, cursor: "pointer",
            }}>{autoPlay ? "Авто: ON" : "Авто: OFF"}</button>
            <span style={{ fontSize: 11, color: "#64748b" }}>баланс {balance.toFixed(3)}</span>
          </div>
        </div>
      )}

      {sectors.length > 0 && (
        <div style={{ padding: "14px 16px 96px", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, marginBottom: 8 }}>
            {sectors.length} игрок{sectors.length === 1 ? "" : sectors.length < 5 ? "а" : "ов"}
            {arena?.id ? ` · #${arena.id}` : ""}
          </div>
          {sectors.map((s) => {
            const isMe = s.telegramId === telegramId;
            const isWin = phase === "winner" && !!winnerData && arena?.winnerId === s.telegramId;
            const photo = playerPhoto(s);
            return (
              <div key={s.telegramId} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14,
                marginBottom: 6, background: isMe ? "rgba(91,225,44,0.1)" : "rgba(20,20,32,0.9)",
                border: `1px solid ${isWin ? "rgba(91,225,44,0.5)" : isMe ? "rgba(91,225,44,0.35)" : "rgba(255,255,255,0.06)"}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", overflow: "hidden",
                  border: `2px solid ${s.color}`, background: s.color, flexShrink: 0,
                }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff",
                    }}>{initials(s.username, s.telegramId)}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", color: isWin ? "#5BE12C" : "#f1f5f9",
                  }}>
                    {isWin ? "🏆 " : ""}@{(s.username || s.telegramId).replace(/^@/, "")}
                    {isMe ? " · вы" : ""}
                  </div>
                  <div style={{ height: 4, marginTop: 5, borderRadius: 99, background: "rgba(51,65,85,0.5)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(s.share * 100, 1)}%`, height: "100%", background: s.color, borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, color: "#fbbf24" }}>{s.stake.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{(s.share * 100).toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 450,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "12px 18px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(12,12,22,0.97)", borderTop: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.28)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(91,225,44,0.13)",
            border: "1px solid rgba(91,225,44,0.25)", color: "#8bf56b", fontSize: 18,
          }}>♟</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f1f5f9" }}>
              {arena?.players.length ?? 0} участн. поставили ставки
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {pool.toFixed(3)} TON в банке
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {(arena?.players ?? []).slice(0, 5).map((p, i) => (
            <div key={p.telegramId} title={p.username || p.telegramId} style={{
              width: 27, height: 27, marginLeft: i ? -7 : 0, borderRadius: "50%",
              border: "2px solid #0c0c16", background: colorFor(i), color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 900, overflow: "hidden",
            }}>
              {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(p.username, p.telegramId)}
            </div>
          ))}
          {(arena?.players.length ?? 0) > 5 && (
            <div style={{
              width: 27, height: 27, marginLeft: -7, borderRadius: "50%",
              border: "2px solid #0c0c16", background: "#252538", color: "#e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900,
            }}>+{(arena?.players.length ?? 0) - 5}</div>
          )}
        </div>
      </div>
    </div>
  );
}
