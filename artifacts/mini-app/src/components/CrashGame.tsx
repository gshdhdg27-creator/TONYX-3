import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5, 10];

/** Must match server games-crash.ts */
const ROUND_MS = 20_000;
const BETTING_MS = 10_000;
const FLY_MS = 7_500;

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

const HIST_KEY = "tonyx_crash_history_v1";
const HIST_MAX = 40;

type Hist = {
  mult: number;
  won: boolean;
  roundId: number;
  at: number;
  hash: string;
  stake?: number;
  cashoutAt?: number;
  profit?: number;
  mine?: boolean;
};

type Phase = "betting" | "fly" | "crash" | "win";

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
  } catch { return []; }
}
function saveHist(items: Hist[]) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(items.slice(0, HIST_MAX))); } catch { /* */ }
}
function roundHash(roundId: number): string {
  const h = (roundId * 2654435761) >>> 0;
  return ("00000000" + h.toString(16)).slice(-8);
}
function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return String(ts); }
}

function multAtTime(tSec: number, crash: number): number {
  const m = 1 + (Math.exp(tSec * 0.55) - 1) * 0.85;
  return Math.min(crash, Math.round(m * 100) / 100);
}

function crashTimeSec(crash: number): number {
  const target = Math.max(crash, 1.01);
  let t = 0;
  for (let i = 0; i < 240; i++) {
    if (multAtTime(t, 999) >= target) return t;
    t += 0.04;
  }
  return Math.min(FLY_MS / 1000 - 0.05, t);
}

/** Pure schedule from wall clock + offset (same for all clients) */
function snapFromClock(offsetMs: number, crashByRound: Map<number, number>): RoundSnap {
  const now = Date.now() + offsetMs;
  const roundId = Math.floor(now / ROUND_MS);
  const elapsed = now % ROUND_MS;
  const crashPoint = crashByRound.get(roundId) ?? null;

  if (elapsed < BETTING_MS) {
    return {
      roundId, phase: "betting",
      phaseElapsed: elapsed,
      phaseRemaining: BETTING_MS - elapsed,
      crashPoint: null,
      serverNow: now,
    };
  }
  if (elapsed < BETTING_MS + FLY_MS) {
    return {
      roundId, phase: "fly",
      phaseElapsed: elapsed - BETTING_MS,
      phaseRemaining: BETTING_MS + FLY_MS - elapsed,
      crashPoint,
      serverNow: now,
    };
  }
  return {
    roundId, phase: "result",
    phaseElapsed: elapsed - BETTING_MS - FLY_MS,
    phaseRemaining: ROUND_MS - elapsed,
    crashPoint,
    serverNow: now,
  };
}

function buildCurve(tSec: number, crash: number): { t: number; m: number }[] {
  const crashT = crashTimeSec(crash);
  const end = Math.min(tSec, crashT);
  const pts: { t: number; m: number }[] = [{ t: 0, m: 1 }];
  const steps = Math.max(2, Math.ceil(end / 0.05));
  for (let i = 1; i <= steps; i++) {
    const t = (end * i) / steps;
    pts.push({ t, m: multAtTime(t, crash) });
  }
  if (tSec >= crashT) {
    pts.push({ t: crashT, m: crash });
  }
  return pts;
}

function Row({ label, value, ok, mono }: { label: string; value: string; ok?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 800, textAlign: "right",
        color: ok === true ? "#4ade80" : ok === false ? "#f87171" : "#e2e8f0",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        wordBreak: "break-all",
      }}>{value}</span>
    </div>
  );
}

export default function CrashGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [stake, setStake] = useState(0.5);
  const [autoCashout, setAutoCashout] = useState(2);
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(10);
  const [mult, setMult] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<Hist[]>(() => loadHist());
  const [selected, setSelected] = useState<Hist | null>(null);
  const [betLocked, setBetLocked] = useState(false);
  const [lockedStake, setLockedStake] = useState(0);
  const [lockedCashout, setLockedCashout] = useState(2);
  const [roundId, setRoundId] = useState(0);
  const [settling, setSettling] = useState(false);
  const [ready, setReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ t: number; m: number }[]>([{ t: 0, m: 1 }]);
  const offsetRef = useRef(0);
  const crashMapRef = useRef<Map<number, number>>(new Map());
  const activeRoundRef = useRef<number>(-1);
  const settledRef = useRef<Set<number>>(new Set());
  const betRoundRef = useRef<number | null>(null);
  const betResultRef = useRef<any>(null);
  const wonRef = useRef(false);
  const readyRef = useRef(false);

  const draw = useCallback((current: number, crashed: boolean) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.floor(w * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    for (let i = 1; i < 5; i++) {
      const y = (h / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const maxT = Math.max(pts[pts.length - 1]!.t, 0.001);
    const maxM = Math.max(current, 2, ...pts.map((p) => p.m));
    const xOf = (t: number) => (t / maxT) * (w - 24) + 8;
    const yOf = (m: number) => h - 16 - ((m - 1) / (maxM - 1 || 1)) * (h - 32);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (crashed && !wonRef.current) {
      grad.addColorStop(0, "rgba(248,113,113,0.4)");
      grad.addColorStop(1, "rgba(248,113,113,0)");
    } else {
      grad.addColorStop(0, "rgba(74,222,128,0.4)");
      grad.addColorStop(1, "rgba(74,222,128,0)");
    }
    ctx.beginPath();
    ctx.moveTo(xOf(pts[0]!.t), h);
    for (const p of pts) ctx.lineTo(xOf(p.t), yOf(p.m));
    ctx.lineTo(xOf(pts[pts.length - 1]!.t), h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = crashed && !wonRef.current ? "#f87171" : "#4ade80";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14;
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(p.t), yOf(p.m)) : ctx.lineTo(xOf(p.t), yOf(p.m))));
    ctx.stroke();
    ctx.shadowBlur = 0;

    const last = pts[pts.length - 1]!;
    ctx.beginPath();
    ctx.arc(xOf(last.t), yOf(last.m), 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  /** Apply server state snapshot — join mid-round correctly */
  const applyServer = useCallback((d: any) => {
    if (typeof d.serverNow === "number") {
      offsetRef.current = d.serverNow - Date.now();
    }
    const rid = Number(d.roundId);
    if (Number.isFinite(rid) && d.crashPoint != null) {
      crashMapRef.current.set(rid, Number(d.crashPoint));
    }
    // also seed previous round crash if provided
    if (d.prevCrashPoint != null && Number.isFinite(d.prevRoundId)) {
      crashMapRef.current.set(Number(d.prevRoundId), Number(d.prevCrashPoint));
    }
  }, []);

  // Bootstrap + periodic sync
  useEffect(() => {
    let alive = true;
    const sync = async (isBoot = false) => {
      try {
        const r = await fetch("/api/mini/games/crash/state");
        const d = await r.json();
        if (!alive) return;
        applyServer(d);
        if (isBoot) {
          readyRef.current = true;
          setReady(true);
          // Jump straight into current phase — no replay
          const st = snapFromClock(offsetRef.current, crashMapRef.current);
          activeRoundRef.current = st.roundId;
          setRoundId(st.roundId);
          if (st.phase === "betting") {
            pointsRef.current = [{ t: 0, m: 1 }];
            setMult(1);
            setPhase("betting");
            setCountdown(Math.ceil(st.phaseRemaining / 1000));
            draw(1, false);
          } else {
            const crash = st.crashPoint ?? crashMapRef.current.get(st.roundId) ?? 1.5;
            const tSec = st.phase === "fly" ? st.phaseElapsed / 1000 : FLY_MS / 1000;
            const crashT = crashTimeSec(crash);
            const done = tSec >= crashT || st.phase === "result";
            pointsRef.current = buildCurve(done ? crashT + 0.01 : tSec, crash);
            setMult(done ? crash : multAtTime(tSec, crash));
            setPhase(done ? "crash" : "fly");
            wonRef.current = false;
            draw(done ? crash : multAtTime(tSec, crash), done);
          }
        }
      } catch { /* offline: still run on local clock after timeout */
        if (isBoot && alive) {
          readyRef.current = true;
          setReady(true);
        }
      }
    };
    void sync(true);
    const id = setInterval(() => void sync(false), 4000);
    return () => { alive = false; clearInterval(id); };
  }, [applyServer, draw]);

  // Main render loop — only after ready
  useEffect(() => {
    if (!ready) return;
    let raf = 0;

    const tick = () => {
      if (!readyRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const st = snapFromClock(offsetRef.current, crashMapRef.current);

      // Round changed → reset visual, never replay old settlement UI
      if (st.roundId !== activeRoundRef.current) {
        activeRoundRef.current = st.roundId;
        wonRef.current = false;
        pointsRef.current = [{ t: 0, m: 1 }];
        // clear bet if it belonged to previous round
        if (betRoundRef.current != null && betRoundRef.current !== st.roundId) {
          setBetLocked(false);
          setLockedStake(0);
          betRoundRef.current = null;
          betResultRef.current = null;
        }
        // fetch crash for new fly/result phase
        if (st.phase !== "betting") {
          void fetch("/api/mini/games/crash/state")
            .then((r) => r.json())
            .then((d) => applyServer(d))
            .catch(() => {});
        }
      }

      setRoundId(st.roundId);

      if (st.phase === "betting") {
        setPhase("betting");
        setCountdown(Math.max(0, Math.ceil(st.phaseRemaining / 1000)));
        setMult(1);
        if (pointsRef.current.length > 1) pointsRef.current = [{ t: 0, m: 1 }];
        draw(1, false);
      } else if (st.phase === "fly") {
        let crash = crashMapRef.current.get(st.roundId) ?? st.crashPoint;
        if (crash == null) {
          // still loading crash — mild hold at 1.00
          setPhase("fly");
          setMult(1);
          draw(1, false);
        } else {
          const tSec = st.phaseElapsed / 1000;
          const crashT = crashTimeSec(crash);
          const done = tSec >= crashT;
          pointsRef.current = buildCurve(done ? crashT + 0.01 : tSec, crash);
          const m = done ? crash : multAtTime(tSec, crash);
          setMult(m);
          setPhase(done ? (wonRef.current ? "win" : "crash") : "fly");
          draw(m, done);

          if (done) {
            // history once per round (visual only; bet already settled on server at place time)
            if (!settledRef.current.has(st.roundId)) {
              settledRef.current.add(st.roundId);
              const res = betResultRef.current;
              const entry: Hist = {
                mult: crash,
                won: false,
                roundId: st.roundId,
                at: Date.now(),
                hash: roundHash(st.roundId),
                mine: false,
              };
              if (res && !res.error && betRoundRef.current === st.roundId) {
                wonRef.current = !!res.won;
                entry.won = !!res.won;
                entry.mult = res.won ? Number(res.cashoutAt) : crash;
                entry.stake = Number(res.stake) || undefined;
                entry.cashoutAt = Number(res.cashoutAt) || undefined;
                entry.profit = Number(res.profit);
                entry.mine = true;
                if (res.won) {
                  hapticNotify("success");
                  flash(`+${Number(res.profit).toFixed(3)} TON · ${res.cashoutAt}x`);
                } else {
                  hapticNotify("error");
                  flash(`CRASH ${crash.toFixed(2)}x`);
                }
              }
              setHistory((h) => {
                const next = [entry, ...h.filter((x) => x.roundId !== entry.roundId)].slice(0, HIST_MAX);
                saveHist(next);
                return next;
              });
              setBetLocked(false);
              setLockedStake(0);
            }
          }
        }
      } else {
        // result pad — show final crash of THIS round only
        const crash = crashMapRef.current.get(st.roundId) ?? st.crashPoint ?? 1;
        const crashT = crashTimeSec(crash);
        pointsRef.current = buildCurve(crashT + 0.01, crash);
        setMult(crash);
        setPhase(wonRef.current ? "win" : "crash");
        draw(crash, true);

        if (!settledRef.current.has(st.roundId)) {
          settledRef.current.add(st.roundId);
          const entry: Hist = {
            mult: crash,
            won: false,
            roundId: st.roundId,
            at: Date.now(),
            hash: roundHash(st.roundId),
            mine: betRoundRef.current === st.roundId,
          };
          const res = betResultRef.current;
          if (res && !res.error && betRoundRef.current === st.roundId) {
            entry.won = !!res.won;
            entry.mult = res.won ? Number(res.cashoutAt) : crash;
            entry.stake = Number(res.stake) || undefined;
            entry.cashoutAt = Number(res.cashoutAt) || undefined;
            entry.profit = Number(res.profit);
            entry.mine = true;
            wonRef.current = !!res.won;
          }
          setHistory((h) => {
            const next = [entry, ...h.filter((x) => x.roundId !== entry.roundId)].slice(0, HIST_MAX);
            saveHist(next);
            return next;
          });
          setBetLocked(false);
          setLockedStake(0);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, draw, applyServer]);

  const placeBet = async () => {
    if (phase !== "betting" || betLocked || settling) return;
    if (!telegramId) return;
    if (stake > balance) { flash("Недостаточно TON"); return; }

    const st = snapFromClock(offsetRef.current, crashMapRef.current);
    if (st.phase !== "betting") { flash("Ставки закрыты"); return; }

    setSettling(true);
    try {
      const res = await fetch("/api/mini/games/crash/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          stake,
          cashoutAt: Math.max(1.01, Math.min(100, autoCashout)),
          roundId: st.roundId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Ошибка");
        return;
      }
      betResultRef.current = d;
      betRoundRef.current = st.roundId;
      // store public crash for this round (same for everyone)
      if (d.publicCrashPoint != null) {
        crashMapRef.current.set(st.roundId, Number(d.publicCrashPoint));
      }
      setBetLocked(true);
      setLockedStake(stake);
      setLockedCashout(Number(d.cashoutAt));
      haptic("medium");
      flash(`Ставка ${stake.toFixed(2)} TON · авто ${d.cashoutAt}x`);
      onBalanceChange();
    } catch {
      flash("Сеть недоступна");
    } finally {
      setSettling(false);
    }
  };

  const multColor =
    phase === "crash" ? "#f87171"
      : phase === "win" ? "#4ade80"
        : phase === "fly" ? "#fbbf24"
          : "#e2e8f0";

  const canBet = phase === "betting" && !betLocked && !settling && stake <= balance && ready;

  if (!ready) {
    return (
      <div style={{ ...root, padding: 40, textAlign: "center", color: "#64748b", fontWeight: 700 }}>
        Синхронизация раунда…
      </div>
    );
  }

  return (
    <div style={root}>
      <style>{`
        @keyframes crashPulse { 0%,100%{text-shadow:0 0 18px currentColor} 50%{text-shadow:0 0 42px currentColor,0 0 80px currentColor} }
        @keyframes crashShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .cm.fly{animation:crashPulse .75s ease-in-out infinite}
        .cm.crash{animation:crashShake .45s ease-in-out;color:#f87171!important}
        .cm.win{color:#4ade80!important;animation:crashPulse 1s ease-in-out infinite}
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={histRow}>
        {history.length === 0 && <span style={{ color: "#475569", fontSize: 11 }}>история</span>}
        {history.map((h, i) => (
          <button
            key={`${h.roundId}-${i}`}
            type="button"
            onClick={() => setSelected(h)}
            style={{
              ...histChip,
              color: h.won ? "#86efac" : "#fca5a5",
              borderColor: h.won ? "rgba(74,222,128,0.45)" : "rgba(248,113,113,0.45)",
              background: h.won ? "rgba(22,163,74,0.18)" : "rgba(185,28,28,0.18)",
              boxShadow: h.mine ? "0 0 0 1px rgba(251,191,36,0.45)" : undefined,
            }}
          >
            {h.mult.toFixed(2)}x
          </button>
        ))}
      </div>

      {selected && (
        <div style={modalBackdrop} onClick={() => setSelected(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Раунд #{selected.roundId}</div>
              <button type="button" onClick={() => setSelected(null)} style={modalClose}>✕</button>
            </div>
            <div style={{
              fontSize: 28, fontWeight: 900, marginBottom: 14,
              color: selected.won ? "#4ade80" : "#f87171",
            }}>
              {selected.mult.toFixed(2)}x
            </div>
            <Row label="Статус" value={selected.won ? "Выигрыш" : "Crash"} ok={selected.won} />
            <Row label="Время" value={fmtTime(selected.at)} />
            <Row label="Номер раунда" value={String(selected.roundId)} />
            <Row label="Hash ID" value={selected.hash} mono />
            {selected.mine && (
              <>
                <Row label="Ваша ставка" value={selected.stake != null ? `${selected.stake} TON` : "—"} />
                <Row label="Авто-кэшаут" value={selected.cashoutAt != null ? `${selected.cashoutAt}x` : "—"} />
                <Row
                  label="Профит"
                  value={selected.profit != null ? `${selected.profit >= 0 ? "+" : ""}${selected.profit.toFixed(3)} TON` : "—"}
                  ok={selected.profit != null && selected.profit >= 0}
                />
              </>
            )}
            {!selected.mine && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Вы не ставили в этом раунде</div>
            )}
          </div>
        </div>
      )}

      <div style={graphWrap}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        {phase === "betting" ? (
          <div style={bettingOverlay}>
            <div style={countdownBig}>{countdown}</div>
            <div style={bettingHint}>Ставки · раунд #{roundId}</div>
            {betLocked && (
              <div style={betPlaced}>
                ✓ {lockedStake.toFixed(2)} TON · авто {lockedCashout}x
              </div>
            )}
          </div>
        ) : (
          <div className={`cm ${phase === "win" ? "win" : phase === "crash" ? "crash" : "fly"}`} style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", fontSize: 54, fontWeight: 900, letterSpacing: "-0.04em",
            color: multColor, fontVariantNumeric: "tabular-nums",
          }}>{mult.toFixed(2)}x</div>
        )}
        {phase === "crash" && !wonRef.current && <div style={crashBanner}>CRASHED</div>}
        {phase === "win" && <div style={{ ...crashBanner, color: "#4ade80" }}>CASH OUT</div>}
      </div>

      <div style={panel}>
        <div style={field}>
          <span style={lab}>Ставка</span>
          <input type="number" min={MIN_BET} step="0.1" value={stake}
            disabled={phase !== "betting" || betLocked}
            onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))}
            style={inp} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button key={p} type="button" disabled={phase !== "betting" || betLocked}
                onClick={() => setStake(p)} style={chip}>{p}</button>
            ))}
          </div>
        </div>
        <div style={field}>
          <span style={lab}>Авто-кэшаут</span>
          <input type="number" min={1.01} max={100} step="0.1" value={autoCashout}
            disabled={phase !== "betting" || betLocked}
            onChange={(e) => setAutoCashout(Math.max(1.01, Number(e.target.value) || 2))}
            style={inp} />
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Баланс <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
          {" · "}Потенциал <b style={{ color: "#4ade80" }}>{(stake * autoCashout).toFixed(3)} TON</b>
        </div>
        <button type="button" disabled={!canBet} onClick={placeBet} style={{
          ...btn,
          opacity: canBet ? 1 : 0.55,
          background: betLocked
            ? "linear-gradient(135deg,#1d4ed8,#38bdf8)"
            : phase === "betting"
              ? "linear-gradient(135deg,#16a34a,#4ade80)"
              : "linear-gradient(135deg,#334155,#475569)",
          color: betLocked ? "#fff" : phase === "betting" ? "#052e16" : "#cbd5e1",
        }}>
          {settling ? "…"
            : betLocked ? "Ставка принята"
              : phase === "betting" ? `Поставить · ${countdown}s`
                : phase === "fly" ? "Полёт…"
                  : "Ждите раунд…"}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const histRow: CSSProperties = { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, minHeight: 28 };
const histChip: CSSProperties = {
  flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 8,
  border: "1px solid", cursor: "pointer", fontFamily: "inherit",
};
const graphWrap: CSSProperties = {
  position: "relative", height: 240, borderRadius: 20, overflow: "hidden", marginBottom: 14,
  background: "linear-gradient(180deg,#0c1222 0%,#06080f 100%)",
  border: "1px solid rgba(74,222,128,0.22)",
  boxShadow: "0 0 40px rgba(74,222,128,0.1), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const bettingOverlay: CSSProperties = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", pointerEvents: "none",
  background: "radial-gradient(ellipse at center, rgba(15,23,42,0.35), transparent 70%)",
};
const countdownBig: CSSProperties = {
  fontSize: 72, fontWeight: 900, color: "#fbbf24", lineHeight: 1,
  textShadow: "0 0 40px rgba(251,191,36,0.55)", fontVariantNumeric: "tabular-nums",
};
const bettingHint: CSSProperties = { marginTop: 8, fontSize: 13, fontWeight: 700, color: "#94a3b8" };
const betPlaced: CSSProperties = {
  marginTop: 12, padding: "8px 14px", borderRadius: 999, fontWeight: 800, fontSize: 13,
  background: "rgba(34,197,94,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#86efac",
};
const crashBanner: CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center",
  fontSize: 13, fontWeight: 900, letterSpacing: 5, color: "#f87171",
};
const panel: CSSProperties = { background: "rgba(15,23,42,0.8)", borderRadius: 18, padding: 14, border: "1px solid rgba(255,255,255,0.08)" };
const field: CSSProperties = { marginBottom: 12 };
const lab: CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 };
const inp: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)", color: "#cbd5e1", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const btn: CSSProperties = {
  width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
  fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(74,222,128,0.25)",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 13,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
};
const modalBackdrop: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modalCard: CSSProperties = {
  width: "100%", maxWidth: 340, borderRadius: 18, padding: 16,
  background: "linear-gradient(180deg, #1a1030 0%, #0c1222 100%)",
  border: "1px solid rgba(168,85,247,0.35)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
};
const modalClose: CSSProperties = {
  border: "none", background: "rgba(255,255,255,0.08)", color: "#94a3b8",
  width: 32, height: 32, borderRadius: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
