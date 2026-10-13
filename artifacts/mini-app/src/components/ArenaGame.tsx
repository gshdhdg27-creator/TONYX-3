import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
  "#3b82f6", "#a855f7", "#22d3ee", "#eab308", "#ef4444",
  "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
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
  const balance = Number(
    (profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0,
  );

  const refreshBalance = useCallback(() => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    onBalanceChange?.();
  }, [qc, telegramId, onBalanceChange]);

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [wheelRot, setWheelRot] = useState(0);
  const [puckAngle, setPuckAngle] = useState(0);
  const [puckVisible, setPuckVisible] = useState(false);
  const [winnerData, setWinnerData] = useState<{
    name: string; payout: number; mult: number; photo?: string | null;
  } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [bets, setBets] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("arena_bets");
      if (raw) return JSON.parse(raw);
    } catch { /* */ }
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
    setWheelRot(0);
    setPuckAngle(0);
    setPuckVisible(false);
    setWinnerData(null);
    setFreezeSectors(null);
    setFreezePool(0);
  }

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

    // Поле НЕ крутится. Шайба едет по краю и останавливается на победителе.
    const laps = 4;
    const targetPuck = laps * 360 + mid;

    setPhase("spin");
    setWheelRot(0);
    setPuckAngle(0);
    setPuckVisible(true);
    setWinnerData(null);

    const duration = 5200;
    const t0 = performance.now();

    const tickFn = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeOutCubic(t);
      setWheelRot(0);
      setPuckAngle(targetPuck * e);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tickFn);
        return;
      }
      setWheelRot(0);
      setPuckAngle(targetPuck);
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

  const liveSectors = useMemo(() => buildSectors(arena?.players ?? []), [arena?.players]);
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
    if (arena?.status === "starting") {
      flash("Игра уже началась", "err");
      return;
    }
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE} TON`, "err");
      return;
    }
    if (amount > balance + 1e-9) {
      flash("Недостаточно TON", "err");
      return;
    }
    setBusy(true);
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount }
        : { telegramId, stake: amount };
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

  const isSpinning = phase === "spin";
  const isAnimating = phase === "spin" || phase === "winner";
  const canBet =
    phase === "lobby" &&
    arena?.status !== "finished" &&
    arena?.status !== "starting" &&
    !busy;

  function avatarStyle(midDeg: number, share: number, highlight = false): CSSProperties {
    const rad = ((midDeg - 90) * Math.PI) / 180;
    const r = sectors.length === 1 ? 0 : 0.28;
    const size = Math.max(48, Math.min(120, 42 + share * 140));
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
      border: highlight ? "3px solid #fff" : "3px solid rgba(255,255,255,0.85)",
      boxShadow: highlight
        ? "0 0 0 3px rgba(74,222,128,0.6), 0 8px 24px rgba(0,0,0,0.5)"
        : "0 6px 20px rgba(0,0,0,0.45)",
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

  const puckRad = ((puckAngle - 90) * Math.PI) / 180;
  const puckR = 0.44;
  const puckX = 50 + Math.cos(puckRad) * puckR * 100;
  const puckY = 50 + Math.sin(puckRad) * puckR * 100;

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#0a0a0c",
        color: "#e8e8ed",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes arenaPop { from{transform:scale(.82);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={onClose} style={iconRound} aria-label="Закрыть">
          ✕
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>PvP Arena</div>
        <button
          type="button"
          onClick={() => {
            setShowHistory(true);
            loadHistory();
            onOpenHistory?.();
          }}
          style={{
            ...iconRound,
            width: "auto",
            padding: "0 12px",
            gap: 6,
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          📋 История
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "5px 10px 5px 6px",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#0098ea,#00d4ff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 900,
              color: "#fff",
            }}
          >
            ◆
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {balance.toFixed(3)}
          </span>
        </div>
      </div>

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
            <span style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
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
          ) : arena?.status === "starting" && countdownSec != null && countdownSec > 0 ? (
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

      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 260,
          maxHeight: "min(56vh, 380px)",
          padding: "4px 16px",
        }}
      >
        <div
          style={{
            width: "min(100%, 340px)",
            aspectRatio: "1 / 1",
            maxHeight: "min(56vh, 360px)",
            position: "relative",
            borderRadius: 18,
            overflow: "hidden",
            background: "#121218",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.55)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: conic,
              transform: `rotate(${wheelRot}deg)`,
              willChange: "transform",
            }}
          >
            {sectors.map((s) => {
              const isWin =
                phase === "winner" &&
                (s.telegramId === arena?.winnerId ||
                  (winnerData &&
                    (s.username === winnerData.name || s.telegramId === winnerData.name)));
              return (
                <div key={s.telegramId} style={avatarStyle(s.mid, s.share, !!isWin)}>
                  {s.photoUrl || (s.telegramId === telegramId ? myPhoto : null) ? (
                    <img
                      src={(s.photoUrl || (s.telegramId === telegramId ? myPhoto : null))!}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    initials(s.username, s.telegramId)
                  )}
                </div>
              );
            })}
          </div>

          {puckVisible && (
            <div
              style={{
                position: "absolute",
                left: `${puckX}%`,
                top: `${puckY}%`,
                width: 36,
                height: 36,
                marginLeft: -18,
                marginTop: -18,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.3)",
                zIndex: 20,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "2px solid #334155",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 0,
                    bottom: 0,
                    width: 1.5,
                    marginLeft: -0.75,
                    background: "#334155",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    right: 0,
                    height: 1.5,
                    marginTop: -0.75,
                    background: "#334155",
                  }}
                />
              </div>
            </div>
          )}

          {!sectors.length && phase === "lobby" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#555",
                fontSize: 14,
                fontWeight: 600,
                zIndex: 4,
              }}
            >
              Ждём игроков…
            </div>
          )}
        </div>
      </div>
            <div style={{ padding: "6px 14px 8px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
          }}
        >
          <span>Игроки · {sectors.length}</span>
          <span>Игра #{arena?.id ?? "—"}</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {sectors
            .slice()
            .sort((a, b) => b.stake - a.stake)
            .map((s) => (
              <div
                key={s.telegramId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  padding: "7px 10px",
                  border:
                    s.telegramId === telegramId
                      ? "1px solid rgba(56,189,248,0.4)"
                      : "1px solid transparent",
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
                  {s.telegramId === telegramId ? "Вы" : `@${s.username || s.telegramId}`}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>{(s.share * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.stake.toFixed(2)} TON</div>
              </div>
            ))}
        </div>
      </div>

      <div
        style={{
          padding: "10px 12px 18px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          background: "#0c0c0e",
        }}
      >
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
          <div style={{ fontSize: 11, color: "#a3e635", marginTop: 6, textAlign: "center" }}>
            Авто: {autoStake} TON · осталось {autoLeft}
          </div>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 16,
            right: 16,
            zIndex: 50,
            background: toast.type === "ok" ? "rgba(5,150,105,0.95)" : "rgba(220,38,38,0.95)",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}

      {phase === "winner" && winnerData && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              background: "#15201a",
              borderRadius: 20,
              padding: "24px 18px",
              textAlign: "center",
              animation: "arenaPop 0.35s ease",
              border: "1px solid rgba(74,222,128,0.35)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
              @{winnerData.name} выиграл
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#4ade80" }}>
              {winnerData.payout} TON
            </div>
            <div
              style={{
                display: "inline-block",
                marginTop: 8,
                background: "rgba(74,222,128,0.15)",
                color: "#86efac",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {winnerData.mult}x
            </div>
          </div>
        </div>
      )}      {showHistory && (
        <Sheet onClose={() => setShowHistory(false)} title="История игр">
          {history.length === 0 && (
            <div style={{ color: "#666", textAlign: "center", padding: 24 }}>Пусто</div>
          )}
          {history.map((item: any) => {
            const id = item.id ?? item.gameId;
            const players = item.players ?? [];
            const wp = players.find((p: any) => p.telegramId === item.winnerId);
            const stake = Number(wp?.stake ?? 0);
            const payout = Number(item.winnerPayout ?? 0);
            const mult =
              item.multiplier ??
              item.mult ??
              (stake > 0 && payout > 0 ? (payout / stake).toFixed(2) : "—");
            return (
              <div
                key={id}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, color: "#4ade80" }}>{mult}x</span>
                  <span style={{ color: "#666", fontSize: 12 }}>#{id}</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  @{item.winnerUsername ?? item.winnerId ?? "?"}
                </div>
                {payout > 0 && (
                  <div style={{ fontSize: 12, color: "#86efac", marginBottom: 8 }}>
                    +{payout} TON
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={smallBtn} onClick={() => replayFromHistory(item)}>
                    Открыть повтор
                  </button>
                  <button type="button" style={smallBtn} onClick={() => openFair(id)}>
                    Проверка честности
                  </button>
                </div>
              </div>
            );
          })}
        </Sheet>
      )}

      {fairItem && (
        <Sheet onClose={() => setFairItem(null)} title={`Игра #${fairItem.id ?? ""}`}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
            Хеш: {fairItem.serverSeedHash ?? fairItem.hash ?? "—"}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
            Сид: {fairItem.serverSeed ?? fairItem.seed ?? "—"}
          </div>
          <button
            type="button"
            style={{ ...betChip, width: "100%", marginTop: 12 }}
            onClick={() => setFairItem(null)}
          >
            Legit Check
          </button>
        </Sheet>
      )}

      {showBetEdit && (
        <Sheet onClose={() => setShowBetEdit(false)} title="Настроить кнопки">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {bets.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setEditIdx(i);
                  setEditVal(String(b));
                }}
                style={{
                  ...betChip,
                  borderColor: editIdx === i ? "#38bdf8" : "rgba(255,255,255,0.1)",
                }}
              >
                {b}
              </button>
            ))}
          </div>
          <input
            value={editVal}
            onChange={(e) => setEditVal(e.target.value.replace(",", "."))}
            inputMode="decimal"
            style={inputStyle}
            placeholder="Сумма TON"
          />
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={hideAllIn}
              onChange={(e) => setHideAllIn(e.target.checked)}
            />
            Скрывать «Ва-банк»
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              style={betChip}
              onClick={() => {
                setBets(DEFAULT_BETS);
                setHideAllIn(false);
              }}
            >
              Сбросить
            </button>
            <button
              type="button"
              style={{ ...betChip, background: "#2563eb", borderColor: "#2563eb", flex: 1 }}
              onClick={() => {
                const n = parseFloat(editVal);
                if (!n || n <= 0) {
                  flash("Сумма должна быть больше 0", "err");
                  return;
                }
                const next = [...bets];
                next[editIdx] = Math.round(n * 1000) / 1000;
                setBets(next);
                localStorage.setItem("arena_bets", JSON.stringify(next));
                setShowBetEdit(false);
              }}
            >
              Сохранить
            </button>
          </div>
        </Sheet>
      )}
            {showAuto && (
        <Sheet onClose={() => setShowAuto(false)} title="Автоигра">
          <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Размер одной ставки</div>
          <input
            value={String(autoStake)}
            onChange={(e) => setAutoStake(parseFloat(e.target.value) || 0)}
            inputMode="decimal"
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[0.5, 1, 2, 5, 10].map((v) => (
              <button key={v} type="button" style={smallBtn} onClick={() => setAutoStake(v)}>
                {v}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#888", margin: "14px 0 8px" }}>Количество игр</div>
          <input
            value={String(autoLeft || 10)}
            onChange={(e) => setAutoLeft(parseInt(e.target.value || "0", 10))}
            inputMode="numeric"
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              style={betChip}
              onClick={() => {
                setAutoOn(false);
                setAutoLeft(0);
                setShowAuto(false);
              }}
            >
              Сбросить
            </button>
            <button
              type="button"
              style={{ ...betChip, background: "#2563eb", borderColor: "#2563eb", flex: 1 }}
              onClick={() => {
                if (autoStake < MIN_STAKE) {
                  flash(`Мин. ${MIN_STAKE}`, "err");
                  return;
                }
                setAutoOn(true);
                if (autoLeft <= 0) setAutoLeft(10);
                setShowAuto(false);
              }}
            >
              Запустить
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxHeight: "78%",
          overflowY: "auto",
          background: "#121218",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: "16px 16px 28px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button type="button" onClick={onClose} style={iconRound}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const iconRound: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  color: "#aaa",
  fontSize: 15,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "inherit",
};
const topPill: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  borderRadius: 12,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
};
const betChip: CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: "12px 6px",
  color: "#e8e8ed",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
const roundBtn: CSSProperties = {
  ...betChip,
  flex: "0 0 40px",
  padding: "12px 0",
};
const smallBtn: CSSProperties = {
  background: "rgba(37,99,235,0.25)",
  border: "1px solid rgba(37,99,235,0.45)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: "12px 14px",
  color: "#f1f5f9",
  fontSize: 16,
  fontWeight: 700,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
