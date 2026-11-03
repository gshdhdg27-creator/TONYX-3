import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5, 10];
const ROUND_MS = 20_000;
const BETTING_MS = 10_000;
const FLY_MS = 7_500;
const HIST_KEY = "tonyx_crash_hist_v2";
const HIST_MAX = 40;

type Phase = "betting" | "fly" | "crash" | "win";
type Hist = {
  roundId: number;
  crash: number;
  hash: string;
  at: number;
  won?: boolean;
  payout?: number;
};

type RoundSnap = {
  roundId: number;
  phase: "betting" | "fly" | "result";
  phaseElapsed: number;
  phaseRemaining: number;
  crashPoint: number | null;
  serverNow: number;
};

function loadHist(): Hist[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, HIST_MAX) : [];
  } catch {
    return [];
  }
}
function saveHist(items: Hist[]) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(items.slice(0, HIST_MAX)));
  } catch {
    /* */
  }
}

function snapFromClock(offsetMs: number, epochMs: number, crashByRound: Map<number, number>): RoundSnap {
  const now = Date.now() + offsetMs;
  const elapsedTotal = Math.max(0, now - epochMs);
  const idx0 = Math.floor(elapsedTotal / ROUND_MS);
  const roundId = idx0 + 1;
  const elapsed = elapsedTotal % ROUND_MS;
  const crashPoint = crashByRound.get(roundId) ?? null;

  if (elapsed < BETTING_MS) {
    return {
      roundId,
      phase: "betting",
      phaseElapsed: elapsed,
      phaseRemaining: BETTING_MS - elapsed,
      crashPoint: null,
      serverNow: now,
    };
  }
  if (elapsed < BETTING_MS + FLY_MS) {
    return {
      roundId,
      phase: "fly",
      phaseElapsed: elapsed - BETTING_MS,
      phaseRemaining: BETTING_MS + FLY_MS - elapsed,
      crashPoint,
      serverNow: now,
    };
  }
  return {
    roundId,
    phase: "result",
    phaseElapsed: elapsed - BETTING_MS - FLY_MS,
    phaseRemaining: ROUND_MS - elapsed,
    crashPoint,
    serverNow: now,
  };
}

function multAt(elapsedMs: number, crash: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const m = Math.pow(Math.E, 0.06 * t);
  return Math.min(crash, Math.max(1, Math.floor(m * 100) / 100));
}

export default function CrashGame({
  telegramId,
  balance,
  onBalance,
}: {
  telegramId: string;
  balance: number;
  onBalance: (n: number) => void;
}) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("betting");
  const [mult, setMult] = useState(1);
  const [countdown, setCountdown] = useState(10);
  const [roundId, setRoundId] = useState(0);
  const [stake, setStake] = useState(MIN_BET);
  const [cashoutAt, setCashoutAt] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hist, setHist] = useState<Hist[]>(() => loadHist());
  const [detail, setDetail] = useState<Hist | null>(null);
  const [betActive, setBetActive] = useState(false);

  const offsetRef = useRef(0);
  const epochRef = useRef(Date.now());
  const crashMapRef = useRef<Map<number, number>>(new Map());
  const activeRoundRef = useRef(-1);
  const betRoundRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const readyRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const applyServer = useCallback((d: any) => {
    if (typeof d.serverNow === "number") offsetRef.current = d.serverNow - Date.now();
    if (typeof d.epochMs === "number" && Number.isFinite(d.epochMs)) epochRef.current = d.epochMs;
    const rid = Number(d.roundId);
    if (Number.isFinite(rid) && d.crashPoint != null) crashMapRef.current.set(rid, Number(d.crashPoint));
    if (d.prevCrashPoint != null && Number.isFinite(d.prevRoundId)) {
      crashMapRef.current.set(Number(d.prevRoundId), Number(d.prevCrashPoint));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const pull = async (isBoot = false) => {
      try {
        const r = await fetch("/api/mini/games/crash/state");
        const d = await r.json();
        if (!alive) return;
        applyServer(d);
        if (isBoot) {
          readyRef.current = true;
          setReady(true);
        }
      } catch {
        /* */
      }
    };
    void pull(true);
    const id = setInterval(() => void pull(false), 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [applyServer]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const st = snapFromClock(offsetRef.current, epochRef.current, crashMapRef.current);
      if (st.roundId !== activeRoundRef.current) {
        activeRoundRef.current = st.roundId;
        setRoundId(st.roundId);
        if (betRoundRef.current != null && betRoundRef.current !== st.roundId) {
          setBetActive(false);
          betRoundRef.current = null;
        }
      }
      setRoundId(st.roundId);

      if (st.phase === "betting") {
        setPhase("betting");
        setMult(1);
        setCountdown(Math.ceil(st.phaseRemaining / 1000));
      } else if (st.phase === "fly") {
        let crash = crashMapRef.current.get(st.roundId) ?? st.crashPoint ?? 2;
        if (st.crashPoint != null) crashMapRef.current.set(st.roundId, st.crashPoint);
        crash = crashMapRef.current.get(st.roundId) ?? crash;
        const m = multAt(st.phaseElapsed, crash);
        setMult(m);
        if (m >= crash) {
          setPhase("crash");
          setMult(crash);
          if (!settledRef.current.has(st.roundId)) {
            settledRef.current.add(st.roundId);
            const item: Hist = {
              roundId: st.roundId,
              crash,
              hash: String(st.roundId),
              at: Date.now(),
            };
            setHist((h) => {
              const next = [item, ...h.filter((x) => x.roundId !== st.roundId)].slice(0, HIST_MAX);
              saveHist(next);
              return next;
            });
          }
        } else {
          setPhase("fly");
        }
      } else {
        const crash = crashMapRef.current.get(st.roundId) ?? st.crashPoint ?? 1;
        setPhase("crash");
        setMult(crash);
      }
    };
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [ready]);

  const placeBet = async () => {
    if (busy || phase !== "betting" || !telegramId) return;
    if (stake > balance) {
      setMsg("Недостаточно TON");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/mini/games/crash/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          stake,
          cashoutAt,
          roundId,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d.error || "Ошибка");
      } else {
        setBetActive(true);
        betRoundRef.current = roundId;
        if (typeof d.newBalance === "number") onBalance(d.newBalance);
        setMsg(d.won ? `Выигрыш +${d.profit}` : `Проигрыш ${stake}`);
        setHist((h) => {
          const item: Hist = {
            roundId: d.roundId ?? roundId,
            crash: d.publicCrashPoint ?? d.crashPoint ?? 0,
            hash: d.hash || "",
            at: Date.now(),
            won: d.won,
            payout: d.payout,
          };
          const next = [item, ...h.filter((x) => x.roundId !== item.roundId)].slice(0, HIST_MAX);
          saveHist(next);
          return next;
        });
      }
    } catch {
      setMsg("Сеть");
    } finally {
      setBusy(false);
    }
  };

  const phaseColor =
    phase === "betting" ? "#38bdf8" : phase === "fly" ? "#4ade80" : phase === "win" ? "#fbbf24" : "#f87171";

  const card: CSSProperties = {
    background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 16,
    padding: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!ready && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Синхронизация раунда…</div>
      )}
      {ready && (
        <>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
              Раунд <b style={{ color: "#fbbf24" }}>#{roundId}</b>
              {betActive && <span style={{ marginLeft: 8, color: "#4ade80" }}>ставка принята</span>}
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, color: phaseColor, fontVariantNumeric: "tabular-nums" }}>
              {phase === "betting" ? `${countdown}s` : `${mult.toFixed(2)}x`}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
              {phase === "betting" && "Приём ставок"}
              {phase === "fly" && "Полёт"}
              {(phase === "crash" || phase === "win") && "Краш"}
            </div>
            <canvas ref={canvasRef} width={320} height={120} style={{ width: "100%", marginTop: 8, borderRadius: 8, background: "#0f172a" }} />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {hist.slice(0, 12).map((h) => (
              <button
                key={h.roundId}
                type="button"
                onClick={() => setDetail(h)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: h.crash >= 2 ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.2)",
                  color: h.crash >= 2 ? "#4ade80" : "#f87171",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {h.crash.toFixed(2)}x
              </button>
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Ставка (TON)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStake(p)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: stake === p ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                    background: stake === p ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.05)",
                    color: "#e2e8f0",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={MIN_BET}
              step={0.1}
              value={stake}
              onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0f172a",
                color: "#f1f5f9",
                marginBottom: 10,
                fontFamily: "inherit",
              }}
            />
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Автокэшаут</div>
            <input
              type="number"
              min={1.01}
              step={0.1}
              value={cashoutAt}
              onChange={(e) => setCashoutAt(Math.max(1.01, Number(e.target.value) || 1.01))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0f172a",
                color: "#f1f5f9",
                marginBottom: 12,
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              disabled={busy || phase !== "betting" || betActive}
              onClick={() => void placeBet()}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 12,
                border: "none",
                background:
                  phase === "betting" && !betActive
                    ? "linear-gradient(135deg,#0369a1,#0ea5e9)"
                    : "rgba(100,116,139,0.3)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 15,
                cursor: phase === "betting" && !betActive ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {betActive ? "Ставка принята" : phase !== "betting" ? "Ждите раунд" : busy ? "…" : `Ставка ${stake} TON`}
            </button>
            {msg && (
              <div style={{ marginTop: 10, fontSize: 13, color: "#cbd5e1", textAlign: "center" }}>{msg}</div>
            )}
          </div>
        </>
      )}

      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, width: "100%", maxWidth: 320 }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, color: "#f1f5f9", marginBottom: 10 }}>
              Раунд #{detail.roundId}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
              <div>
                Коэффициент: <b style={{ color: "#4ade80" }}>{detail.crash.toFixed(2)}x</b>
              </div>
              <div>Hash: {detail.hash || "—"}</div>
              <div>Время: {new Date(detail.at).toLocaleString()}</div>
              {detail.won != null && (
                <div>Статус: {detail.won ? `Выигрыш ${detail.payout ?? ""}` : "Проигрыш"}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              style={{
                marginTop: 14,
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "none",
                background: "#1e293b",
                color: "#e2e8f0",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
