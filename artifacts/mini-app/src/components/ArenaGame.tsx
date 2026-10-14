import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

/* Portals square-arena geometry v2 — force rebuild */
const SQ = 300;
const CX = SQ / 2;
const CY = SQ / 2;
const HW = SQ / 2;
const HH = SQ / 2;
const BALL_R = 9;
const INNER_R = 40;

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

function squarePoint(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const t =
    ax < 1e-9 ? HH / ay :
    ay < 1e-9 ? HW / ax :
    Math.min(HW / ax, HH / ay);
  return [CX + t * dx, CY + t * dy];
}

function squareSectorPoints(startDeg: number, endDeg: number, steps = 40): string {
  const pts: [number, number][] = [[CX, CY]];
  for (let i = 0; i <= steps; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / steps;
    pts.push(squarePoint(a));
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function sectorCentroid(startDeg: number, endDeg: number): [number, number] {
  const N = 28;
  let sx = CX, sy = CY, count = 1;
  for (let i = 0; i <= N; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / N;
    const [px, py] = squarePoint(a);
    sx += px; sy += py; count++;
  }
  return [sx / count, sy / count];
}

function buildSectors(players: ArenaPlayer[]) {
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return players.map((p, i) => {
    const share = p.stake / total;
    const startDeg = acc * 360;
    acc += share;
    const endDeg = acc * 360;
    const midDeg = (startDeg + endDeg) / 2;
    const [edgeX, edgeY] = squarePoint(midDeg);
    const ax = CX + (edgeX - CX) * 0.58;
    const ay = CY + (edgeY - CY) * 0.58;
    const [centX, centY] = sectorCentroid(startDeg, endDeg);
    const size = Math.max(30, Math.min(48, 28 + share * 36));
    return {
      ...p,
      share,
      startDeg,
      endDeg,
      midDeg,
      color: colorFor(i),
      index: i,
      ax,
      ay,
      centX,
      centY,
      size,
      points: squareSectorPoints(startDeg, endDeg),
    };
  });
}

function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
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
  const balanceTon = Number(
    (profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0,
  );
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
  const [winnerData, setWinnerData] = useState<{
    name: string; payout: number; mult: number; photo?: string | null;
  } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [customBet, setCustomBet] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoStake, setAutoStake] = useState(0.1);
  const [boardZoom, setBoardZoom] = useState(1);
  const autoPlayRef = useRef(false);
  const autoStakeRef = useRef(0.1);

  const ballRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
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
    if (arena?.status !== "starting" || !arena.startAt) {
      setCountdown(0);
      return;
    }
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

  function placeBall(nx: number, ny: number) {
    posRef.current = { x: nx, y: ny };
    ballRef.current?.setAttribute("cx", nx.toFixed(2));
    ballRef.current?.setAttribute("cy", ny.toFixed(2));
    glowRef.current?.setAttribute("cx", nx.toFixed(2));
    glowRef.current?.setAttribute("cy", ny.toFixed(2));
  }

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    placeBall(CX, CY);
    setWinnerData(null);
    setFreezeSectors(null);
    setFreezePool(0);
    setBoardZoom(1);
  }

  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const secs = buildSectors(data.players);
    const winner = secs.find((s) => s.telegramId === data.winnerId) ?? secs[0];
    if (!winner) return;

    setFreezeSectors(secs);
    setFreezePool(data.totalPool);
    setPhase("spin");
    setWinnerData(null);
    setBoardZoom(1);

    const target = { x: winner.centX, y: winner.centY };
    const angle = Math.random() * Math.PI * 2;
    const speed = 4.2 + Math.random() * 2;
    placeBall(CX, CY);
    velRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };

    const startTime = performance.now();
    const ATTRACT_MS = 3400;
    const EDGE = 3;
    let stopped = false;

    const step = () => {
      if (stopped) return;
      const elapsed = performance.now() - startTime;
      const pos = posRef.current;
      let { vx, vy } = velRef.current;

      if (elapsed >= ATTRACT_MS) {
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) {
          stopped = true;
          placeBall(target.x, target.y);
          setBoardZoom(1.25);
          setPhase("winner");
          const payout = payoutOf(winner.stake, data.totalPool);
          const mult =
            winner.stake > 0 ? Math.round((payout / winner.stake) * 100) / 100 : 0;
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
              setTimeout(() => placeBet(autoStakeRef.current), 700);
            }
          }, 3200);
          return;
        }
        vx = dx * 0.12;
        vy = dy * 0.12;
        velRef.current = { vx, vy };
        placeBall(pos.x + vx, pos.y + vy);
        const k = Math.min(1, (elapsed - ATTRACT_MS) / 800);
        setBoardZoom(1 + k * 0.25);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      vx *= 0.996;
      vy *= 0.996;
      let nx = pos.x + vx;
      let ny = pos.y + vy;
      if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx); }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx); }
      if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy); }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy); }
      velRef.current = { vx, vy };
      placeBall(nx, ny);
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
        !settledRef.current.has(d.id) &&
        phaseRef.current === "lobby"
      ) {
        settledRef.current.add(d.id);
        setArena(d);
        runSpinAnimation(d);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 700);
    return () => {
      clearInterval(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fetchState]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) return;
    const ms = new Date(arena.startAt).getTime() - Date.now();
    if (ms > 35000) return;
    const t = setTimeout(() => fetchState(), Math.max(0, ms + 60));
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  const liveSectors = useMemo(
    () => buildSectors(arena?.players ?? []),
    [arena?.players],
  );
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

  function playerPhoto(s: ReturnType<typeof buildSectors>[0]) {
    if (s.telegramId === telegramId && myPhoto) return myPhoto;
    return s.photoUrl ?? null;
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400, background: "#0a0a12",
      color: "#f1f1f8", display: "flex", flexDirection: "column",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999,
          padding: "10px 18px", borderRadius: 12,
          background: toast.type === "ok" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)",
          color: "#fff", fontWeight: 700, fontSize: 13,
        }}>{toast.msg}</div>
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button type="button" onClick={onClose} style={{
          background: "transparent", border: "none", color: "#a0a0c0", fontSize: 20, cursor: "pointer",
        }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>⚔️ Арена</div>
        <button type="button" onClick={() => onOpenHistory?.()} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, color: "#c4b5fd", fontSize: 11, fontWeight: 700,
          padding: "6px 10px", cursor: "pointer",
        }}>История</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setBetCurrency("ton")} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999,
            border: betCurrency === "ton" ? "1.5px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
            background: betCurrency === "ton" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
            color: "#e2e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <span style={{ color: "#60a5fa" }}>◆</span>{balanceTon.toFixed(2)}
          </button>
          <button type="button" onClick={() => setBetCurrency("tonyx")} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999,
            border: betCurrency === "tonyx" ? "1.5px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
            background: betCurrency === "tonyx" ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
            color: "#e2e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <span style={{ color: "#c084fc" }}>●</span>{balanceTonyx.toFixed(0)}
          </button>
        </div>
        <div style={{
          padding: "6px 14px", borderRadius: 12,
          background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))",
          border: "1px solid rgba(167,139,250,0.35)", textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, letterSpacing: 0.5 }}>БАНК</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{pool > 0 ? pool.toFixed(2) : "0.00"} TON</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "2px 14px 8px" }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: phase === "spin" ? "#fbbf24" : arena?.status === "starting" ? "#34d399" : "#94a3b8",
        }}>
          {phase === "spin" ? "Крутим…" : phase === "winner" ? "Победитель" : arena?.status === "starting" ? "Старт" : "Набор"}
        </span>
        {arena?.status === "starting" && countdown > 0 && phase === "lobby" && (
          <span style={{
            fontSize: 18, fontWeight: 900, color: countdown <= 5 ? "#ef4444" : "#f1f5f9",
            fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "center",
          }}>⏱ {countdown}с</span>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>{sectors.length} игр.</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 16px" }}>
          <div style={{
            width: SQ, height: SQ, maxWidth: "100%",
            position: "relative", borderRadius: 16, overflow: "hidden",
            transform: `scale(${boardZoom})`,
            transformOrigin: "center center",
            transition: phase === "spin" ? "none" : "transform 400ms ease",
            boxShadow: phase === "spin"
              ? "0 0 0 2px rgba(251,191,36,0.45), 0 16px 40px rgba(0,0,0,0.55)"
              : "0 0 0 1px #1F2937, 0 16px 40px rgba(0,0,0,0.55)",
          }}>
            <svg width={SQ} height={SQ} style={{ display: "block" }}>
              <rect x={0} y={0} width={SQ} height={SQ} fill="#111827" />
              {sectors.map((s) => (
                <polygon key={s.telegramId} points={s.points} fill={s.color} opacity={0.92} />
              ))}
              {sectors.length >= 2 && sectors.map((s) => {
                const [ex, ey] = squarePoint(s.startDeg);
                return (
                  <line key={`ln-${s.telegramId}`}
                    x1={CX} y1={CY} x2={ex} y2={ey}
                    stroke="#111827" strokeWidth={2.5}
                  />
                );
              })}
              <circle cx={CX} cy={CY} r={INNER_R} fill="#0d1117" />
              <circle ref={glowRef} cx={CX} cy={CY} r={BALL_R + 6} fill="white" opacity={0.14} />
              <circle
                ref={ballRef}
                cx={CX} cy={CY} r={BALL_R}
                fill="white"
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={1}
                style={{ filter: "drop-shadow(0 2px 10px rgba(255,255,255,0.75))" }}
              />
            </svg>

            {sectors.map((s) => {
              const isWin = phase === "winner" && s.telegramId === arena?.winnerId;
              const photo = playerPhoto(s);
              return (
                <div
                  key={s.telegramId}
                  style={{
                    position: "absolute",
                    left: s.ax - s.size / 2,
                    top: s.ay - s.size / 2,
                    width: s.size,
                    height: s.size,
                    borderRadius: "50%",
                    background: s.color,
                    border: isWin ? "3px solid #fff" : "2px solid rgba(255,255,255,0.5)",
                    boxShadow: isWin
                      ? `0 0 0 3px ${s.color}, 0 4px 14px rgba(0,0,0,0.5)`
                      : "0 2px 8px rgba(0,0,0,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: Math.max(10, s.size * 0.3),
                    fontWeight: 800,
                    color: "#fff",
                    overflow: "hidden",
                    zIndex: isWin ? 20 : 10,
                  }}
                >
                  {photo ? (
                    <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : initials(s.username, s.telegramId)}
                </div>
              );
            })}

            {phase === "winner" && winnerData && (
              <div style={{
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                zIndex: 30, textAlign: "center", pointerEvents: "none",
                background: "rgba(0,0,0,0.8)", borderRadius: 14, padding: "10px 16px",
                border: "1px solid rgba(251,191,36,0.45)",
              }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>🏆 {winnerData.name}</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 2 }}>+{winnerData.payout} · ×{winnerData.mult}</div>
              </div>
            )}

            {!sectors.length && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#666", fontSize: 14, fontWeight: 600,
              }}>Ожидание игроков…</div>
            )}
          </div>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          {sectors.map((s) => (
            <div key={s.telegramId} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {s.username || s.telegramId}
                {s.telegramId === telegramId && <span style={{ color: "#a78bfa", fontSize: 11, marginLeft: 6 }}>вы</span>}
              </div>
              <div style={{ fontSize: 12, color: "#a0a0c0" }}>
                {s.stake} · {(s.share * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {phase === "lobby" && (
        <div style={{
          padding: "10px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,10,18,0.95)",
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <button type="button" onClick={() => setAutoPlay((v) => !v)} style={{
              padding: "8px 12px", borderRadius: 10,
              border: autoPlay ? "1.5px solid #34d399" : "1px solid rgba(255,255,255,0.12)",
              background: autoPlay ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
              color: autoPlay ? "#34d399" : "#94a3b8", fontWeight: 700, fontSize: 12,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{autoPlay ? "● Авто" : "○ Авто"}</button>
            <input type="number" inputMode="decimal" min={MIN_STAKE} step={0.1}
              placeholder="Своя ставка" value={customBet}
              onChange={(e) => setCustomBet(e.target.value)}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
                color: "#fff", fontSize: 13, fontWeight: 600, outline: "none",
              }}
            />
            <button type="button" disabled={busy} onClick={() => {
              const v = parseFloat(customBet);
              if (!Number.isFinite(v)) { flash("Введите сумму", "err"); return; }
              setAutoStake(v); placeBet(v);
            }} style={{
              padding: "8px 14px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>Ставка</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {DEFAULT_BETS.map((b) => (
              <button key={b} type="button" disabled={busy}
                onClick={() => { setAutoStake(b); placeBet(b); }}
                style={{
                  padding: "10px 16px", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", minWidth: 72,
                }}>
                {b} {betCurrency === "ton" ? "TON" : "TONYX"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
