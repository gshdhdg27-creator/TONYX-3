import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5, 10];
const ROUND_MS = 20_000;
const BETTING_MS = 10_000;
const FLY_MS = 7_500;
const HIST_KEY = "tonyx_crash_hist_v4";
const HIST_MAX = 40;

type UiPhase = "betting" | "fly" | "result";
type Hist = {
  roundId: number;
  crash: number;
  hash: string;
  at: number;
  status: string;
  won?: boolean;
  payout?: number;
};

type RoundSnap = {
  roundId: number;
  phase: "betting" | "fly" | "result";
  phaseElapsed: number;
  phaseRemaining: number;
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

function snapFromClock(offsetMs: number, epochMs: number): RoundSnap {
  const now = Date.now() + offsetMs;
  const elapsedTotal = Math.max(0, now - epochMs);
  const idx0 = Math.floor(elapsedTotal / ROUND_MS);
  const roundId = idx0 + 1;
  const elapsed = elapsedTotal % ROUND_MS;
  if (elapsed < BETTING_MS) {
    return { roundId, phase: "betting", phaseElapsed: elapsed, phaseRemaining: BETTING_MS - elapsed };
  }
  if (elapsed < BETTING_MS + FLY_MS) {
    return {
      roundId,
      phase: "fly",
      phaseElapsed: elapsed - BETTING_MS,
      phaseRemaining: BETTING_MS + FLY_MS - elapsed,
    };
  }
  return {
    roundId,
    phase: "result",
    phaseElapsed: elapsed - BETTING_MS - FLY_MS,
    phaseRemaining: ROUND_MS - elapsed,
  };
}

function multAt(elapsedMs: number, crash: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const m = Math.pow(Math.E, 0.06 * t);
  return Math.min(crash, Math.max(1, Math.floor(m * 100) / 100));
}

function flyProgress(elapsedMs: number, crash: number): number {
  if (crash <= 1.01) return 1;
  const targetT = Math.log(crash) / 0.06;
  const t = Math.max(0, elapsedMs) / 1000;
  return Math.min(1, t / Math.max(0.01, targetT));
}

export default function CrashGame({
  telegramId,
  balance,
  onBalanceChange,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<UiPhase>("betting");
  const [mult, setMult] = useState(1);
  const [countdown, setCountdown] = useState(10);
  const [roundId, setRoundId] = useState(0);
  const [stake, setStake] = useState(0.5);
  const [cashoutAt, setCashoutAt] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hist, setHist] = useState<Hist[]>(() => loadHist());
  const [detail, setDetail] = useState<Hist | null>(null);
  const [betActive, setBetActive] = useState(false);

  const offsetRef = useRef(0);
  const epochRef = useRef(0);
  const crashMapRef = useRef<Map<number, number>>(new Map());
  const hashMapRef = useRef<Map<number, string>>(new Map());
  const activeRoundRef = useRef(-1);
  const betRoundRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<UiPhase>("betting");
  const multRef = useRef(1);
  const progressRef = useRef(0);
  const explodeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  const pushHist = useCallback((item: Hist) => {
    setHist((h) => {
      const next = [item, ...h.filter((x) => x.roundId !== item.roundId)].slice(0, HIST_MAX);
      saveHist(next);
      return next;
    });
  }, []);

  const applyServer = useCallback(
    (d: any) => {
      if (typeof d.serverNow === "number") offsetRef.current = d.serverNow - Date.now();
      if (typeof d.epochMs === "number" && Number.isFinite(d.epochMs)) epochRef.current = d.epochMs;
      const rid = Number(d.roundId);
      if (Number.isFinite(rid)) {
        if (d.crashPoint != null) crashMapRef.current.set(rid, Number(d.crashPoint));
        if (d.hash) hashMapRef.current.set(rid, String(d.hash));
      }
      if (d.prevRoundId != null && Number.isFinite(Number(d.prevRoundId))) {
        const pr = Number(d.prevRoundId);
        if (d.prevCrashPoint != null) crashMapRef.current.set(pr, Number(d.prevCrashPoint));
        if (d.prevHash) hashMapRef.current.set(pr, String(d.prevHash));
        if (!settledRef.current.has(pr) && d.prevCrashPoint != null) {
          settledRef.current.add(pr);
          pushHist({
            roundId: pr,
            crash: Number(d.prevCrashPoint),
            hash: String(d.prevHash || ""),
            at: Date.now() - ROUND_MS,
            status: "Завершён",
          });
        }
      }
    },
    [pushHist],
  );

  useEffect(() => {
    let alive = true;
    const pull = async (isBoot: boolean) => {
      try {
        const r = await fetch("/api/mini/games/crash/state");
        const d = await r.json();
        if (!alive || d.error) return;
        applyServer(d);
        if (isBoot && epochRef.current > 0) {
          const st = snapFromClock(offsetRef.current, epochRef.current);
          activeRoundRef.current = st.roundId;
          setRoundId(st.roundId);
          if (st.phase === "betting") {
            phaseRef.current = "betting";
            setPhase("betting");
            multRef.current = 1;
            setMult(1);
            progressRef.current = 0;
            explodeRef.current = 0;
            setCountdown(Math.max(1, Math.ceil(st.phaseRemaining / 1000)));
          } else if (st.phase === "fly") {
            const crash = crashMapRef.current.get(st.roundId) ?? Number(d.crashPoint) ?? 2;
            crashMapRef.current.set(st.roundId, crash);
            phaseRef.current = "fly";
            setPhase("fly");
            const m = multAt(st.phaseElapsed, crash);
            multRef.current = m;
            setMult(m);
            progressRef.current = flyProgress(st.phaseElapsed, crash);
            explodeRef.current = 0;
          } else {
            const crash = crashMapRef.current.get(st.roundId) ?? Number(d.crashPoint) ?? 1;
            crashMapRef.current.set(st.roundId, crash);
            phaseRef.current = "result";
            setPhase("result");
            multRef.current = crash;
            setMult(crash);
            progressRef.current = 1;
            explodeRef.current = 1;
          }
          setReady(true);
        }
      } catch {
        /* */
      }
    };
    void pull(true);
    const id = setInterval(() => void pull(false), 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [applyServer]);

  useEffect(() => {
    if (!ready || epochRef.current <= 0) return;
    const tick = () => {
      const st = snapFromClock(offsetRef.current, epochRef.current);
      if (st.roundId !== activeRoundRef.current) {
        const prev = activeRoundRef.current;
        if (prev > 0 && !settledRef.current.has(prev)) {
          const c = crashMapRef.current.get(prev);
          if (c != null) {
            settledRef.current.add(prev);
            pushHist({
              roundId: prev,
              crash: c,
              hash: hashMapRef.current.get(prev) || "",
              at: Date.now(),
              status: "Завершён",
            });
          }
        }
        activeRoundRef.current = st.roundId;
        setRoundId(st.roundId);
        explodeRef.current = 0;
        progressRef.current = 0;
        if (betRoundRef.current != null && betRoundRef.current !== st.roundId) {
          setBetActive(false);
          betRoundRef.current = null;
        }
      }

      if (st.phase === "betting") {
        phaseRef.current = "betting";
        setPhase("betting");
        multRef.current = 1;
        setMult(1);
        progressRef.current = 0;
        explodeRef.current = 0;
        setCountdown(Math.max(1, Math.ceil(st.phaseRemaining / 1000)));
        return;
      }

      if (st.phase === "fly") {
        const crash = crashMapRef.current.get(st.roundId);
        if (crash == null) {
          phaseRef.current = "fly";
          setPhase("fly");
          return;
        }
        const m = multAt(st.phaseElapsed, crash);
        const p = flyProgress(st.phaseElapsed, crash);
        multRef.current = m;
        progressRef.current = p;
        setMult(m);
        if (m >= crash || p >= 0.999) {
          phaseRef.current = "result";
          setPhase("result");
          multRef.current = crash;
          setMult(crash);
          progressRef.current = 1;
          explodeRef.current = Math.min(1, explodeRef.current + 0.08);
          if (!settledRef.current.has(st.roundId)) {
            settledRef.current.add(st.roundId);
            pushHist({
              roundId: st.roundId,
              crash,
              hash: hashMapRef.current.get(st.roundId) || "",
              at: Date.now(),
              status: "Завершён",
            });
          }
        } else {
          phaseRef.current = "fly";
          setPhase("fly");
          explodeRef.current = 0;
        }
        return;
      }

      const crash = crashMapRef.current.get(st.roundId) ?? 1;
      phaseRef.current = "result";
      setPhase("result");
      multRef.current = crash;
      setMult(crash);
      progressRef.current = 1;
      explodeRef.current = Math.min(1, explodeRef.current + 0.05);
      if (!settledRef.current.has(st.roundId) && crashMapRef.current.has(st.roundId)) {
        settledRef.current.add(st.roundId);
        pushHist({
          roundId: st.roundId,
          crash,
          hash: hashMapRef.current.get(st.roundId) || "",
          at: Date.now(),
          status: "Завершён",
        });
      }
    };
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [ready, pushHist]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0c1222");
      g.addColorStop(1, "#1a0a2e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(56,189,248,0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = (h / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const ph = phaseRef.current;
      const p = progressRef.current;
      const exp = explodeRef.current;
      const x0 = 28;
      const y0 = h - 28;
      const x1 = w - 36;
      const y1 = 28;

      if (ph === "betting") {
        drawRocket(ctx, x0, y0, 0, false);
        ctx.fillStyle = "#64748b";
        ctx.font = "12px system-ui";
        ctx.fillText("Ожидание…", w / 2 - 30, 24);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = ph === "result" ? "rgba(248,113,113,0.5)" : "rgba(74,222,128,0.55)";
        ctx.lineWidth = 2.5;
        ctx.moveTo(x0, y0);
        const steps = Math.max(2, Math.floor(40 * Math.min(1, p)));
        for (let i = 1; i <= steps; i++) {
          const t = i / 40;
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * (t * t);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        const t = Math.min(1, p);
        const rx = x0 + (x1 - x0) * t;
        const ry = y0 + (y1 - y0) * (t * t);
        const ang = Math.atan2((y1 - y0) * 2 * t, x1 - x0);
        if (ph === "result" || exp > 0) drawExplosion(ctx, rx, ry, exp);
        else drawRocket(ctx, rx, ry, ang, true);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  const placeBet = async () => {
    if (busy || phase !== "betting" || !telegramId || betActive) return;
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
        body: JSON.stringify({ telegramId, stake, cashoutAt, roundId }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Ошибка");
      else {
        setBetActive(true);
        betRoundRef.current = roundId;
        onBalanceChange();
        if (d.publicCrashPoint != null) {
          crashMapRef.current.set(Number(d.roundId ?? roundId), Number(d.publicCrashPoint));
        }
        if (d.hash) hashMapRef.current.set(Number(d.roundId ?? roundId), String(d.hash));
        setMsg(d.won ? `Выигрыш +${d.profit}` : "Ставка принята");
      }
    } catch {
      setMsg("Сеть");
    } finally {
      setBusy(false);
    }
  };

  const phaseColor = phase === "betting" ? "#38bdf8" : phase === "fly" ? "#4ade80" : "#f87171";
  const card: CSSProperties = {
    background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 16,
    padding: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!ready && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Синхронизация…</div>
      )}
      {ready && (
        <>
          <div style={{ ...card, textAlign: "center", paddingBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
              Раунд <b style={{ color: "#fbbf24" }}>#{roundId}</b>
              {betActive && <span style={{ marginLeft: 8, color: "#4ade80" }}>ставка</span>}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: phaseColor,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.05,
              }}
            >
              {phase === "betting" ? `${countdown}` : `${mult.toFixed(2)}x`}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              {phase === "betting" && "сек · приём ставок"}
              {phase === "fly" && "🚀 полёт"}
              {phase === "result" && "💥 краш"}
            </div>
            <canvas
              ref={canvasRef}
              width={360}
              height={180}
              style={{
                width: "100%",
                height: 160,
                borderRadius: 12,
                background: "#0c1222",
                display: "block",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 32 }}>
            {hist.length === 0 && (
              <span style={{ fontSize: 11, color: "#475569" }}>История появится после раундов</span>
            )}
            {hist.slice(0, 16).map((h) => (
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
              style={inp}
            />
            <div style={{ fontSize: 12, color: "#94a3b8", margin: "8px 0 6px" }}>Автокэшаут</div>
            <input
              type="number"
              min={1.01}
              step={0.1}
              value={cashoutAt}
              onChange={(e) => setCashoutAt(Math.max(1.01, Number(e.target.value) || 1.01))}
              style={{ ...inp, marginBottom: 12 }}
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
              {betActive
                ? "Ставка принята"
                : phase !== "betting"
                  ? "Ждите раунд"
                  : busy
                    ? "…"
                    : `Ставка ${stake} TON`}
            </button>
            {msg && (
              <div style={{ marginTop: 10, fontSize: 13, color: "#cbd5e1", textAlign: "center" }}>
                {msg}
              </div>
            )}
          </div>
        </>
      )}

      {detail && (
        <div
          role="presentation"
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div role="dialog" onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#f1f5f9", marginBottom: 12 }}>
              Раунд #{detail.roundId}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8 }}>
              <div>
                Статус: <b style={{ color: "#e2e8f0" }}>{detail.status || "Завершён"}</b>
              </div>
              <div>
                Коэффициент:{" "}
                <b style={{ color: detail.crash >= 2 ? "#4ade80" : "#f87171" }}>
                  {detail.crash.toFixed(2)}x
                </b>
              </div>
              <div>
                Hash ID:{" "}
                <b style={{ color: "#67e8f9", wordBreak: "break-all" }}>{detail.hash || "—"}</b>
              </div>
              <div>
                Время: <b style={{ color: "#e2e8f0" }}>{new Date(detail.at).toLocaleString()}</b>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              style={{
                marginTop: 14,
                width: "100%",
                padding: 11,
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

const inp: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#0f172a",
  color: "#f1f5f9",
  fontFamily: "inherit",
};

function drawRocket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  thrust: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(8, 10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(0, -2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(-14, 14);
  ctx.lineTo(-6, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(14, 14);
  ctx.lineTo(6, 12);
  ctx.fill();
  if (thrust) {
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(-5, 10);
    ctx.lineTo(0, 22 + Math.random() * 6);
    ctx.lineTo(5, 10);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(-3, 10);
    ctx.lineTo(0, 16 + Math.random() * 4);
    ctx.lineTo(3, 10);
    ctx.fill();
  }
  ctx.restore();
}

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const r = 8 + t * 28;
    ctx.fillStyle = i % 2 === 0 ? `rgba(251,191,36,${1 - t * 0.5})` : `rgba(239,68,68,${1 - t * 0.4})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 4 + (1 - t) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
  ctx.beginPath();
  ctx.arc(x, y, 6 + t * 10, 0, Math.PI * 2);
  ctx.fill();
}
