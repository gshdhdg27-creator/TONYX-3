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
import { runPortalsSpin } from "./arenaSpin";

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
  "#3b82f6",
  "#a855f7",
  "#22d3ee",
  "#eab308",
  "#ef4444",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
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
    const span = end - start;
    const radius =
      players.length === 1
        ? 0
        : span >= 120
          ? 28
          : span >= 60
            ? 32
            : span >= 30
              ? 36
              : 40;
    const angle = ((mid - 90) * Math.PI) / 180;
    const cx = 50 + Math.cos(angle) * radius;
    const cy = 50 + Math.sin(angle) * radius;
    const size = Math.max(28, Math.min(72, 24 + Math.sqrt(share) * 64));
    return {
      ...p,
      share,
      start,
      end,
      mid,
      color: colorFor(i),
      index: i,
      cx,
      cy,
      size,
      radius,
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
  const [boardZoom, setBoardZoom] = useState({ scale: 1, x: 50, y: 50 });
  const puckRef = useRef<HTMLDivElement | null>(null);
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
    setBoardZoom({ scale: 1, x: 50, y: 50 });
  }

  function paintPuck(x: number, y: number) {
    setPuckPos({ x, y });
    const el = puckRef.current;
    if (el) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
    }
  }

  function runSpinAnimation(data: ArenaState) {
    const secs = buildSectors(data.players);
    runPortalsSpin({
      sectors: secs,
      winnerId: data.winnerId,
      totalPool: data.totalPool,
      winnerUsername: data.winnerUsername,
      payoutOf,
      rafRef,
      replayingRef,
      cb: {
        setArrowAngle,
        setArrowVisible,
        setPuckVisible,
        paintPuck,
        setBoardZoom,
        setPhase,
        setFreezeSectors,
        setFreezePool,
        setWinnerData,
        onDone: () => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
        },
      },
    });
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

  const liveSectors = useMemo(
    () => buildSectors(arena?.players ?? []),
    [arena?.players],
  );
  const sectors = freezeSectors ?? liveSectors;
  const pool = freezeSectors ? freezePool : (arena?.totalPool ?? 0);

  const conic = useMemo(() => {
    if (!sectors.length) return "#121218";
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
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE}`, "err");
      return;
    }
    if (amount > balance + 1e-9) {
      flash("Недостаточно средств", "err");
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

  function playerPhoto(s: ReturnType<typeof buildSectors>[0]) {
    if (s.telegramId === telegramId && myPhoto) return myPhoto;
    return s.photoUrl ?? null;
  }

  function avatarStyle(s: ReturnType<typeof buildSectors>[0], isWin: boolean): CSSProperties {
    return {
      position: "absolute",
      left: `${s.cx}%`,
      top: `${s.cy}%`,
      width: s.size,
      height: s.size,
      marginLeft: -s.size / 2,
      marginTop: -s.size / 2,
      borderRadius: "50%",
      background: s.color,
      border: isWin ? "3px solid #fff" : "2px solid rgba(255,255,255,0.35)",
      boxShadow: isWin
        ? "0 0 0 3px rgba(251,191,36,0.8), 0 4px 16px rgba(0,0,0,0.5)"
        : "0 2px 8px rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.max(10, s.size * 0.32),
      fontWeight: 800,
      color: "#fff",
      overflow: "hidden",
      zIndex: isWin ? 20 : 10,
      transition: "box-shadow 0.3s",
    };
  }

  const countdownSec = arena?.startAt
    ? Math.max(0, Math.ceil((new Date(arena.startAt).getTime() - Date.now()) / 1000))
    : null;
  void tick;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "#0a0a12",
        color: "#f1f1f8",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 999,
            padding: "10px 18px",
            borderRadius: 12,
            background: toast.type === "ok" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {toast.msg}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#a0a0c0",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ←
        </button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>⚔️ Арена</div>
        <div style={{ fontSize: 12, color: "#888" }}>
          {pool > 0 ? `${pool.toFixed(2)} pool` : "—"}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 16px",
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
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `scale(${boardZoom.scale})`,
                transformOrigin: `${boardZoom.x}% ${boardZoom.y}%`,
                transition: "transform 650ms ease",
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: conic }} />

              {sectors.map((s) => {
                const isWin =
                  phase === "winner" &&
                  (s.telegramId === arena?.winnerId ||
                    (winnerData &&
                      (s.username === winnerData.name ||
                        s.telegramId === winnerData.name)));
                const photo = playerPhoto(s);
                return (
                  <div key={s.telegramId} style={avatarStyle(s, !!isWin)}>
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                    transition: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -2.5,
                      top: -42,
                      width: 5,
                      height: 36,
                      borderRadius: 3,
                      background: "linear-gradient(180deg, #ffffff 0%, #e5e7eb 100%)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: -9,
                      top: -58,
                      width: 0,
                      height: 0,
                      borderLeft: "9px solid transparent",
                      borderRight: "9px solid transparent",
                      borderBottom: "18px solid #fff",
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: -8,
                      top: -8,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 35% 30%, #fff 0%, #d1d5db 100%)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.35)",
                    }}
                  />
                </div>
              )}

              {puckVisible && (
                <div
                  ref={puckRef}
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
                      "radial-gradient(circle at 35% 30%, #ffffff 0%, #f3f4f6 55%, #d1d5db 100%)",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.55)",
                    zIndex: 30,
                    pointerEvents: "none",
                  }}
                />
              )}

              {phase === "winner" && winnerData && (
                <div
                  style={{
                    position: "absolute",
                    left: `${puckPos.x}%`,
                    top: `${puckPos.y}%`,
                    transform: "translate(-50%, -42px)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 16,
                    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                    zIndex: 31,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {winnerData.name}
                </div>
              )}
            </div>

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

        {/* Players list */}
        <div style={{ padding: "0 16px 16px" }}>
          {sectors.map((s) => (
            <div
              key={s.telegramId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: s.color,
                }}
              />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {s.username || s.telegramId}
              </div>
              <div style={{ fontSize: 12, color: "#a0a0c0" }}>
                {s.stake} · {(s.share * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bet panel */}
      {phase === "lobby" && (
        <div
          style={{
            padding: "12px 16px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {bets.map((b) => (
            <button
              key={b}
              type="button"
              disabled={busy}
              onClick={() => placeBet(b)}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {b} {betCurrency === "ton" ? "TON" : "TONYX"}
            </button>
          ))}
        </div>
      )}

      {phase === "winner" && winnerData && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.85)",
            padding: "14px 22px",
            borderRadius: 16,
            textAlign: "center",
            border: "1px solid rgba(251,191,36,0.4)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16, color: "#fbbf24" }}>
            🏆 {winnerData.name}
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 4 }}>
            +{winnerData.payout} · x{winnerData.mult}
          </div>
        </div>
      )}
    </div>
  );
}
