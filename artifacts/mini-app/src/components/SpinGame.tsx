import { useEffect, useRef, useState, useCallback } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import { haptic, hapticNotify } from "@/lib/telegram";

/* ═══════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════ */
interface SpinPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
}

interface SpinRound {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  players: SpinPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
  finishedAt: string | null;
  fair?: FairData;
}

interface LastWinner {
  telegramId: string;
  username: string | null;
  payout: number;
  totalPool: number;
  finishedAt: string | null;
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const SECTOR_COLORS = [
  "#7c3aed","#dc2626","#059669","#d97706","#0891b2",
  "#be185d","#1d4ed8","#b45309","#4338ca","#0f766e",
  "#7c2d12","#164e63","#3b0764","#14532d","#7f1d1d",
];
const COMMISSION = 0.20;
const MIN_STAKE = 0.1;
const QUICK_BETS = [0.5, 1, 5, 10];

/* ═══════════════════════════════════════════════════════════
   WEB AUDIO — no external files
═══════════════════════════════════════════════════════════ */
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
  return _ctx;
}

function soundRatchet(volume = 0.15) {
  try {
    const c = getCtx();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.012), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = Math.min(0.35, volume);
    src.connect(g); g.connect(c.destination); src.start();
  } catch { /* ignore */ }
}

function soundTick() {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.045);
  } catch { /* ignore */ }
}

function soundFanfare() {
  try {
    const c = getCtx();
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.frequency.value = freq; osc.type = "sine";
      const t = c.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      osc.start(t); osc.stop(t + 0.85);
    });
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function buildArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toR = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toR(startDeg));
  const y1 = cy + r * Math.sin(toR(startDeg));
  const x2 = cx + r * Math.cos(toR(endDeg));
  const y2 = cy + r * Math.sin(toR(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
}

function getSectorAt(angleDeg: number, players: SpinPlayer[]): number {
  if (players.length === 0) return -1;
  const total = players.reduce((s, p) => s + p.stake, 0);
  let acc = 0;
  for (let i = 0; i < players.length; i++) {
    acc += (players[i].stake / total) * 360;
    if (angleDeg < acc) return i;
  }
  return players.length - 1;
}

function fmtTimer(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════
   WHEEL SVG
═══════════════════════════════════════════════════════════ */
const WCX = 130; const WCY = 130; const WR = 118; const WIR = 40;

function WheelSVG({ players, rotateDeg, spinning }: {
  players: SpinPlayer[]; rotateDeg: number; spinning: boolean;
}) {
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  const isSolo = players.length === 1;

  if (players.length === 0) {
    return (
      <svg width="260" height="260" viewBox="0 0 260 260">
        <circle cx={WCX} cy={WCY} r={WR} fill="rgba(30,45,69,0.55)" stroke="rgba(99,102,241,0.3)" strokeWidth="1.5" />
        <circle cx={WCX} cy={WCY} r={WIR} fill="#0f172a" />
        <text x={WCX} y={WCY + 5} textAnchor="middle" fill="#475569" fontSize="11" fontFamily="Inter,sans-serif">Ждём игроков…</text>
      </svg>
    );
  }

  let angle = 0;
  const sectors = players.map((p, i) => {
    const frac = p.stake / total;
    const start = angle;
    const span = Math.max(frac * 360, 0.4);
    const end = start + span;
    angle = start + frac * 360;
    const mid = ((start + end) / 2 - 90) * Math.PI / 180;
    return {
      path: buildArc(WCX, WCY, WR, start, Math.min(end, start + 359.96)),
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      lx: WCX + WR * 0.6 * Math.cos(mid),
      ly: WCY + WR * 0.6 * Math.sin(mid),
      frac, p,
    };
  });

  return (
    <svg
      width="260" height="260" viewBox="0 0 260 260"
      style={{ display: "block", transform: `rotate(${rotateDeg}deg)`, transition: spinning ? "none" : "transform 0.15s ease" }}
    >
      {isSolo ? (
        <>
          <circle cx={WCX} cy={WCY} r={WR} fill={SECTOR_COLORS[0]} />
          <text x={WCX} y={WCY - 8} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="22" fontWeight="900" fontFamily="Inter,sans-serif">100%</text>
          <text x={WCX} y={WCY + 14} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11" fontFamily="Inter,sans-serif">
            {players[0].username ? `@${players[0].username}` : "Игрок"}
          </text>
        </>
      ) : (
        sectors.map((s, i) => (
          <g key={i}>
            <path d={s.path} fill={s.color} stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
            {s.frac > 0.06 && (
              <text x={s.lx} y={s.ly + 4} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif">
                {Math.round(s.frac * 100)}%
              </text>
            )}
          </g>
        ))
      )}
      {/* Hub */}
      <circle cx={WCX} cy={WCY} r={WIR + 3} fill="rgba(0,0,0,0.35)" />
      <circle cx={WCX} cy={WCY} r={WIR} fill="#0a0f1e" stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" />
      <text x={WCX} y={WCY + 5} textAnchor="middle" fill="#4ade80" fontSize="10" fontWeight="900" fontFamily="Inter,sans-serif">
        {players.length} / ∞
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN HOOK
═══════════════════════════════════════════════════════════ */
function useCountdown(startAt: string | null): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!startAt) { setSecs(null); return; }
    const update = () => setSecs(Math.max(0, Math.ceil((new Date(startAt).getTime() - Date.now()) / 1000)));
    update();
    const iv = setInterval(update, 500);
    return () => clearInterval(iv);
  }, [startAt]);
  return secs;
}

/* ═══════════════════════════════════════════════════════════
   JACKPOT WHEEL — named export used by games/index.tsx
═══════════════════════════════════════════════════════════ */
export function JackpotWheel({
  players,
  spinning,
  winnerId,
}: {
  players: SpinPlayer[];
  spinning: boolean;
  winnerId: string | null;
}) {
  const rafRef = useRef<number | null>(null);
  const [rotateDeg, setRotateDeg] = useState(0);
  const currentDegRef = useRef(0);

  useEffect(() => {
    if (spinning) {
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last;
        last = now;
        currentDegRef.current = (currentDegRef.current + dt * 0.36) % 360;
        setRotateDeg(currentDegRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (winnerId && players.length > 0) {
      const total = players.reduce((s, p) => s + p.stake, 0) || 1;
      let acc = 0;
      for (const p of players) {
        const span = (p.stake / total) * 360;
        if (p.telegramId === winnerId) {
          const midAngle = acc + span / 2;
          const target = (360 - midAngle + 5 * 360) % 360;
          setRotateDeg(target);
          currentDegRef.current = target;
          break;
        }
        acc += span;
      }
    }
    return undefined;
  }, [spinning, winnerId, players]);

  return <WheelSVG players={players} rotateDeg={rotateDeg} spinning={spinning} />;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
  onOpenHistory?: () => void;
}

export default function SpinGame({ telegramId, tonBalance, onBalanceChange, onOpenHistory }: Props) {
  const [round, setRound] = useState<SpinRound | null>(null);
  const [stake, setStake] = useState(1);
  const [busy, setBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [winnerBanner, setWinnerBanner] = useState<{ name: string; payout: number } | null>(null);
  const [showFairness, setShowFairness] = useState(false);
  const [lastWinner, setLastWinner] = useState<LastWinner | null>(null);
  const [biggestWinner, setBiggestWinner] = useState<LastWinner | null>(null);

  const rafRef = useRef<number | null>(null);
  const rotateDegRef = useRef(0);
  const lastSectorRef = useRef(-1);
  const seenFinishedId = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const flash = useCallback((msg: string, type: "ok" | "err" | "info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Fetch ── */
  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/spin/state");
      if (!r.ok) return;
      const data: SpinRound = await r.json();

      // Detect transition to finished to start spin
      if (
        data.status === "finished" && data.winnerId &&
        (prevStatusRef.current === "starting" || prevStatusRef.current === "waiting") &&
        data.id !== seenFinishedId.current
      ) {
        seenFinishedId.current = data.id;
        setRound(data);
        startSpin(data);
      } else {
        setRound(data);
      }
      prevStatusRef.current = data.status;
    } catch { /* ignore */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    // Load winner records
    Promise.all([
      fetch("/api/mini/games/spin/last-winner").then(r => r.json()).catch(() => null),
      fetch("/api/mini/games/spin/biggest-winner").then(r => r.json()).catch(() => null),
    ]).then(([lw, bw]) => {
      if (lw?.winner) setLastWinner(lw.winner);
      if (bw?.winner) setBiggestWinner(bw.winner);
    });
    fetchState();
    const iv = setInterval(fetchState, 2000);
    return () => clearInterval(iv);
  }, [fetchState]);

  const countdown = useCountdown(round?.startAt ?? null);

  /* ── Tick sound ── */
  useEffect(() => {
    if (countdown !== null && countdown <= 5 && countdown > 0 && round?.status === "starting") soundTick();
  }, [countdown, round?.status]);

  /* ── rAF spin with sector-crossing ratchet ── */
  function startSpin(data: SpinRound) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setSpinning(true);

    const players = data.players;
    const total = players.reduce((s, p) => s + p.stake, 0) || 1;

    // Winner sector midpoint in wheel-space
    let winnerMid = 0;
    if (data.winnerId) {
      let acc = 0;
      for (const p of players) {
        const frac = p.stake / total;
        if (p.telegramId === data.winnerId) {
          winnerMid = (acc + frac / 2) * 360;
          break;
        }
        acc += frac;
      }
    }

    // Rotate wheel so winner sector aligns under top pointer
    const currentNorm = ((rotateDegRef.current % 360) + 360) % 360;
    const adjustment = ((360 - winnerMid - currentNorm) % 360 + 360) % 360;
    const targetAngle = rotateDegRef.current + 6 * 360 + adjustment;

    let speed = 35; // deg/frame — spec: 35° за кадр в фазе разгона
    const FAST_FRAMES = 150; // ~2.5 сек при 60fps (spec: первые 2.5с бешено)
    let frame = 0;
    lastSectorRef.current = -1;

    function animate() {
      frame++;

      // Deceleration: speed *= 0.96 per frame (spec requirement)
      if (frame > FAST_FRAMES) {
        speed *= 0.96;
        if (speed < 0.4) speed = 0.4;
      }

      rotateDegRef.current += speed;

      // Sector boundary crossing → ratchet click
      const pointerInWheel = ((- rotateDegRef.current % 360) + 360) % 360;
      const curSector = getSectorAt(pointerInWheel, players);
      if (curSector !== lastSectorRef.current && lastSectorRef.current !== -1) {
        const vol = Math.min(0.3, 0.04 + speed * 0.007);
        soundRatchet(vol);
      }
      lastSectorRef.current = curSector;

      // Stop condition
      const past = rotateDegRef.current >= targetAngle && frame > FAST_FRAMES;
      if (past && speed < 0.8) {
        rotateDegRef.current = targetAngle;
        setRotateDeg(targetAngle);
        finishSpin(data);
        return;
      }

      setRotateDeg(rotateDegRef.current);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
  }

  function finishSpin(data: SpinRound) {
    setSpinning(false);
    soundFanfare();
    const wp = data.players.find(p => p.telegramId === data.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (data.totalPool - ws) * (1 - COMMISSION)) * 1000) / 1000;
    const name = data.winnerUsername ?? data.winnerId ?? "?";
    setWinnerBanner({ name, payout });

    const isMe = data.winnerId === telegramId;
    hapticNotify(isMe ? "success" : "error");

    const lw: LastWinner = { telegramId: data.winnerId!, username: data.winnerUsername, payout, totalPool: data.totalPool, finishedAt: new Date().toISOString() };
    setLastWinner(lw);

    setTimeout(() => {
      setWinnerBanner(null);
      onBalanceChange();
      fetchState();
    }, 4200);
  }

  /* ── Join ── */
  const joinRound = async () => {
    if (stake < MIN_STAKE) { flash(`Мин. ${MIN_STAKE} TON`, "err"); return; }
    if (stake > tonBalance) { flash("Недостаточно TON", "err"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/spin/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setRound(d); onBalanceChange(); hapticNotify("success"); flash("✅ Ставка сделана!", "ok");
    } catch { flash("Сетевая ошибка", "err"); } finally { setBusy(false); }
  };

  /* ── Add stake (ВСЕГДА активна) ── */
  const addStake = async (amount: number) => {
    if (addBusy) return;
    if (amount > tonBalance) { flash("Недостаточно TON", "err"); return; }
    setAddBusy(true); haptic("medium");
    try {
      const r = await fetch("/api/mini/games/spin/increase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, additionalStake: amount }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setRound(d); onBalanceChange(); hapticNotify("success");
      flash(`+${amount} TON добавлено! 💪`, "ok");
    } catch { flash("Сетевая ошибка", "err"); } finally { setAddBusy(false); }
  };

  const players = round?.players ?? [];
  const isIn = players.some(p => p.telegramId === telegramId);
  const myP = players.find(p => p.telegramId === telegramId);
  const othersPool = players.filter(p => p.telegramId !== telegramId).reduce((s, p) => s + p.stake, 0);
  const myWinPayout = myP ? Math.round((myP.stake + othersPool * (1 - COMMISSION)) * 1000) / 1000 : 0;
  const isActive = round?.status === "waiting" || round?.status === "starting";

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div style={{ paddingBottom: 8, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spinWin  { 0%{opacity:0;transform:scale(0.7) translateY(16px)} 60%{transform:scale(1.08)} 100%{opacity:1;transform:scale(1)} }
        @keyframes spinPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.5)} 50%{box-shadow:0 0 0 8px rgba(99,102,241,0)} }
        @keyframes spinBlink{ 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          background: toast.type === "ok" ? "rgba(5,150,105,0.97)" : toast.type === "err" ? "rgba(220,38,38,0.97)" : "rgba(30,64,175,0.97)",
          color: "#fff", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 28px rgba(0,0,0,0.5)", maxWidth: "calc(100% - 32px)", textAlign: "center",
        }}>{toast.msg}</div>
      )}

      {/* WINNER BANNER */}
      {winnerBanner && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.16) 0%, #0b0f14 70%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          <div style={{ fontSize: 76, animation: "spinWin 0.6s cubic-bezier(0.2,0.8,0.3,1.1) both" }}>🎡</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 2, animation: "spinWin 0.6s 0.1s both" }}>ПОБЕДИТЕЛЬ!</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", animation: "spinWin 0.6s 0.2s both" }}>
            @{winnerBanner.name}
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#4ade80", animation: "spinWin 0.6s 0.3s both" }}>
            +{winnerBanner.payout} TON 💎
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4, animation: "spinBlink 1.2s 1s infinite" }}>
            Новый раунд начнётся автоматически…
          </div>
        </div>
      )}

      {/* TOP WINNERS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {lastWinner && (
          <div onClick={() => onOpenHistory?.()} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "8px 10px", minWidth: 0, cursor: "pointer" }}>
            <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: "0.08em", marginBottom: 2 }}>🟢 ПОСЛЕДНИЙ</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{lastWinner.username ?? lastWinner.telegramId.slice(-6)}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24" }}>+{lastWinner.payout} TON</div>
          </div>
        )}
        {biggestWinner && (
          <div onClick={() => onOpenHistory?.()} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "8px 10px", minWidth: 0, cursor: "pointer" }}>
            <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: "0.08em", marginBottom: 2 }}>🟡 РЕКОРД</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{biggestWinner.username ?? biggestWinner.telegramId.slice(-6)}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24" }}>+{biggestWinner.payout} TON</div>
          </div>
        )}
        <button onClick={() => setShowFairness(true)} style={{ flexShrink: 0, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: "8px 10px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 18 }}>🔐</span><span>Честность</span>
        </button>
        <button onClick={() => onOpenHistory?.()} style={{ flexShrink: 0, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: "8px 10px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 18 }}>📋</span><span>История</span>
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[
          { label: "БАНК",      val: `${(round?.totalPool ?? 0).toFixed(3)} TON`, col: "#fbbf24" },
          { label: "ИГРОКОВ",   val: String(players.length),                      col: "#22d3ee" },
          { label: "МОЙ ШАНС", val: myP ? `${myP.chance.toFixed(1)}%` : "—",     col: "#4ade80" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.2)", borderRadius: 11, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* COUNTDOWN */}
      {round?.status === "starting" && countdown !== null && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 2 }}>СПИН ЧЕРЕЗ</div>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums",
            color: countdown <= 5 ? "#f87171" : "#60a5fa",
            textShadow: countdown <= 5 ? "0 0 24px rgba(248,113,113,0.7)" : "0 0 20px rgba(96,165,250,0.5)",
          }}>{fmtTimer(countdown)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Ещё можно увеличить ставку! 🔥</div>
        </div>
      )}

      {round?.status === "waiting" && players.length < 2 && (
        <div style={{ textAlign: "center", fontSize: 12, color: "#475569", marginBottom: 8 }}>⏳ Нужно минимум 2 игрока для старта</div>
      )}

      {/* WHEEL */}
      <div style={{ position: "relative", width: 260, margin: "0 auto 12px" }}>
        <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
          <svg width="22" height="18"><polygon points="11,18 1,1 21,1" fill="white" opacity="0.9" /></svg>
        </div>
        <div style={{
          width: 260, height: 260, borderRadius: "50%",
          border: `3px solid ${spinning ? "#f59e0b" : "rgba(99,102,241,0.4)"}`,
          boxShadow: spinning ? "0 0 32px rgba(245,158,11,0.45)" : "0 0 18px rgba(99,102,241,0.15)",
          transition: "border-color 0.4s, box-shadow 0.4s",
          animation: spinning ? undefined : undefined,
        }}>
          <WheelSVG players={players} rotateDeg={rotateDeg} spinning={spinning} />
        </div>
      </div>

      {/* MY WIN ESTIMATE */}
      {isIn && myP && players.length >= 2 && !spinning && (
        <div style={{ background: "rgba(30,58,143,0.08)", border: "1px solid rgba(30,58,143,0.22)", borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>💡 Если победишь</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Твоя ставка: <span style={{ color: "#94a3b8" }}>{myP.stake} TON</span></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Чужие (−{COMMISSION*100}%): <span style={{ color: "#94a3b8" }}>{(othersPool * (1 - COMMISSION)).toFixed(3)} TON</span></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>+{myWinPayout} TON</div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────
          STAKE PANEL — КНОПКА ВСЕГДА АКТИВНА
      ────────────────────────────────────────────────────── */}
      {isActive && !spinning && (
        <div style={{ background: "rgba(15,23,42,0.95)", border: `1px solid ${isIn ? "rgba(16,185,129,0.3)" : "rgba(30,58,143,0.35)"}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
          {isIn ? (
            /* ADD-STAKE SECTION — всегда видна пока раунд активен */
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>⚡ Добавить к ставке</div>
                <div style={{ fontSize: 11, color: "#334155" }}>
                  Сейчас: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{myP?.stake.toFixed(3)} TON</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[0.5, 1, 2, 5].map(add => (
                  <button key={add}
                    onClick={() => void addStake(add)}
                    disabled={addBusy || add > tonBalance}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontFamily: "inherit",
                      background: add > tonBalance ? "rgba(30,45,69,0.4)" : "rgba(16,185,129,0.18)",
                      color: add > tonBalance ? "#334155" : "#4ade80",
                      fontSize: 13, fontWeight: 800, cursor: add > tonBalance ? "not-allowed" : "pointer",
                      transition: "all 0.1s",
                    }}>+{add}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#334155" }}>
                Баланс: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{tonBalance.toFixed(3)} TON</span>
                {addBusy && " · обработка…"}
              </div>
            </>
          ) : (
            /* JOIN SECTION */
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>🎡 Сделать ставку</div>
                <div style={{ fontSize: 12, color: "#334155" }}>Баланс: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{tonBalance.toFixed(3)} TON</span></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {QUICK_BETS.map(v => (
                  <button key={v} onClick={() => { haptic("light"); setStake(v); }} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit",
                    background: stake === v ? "linear-gradient(135deg,#d97706,#f59e0b)" : "rgba(30,45,69,0.8)",
                    color: stake === v ? "#fff" : "#64748b",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    boxShadow: stake === v ? "0 0 14px rgba(245,158,11,0.4)" : "none",
                    transition: "all 0.15s",
                  }}>{v}</button>
                ))}
              </div>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input value={stake}
                  onChange={e => setStake(Math.max(MIN_STAKE, parseFloat(e.target.value) || 0))}
                  type="number" step="0.1" placeholder="Своя сумма…"
                  style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 60px 10px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#475569", fontWeight: 700 }}>TON</span>
              </div>
              <div style={{ background: "rgba(30,58,143,0.07)", borderRadius: 8, padding: "7px 12px", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#475569" }}>💡 Комиссия 20% только с чужих монет. Своя ставка возвращается всегда.</div>
              </div>
              <button onClick={joinRound} disabled={busy || stake > tonBalance || stake < MIN_STAKE} style={{
                width: "100%", padding: "15px 0", borderRadius: 13, border: "none", fontFamily: "inherit",
                background: stake > tonBalance ? "rgba(30,45,69,0.5)" : "linear-gradient(135deg,#0e7490,#06b6d4)",
                color: stake > tonBalance ? "#334155" : "#fff",
                fontSize: 15, fontWeight: 800, cursor: stake > tonBalance ? "not-allowed" : "pointer",
                boxShadow: stake <= tonBalance ? "0 0 28px rgba(6,182,212,0.38)" : "none",
              }}>
                {busy ? "⏳…" : stake > tonBalance ? "Недостаточно TON" : `🎡 Поставить · ${stake} TON`}
              </button>
            </>
          )}
        </div>
      )}

      {/* PARTICIPANTS LIST */}
      {players.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", margin: "12px 0 7px" }}>
            УЧАСТНИКИ РАУНДА ({players.length})
          </div>
          {players.map((p, i) => {
            const isMe = p.telegramId === telegramId;
            const isWin = round?.status === "finished" && round.winnerId === p.telegramId;
            const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
            return (
              <div key={p.telegramId} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: isMe ? "rgba(99,102,241,0.06)" : "rgba(15,23,42,0.95)",
                border: `1px solid ${isWin ? "rgba(74,222,128,0.45)" : isMe ? "rgba(99,102,241,0.35)" : "rgba(30,58,143,0.18)"}`,
                borderRadius: 13, padding: "10px 12px", marginBottom: 6,
              }}>
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white", border: "2px solid rgba(255,255,255,0.14)" }}>
                  {(p.username ?? p.telegramId).slice(0, 1).toUpperCase()}
                </div>
                {/* Name + progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isWin ? "#4ade80" : isMe ? "#a5b4fc" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isWin && "🏆 "}{p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`}
                    {isMe && <span style={{ color: "#22d3ee" }}> · ты</span>}
                  </div>
                  {/* Chance bar */}
                  <div style={{ display: "flex", gap: 3, marginTop: 5, height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(30,45,69,0.6)" }}>
                    <div style={{ width: `${Math.max(p.chance, 0.5)}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                </div>
                {/* Stake + chance */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{p.stake.toFixed(3)}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{p.chance.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* FAIRNESS MODAL */}
      {showFairness && round?.fair && (
        <FairnessModal
          fair={round.fair}
          status={round.status}
          gameType="spin"
          gameId={round.id}
          onClose={() => setShowFairness(false)}
          onClientSeedChanged={(seed) => setRound(r => r ? { ...r, fair: { ...r.fair!, clientSeed: seed } } : r)}
        />
      )}
    </div>
  );
}
