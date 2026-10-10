import { useEffect, useRef, useState, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════ */
interface ArenaPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
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

type Phase = "lobby" | "spinning" | "winner";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const SECTOR_COLORS = [
  "#7c3aed", "#dc2626", "#059669", "#d97706", "#0891b2",
  "#be185d", "#1d4ed8", "#b45309", "#4338ca", "#0f766e",
];
const COMMISSION = 0.20;
const MIN_STAKE = 0.1;

/* ═══════════════════════════════════════════════════════════
   SOUND MANAGER  (Web Audio API — без внешних файлов)
═══════════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null;
function getACtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
  return _audioCtx;
}

function soundTick() {
  try {
    const c = getACtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.frequency.value = 1000;
    g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.055);
  } catch { /* ignore */ }
}

function soundClick(volume = 0.12) {
  try {
    const c = getACtx();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.018), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(c.destination); src.start();
  } catch { /* ignore */ }
}

function soundVictory() {
  try {
    const c = getACtx();
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.frequency.value = freq; osc.type = "sine";
      const t = c.currentTime + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t); osc.stop(t + 0.9);
    });
  } catch { /* ignore */ }
}

function initials(name: string | null, id: string): string {
  const n = (name ?? "").trim();
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  if (n.length === 1) return n.toUpperCase();
  return id.slice(-2).toUpperCase();
}

/** Portals-style square arena with colored sectors + player balls */
function Wheel({
  players, spinDeg, spinning, winnerId,
}: {
  players: ArenaPlayer[];
  spinDeg: number;
  spinning: boolean;
  winnerId?: string | null;
}) {
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  const SIZE = 300;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 2;

  let angle = -90; // start from top
  const sectors = players.map((p, i) => {
    const frac = p.stake / total;
    const start = angle;
    const span = Math.max(frac * 360, 0.4);
    const end = start + span;
    const midDeg = start + span / 2;
    const midRad = (midDeg * Math.PI) / 180;
    // ball sits closer to center for large sectors, further for small
    const ballR = 0.38 + Math.min(frac, 0.35) * 0.25;
    angle = end;
    return {
      start,
      end,
      midDeg,
      frac,
      p,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      bx: CX + R * ballR * Math.cos(midRad),
      by: CY + R * ballR * Math.sin(midRad),
      isWinner: winnerId != null && p.telegramId === winnerId,
    };
  });

  function sectorPath(startDeg: number, endDeg: number): string {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = CX + R * Math.cos(s);
    const y1 = CY + R * Math.sin(s);
    const x2 = CX + R * Math.cos(e);
    const y2 = CY + R * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}>
      {/* fixed board frame */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 22,
        background: "#12151c",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}>
        {/* rotating pie + balls */}
        <div style={{
          width: "100%", height: "100%",
          transform: `rotate(${spinDeg}deg)`,
          transition: spinning ? "none" : "transform 0.12s linear",
          willChange: "transform",
        }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
            <defs>
              <clipPath id="arenaClip">
                <rect x="0" y="0" width={SIZE} height={SIZE} rx="22" ry="22" />
              </clipPath>
            </defs>
            <g clipPath="url(#arenaClip)">
              {players.length === 0 ? (
                <rect width={SIZE} height={SIZE} fill="#1a2332" />
              ) : players.length === 1 ? (
                <rect width={SIZE} height={SIZE} fill={SECTOR_COLORS[0]} />
              ) : (
                sectors.map((s, i) => (
                  <path
                    key={i}
                    d={sectorPath(s.start, s.end)}
                    fill={s.color}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth="1"
                  />
                ))
              )}
            </g>
          </svg>

          {/* player balls (HTML overlay so text stays readable while rotating with pie) */}
          {players.length === 0 ? null : players.length === 1 ? (
            <div style={{
              position: "absolute", left: "50%", top: "50%",
              transform: "translate(-50%, -50%)",
              width: 88, height: 88, borderRadius: "50%",
              background: "linear-gradient(145deg,#93c5fd,#3b82f6)",
              border: "3px solid rgba(255,255,255,0.85)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 900, fontSize: 22,
            }}>
              {initials(players[0].username, players[0].telegramId)}
            </div>
          ) : (
            sectors.map((s, i) => {
              const ballSize = s.frac > 0.25 ? 56 : s.frac > 0.12 ? 48 : 40;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: s.bx,
                    top: s.by,
                    width: ballSize,
                    height: ballSize,
                    marginLeft: -ballSize / 2,
                    marginTop: -ballSize / 2,
                    borderRadius: "50%",
                    background: `linear-gradient(145deg, ${s.color}, ${s.color}cc)`,
                    border: s.isWinner ? "3px solid #fbbf24" : "3px solid rgba(255,255,255,0.9)",
                    boxShadow: s.isWinner
                      ? "0 0 28px rgba(251,191,36,0.85), 0 6px 16px rgba(0,0,0,0.4)"
                      : "0 6px 16px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: ballSize > 50 ? 16 : 13,
                    transform: s.isWinner ? "scale(1.12)" : "scale(1)",
                    transition: "transform 0.25s ease",
                    zIndex: s.isWinner ? 5 : 2,
                  }}
                >
                  {initials(s.p.username, s.p.telegramId)}
                </div>
              );
            })
          )}
        </div>

        {/* empty state text (not rotating) */}
        {players.length === 0 && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#5eead4", fontSize: 16, fontWeight: 600, letterSpacing: "0.02em",
            background: "radial-gradient(circle at 50% 50%, rgba(15,23,42,0.2), rgba(15,23,42,0.85))",
          }}>
            Waiting for players…
          </div>
        )}
      </div>

      {/* fixed crosshair pointer at top (like Portals) */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: -6,
        transform: "translateX(-50%)",
        zIndex: 10,
        pointerEvents: "none",
      }}>
        <div style={{
          width: 0, height: 0,
          borderLeft: "9px solid transparent",
          borderRight: "9px solid transparent",
          borderTop: "14px solid #f8fafc",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
        }} />
      </div>

      {/* spinning crosshair ring on board */}
      {spinning && (
        <div style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 36, height: 36,
          marginLeft: -18, marginTop: -18,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.55)",
          boxShadow: "0 0 12px rgba(255,255,255,0.25)",
          zIndex: 12,
          pointerEvents: "none",
        }}>
          <div style={{ position: "absolute", left: "50%", top: 2, width: 2, height: 8, marginLeft: -1, background: "rgba(255,255,255,0.7)" }} />
          <div style={{ position: "absolute", left: "50%", bottom: 2, width: 2, height: 8, marginLeft: -1, background: "rgba(255,255,255,0.7)" }} />
          <div style={{ position: "absolute", top: "50%", left: 2, width: 8, height: 2, marginTop: -1, background: "rgba(255,255,255,0.7)" }} />
          <div style={{ position: "absolute", top: "50%", right: 2, width: 8, height: 2, marginTop: -1, background: "rgba(255,255,255,0.7)" }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN HOOK
═══════════════════════════════════════════════════════════ */
function useCountdown(startAt: string | null): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!startAt) { setSecs(0); return; }
    const update = () => setSecs(Math.max(0, Math.ceil((new Date(startAt).getTime() - Date.now()) / 1000)));
    update();
    const iv = setInterval(update, 500);
    return () => clearInterval(iv);
  }, [startAt]);
  return secs;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
interface Props {
  telegramId?: string;
  tonBalance?: number;
  onBalanceChange?: () => void;
  onClose?: () => void;
  onOpenHistory?: () => void;
}

export default function ArenaGame({ telegramId, tonBalance = 0, onBalanceChange, onClose }: Props) {
  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [spinDeg, setSpinDeg] = useState(0);
  const [addAmt, setAddAmt] = useState("1");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [winnerData, setWinnerData] = useState<{ name: string; payout: number } | null>(null);

  const rafRef = useRef<number | null>(null);
  const spinDegRef = useRef(0);
  const seenFinishedId = useRef<number | null>(null);

  const flash = useCallback((msg: string, type: "ok" | "err" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── Fetch arena state ── */
  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const data: ArenaState = await r.json();
      setArena(data);
      if (data.status === "finished" && data.winnerId && data.id !== seenFinishedId.current) {
        seenFinishedId.current = data.id;
        startSpin(data);
      }
    } catch { /* network error — ignore */ }
  }, []); // eslint-disable-line

  /* ── Poll every 2s ── */
  useEffect(() => {
    fetchState();
    const iv = setInterval(fetchState, 2000);
    return () => clearInterval(iv);
  }, [fetchState]);

  const countdown = useCountdown(arena?.startAt ?? null);

  /* ── Tick sound on countdown ── */
  useEffect(() => {
    if (countdown > 0 && countdown <= 5 && arena?.status === "starting") soundTick();
  }, [countdown, arena?.status]);

  /* ── rAF Spin animation with easing ── */
  function startSpin(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("spinning");

    const players = data.players;
    const total = players.reduce((s, p) => s + p.stake, 0) || 1;

    // Find winner sector midpoint in wheel space (0–360°)
    let winnerMidDeg = 0;
    if (data.winnerId) {
      let acc = 0;
      for (const p of players) {
        const frac = p.stake / total;
        if (p.telegramId === data.winnerId) {
          winnerMidDeg = (acc + frac / 2) * 360;
          break;
        }
        acc += frac;
      }
    }

    // Rotate wheel so winner sector aligns with top pointer
    const currentNorm = ((spinDegRef.current % 360) + 360) % 360;
    const adjustment = ((360 - winnerMidDeg - currentNorm) % 360 + 360) % 360;
    const targetAngle = spinDegRef.current + 6 * 360 + adjustment;

    let speed = 28; // deg/frame at ~60fps ≈ 1680 deg/s
    const FAST_FRAMES = 180; // 3 seconds fast phase
    let frame = 0;
    let lastClickFrame = 0;

    function animate() {
      frame++;

      // Deceleration phase after FAST_FRAMES
      if (frame > FAST_FRAMES) {
        speed *= 0.955; // ← затухание по формуле из ТЗ
        if (speed < 0.5) speed = 0.5;
      }

      spinDegRef.current += speed;

      // Emit click sound — frequency falls with speed
      const clickEvery = Math.max(2, Math.round(4 * (28 / Math.max(speed, 1))));
      if (frame - lastClickFrame >= clickEvery) {
        soundClick(Math.min(0.18, speed * 0.006));
        lastClickFrame = frame;
      }

      // Stop condition: past target and slow
      const reachedTarget = spinDegRef.current >= targetAngle && frame > FAST_FRAMES;
      if (reachedTarget && speed < 1.0) {
        spinDegRef.current = targetAngle;
        setSpinDeg(targetAngle);
        showWinner(data);
        return;
      }

      setSpinDeg(spinDegRef.current);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
  }

  function showWinner(data: ArenaState) {
    setPhase("winner");
    soundVictory();
    const winner = data.players.find((p) => p.telegramId === data.winnerId);
    const ws = winner?.stake ?? 0;
    const payout = Math.round((ws + (data.totalPool - ws) * (1 - COMMISSION)) * 1000) / 1000;
    setWinnerData({ name: data.winnerUsername ?? data.winnerId ?? "?", payout });
    setTimeout(() => {
      setPhase("lobby");
      setWinnerData(null);
      fetchState();
    }, 4200);
  }

  /* ── Join room ── */
  const handleJoin = async () => {
    if (!telegramId) { flash("Откройте в Telegram", "err"); return; }
    const amount = parseFloat(addAmt);
    if (!amount || amount < MIN_STAKE) { flash(`Мин. ставка ${MIN_STAKE} TON`, "err"); return; }
    if (amount > tonBalance) { flash("Недостаточно TON", "err"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/arena/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake: amount }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d); flash("Вы в игре! 🎉", "ok"); onBalanceChange?.();
    } catch { flash("Сетевая ошибка", "err"); } finally { setBusy(false); }
  };

  /* ── Add to stake (кнопка ВСЕГДА видна пока активна комната) ── */
  const handleAdd = async () => {
    if (!telegramId) return;
    const amount = parseFloat(addAmt);
    if (!amount || amount <= 0) { flash("Введите сумму", "err"); return; }
    if (amount > tonBalance) { flash("Недостаточно TON", "err"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/arena/increase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, additionalStake: amount }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "err"); return; }
      setArena(d); flash(`+${amount} TON добавлено! 💪`, "ok"); onBalanceChange?.();
    } catch { flash("Сетевая ошибка", "err"); } finally { setBusy(false); }
  };

  const myEntry = arena?.players.find((p) => p.telegramId === telegramId);
  const canJoin = !myEntry && !!arena && arena.status !== "finished";
  // ★ Кнопка добавления ВСЕГДА видна, пока не начался финальный отсчёт < 3с
  const canAdd = !!myEntry && (arena?.status === "waiting" || arena?.status === "starting") && countdown > 3;
  const isActive = arena?.status === "waiting" || arena?.status === "starting";
  const totalPool = arena?.totalPool ?? 0;

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, #0b0f14 60%)",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif", color: "#f1f5f9",
      maxWidth: 480, margin: "0 auto",
    }}>
      <style>{`
        @keyframes arenaWinner  { 0%{opacity:0;transform:scale(0.7) translateY(20px)} 60%{transform:scale(1.08) translateY(-4px)} 100%{opacity:1;transform:scale(1)} }
        @keyframes arenaShimmer { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes arenaPulse   { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.5)} 50%{box-shadow:0 0 0 10px rgba(99,102,241,0)} }
        @keyframes arenaGlow    { 0%,100%{box-shadow:0 0 22px rgba(245,158,11,0.3)} 50%{box-shadow:0 0 44px rgba(245,158,11,0.6)} }
      `}</style>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "absolute", top: 12, left: 16, right: 16, zIndex: 999,
          background: toast.type === "ok" ? "rgba(5,150,105,0.95)" : toast.type === "err" ? "rgba(220,38,38,0.95)" : "rgba(30,64,175,0.95)",
          color: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", textAlign: "center",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── WINNER BANNER (4 секунды) ── */}
      {phase === "winner" && winnerData && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 300,
          background: "radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.16) 0%, #0b0f14 70%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
        }}>
          <div style={{ fontSize: 76, animation: "arenaWinner 0.6s cubic-bezier(0.2,0.8,0.3,1.1) both" }}>🏆</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 2, animation: "arenaWinner 0.6s 0.1s both" }}>ПОБЕДИТЕЛЬ!</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", animation: "arenaWinner 0.6s 0.2s both" }}>
            @{winnerData.name}
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#4ade80", animation: "arenaWinner 0.6s 0.3s both" }}>
            +{winnerData.payout} TON 💎
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 8, animation: "arenaShimmer 1.2s 1s infinite" }}>
            Новый раунд начнётся автоматически…
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "7px 13px", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ← Назад
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🎰 PvP Арена</div>
          <div style={{ fontSize: 11, color: "#475569" }}>Coinflip — Система билетов</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#475569" }}>Баланс</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa" }}>{tonBalance.toFixed(3)} TON</div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 24px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* STATUS ROW */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 14px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: arena?.status === "waiting" ? "#f59e0b" : arena?.status === "starting" ? "#22c55e" : "#6366f1",
              animation: isActive ? "arenaPulse 1.5s infinite" : undefined,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
              {arena?.status === "waiting" ? "Набор игроков" : arena?.status === "starting" ? "Старт через…" : phase === "spinning" ? "Крутим барабан…" : "Завершён"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", gap: 8, alignItems: "center" }}>
            {arena?.status === "starting" && countdown > 0 && (
              <span style={{ color: countdown <= 5 ? "#ef4444" : "#f1f5f9", fontWeight: 800, fontSize: 14 }}>
                ⏱ {countdown}с
              </span>
            )}
            <span>{arena?.players.length ?? 0} 👤</span>
          </div>
        </div>

        {/* POOL SIZE */}
        <div style={{
          textAlign: "center", padding: "10px 0",
          background: "rgba(255,255,255,0.02)", borderRadius: 14,
          border: `1px solid ${phase === "spinning" ? "rgba(245,158,11,0.4)" : "rgba(99,102,241,0.2)"}`,
          animation: phase === "spinning" ? "arenaGlow 0.8s infinite" : undefined,
        }}>
          <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Общий банк</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>
            {totalPool.toFixed(3)} <span style={{ fontSize: 15, color: "#60a5fa" }}>TON</span>
          </div>
          {totalPool > 0 && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              Победитель заберёт ~{(totalPool * (1 - COMMISSION)).toFixed(3)} TON
            </div>
          )}
        </div>

        {/* WHEEL */}
        <div style={{ position: "relative", width: 260, margin: "0 auto", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
            <svg width="22" height="18">
              <polygon points="11,18 1,1 21,1" fill="white" opacity="0.9" />
            </svg>
          </div>
          <div style={{
            width: 300, height: 300,
            filter: phase === "spinning"
              ? "drop-shadow(0 0 28px rgba(245,158,11,0.35))"
              : "drop-shadow(0 12px 28px rgba(0,0,0,0.45))",
            transition: "filter 0.4s",
          }}>
            <Wheel
              players={arena?.players ?? []}
              spinDeg={spinDeg}
              spinning={phase === "spinning"}
              winnerId={phase === "winner" ? arena?.winnerId : null}
            />
          </div>
        </div>

        {/* PLAYERS LIST */}
        {(arena?.players.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(arena?.players ?? []).map((p, i) => {
              const isMe = p.telegramId === telegramId;
              const isWinner = arena?.status === "finished" && arena.winnerId === p.telegramId;
              return (
                <div key={p.telegramId} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: isMe ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isWinner ? "#f59e0b" : isMe ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10, padding: "9px 12px",
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: SECTOR_COLORS[i % SECTOR_COLORS.length], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isMe ? "#a5b4fc" : "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isWinner && "🏆 "}{p.username ? `@${p.username}` : `Player #${p.telegramId.slice(-4)}`}{isMe && " (вы)"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa" }}>{p.stake.toFixed(3)} TON</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{p.chance.toFixed(1)}% шанс</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── STAKE PANEL ─── */}
        {/* Панель входа / доливки — ВСЕГДА показывается пока активна комната */}
        {(canJoin || canAdd) && (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${canAdd ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.25)"}`,
            borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              {canJoin ? "Ваша ставка (TON)" : "💰 Добавить к ставке — доступно всегда!"}
            </div>

            {/* Quick amounts */}
            <div style={{ display: "flex", gap: 5 }}>
              {[0.1, 0.5, 1, 5].map((v) => (
                <button key={v} onClick={() => setAddAmt(String(v))} style={{
                  flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontFamily: "inherit",
                  background: parseFloat(addAmt) === v ? "rgba(99,102,241,0.4)" : "rgba(30,45,69,0.8)",
                  color: parseFloat(addAmt) === v ? "#a5b4fc" : "#475569",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.1s",
                }}>
                  {v}
                </button>
              ))}
            </div>

            <input
              type="number" step="0.1" min={canJoin ? MIN_STAKE : 0.01}
              value={addAmt}
              onChange={(e) => setAddAmt(e.target.value)}
              style={{
                width: "100%", background: "rgba(30,45,69,0.6)",
                border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10,
                padding: "10px 14px", color: "#f1f5f9", fontFamily: "inherit",
                fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
              placeholder={`мин. ${canJoin ? MIN_STAKE : 0.01} TON`}
            />

            <button
              onClick={canJoin ? handleJoin : handleAdd}
              disabled={busy || !parseFloat(addAmt) || parseFloat(addAmt) > tonBalance}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none", fontFamily: "inherit",
                background: (busy || !parseFloat(addAmt) || parseFloat(addAmt) > tonBalance)
                  ? "rgba(99,102,241,0.12)"
                  : canJoin
                    ? "linear-gradient(135deg,#4338ca,#6366f1)"
                    : "linear-gradient(135deg,#059669,#10b981)",
                color: (busy || !parseFloat(addAmt) || parseFloat(addAmt) > tonBalance) ? "#334155" : "#fff",
                fontSize: 15, fontWeight: 800,
                cursor: (busy || !parseFloat(addAmt) || parseFloat(addAmt) > tonBalance) ? "not-allowed" : "pointer",
                boxShadow: !(busy || parseFloat(addAmt) > tonBalance) ? "0 0 24px rgba(99,102,241,0.3)" : "none",
                transition: "all 0.2s",
              }}
            >
              {busy ? "…" : canJoin ? "⚔️ Вступить в бой" : "➕ Добавить к ставке"}
            </button>

            {canAdd && myEntry && (
              <div style={{ fontSize: 11, color: "#334155", textAlign: "center" }}>
                Ваша текущая ставка: <strong style={{ color: "#60a5fa" }}>{myEntry.stake.toFixed(3)} TON</strong>
                {" · "}шанс: <strong style={{ color: "#4ade80" }}>{myEntry.chance.toFixed(1)}%</strong>
              </div>
            )}
          </div>
        )}

        {/* WAITING MESSAGE */}
        {!canJoin && !canAdd && isActive && !myEntry && (
          <div style={{ textAlign: "center", fontSize: 13, color: "#334155", padding: 8 }}>
            Ожидаем ещё игроков…
          </div>
        )}

        {/* Финальный отсчёт — ставки заблокированы */}
        {canAdd === false && myEntry && isActive && countdown <= 3 && countdown > 0 && (
          <div style={{
            textAlign: "center", padding: "10px", borderRadius: 10,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 13,
          }}>
            🔒 Приём ставок закрыт — финальный отсчёт
          </div>
        )}

        {/* PROVABLY FAIR */}
        {arena && (
          <div style={{ fontSize: 10, color: "#1e3a5f", textAlign: "center", paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            🔐 Provably Fair · Комиссия {COMMISSION * 100}% · Round #{arena.id}
          </div>
        )}
      </div>
    </div>
  );
}
