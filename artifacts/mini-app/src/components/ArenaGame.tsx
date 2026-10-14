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
  "#3b82f6", "#a855f7", "#22d3ee", "#eab308", "#ef4444",
  "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
];

const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 5, 10];

function initials(name: string | null | undefined, id: string) {
  const s = (name || id || "?").replace(/^@/, "");
  return s.slice(0, 2).toUpperCase();
}

function colorFor(i: number) {
  return COLORS[i % COLORS.length];
}

function buildSectors(players: ArenaPlayer[]) {
  // Portals-style areas: vertical strips, width = stake share.
  // Small bets = thin strips on the side; large bets = wide territory.
  // NOT pie/clock wedges from center.
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  const ordered = [...players].sort((a, b) => b.stake - a.stake);
  let acc = 0;
  return ordered.map((p, i) => {
    const share = p.stake / total;
    const left = acc * 100;
    acc += share;
    const right = acc * 100;
    const width = right - left;
    const cx = left + width / 2;
    const cy = 50;
    const size = Math.max(
      28,
      Math.min(56, Math.min(width * 2.2, 30 + share * 40)),
    );
    const start = (left / 100) * 360;
    const end = (right / 100) * 360;
    const mid = (start + end) / 2;
    return {
      ...p,
      share,
      start,
      end,
      mid,
      color: colorFor(Math.max(0, players.findIndex((x) => x.telegramId === p.telegramId))),
      index: i,
      cx,
      cy,
      size,
      radius: width / 2,
      left,
      right,
      width,
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
  const [puckPos, setPuckPos] = useState({ x: 50, y: 50 });
  const [puckVisible, setPuckVisible] = useState(false);
  const [boardZoom, setBoardZoom] = useState({ scale: 1, x: 50, y: 50 });
  const puckRef = useRef<HTMLDivElement | null>(null);
  const [arrowAngle, setArrowAngle] = useState(0);
  const [arrowVisible, setArrowVisible] = useState(false);
  const [winnerData, setWinnerData] = useState<{
    name: string; payout: number; mult: number; photo?: string | null;
  } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [tick, setTick] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [customBet, setCustomBet] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoStake, setAutoStake] = useState(0.1);
  const autoPlayRef = useRef(false);
  const autoStakeRef = useRef(0.1);

  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const replayingRef = useRef(false);
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
      setTick((n) => n + 1);
    };
    update();
    const id = setInterval(update, 200);
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
      sectors: secs as any,
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
        setFreezeSectors: setFreezeSectors as any,
        setFreezePool,
        setWinnerData,
        onDone: () => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
          if (autoPlayRef.current && autoStakeRef.current > 0) {
            setTimeout(() => placeBet(autoStakeRef.current), 700);
          }
        },
      },
    });
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
        phaseRef.current === "lobby" && !replayingRef.current
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

  const liveSectors = useMemo(() => buildSectors(arena?.players ?? []), [arena?.players]);
  const sectors = freezeSectors ?? liveSectors;
  const pool = freezeSectors ? freezePool : (arena?.totalPool ?? 0);

  void tick;

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

  function avatarStyle(s: ReturnType<typeof buildSectors>[0], isWin: boolean): CSSProperties {
    return {
      position: "absolute",
      left: `${s.cx}%`, top: `${s.cy}%`,
      width: s.size, height: s.size,
      marginLeft: -s.size / 2, marginTop: -s.size / 2,
      borderRadius: "50%", background: s.color,
      border: isWin ? "3px solid #fff" : "2px solid rgba(255,255,255,0.55)",
      boxShadow: isWin
        ? "0 0 0 3px rgba(251,191,36,0.8), 0 4px 16px rgba(0,0,0,0.5)"
        : "0 2px 8px rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.max(10, s.size * 0.32), fontWeight: 800, color: "#fff",
      overflow: "hidden", zIndex: isWin ? 20 : 10,
    };
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 16px" }}>
          <div style={{
            width: "min(100%, 320px)", aspectRatio: "1 / 1", maxHeight: 300,
            position: "relative", borderRadius: 22, overflow: "hidden", background: "#121218",
            boxShadow: phase === "spin"
              ? "0 0 0 2px rgba(251,191,36,0.45), 0 16px 40px rgba(0,0,0,0.55)"
              : "0 0 0 1px rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.55)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              transform: `scale(${boardZoom.scale})`,
              transformOrigin: `${boardZoom.x}% ${boardZoom.y}%`,
              transition: "transform 650ms ease",
            }}>
              {/* Vertical strip territories — NOT pie */}
              {sectors.map((s) => (
                <div
                  key={`strip-${s.telegramId}`}
                  style={{
                    position: "absolute",
                    left: `${(s as { left?: number }).left ?? 0}%`,
                    top: 0,
                    width: `${(s as { width?: number }).width ?? 100}%`,
                    height: "100%",
                    background: s.color,
                    borderRight: sectors.length > 1 ? "2px solid rgba(10,10,18,0.85)" : "none",
                    boxSizing: "border-box",
                  }}
                />
              ))}
              {sectors.length === 0 && (
                <div style={{ position: "absolute", inset: 0, background: "#121218" }} />
              )}

              {sectors.map((s) => {
                const isWin = phase === "winner" && (
                  s.telegramId === arena?.winnerId ||
                  (winnerData && (s.username === winnerData.name || s.telegramId === winnerData.name))
                );
                const photo = playerPhoto(s);
                return (
                  <div key={s.telegramId} style={avatarStyle(s, !!isWin)}>
                    {photo ? (
                      <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : initials(s.username, s.telegramId)}
                  </div>
                );
              })}

              {puckVisible && (
                <div ref={puckRef} style={{
                  position: "absolute", left: `${puckPos.x}%`, top: `${puckPos.y}%`,
                  width: 36, height: 36, marginLeft: -18, marginTop: -18, borderRadius: "50%",
                  background: "radial-gradient(circle at 32% 28%, #ffffff 0%, #f8fafc 40%, #e2e8f0 70%, #94a3b8 100%)",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.5), inset 0 -3px 6px rgba(0,0,0,0.12), 0 0 0 1.5px rgba(255,255,255,0.7)",
                  zIndex: 30, pointerEvents: "none",
                }} />
              )}

              {phase === "winner" && winnerData && (
                <div style={{
                  position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                  zIndex: 35, textAlign: "center", pointerEvents: "none",
                  background: "rgba(0,0,0,0.75)", borderRadius: 14, padding: "10px 16px",
                  border: "1px solid rgba(251,191,36,0.45)",
                }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>🏆 {winnerData.name}</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 2 }}>+{winnerData.payout} · ×{winnerData.mult}</div>
                </div>
              )}
            </div>
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
