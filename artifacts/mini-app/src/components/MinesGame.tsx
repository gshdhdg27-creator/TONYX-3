/**
 * Premium Mines — Stake-style 5×5
 * Same API: /api/mini/games/mines/{start,reveal,cashout}
 */
import { useState, useMemo, useEffect, useRef, type CSSProperties } from "react";
import { haptic, hapticNotify } from "@/lib/telegram";
import { translations, type Lang } from "@/lib/i18n";

type Cell = "hidden" | "safe" | "mine";

interface MineGameState {
  id: number;
  stake: number;
  minesCount: number;
  revealed: Cell[][];
  multiplier: number;
  status: "active" | "won" | "lost";
  payout: number | null;
  safeCount: number;
}

const MINE_OPTIONS = [1, 3, 5, 10, 15, 24];
const BET_PRESETS = [0.1, 0.5, 1, 2, 5, 10];
const MIN_BET = 0.1;
const GRID = 5;

function formatTon(v: number): string {
  const x = Math.round(v * 1000) / 1000;
  return x % 1 === 0 ? x.toFixed(1) : String(x);
}

function nextStepMult(safeOpened: number, mines: number): number {
  const total = 25;
  const safe = total - mines;
  let m = 1;
  for (let i = 0; i < safeOpened; i++) m *= (total - i) / (safe - i);
  const rem = total - safeOpened;
  const safeRem = safe - safeOpened;
  if (safeRem <= 0 || rem <= 0) return Math.round(m * 0.97 * 100) / 100;
  return Math.round(m * (rem / safeRem) * 0.97 * 100) / 100;
}

function multSteps(safeOpened: number, mines: number, count = 7): number[] {
  const arr: number[] = [];
  for (let i = 0; i < count; i++) arr.push(nextStepMult(safeOpened + i, mines));
  return arr;
}

function GemIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.7))" }}>
      <path d="M12 2L15.5 8.5L22 9.5L17 14.5L18.5 21.5L12 18L5.5 21.5L7 14.5L2 9.5L8.5 8.5L12 2Z" fill="url(#gemG)" stroke="#6ee7b7" strokeWidth="0.6" />
      <defs>
        <linearGradient id="gemG" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6ee7b7" />
          <stop offset="0.5" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function BombIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 10px rgba(239,68,68,0.75))" }}>
      <circle cx="12" cy="13" r="7.5" fill="url(#bombG)" stroke="#7f1d1d" strokeWidth="0.8" />
      <path d="M12 5.5V3.5M14 4.5L15.5 3M10 4.5L8.5 3" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="11.5" r="1.4" fill="rgba(255,255,255,0.35)" />
      <defs>
        <linearGradient id="bombG" x1="12" y1="5" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f87171" />
          <stop offset="1" stopColor="#991b1b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function MinesGame({
  telegramId,
  balance,
  lang,
  onBalanceChange,
}: {
  telegramId: string;
  balance: number;
  lang: Lang;
  onBalanceChange: () => void;
}) {
  const t = translations[lang].games.mines;
  const [bet, setBet] = useState(1);
  const [mines, setMines] = useState(3);
  const [game, setGame] = useState<MineGameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [exploding, setExploding] = useState<string | null>(null);
  const [lastFlip, setLastFlip] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [displayMult, setDisplayMult] = useState(1);
  const multAnim = useRef<number | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const countSafe = (grid: Cell[][]) => grid.flat().filter((c) => c === "safe").length;

  useEffect(() => {
    const target = game?.status === "active" ? game.multiplier : nextStepMult(0, mines);
    if (multAnim.current) cancelAnimationFrame(multAnim.current);
    const start = displayMult;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) {
      setDisplayMult(target);
      return;
    }
    const t0 = performance.now();
    const dur = 280;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayMult(Math.round((start + diff * ease) * 100) / 100);
      if (p < 1) multAnim.current = requestAnimationFrame(tick);
    };
    multAnim.current = requestAnimationFrame(tick);
    return () => {
      if (multAnim.current) cancelAnimationFrame(multAnim.current);
    };
  }, [game?.multiplier, game?.status, mines]);

  const startGame = async () => {
    const stake = Math.max(MIN_BET, Math.round(bet * 1000) / 1000);
    if (stake > balance) {
      flash(t.errInsufficient, "error");
      return;
    }
    haptic("medium");
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/mines/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, minesCount: mines }),
      });
      const d = await r.json();
      if (!r.ok) {
        flash(d.error ?? t.errNetwork, "error");
        return;
      }
      setGame({
        id: d.id,
        stake: d.stake,
        minesCount: d.minesCount,
        revealed: d.revealed,
        multiplier: d.multiplier,
        status: d.status,
        payout: null,
        safeCount: 0,
      });
      setLastFlip(null);
      setDisplayMult(1);
      onBalanceChange();
    } catch {
      flash(t.errNetwork, "error");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (row: number, col: number) => {
    if (!game || game.status !== "active" || game.revealed[row][col] !== "hidden") return;
    haptic("light");
    try {
      const r = await fetch("/api/mini/games/mines/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, telegramId, row, col }),
      });
      const d = await r.json();
      if (!r.ok) {
        flash(d.error ?? t.errNetwork, "error");
        return;
      }
      const sc = countSafe(d.game.revealed);
      setLastFlip(`${row}-${col}`);
      setGame({
        ...game,
        revealed: d.game.revealed,
        multiplier: d.multiplier,
        status: d.game.status,
        payout: d.payout,
        safeCount: sc,
      });
      if (d.hit) {
        setExploding(`${row}-${col}`);
        setTimeout(() => setExploding(null), 900);
        hapticNotify("error");
        flash(t.lost(game.stake), "error");
        onBalanceChange();
      } else {
        haptic("light");
      }
    } catch {
      flash(t.errNetwork, "error");
    }
  };

  const cashout = async () => {
    if (!game || game.status !== "active") return;
    haptic("heavy");
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/mines/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, telegramId }),
      });
      const d = await r.json();
      if (!r.ok) {
        flash(d.error ?? t.errNetwork, "error");
        return;
      }
      hapticNotify("success");
      flash(t.won(d.payout, d.multiplier), "success");
      setGame((prev) => (prev ? { ...prev, status: "won", payout: d.payout, multiplier: d.multiplier } : null));
      onBalanceChange();
    } catch {
      flash(t.errNetwork, "error");
    } finally {
      setBusy(false);
    }
  };

  const isPlaying = game?.status === "active";
  const isOver = game && game.status !== "active";
  const steps = useMemo(
    () => multSteps(game?.safeCount ?? 0, game?.minesCount ?? mines, 7),
    [game?.safeCount, game?.minesCount, mines],
  );
  const nextMult = nextStepMult(game?.safeCount ?? 0, game?.minesCount ?? mines);
  const cashoutAmt = game ? Math.round(game.stake * game.multiplier * 1000) / 1000 : 0;
  const profit = game ? Math.round((cashoutAmt - game.stake) * 1000) / 1000 : 0;
  const gemsLeft = 25 - (game?.minesCount ?? mines) - (game?.safeCount ?? 0);

  return (
    <div style={root}>
      <style>{CSS}</style>

      {toast && <div className={`mn-toast mn-toast-${toast.type}`}>{toast.msg}</div>}

      <div style={header}>
        <div>
          <div style={title}>Mines</div>
          <div style={subtitle}>Stake style · 5×5</div>
        </div>
        <div style={balPill}>
          <span style={{ opacity: 0.55, fontSize: 10, letterSpacing: "0.06em" }}>БАЛАНС</span>
          <span style={{ fontWeight: 800, color: "#f8fafc", fontVariantNumeric: "tabular-nums" }}>
            {formatTon(balance)} <span style={{ color: "#94a3b8", fontWeight: 600 }}>TON</span>
          </span>
        </div>
      </div>

      <div style={hero}>
        <div style={heroLabel}>
          {isPlaying ? "ТЕКУЩИЙ" : isOver ? (game!.status === "won" ? "ВЫИГРЫШ" : "ПРОИГРЫШ") : "СЛЕДУЮЩИЙ"}
        </div>
        <div
          className="mn-hero-mult"
          style={{
            color:
              isOver && game!.status === "lost"
                ? "#f87171"
                : isOver && game!.status === "won"
                  ? "#4ade80"
                  : "#fbbf24",
            textShadow:
              isOver && game!.status === "lost"
                ? "0 0 36px rgba(248,113,113,0.5)"
                : isOver && game!.status === "won"
                  ? "0 0 36px rgba(74,222,128,0.45)"
                  : "0 0 40px rgba(251,191,36,0.45)",
          }}
        >
          {isOver && game!.status === "won" && game!.payout != null
            ? `+${formatTon(game!.payout)}`
            : isPlaying
              ? `×${displayMult.toFixed(2)}`
              : `×${nextMult.toFixed(2)}`}
        </div>
        {isPlaying && (
          <div style={heroSub}>
            Прибыль{" "}
            <span style={{ color: profit >= 0 ? "#4ade80" : "#f87171", fontWeight: 800 }}>
              {profit >= 0 ? "+" : ""}
              {formatTon(profit)}
            </span>
            <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
            <span style={{ color: "#34d399" }}>💎 {gemsLeft}</span>
          </div>
        )}
      </div>

      <div style={gridWrap}>
        <div style={grid}>
          {Array.from({ length: GRID }).map((_, row) =>
            Array.from({ length: GRID }).map((_, col) => {
              const key = `${row}-${col}`;
              const cell: Cell = game?.revealed?.[row]?.[col] ?? "hidden";
              const isBoom = exploding === key;
              const isFlip = lastFlip === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!isPlaying || cell !== "hidden" || busy}
                  onClick={() => reveal(row, col)}
                  className={[
                    "mn-cell",
                    cell === "safe" ? "mn-safe" : "",
                    cell === "mine" ? "mn-mine" : "",
                    cell === "hidden" && isPlaying ? "mn-hidden" : "",
                    cell === "hidden" && !isPlaying ? "mn-idle" : "",
                    isBoom ? "mn-boom" : "",
                    isFlip ? "mn-flip" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {cell === "safe" && <GemIcon />}
                  {cell === "mine" && <BombIcon />}
                  {cell === "hidden" && <span className="mn-dot" />}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div style={ladder}>
        {steps.map((m, i) => (
          <div
            key={i}
            className={i === 0 ? "mn-ladder-active" : ""}
            style={{
              ...ladderItem,
              background: i === 0 ? "rgba(251,191,36,0.16)" : "rgba(15,23,42,0.5)",
              borderColor: i === 0 ? "rgba(251,191,36,0.5)" : "rgba(148,163,184,0.07)",
              color: i === 0 ? "#fbbf24" : "#64748b",
              boxShadow: i === 0 ? "0 0 14px rgba(251,191,36,0.2)" : "none",
            }}
          >
            ×{m.toFixed(2)}
          </div>
        ))}
      </div>

      {!isPlaying ? (
        <div style={panel}>
          <div style={sectionLabel}>{t.minesCount}</div>
          <div style={pills}>
            {MINE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMines(m);
                  haptic("light");
                }}
                style={{
                  ...pill,
                  background: mines === m ? "linear-gradient(135deg,#dc2626,#7f1d1d)" : "rgba(30,41,59,0.9)",
                  borderColor: mines === m ? "rgba(248,113,113,0.55)" : "rgba(148,163,184,0.1)",
                  color: mines === m ? "#fff" : "#94a3b8",
                  boxShadow: mines === m ? "0 0 20px rgba(220,38,38,0.4)" : "none",
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <div style={metaRow}>
            <span>💎 {25 - mines} кристаллов</span>
            <span>📈 старт ×{nextStepMult(0, mines).toFixed(2)}</span>
          </div>

          <div style={{ ...sectionLabel, marginTop: 16 }}>{t.stake}</div>
          <div style={betRow}>
            <button
              type="button"
              style={betAdj}
              onClick={() => setBet((b) => Math.max(MIN_BET, Math.round((b / 2) * 1000) / 1000))}
            >
              ½
            </button>
            <input
              value={bet}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                if (!Number.isNaN(v)) setBet(v);
                else if (e.target.value === "") setBet(0);
              }}
              style={betInput}
              inputMode="decimal"
            />
            <button
              type="button"
              style={betAdj}
              onClick={() => setBet((b) => Math.round(Math.min(balance, b * 2 || MIN_BET) * 1000) / 1000)}
            >
              2×
            </button>
          </div>
          <div style={pills}>
            {BET_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBet(v)}
                style={{
                  ...pill,
                  flex: 1,
                  background: bet === v ? "rgba(124,92,255,0.28)" : "rgba(30,41,59,0.9)",
                  borderColor: bet === v ? "rgba(167,139,250,0.55)" : "rgba(148,163,184,0.1)",
                  color: bet === v ? "#e9d5ff" : "#94a3b8",
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBet(Math.max(MIN_BET, Math.floor(balance * 1000) / 1000))}
              style={{
                ...pill,
                flex: 1.15,
                background: "linear-gradient(135deg,#7c5cff,#a855f7)",
                borderColor: "transparent",
                color: "#fff",
                fontWeight: 900,
                boxShadow: "0 0 16px rgba(124,92,255,0.35)",
              }}
            >
              Max
            </button>
          </div>

          <button type="button" disabled={busy || bet > balance || bet < MIN_BET} onClick={startGame} style={startBtn}>
            {busy ? t.busy : t.startGame}
          </button>
        </div>
      ) : (
        <div style={panel}>
          <div style={liveStats}>
            <div style={statBox}>
              <div style={statLab}>{t.stake}</div>
              <div style={statVal}>{formatTon(game!.stake)}</div>
            </div>
            <div style={statBox}>
              <div style={statLab}>{translations[lang].games.minesLabel}</div>
              <div style={{ ...statVal, color: "#f87171" }}>💣 {game!.minesCount}</div>
            </div>
            <div style={statBox}>
              <div style={statLab}>{translations[lang].games.multLabel}</div>
              <div style={{ ...statVal, color: "#fbbf24" }}>×{game!.multiplier.toFixed(2)}</div>
            </div>
          </div>

          {game!.safeCount > 0 ? (
            <button type="button" disabled={busy} onClick={cashout} className="mn-cashout">
              {t.cashout(cashoutAmt)}
            </button>
          ) : (
            <div style={hint}>{t.openCell}</div>
          )}
        </div>
      )}

      {isOver && (
        <div
          className="mn-result"
          style={{
            ...resultCard,
            borderColor: game!.status === "won" ? "rgba(34,197,94,0.5)" : "rgba(248,113,113,0.45)",
            boxShadow:
              game!.status === "won"
                ? "0 0 40px rgba(34,197,94,0.15)"
                : "0 0 40px rgba(248,113,113,0.12)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 6 }}>{game!.status === "won" ? "🎉" : "💥"}</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: game!.status === "won" ? "#4ade80" : "#f87171",
            }}
          >
            {game!.status === "won" ? t.wonCard(game!.payout ?? cashoutAmt) : t.lostCard(game!.stake)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {game!.status === "won" ? t.wonSub(game!.multiplier) : t.lostSub}
          </div>
          <button
            type="button"
            onClick={() => {
              setGame(null);
              haptic("light");
            }}
            style={{ ...startBtn, marginTop: 16, padding: "13px 0" }}
          >
            Ещё раз
          </button>
        </div>
      )}
    </div>
  );
}

const root: CSSProperties = {
  maxWidth: 420,
  margin: "0 auto",
  padding: "4px 0 32px",
  color: "#f1f5f9",
  fontFamily: "inherit",
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  padding: "0 2px",
};

const title: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  background: "linear-gradient(90deg,#f8fafc 0%,#c4b5fd 60%,#a78bfa 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const subtitle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
  marginTop: 2,
  letterSpacing: "0.02em",
};

const balPill: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 1,
  background: "rgba(15,23,42,0.92)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 14,
  padding: "8px 14px",
  fontSize: 14,
};

const hero: CSSProperties = {
  textAlign: "center",
  marginBottom: 12,
  padding: "10px 8px 2px",
};

const heroLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.16em",
  color: "#64748b",
};

const heroSub: CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  marginTop: 6,
  fontWeight: 600,
};

const gridWrap: CSSProperties = {
  padding: 12,
  borderRadius: 22,
  background: "linear-gradient(165deg, rgba(36,20,60,0.95) 0%, rgba(8,6,18,0.98) 100%)",
  border: "1px solid rgba(124,92,255,0.2)",
  boxShadow:
    "0 24px 56px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.3)",
  marginBottom: 12,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

const ladder: CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 6,
  marginBottom: 14,
  scrollbarWidth: "none",
};

const ladderItem: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 54,
  textAlign: "center",
  padding: "9px 11px",
  borderRadius: 11,
  border: "1px solid",
  fontSize: 12,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
  transition: "all 0.2s ease",
};

const panel: CSSProperties = {
  background: "rgba(12,8,22,0.8)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 20,
  padding: 16,
  backdropFilter: "blur(8px)",
};

const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.14em",
  color: "#64748b",
  marginBottom: 10,
};

const pills: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const pill: CSSProperties = {
  minWidth: 42,
  padding: "11px 0",
  borderRadius: 13,
  border: "1px solid",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s ease",
};

const metaRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 12,
  fontSize: 12,
  color: "#64748b",
  fontWeight: 600,
};

const betRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 10,
};

const betAdj: CSSProperties = {
  width: 50,
  borderRadius: 13,
  border: "1px solid rgba(148,163,184,0.15)",
  background: "rgba(30,41,59,0.95)",
  color: "#e2e8f0",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

const betInput: CSSProperties = {
  flex: 1,
  padding: "13px 14px",
  borderRadius: 13,
  border: "1px solid rgba(124,92,255,0.35)",
  background: "rgba(8,6,18,0.98)",
  color: "#f8fafc",
  fontSize: 17,
  fontWeight: 800,
  textAlign: "center",
  outline: "none",
  fontFamily: "inherit",
  fontVariantNumeric: "tabular-nums",
};

const startBtn: CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: "16px 0",
  borderRadius: 15,
  border: "none",
  background: "linear-gradient(135deg,#7c5cff 0%,#a855f7 45%,#ec4899 100%)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 10px 32px rgba(124,92,255,0.4)",
  letterSpacing: "0.02em",
};

const liveStats: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
  marginBottom: 14,
};

const statBox: CSSProperties = {
  background: "rgba(30,41,59,0.75)",
  borderRadius: 13,
  padding: "11px 8px",
  textAlign: "center",
  border: "1px solid rgba(148,163,184,0.08)",
};

const statLab: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#64748b",
};

const statVal: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginTop: 4,
  color: "#f1f5f9",
  fontVariantNumeric: "tabular-nums",
};

const hint: CSSProperties = {
  textAlign: "center",
  padding: "15px 0",
  borderRadius: 14,
  background: "rgba(30,41,59,0.45)",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const resultCard: CSSProperties = {
  marginTop: 16,
  padding: 20,
  borderRadius: 18,
  background: "rgba(12,8,22,0.95)",
  border: "1px solid",
  textAlign: "center",
};

const CSS = `
  .mn-toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 9999; padding: 12px 20px; border-radius: 14px;
    font-size: 13px; font-weight: 700; color: #fff;
    box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    max-width: calc(100% - 32px);
    animation: mnToastIn 0.3s ease;
  }
  @keyframes mnToastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .mn-toast-success { background: rgba(5,150,105,0.97); }
  .mn-toast-error { background: rgba(220,38,38,0.97); }
  .mn-toast-info { background: rgba(30,64,175,0.97); }

  .mn-hero-mult {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1.05;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
    transition: color 0.25s ease, text-shadow 0.25s ease;
  }

  .mn-cell {
    aspect-ratio: 1;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.2s ease, filter 0.2s;
    background: linear-gradient(155deg, #2e2348 0%, #1a1230 55%, #120e22 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.07),
      inset 0 -2px 0 rgba(0,0,0,0.25),
      0 5px 0 #0d0a18,
      0 8px 16px rgba(0,0,0,0.4);
  }
  .mn-hidden {
    transform: translateY(-3px);
  }
  .mn-hidden:active {
    transform: translateY(0) scale(0.96);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.04),
      0 2px 0 #0d0a18,
      0 4px 10px rgba(0,0,0,0.35);
  }
  .mn-hidden:hover {
    filter: brightness(1.12);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.1),
      0 5px 0 #0d0a18,
      0 0 0 1.5px rgba(167,139,250,0.4),
      0 10px 20px rgba(0,0,0,0.45);
  }
  .mn-idle {
    opacity: 0.55;
    transform: none;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.04),
      0 3px 0 #0d0a18,
      0 4px 10px rgba(0,0,0,0.3);
  }
  .mn-safe {
    background: linear-gradient(155deg, #047857 0%, #064e3b 50%, #022c22 100%);
    box-shadow:
      inset 0 1px 0 rgba(110,231,183,0.3),
      0 0 22px rgba(16,185,129,0.35),
      0 4px 12px rgba(0,0,0,0.3);
    transform: none;
  }
  .mn-mine {
    background: linear-gradient(155deg, #b91c1c 0%, #7f1d1d 50%, #450a0a 100%);
    box-shadow:
      inset 0 1px 0 rgba(252,165,165,0.25),
      0 0 24px rgba(239,68,68,0.4),
      0 4px 12px rgba(0,0,0,0.3);
    transform: none;
  }
  .mn-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(167,139,250,0.28);
    box-shadow: 0 0 6px rgba(167,139,250,0.15);
  }
  .mn-flip {
    animation: mnFlip 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both;
  }
  .mn-boom {
    animation: mnBoom 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }
  @keyframes mnFlip {
    0%   { transform: scale(0.55) rotateY(95deg); opacity: 0.2; filter: brightness(2); }
    55%  { transform: scale(1.08) rotateY(-8deg); opacity: 1; }
    100% { transform: scale(1) rotateY(0); opacity: 1; filter: brightness(1); }
  }
  @keyframes mnBoom {
    0%   { transform: scale(1); filter: brightness(1); }
    25%  { transform: scale(1.28); filter: brightness(2.2); }
    50%  { transform: scale(0.88); filter: brightness(1.4); }
    75%  { transform: scale(1.1); }
    100% { transform: scale(1); filter: brightness(1); }
  }

  .mn-cashout {
    width: 100%;
    padding: 16px 0;
    border-radius: 15px;
    border: none;
    font-family: inherit;
    font-size: 16px;
    font-weight: 900;
    cursor: pointer;
    color: #1a0a00;
    background: linear-gradient(110deg, #f59e0b 0%, #fbbf24 40%, #fcd34d 60%, #f59e0b 100%);
    background-size: 220% 100%;
    box-shadow: 0 0 32px rgba(245,158,11,0.5), 0 6px 0 #b45309;
    animation: mnCash 2s ease infinite;
    letter-spacing: 0.02em;
  }
  .mn-cashout:active {
    transform: translateY(3px);
    box-shadow: 0 0 24px rgba(245,158,11,0.4), 0 2px 0 #b45309;
  }
  @keyframes mnCash {
    0%,100% { background-position: 0% 50%; box-shadow: 0 0 28px rgba(245,158,11,0.45), 0 6px 0 #b45309; }
    50%     { background-position: 100% 50%; box-shadow: 0 0 42px rgba(251,191,36,0.6), 0 6px 0 #b45309; }
  }

  .mn-result {
    animation: mnResultIn 0.4s cubic-bezier(0.22,1.2,0.36,1) both;
  }
  @keyframes mnResultIn {
    from { opacity: 0; transform: scale(0.92) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .mn-ladder-active {
    animation: mnLadderPulse 1.8s ease infinite;
  }
  @keyframes mnLadderPulse {
    0%,100% { box-shadow: 0 0 12px rgba(251,191,36,0.2); }
    50%     { box-shadow: 0 0 20px rgba(251,191,36,0.4); }
  }
`;
