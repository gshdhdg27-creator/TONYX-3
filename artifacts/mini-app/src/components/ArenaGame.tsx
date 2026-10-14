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
  "#3b82f6", // blue
  "#a855f7", // purple
  "#22d3ee", // cyan
  "#eab308", // yellow
  "#ef4444", // red
  "#10b981", // green
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
];

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 1, 10];

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

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
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
    (profile as { tonyxCoins?: string | number; tonyx?: string | number } | undefined)
      ?.tonyxCoins ??
      (profile as { tonyx?: string | number } | undefined)?.tonyx ??
      0,
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
  const [puckPos, setPuckPos] = useState({ x: 50, y: 50 });
  const [puckVisible, setPuckVisible] = useState(false);
  const [arrowAngle, setArrowAngle] = useState(0);
  const [arrowVisible, setArrowVisible] = useState(false);
  const [winnerData, setWinnerData] = useState<{
    name: string;
    payout: number;
    mult: number;
    photo?: string | null;
  } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [bets, setBets] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("arena_bets");
      if (raw) return JSON.parse(raw);
    } catch {
      /* */
    }
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
  const [tick, setTick] = useState(0);

  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const replayingRef = useRef(false);
  const arenaIdRef = useRef<number | null>(null);
  const myPhoto = photoUrl;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    replayingRef.current = replaying;
  }, [replaying]);
  useEffect(() => {
    arenaIdRef.current = arena?.id ?? null;
  }, [arena?.id]);

  useEffect(() => {
    if (arena?.status !== "starting") return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [arena?.status, arena?.startAt]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  function resetAnim() {
    setPuckPos({ x: 50, y: 50 });
    setPuckVisible(false);
    setArrowVisible(false);
    setArrowAngle(0);
    setWinnerData(null);
    setFreezeSectors(null);
    setFreezePool(0);
  }

  /**
   * Анимация как в Portals:
   * 1) стрелка крутится и выбирает направление
   * 2) шарик летит в эту сторону, отскакивает от стен
   * 3) замедляется и останавливается на территории победителя (заранее известен)
   */
  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const secs = buildSectors(data.players);
    const winner = secs.find((s) => s.telegramId === data.winnerId) ?? secs[0];
    if (!winner) return;

    setFreezeSectors(secs);
    setFreezePool(data.totalPool);

    let mid = winner.mid;
    if (data.winnerSector) {
      mid = (data.winnerSector.startDeg + data.winnerSector.endDeg) / 2;
    }

    // Целевая точка остановки — середина сектора победителя (ближе к краю)
    const targetRad = ((mid - 90) * Math.PI) / 180;
    const targetR = 0.36;
    const targetX = 50 + Math.cos(targetRad) * targetR * 100;
    const targetY = 50 + Math.sin(targetRad) * targetR * 100;

    // Начальное направление — в сторону победителя + небольшой разброс
    const startDir = mid + (Math.random() * 40 - 20);
    const startRad = ((startDir - 90) * Math.PI) / 180;

    setPhase("spin");
    setPuckVisible(true);
    setArrowVisible(true);
    setArrowAngle(startDir);
    setPuckPos({ x: 50, y: 50 });
    setWinnerData(null);

    const ARROW_MS = 900;
    const MOVE_MS = 4800;
    const t0 = performance.now();

    // Физика внутри квадрата (0..100)
    let x = 50;
    let y = 50;
    let vx = Math.cos(startRad) * 2.8;
    let vy = Math.sin(startRad) * 2.8;
    const pad = 6; // отступ от краёв
    const friction = 0.992;

    const tickFn = (now: number) => {
      const elapsed = now - t0;

      // Фаза 1: стрелка крутится
      if (elapsed < ARROW_MS) {
        const t = elapsed / ARROW_MS;
        const spin = startDir + 720 * easeOutCubic(t);
        setArrowAngle(spin);
        setPuckPos({ x: 50, y: 50 });
        rafRef.current = requestAnimationFrame(tickFn);
        return;
      }

      setArrowVisible(false);

      const moveT = Math.min(1, (elapsed - ARROW_MS) / MOVE_MS);

      // Физика отскоков
      x += vx;
      y += vy;

      if (x < pad) {
        x = pad;
        vx = Math.abs(vx);
      }
      if (x > 100 - pad) {
        x = 100 - pad;
        vx = -Math.abs(vx);
      }
      if (y < pad) {
        y = pad;
        vy = Math.abs(vy);
      }
      if (y > 100 - pad) {
        y = 100 - pad;
        vy = -Math.abs(vy);
      }

      vx *= friction;
      vy *= friction;

      // Чем ближе к концу — тем сильнее тянем к точке победителя
      const pull = easeOutCubic(moveT) * 0.18;
      x += (targetX - x) * pull;
      y += (targetY - y) * pull;

      // В самом конце жёстко садим на победителя
      if (moveT > 0.92) {
        const k = (moveT - 0.92) / 0.08;
        x = x + (targetX - x) * k;
        y = y + (targetY - y) * k;
      }

      setPuckPos({ x: clamp(x, pad, 100 - pad), y: clamp(y, pad, 100 - pad) });

      if (moveT < 1) {
        rafRef.current = requestAnimationFrame(tickFn);
        return;
      }

      setPuckPos({ x: targetX, y: targetY });
      setPhase("winner");
      const pay = payoutOf(winner.stake, data.totalPool);
      const mult = winner.stake > 0 ? Math.round((pay / winner.stake) * 100) / 100 : 0;
      setWinnerData({
        name: data.winnerUsername || winner.username || winner.telegramId,
        payout: pay,
        mult,
        photo: winner.photoUrl,
      });

      if (!replayingRef.current) {
        setTimeout(() => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
        }, 3200);
      }
    };

    rafRef.current = requestAnimationFrame(tickFn);
  }

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const d = (await r.json()) as ArenaState;

      if (phaseRef.current === "lobby") {
        setArena(d);
      } else if (d.status === "finished" && d.id === arenaIdRef.current) {
        setArena(d);
      }

      if (
        d.status === "finished" &&
        d.winnerId &&
        !settledRef.current.has(d.id) &&
        phaseRef.current === "lobby" &&
        !replayingRef.current
      ) {
        settledRef.current.add(d.id);
        setArena(d);
        runSpinAnimation(d);
      }
    } catch {
      /* ignore */
    }
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
    const delay = Math.max(0, ms + 60);
    const t = setTimeout(() => fetchState(), delay);
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  useEffect(() => {
    if (!autoOn || autoLeft <= 0 || phase !== "lobby" || busy) return;
    const a = arena;
    if (!a || a.status === "finished" || a.status === "starting") return;
    if (a.players.find((p) => p.telegramId === telegramId)) return;
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

  const liveSectors = useMemo(
    () => buildSectors(arena?.players ?? []),
    [arena?.players],
  );
  const sectors = freezeSectors ?? liveSectors;
  const pool = freezeSectors ? freezePool : (arena?.totalPool ?? 0);

  const conic = useMemo(() => {
    if (!sectors.length) return "conic-gradient(from -90deg, #1a1a22 0deg 360deg)";
    let acc = 0;
    const parts = sectors.map((s) => {
      const a = acc;
      acc += s.share * 360;
      return `${s.color} ${a}deg ${acc}deg`;
    });
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }, [sectors]);

  async function placeBet(amount: number) {
    if (!telegramId) {
      flash("Откройте в Telegram", "err");
      return;
    }
    if (phase !== "lobby") {
      flash("Дождитесь окончания игры", "err");
      return;
    }
    if (arena?.status === "finished") {
      flash("Игра завершена, подождите…", "err");
      return;
    }
    if (arena?.status === "starting" && arena.startAt) {
      const left = new Date(arena.startAt).getTime() - Date.now();
      if (left <= 0) {
        flash("Игра уже началась", "err");
        return;
      }
    }
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE} ${betCurrency === "ton" ? "TON" : "TONYX"}`, "err");
      return;
    }
    if (amount > balance + 1e-9) {
      flash(`Недостаточно ${betCurrency === "ton" ? "TON" : "TONYX"}`, "err");
      return;
    }
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
      if (!r.ok) {
        flash(d.error ?? "Ошибка", "err");
        return;
      }
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
      const list = Array.isArray(d) ? d : (d.rooms ?? d.items ?? d.history ?? []);
      setHistory(list);
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
      resetAnim();
    }, 7500);
  }

  const countdownSec = arena?.startAt
    ? Math.max(0, Math.ceil((new Date(arena.startAt).getTime() - Date.now()) / 1000))
    : null;
  void tick;

  const isAnimating = phase === "spin" || phase === "winner";
  const countdownLeftMs =
    arena?.status === "starting" && arena.startAt
      ? new Date(arena.startAt).getTime() - Date.now()
      : null;
  const canBet =
    phase === "lobby" &&
    arena?.status !== "finished" &&
    !(arena?.status === "starting" && countdownLeftMs !== null && countdownLeftMs <= 0) &&
    !busy;

   function avatarStyle(midDeg: number, share: number, highlight = false): CSSProperties {
    const rad = ((midDeg - 90) * Math.PI) / 180;
    // один игрок — центр; иначе ближе к центру сектора, чтобы не вылезать
    const r = sectors.length === 1 ? 0 : Math.min(0.28, 0.12 + share * 0.22);
    // размер зависит от доли — маленькая территория = маленький аватар
    const size = Math.max(36, Math.min(88, 32 + share * 100));
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
      border: highlight ? "3px solid #fff" : "3px solid rgba(255,255,255,0.9)",
      boxShadow: highlight
        ? "0 0 0 3px rgba(74,222,128,0.65), 0 8px 24px rgba(0,0,0,0.5)"
        : "0 6px 18px rgba(0,0,0,0.45)",
      background: "#111",
      zIndex: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.28,
      fontWeight: 800,
      color: "#e2e8f0",
    };
  }

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  function playerPhoto(s: { telegramId: string; photoUrl?: string | null }) {
    if (s.photoUrl) return s.photoUrl;
    if (s.telegramId === telegramId && myPhoto) return myPhoto;
    return null;
  }
    return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0a0a0c",
        color: "#e8e8ed",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
      `}</style>

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px 8px",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.2 }}>
          PvP Arena
        </div>
        <button
          type="button"
          onClick={() => {
            setShowHistory(true);
            loadHistory();
          }}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "6px 12px",
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          📋 История
        </button>
      </div>

      {/* TOTAL + TIMER */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "0 14px 10px",
          flexShrink: 0,
        }}
      >
        <div style={topPill}>
          Тотал{" "}
          <b style={{ color: "#38bdf8", marginLeft: 4 }}>{pool.toFixed(2)}</b>
          <span style={{ color: "#38bdf8", marginLeft: 3 }}>TON</span>
        </div>
        <div style={{ ...topPill, marginLeft: "auto" }}>
          {isAnimating ? (
            <span
              style={{
                color: "#4ade80",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#4ade80",
                  animation: "livePulse 1s infinite",
                }}
              />
              LIVE
            </span>
          ) : arena?.status === "starting" &&
            countdownSec != null &&
            countdownSec > 0 ? (
            <span>
              Начало через{" "}
              <b style={{ color: "#fbbf24" }}>{fmtCountdown(countdownSec)}</b>
            </span>
          ) : arena?.status === "starting" ? (
            <span style={{ color: "#4ade80" }}>● LIVE</span>
          ) : (
            <span style={{ color: "#888" }}>Ожидание ставок</span>
          )}
        </div>
      </div>

          {/* СКРОЛЛ: арена + игроки */}
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* ARENA BOARD — фиксированный размер */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 16px 12px",
          }}
        >
          <div
            style={{
              width: "min(100%, 320px)",
              aspectRatio: "1 / 1",
              maxHeight: 300,
              position: "relative",
              borderRadius: 18,
              overflow: "hidden",
              background: "#121218",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.55)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: conic,
              }}
            />

            {sectors.map((s) => {
              const isWin =
                phase === "winner" &&
                (s.telegramId === arena?.winnerId ||
                  (winnerData &&
                    (s.username === winnerData.name ||
                      s.telegramId === winnerData.name)));
              const photo = playerPhoto(s);
              return (
                <div
                  key={s.telegramId}
                  style={avatarStyle(s.mid, s.share, !!isWin)}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    initials(s.username, s.telegramId)
                  )}
                </div>
              );
            })}

            {arrowVisible && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 0,
                  height: 0,
                  zIndex: 25,
                  pointerEvents: "none",
                  transform: `translate(-50%, -50%) rotate(${arrowAngle}deg)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -6,
                    top: -28,
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderBottom: "22px solid #fff",
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                  }}
                />
              </div>
            )}

            {puckVisible && (
              <div
                style={{
                  position: "absolute",
                  left: `${puckPos.x}%`,
                  top: `${puckPos.y}%`,
                  width: 34,
                  height: 34,
                  marginLeft: -17,
                  marginTop: -17,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 35% 30%, #fff 0%, #e8e8e8 45%, #c0c0c0 100%)",
                  boxShadow:
                    "0 2px 10px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.15)",
                  zIndex: 20,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    width: 14,
                    height: 2,
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: 1,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    width: 2,
                    height: 14,
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: 1,
                  }}
                />
              </div>
            )}

            {!sectors.length && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Ожидание игроков…
              </div>
            )}
          </div>
        </div>

        {/* СПИСОК ИГРОКОВ */}
        <div style={{ padding: "0 14px 16px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#888",
              marginBottom: 8,
            }}
          >
            Игроки · {sectors.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sectors.map((s) => (
              <div
                key={s.telegramId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background:
                    s.telegramId === telegramId
                      ? "rgba(56,189,248,0.1)"
                      : "rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: s.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  {s.telegramId === telegramId
                    ? "Вы"
                    : `@${s.username || s.telegramId}`}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {(s.share * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {s.stake.toFixed(2)} TON
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* КНОПКИ СТАВОК */}
      <div
        style={{
          padding: "14px 12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          background: "#0c0c0e",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 10,
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setBetCurrency("ton")}
            style={{
              padding: "6px 16px",
              borderRadius: 10,
              border:
                betCurrency === "ton"
                  ? "1px solid rgba(56,189,248,0.6)"
                  : "1px solid rgba(255,255,255,0.1)",
              background:
                betCurrency === "ton"
                  ? "rgba(56,189,248,0.18)"
                  : "rgba(255,255,255,0.05)",
              color: betCurrency === "ton" ? "#38bdf8" : "#888",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            TON
          </button>
          <button
            type="button"
            onClick={() => setBetCurrency("tonyx")}
            style={{
              padding: "6px 16px",
              borderRadius: 10,
              border:
                betCurrency === "tonyx"
                  ? "1px solid rgba(168,85,247,0.6)"
                  : "1px solid rgba(255,255,255,0.1)",
              background:
                betCurrency === "tonyx"
                  ? "rgba(168,85,247,0.18)"
                  : "rgba(255,255,255,0.05)",
              color: betCurrency === "tonyx" ? "#c084fc" : "#888",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            TONYX
          </button>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <button
            type="button"
            style={roundBtn}
            onClick={() => setShowBetEdit(true)}
            disabled={isAnimating}
          >
            ✎
          </button>
          {bets.map((b) => (
            <button
              key={b}
              type="button"
              disabled={!canBet}
              onClick={() => placeBet(b)}
              style={{
                ...betChip,
                opacity: canBet ? 1 : 0.4,
              }}
            >
              {b}
            </button>
          ))}
          {!hideAllIn && (
            <button
              type="button"
              disabled={!canBet || balance < MIN_STAKE}
              onClick={() => placeBet(Math.floor(balance * 1000) / 1000)}
              style={{
                ...betChip,
                background: "rgba(239,68,68,0.18)",
                borderColor: "rgba(239,68,68,0.35)",
                opacity: canBet && balance >= MIN_STAKE ? 1 : 0.4,
              }}
            >
              Ва-банк
            </button>
          )}
          <button
            type="button"
            style={roundBtn}
            onClick={() => setShowAuto(true)}
            disabled={isAnimating}
          >
            ↻
          </button>
        </div>
 
        {autoOn && (
          <div
            style={{
              fontSize: 11,
              color: "#a3e635",
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Авто: {autoStake} TON · осталось {autoLeft}
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: "absolute",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            background:
              toast.type === "ok"
                ? "rgba(34,197,94,0.95)"
                : "rgba(239,68,68,0.95)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 50,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* WINNER MODAL */}
      {phase === "winner" && winnerData && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg,#14532d,#052e16)",
              border: "1px solid rgba(74,222,128,0.35)",
              borderRadius: 20,
              padding: "24px 28px",
              textAlign: "center",
              maxWidth: 300,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 14, color: "#86efac", marginBottom: 6 }}>
              Победитель
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#fff",
                marginBottom: 8,
              }}
            >
              {winnerData.name.startsWith("@")
                ? winnerData.name
                : `@${winnerData.name}`}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: "#4ade80",
                marginBottom: 4,
              }}
            >
              +{winnerData.payout.toFixed(2)} TON
            </div>
            <div style={{ fontSize: 13, color: "#86efac" }}>
              ×{winnerData.mult}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY SHEET */}
      {showHistory && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              background: "#121218",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxHeight: "70vh",
              overflow: "auto",
              padding: "16px 14px 28px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>История игр</div>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#888",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            {history.length === 0 && (
              <div style={{ color: "#666", textAlign: "center", padding: 20 }}>
                Пока пусто
              </div>
            )}
            {history.map((item: any) => (
              <div
                key={item.id ?? item.gameId}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    #
                    {item.id ?? item.gameId} ·{" "}
                    {item.winnerUsername
                      ? `@${item.winnerUsername}`
                      : item.winnerId}
                  </span>
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>
                    {Number(item.totalPool ?? 0).toFixed(2)} TON
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    style={smallBtn}
                    onClick={() => openFair(item.id ?? item.gameId)}
                  >
                    Проверка честности
                  </button>
                  <button
                    type="button"
                    style={smallBtn}
                    onClick={() => replayFromHistory(item)}
                  >
                    Повтор
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAIR MODAL */}
      {fairItem && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setFairItem(null)}
        >
          <div
            style={{
              background: "#1a1a22",
              borderRadius: 16,
              padding: 20,
              maxWidth: 320,
              width: "100%",
              fontSize: 12,
              wordBreak: "break-all",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
              Проверка честности
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                color: "#a3a3a3",
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(fairItem, null, 2)}
            </pre>
            <button
              type="button"
              style={{ ...smallBtn, marginTop: 12, width: "100%" }}
              onClick={() => setFairItem(null)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* BET EDIT */}
      {showBetEdit && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setShowBetEdit(false)}
        >
          <div
            style={{
              background: "#121218",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              padding: "20px 16px 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
              Настроить кнопки
            </div>
            {bets.map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ width: 20, color: "#888" }}>{i + 1}.</span>
                <input
                  type="number"
                  value={editIdx === i ? editVal : String(b)}
                  onFocus={() => {
                    setEditIdx(i);
                    setEditVal(String(b));
                  }}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(editVal);
                    if (!isNaN(v) && v >= MIN_STAKE) {
                      const next = [...bets];
                      next[i] = Math.round(v * 1000) / 1000;
                      setBets(next);
                      localStorage.setItem("arena_bets", JSON.stringify(next));
                    }
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
            ))}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                fontSize: 13,
                color: "#aaa",
              }}
            >
              <input
                type="checkbox"
                checked={hideAllIn}
                onChange={(e) => setHideAllIn(e.target.checked)}
              />
              Скрыть «Ва-банк»
            </label>
            <button
              type="button"
              style={{ ...smallBtn, marginTop: 16, width: "100%" }}
              onClick={() => setShowBetEdit(false)}
            >
              Готово
            </button>
          </div>
        </div>
      )}

      {/* AUTO BET */}
      {showAuto && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setShowAuto(false)}
        >
          <div
            style={{
              background: "#121218",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              padding: "20px 16px 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
              Автоставка
            </div>
            <div style={{ marginBottom: 10, fontSize: 13, color: "#aaa" }}>
              Сумма (TON)
            </div>
            <input
              type="number"
              value={autoStake}
              onChange={(e) => setAutoStake(Number(e.target.value) || 0)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "#fff",
                fontSize: 15,
                marginBottom: 12,
              }}
            />
            <div style={{ marginBottom: 10, fontSize: 13, color: "#aaa" }}>
              Сколько раз
            </div>
            <input
              type="number"
              value={autoLeft || 5}
              onChange={(e) => setAutoLeft(Number(e.target.value) || 0)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "#fff",
                fontSize: 15,
                marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={{ ...smallBtn, flex: 1 }}
                onClick={() => {
                  setAutoOn(true);
                  if (autoLeft <= 0) setAutoLeft(5);
                  setShowAuto(false);
                }}
              >
                Включить
              </button>
              <button
                type="button"
                style={{
                  ...smallBtn,
                  flex: 1,
                  background: "rgba(239,68,68,0.2)",
                }}
                onClick={() => {
                  setAutoOn(false);
                  setAutoLeft(0);
                  setShowAuto(false);
                }}
              >
                Выключить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── styles ─── */
const topPill: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
};

const betChip: CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: "12px 0",
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const roundBtn: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontFamily: "inherit",
};

const smallBtn: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
