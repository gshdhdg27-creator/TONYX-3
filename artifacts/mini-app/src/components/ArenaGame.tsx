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

/* Portal-style arena — sectors, bouncing crosshair ball, zoom on winner */
const SQ = 340;
const CX = SQ / 2;
const CY = SQ / 2;
const BALL_R = 12;

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
  for (let i = 0; i < 800; i++) {
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
      x: 28 + random() * (SQ - 56),
      y: 28 + random() * (SQ - 56),
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

  for (let iteration = 0; iteration < 28 && players.length > 1; iteration++) {
    const polygons = makePolygons();
    const areas = polygons.map(polygonArea);
    const areaTotal = areas.reduce((sum, area) => sum + area, 0) || 1;
    for (let i = 0; i < sites.length; i++) {
      const targetShare = Math.max(0, players[i].stake) / total;
      const actualShare = areas[i] / areaTotal;
      sites[i].weight += (targetShare - actualShare) * 18000;
    }
    const mean = sites.reduce((sum, site) => sum + site.weight, 0) / sites.length;
    for (const site of sites) site.weight -= mean;
  }

  const polygons = makePolygons();
  return players.map((p, i) => {
    const site = sites[i];
    let polygon = polygons[i];
    if (polygon.length < 3 || polygonArea(polygon) < 1) {
      polygon = [[site.x - 2, site.y - 2], [site.x + 2, site.y - 2], [site.x, site.y + 2]];
    }
    const [ax, ay] = polygonCenter(polygon);
    const share = Math.max(0, p.stake) / total;
    const size = Math.max(32, Math.min(56, 30 + share * 50));
    return {
      ...p, share, startDeg: 0, endDeg: 360, midDeg: 0,
      color: colorFor(i), index: i, ax, ay, size, polygon,
      points: polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
    };
  });
}

function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}

export default function ArenaGame({
  telegramId, tonBalance, onBalanceChange, onClose,
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRooms, setHistoryRooms] = useState<Array<{
    id: number; winnerId: string | null; winnerUsername: string | null; winnerPayout: number; totalPool: number;
    playerCount: number; players: Array<{ telegramId: string; username: string | null; stake: number; chance?: number }>;
    finishedAt: string | null;
  }>>([]);
  const [selectedHistoryRoom, setSelectedHistoryRoom] = useState<(typeof historyRooms)[number] | null>(null);
  const [playersExpanded, setPlayersExpanded] = useState(true);
  const [spinEndsAt, setSpinEndsAt] = useState<number | null>(null);
  const [displayBalanceTon, setDisplayBalanceTon] = useState(balanceTon);
  const [customBet, setCustomBet] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoStake, setAutoStake] = useState(0.1);
  const [boardZoom, setBoardZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
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
    if (arena?.status !== "waiting" || (arena?.players.length ?? 0) < 2) {
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
    setZoomOrigin("50% 50%");
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
    setSpinEndsAt(Date.now() + 7000);
    setSpinCountdown(7);
    setWinnerData(null);
    setBoardZoom(1);
    setArrowOn(true);

    const random = createSeededRandom(`${data.id}:${data.winnerId ?? winner.telegramId}`);
    const startAng = random() * Math.PI * 2;
    const startR = 6 + random() * 14;
    const sx = CX + Math.cos(startAng) * startR;
    const sy = CY + Math.sin(startAng) * startR;
    const dir = random() * Math.PI * 2;
    const speed = 11 + random() * 4;
    placeBall(sx, sy, (dir * 180) / Math.PI);
    velRef.current = { vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed };

    const target = randomInZone(winner, random);
    const startTime = performance.now();
    const TOTAL_MS = 7000;
    const EDGE = 6;
    let last = startTime;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.min(1, elapsed / TOTAL_MS);

      if (raw >= 1) {
        // Final settle + zoom
        placeBall(target.x, target.y);
        setArrowOn(false);
        setZoomOrigin(`${(target.x / SQ) * 100}% ${(target.y / SQ) * 100}%`);
        setBoardZoom(1.85);
        setPhase("winner");
        setSpinCountdown(0);
        setSpinEndsAt(null);
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult = winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout,
          mult,
          photo: winner.photoUrl,
        });
        rafRef.current = null;
        setTimeout(() => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
          if (autoPlayRef.current && autoStakeRef.current > 0) {
            setTimeout(() => placeBet(autoStakeRef.current), 600);
          }
        }, 3800);
        return;
      }

      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
      last = now;
      const pos = posRef.current;
      let { vx, vy } = velRef.current;

      // Stronger slowdown in the last 30%
      const progress = raw;
      const friction = progress < 0.7 ? 0.997 : 0.97 - (progress - 0.7) * 0.08;
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);

      // Homing force in the final phase
      if (progress > 0.62) {
        const homeStrength = (progress - 0.62) / 0.38;
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = homeStrength * homeStrength * 2.8;
        vx += (dx / dist) * pull;
        vy += (dy / dist) * pull;
      }

      let nx = pos.x + vx * dt * 60;
      let ny = pos.y + vy * dt * 60;

      if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx) * 0.94; }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx) * 0.94; }
      if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy) * 0.94; }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy) * 0.94; }

      velRef.current = { vx, vy };

      const ang = Math.hypot(nx - pos.x, ny - pos.y) > 0.04
        ? (Math.atan2(ny - pos.y, nx - pos.x) * 180) / Math.PI
        : arrowAngle;
      placeBall(nx, ny, ang);
      setArrowAngle(ang);

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
      const r = await fetch("/api/mini/games/arena/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          amount,
          currency: betCurrency,
          photoUrl: me?.photoUrl || myPhoto || null,
          username: me?.username || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка ставки", "err"); return; }
      flash(`Ставка ${amount} принята`);
      fetchState();
      refreshBalance();
    } catch {
      flash("Ошибка сети", "err");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/mini/games/arena/history?limit=40");
      if (r.ok) {
        const d = await r.json();
        setHistoryRooms(d.rooms ?? []);
      }
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen]);

  // ---- RENDER ----
  return (
    <div style={{
      minHeight: "100%",
      background: "radial-gradient(ellipse at top, #1a1a2e 0%, #0c0c16 60%)",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      paddingBottom: 100,
    }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10,
          color: "#fff", width: 36, height: 36, fontSize: 18, cursor: "pointer",
        }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Арена</div>
        <button onClick={() => setHistoryOpen(true)} style={{
          background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10,
          color: "#fff", width: 36, height: 36, fontSize: 16, cursor: "pointer",
        }}>⏱</button>
      </div>

      {/* Status / Timer */}
      <div style={{ textAlign: "center", marginBottom: 8, minHeight: 28 }}>
        {phase === "spin" ? (
          <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>
            LIVE · {spinCountdown}s
          </div>
        ) : arena?.status === "starting" && countdown > 0 ? (
          <div style={{ color: "#fbbf24", fontWeight: 700 }}>
            Начало через 00:{String(countdown).padStart(2, "0")}
          </div>
        ) : (arena?.players.length ?? 0) < 2 ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>
            Ожидание игроков {arena?.players.length ?? 0}/2
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>
            Ожидание · {waitingCountdown}s
          </div>
        )}
      </div>

      {/* Pool */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Тотал </span>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#5BE12C" }}>{pool.toFixed(2)}</span>
        <span style={{ fontSize: 12, color: "#5BE12C" }}> TON</span>
      </div>

      {/* Board */}
      <div style={{
        display: "flex", justifyContent: "center", margin: "0 12px",
        perspective: 800,
      }}>
        <div style={{
          width: SQ, height: SQ, borderRadius: 16, overflow: "hidden",
          background: "#111122", position: "relative",
          transform: `scale(${boardZoom})`,
          transformOrigin: zoomOrigin,
          transition: phase === "winner" ? "transform 0.55s cubic-bezier(0.22,1,0.36,1)" : "none",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}>
          <svg width={SQ} height={SQ} style={{ display: "block" }}>
            {/* Zones */}
            {sectors.map((s) => (
              <polygon
                key={s.telegramId}
                points={s.points}
                fill={s.color}
                opacity={0.92}
              />
            ))}
            {/* Avatars */}
            {sectors.map((s) => (
              <g key={`av-${s.telegramId}`}>
                <circle cx={s.ax} cy={s.ay} r={s.size / 2 + 2} fill="#000" opacity={0.35} />
                <foreignObject x={s.ax - s.size / 2} y={s.ay - s.size / 2} width={s.size} height={s.size}>
                  <div style={{
                    width: s.size, height: s.size, borderRadius: "50%", overflow: "hidden",
                    border: "3px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    background: "#222", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: s.size * 0.32, fontWeight: 800, color: "#fff",
                  }}>
                    {s.photoUrl
                      ? <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : initials(s.username, s.telegramId)}
                  </div>
                </foreignObject>
              </g>
            ))}
            {/* Ball */}
            <circle ref={glowRef} cx={CX} cy={CY} r={BALL_R + 6} fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />
            <circle ref={ballRef} cx={CX} cy={CY} r={BALL_R} fill="#fff" stroke="#333" strokeWidth={1.5} />
            {arrowOn && (
              <g ref={arrowRef} transform={`translate(${CX},${CY})`}>
                <circle r={6} fill="none" stroke="#fff" strokeWidth={1.5} />
                <line x1={0} y1={0} x2={0} y2={-14} stroke="#fff" strokeWidth={2} />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Players list */}
      <div style={{ margin: "14px 14px 0", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Игроки · {arena?.players.length ?? 0}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Игра #{arena?.id ?? "—"}</div>
        </div>
        {(arena?.players ?? []).map((p, i) => (
          <div key={p.telegramId} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", background: colorFor(i),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, overflow: "hidden",
              }}>
                {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(p.username, p.telegramId)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.username || p.telegramId.slice(0, 8)}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{(p.chance * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div style={{ fontWeight: 800, color: "#5BE12C" }}>{p.stake.toFixed(2)} TON</div>
          </div>
        ))}
      </div>

      {/* Bet controls */}
      <div style={{ margin: "14px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {DEFAULT_BETS.map((b) => (
          <button
            key={b}
            onClick={() => placeBet(b)}
            disabled={busy || phase !== "lobby"}
            style={{
              padding: "10px 16px", borderRadius: 12, border: "none",
              background: "rgba(91,225,44,0.15)", color: "#5BE12C",
              fontWeight: 800, fontSize: 14, cursor: "pointer",
              opacity: busy || phase !== "lobby" ? 0.4 : 1,
            }}
          >
            {b}
          </button>
        ))}
        <button
          onClick={() => placeBet(balance)}
          disabled={busy || phase !== "lobby" || balance < MIN_STAKE}
          style={{
            padding: "10px 16px", borderRadius: 12, border: "none",
            background: "rgba(255,65,54,0.18)", color: "#FF4136",
            fontWeight: 800, fontSize: 14, cursor: "pointer",
            opacity: busy || phase !== "lobby" ? 0.4 : 1,
          }}
        >
          Ва-банк
        </button>
      </div>

      {/* Winner modal */}
      {phase === "winner" && winnerData && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500,
        }}>
          <div style={{
            width: "100%", maxWidth: 420, background: "#0f2a1a",
            borderRadius: "20px 20px 0 0", padding: "18px 16px 28px",
            borderTop: "3px solid #5BE12C",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{winnerData.name} выиграл</div>
              <button onClick={() => { setPhase("lobby"); resetAnim(); }} style={{
                background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer",
              }}>×</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", overflow: "hidden",
                border: "3px solid #5BE12C", background: "#111",
              }}>
                {winnerData.photo
                  ? <img src={winnerData.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{initials(winnerData.name, "")}</div>}
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#5BE12C" }}>{winnerData.payout.toFixed(2)} GRAM</div>
                <div style={{
                  display: "inline-block", background: "#2563eb", color: "#fff",
                  borderRadius: 8, padding: "2px 10px", fontSize: 13, fontWeight: 800, marginTop: 4,
                }}>{winnerData.mult}x</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {historyOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600,
        }}>
          <div style={{
            width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "auto",
            background: "#12121c", borderRadius: "18px 18px 0 0", padding: "14px 12px 24px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>История игр</div>
              <button onClick={() => setHistoryOpen(false)} style={{
                background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer",
              }}>×</button>
            </div>
            {historyLoading && <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>Загрузка…</div>}
            {!historyLoading && historyRooms.length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>Нет игр</div>
            )}
            {historyRooms.map((room) => (
              <div key={room.id} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 12px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{room.winnerUsername || room.winnerId?.slice(0, 8) || "—"}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>#{room.id} · {room.playerCount} игр.</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900, color: "#5BE12C" }}>{room.winnerPayout?.toFixed(2)} TON</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{room.totalPool?.toFixed(2)} банк</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => {
                    // Simple replay: re-run animation if we have data
                    setHistoryOpen(false);
                    flash("Повтор: смотри анимацию");
                  }} style={{
                    flex: 1, padding: "8px", borderRadius: 8, border: "none",
                    background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, cursor: "pointer",
                  }}>Открыть повтор</button>
                  <button onClick={() => flash("Проверка честности: хэш сервера")} style={{
                    flex: 1, padding: "8px", borderRadius: 8, border: "none",
                    background: "#2563eb", color: "#fff", fontSize: 12, cursor: "pointer",
                  }}>Проверка честности</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "err" ? "#7f1d1d" : "#14532d",
          color: "#fff", padding: "10px 16px", borderRadius: 12, fontWeight: 700, zIndex: 700,
        }}>{toast.msg}</div>
      )}

      {/* Bottom bar */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 450,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "12px 18px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(12,12,22,0.97)", borderTop: "1px solid rgba(148,163,184,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(91,225,44,0.13)", color: "#8bf56b", fontSize: 18,
          }}>♟</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900 }}>
              {arena?.players.length ?? 0} участн. поставили ставки
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {pool.toFixed(2)} TON в банке
            </div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          {(arena?.players ?? []).slice(0, 5).map((p, i) => (
            <div key={p.telegramId} style={{
              width: 27, height: 27, marginLeft: i ? -7 : 0, borderRadius: "50%",
              border: "2px solid #0c0c16", background: colorFor(i),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 900, overflow: "hidden",
            }}>
              {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(p.username, p.telegramId)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
