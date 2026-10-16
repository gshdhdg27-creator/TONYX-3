import { useState, useMemo, type CSSProperties } from "react";
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

function multSteps(safeOpened: number, mines: number, count = 6): number[] {
  const arr: number[] = [];
  for (let i = 0; i < count; i++) arr.push(nextStepMult(safeOpened + i, mines));
  return arr;
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

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const countSafe = (grid: Cell[][]) => grid.flat().filter((c) => c === "safe").length;

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
    () => multSteps(game?.safeCount ?? 0, game?.minesCount ?? mines, 6),
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
          <div style={subtitle}>Premium · 5×5</div>
        </div>
        <div style={balPill}>
          <span style={{ opacity: 0.65, fontSize: 11 }}>Баланс</span>
          <span style={{ fontWeight: 800, color: "#f8fafc" }}>{formatTon(balance)} TON</span>
        </div>
      </div>

      <div style={hero}>
        <div style={heroLabel}>
          {isPlaying ? "МНОЖИТЕЛЬ" : isOver ? (game!.status === "won" ? "ВЫИГРЫШ" : "ПРОИГРЫШ") : "СЛЕДУЮЩИЙ"}
        </div>
        <div
          style={{
            ...heroMult,
            color: isOver && game!.status === "lost" ? "#f87171" : isOver && game!.status === "won" ? "#4ade80" : "#fbbf24",
            textShadow:
              isOver && game!.status === "lost"
                ? "0 0 28px rgba(248,113,113,0.45)"
                : "0 0 32px rgba(251,191,36,0.4)",
          }}
        >
          {isOver && game!.status === "won" && game!.payout != null
            ? `+${formatTon(game!.payout)}`
            : isPlaying
              ? `×${(game!.multiplier || 1).toFixed(2)}`
              : `×${nextMult.toFixed(2)}`}
        </div>
        {isPlaying && (
          <div style={heroSub}>
            Прибыль{" "}
            <span style={{ color: profit >= 0 ? "#4ade80" : "#f87171", fontWeight: 800 }}>
              {profit >= 0 ? "+" : ""}
              {formatTon(profit)}
            </span>
            {" · "}💎 {gemsLeft}
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
                    isBoom ? "mn-boom" : "",
                    isFlip ? "mn-flip" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {cell === "safe" && <span className="mn-gem">💎</span>}
                  {cell === "mine" && <span className="mn-bomb">💣</span>}
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
            style={{
              ...ladderItem,
              background: i === 0 ? "rgba(251,191,36,0.14)" : "rgba(15,23,42,0.55)",
              borderColor: i === 0 ? "rgba(251,191,36,0.45)" : "rgba(148,163,184,0.08)",
              color: i === 0 ? "#fbbf24" : "#64748b",
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
                onClick={() => setMines(m)}
                style={{
                  ...pill,
                  background: mines === m ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(30,41,59,0.85)",
                  borderColor: mines === m ? "rgba(248,113,113,0.55)" : "rgba(148,163,184,0.12)",
                  color: mines === m ? "#fff" : "#94a3b8",
                  boxShadow: mines === m ? "0 0 18px rgba(220,38,38,0.35)" : "none",
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
                  background: bet === v ? "rgba(124,92,255,0.25)" : "rgba(30,41,59,0.85)",
                  borderColor: bet === v ? "rgba(167,139,250,0.5)" : "rgba(148,163,184,0.12)",
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
                flex: 1.2,
                background: "linear-gradient(135deg,#7c5cff,#a855f7)",
                borderColor: "transparent",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              Max
            </button>
          </div>

          <button type="button" disabled={busy} onClick={startGame} style={startBtn}>
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
          style={{
            ...resultCard,
            borderColor: game!.status === "won" ? "rgba(34,197,94,0.45)" : "rgba(248,113,113,0.4)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 900, color: game!.status === "won" ? "#4ade80" : "#f87171" }}>
            {game!.status === "won" ? t.wonCard(game!.payout ?? cashoutAmt) : t.lostCard(game!.stake)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {game!.status === "won" ? t.wonSub(game!.multiplier) : t.lostSub}
          </div>
          <button type="button" onClick={() => setGame(null)} style={{ ...startBtn, marginTop: 14, padding: "12px 0" }}>
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
  padding: "8px 0 28px",
  color: "#f1f5f9",
  fontFamily: "inherit",
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
  padding: "0 2px",
};

const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  background: "linear-gradient(90deg,#f8fafc,#c4b5fd)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const subtitle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
  marginTop: 2,
};

const balPill: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 12,
  padding: "8px 12px",
  fontSize: 13,
};

const hero: CSSProperties = {
  textAlign: "center",
  marginBottom: 14,
  padding: "12px 8px 4px",
};

const heroLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.14em",
  color: "#64748b",
};

const heroMult: CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  lineHeight: 1.1,
  marginTop: 4,
  fontVariantNumeric: "tabular-nums",
};

const heroSub: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  marginTop: 6,
  fontWeight: 600,
};

const gridWrap: CSSProperties = {
  padding: 10,
  borderRadius: 20,
  background: "linear-gradient(160deg, rgba(30,16,51,0.95), rgba(8,6,18,0.98))",
  border: "1px solid rgba(124,92,255,0.18)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
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
  paddingBottom: 4,
  marginBottom: 14,
};

const ladderItem: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 52,
  textAlign: "center",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid",
  fontSize: 11,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
};

const panel: CSSProperties = {
  background: "rgba(15,10,25,0.75)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 18,
  padding: 14,
};

const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#64748b",
  marginBottom: 8,
};

const pills: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const pill: CSSProperties = {
  minWidth: 40,
  padding: "10px 0",
  borderRadius: 12,
  border: "1px solid",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const metaRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 10,
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
};

const betRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 8,
};

const betAdj: CSSProperties = {
  width: 48,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.15)",
  background: "rgba(30,41,59,0.9)",
  color: "#e2e8f0",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};

const betInput: CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(124,92,255,0.3)",
  background: "rgba(8,6,18,0.95)",
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 800,
  textAlign: "center",
  outline: "none",
  fontFamily: "inherit",
};

const startBtn: CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "15px 0",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg,#7c5cff 0%,#a855f7 50%,#ec4899 100%)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(124,92,255,0.35)",
};

const liveStats: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
  marginBottom: 12,
};

const statBox: CSSProperties = {
  background: "rgba(30,41,59,0.7)",
  borderRadius: 12,
  padding: "10px 8px",
  textAlign: "center",
  border: "1px solid rgba(148,163,184,0.08)",
};

const statLab: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#64748b",
};

const statVal: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  marginTop: 4,
  color: "#f1f5f9",
};

const hint: CSSProperties = {
  textAlign: "center",
  padding: "14px 0",
  borderRadius: 14,
  background: "rgba(30,41,59,0.5)",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const resultCard: CSSProperties = {
  marginTop: 14,
  padding: 16,
  borderRadius: 16,
  background: "rgba(15,10,25,0.9)",
  border: "1px solid",
  textAlign: "center",
};

const CSS = `
  .mn-toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 9999; padding: 12px 18px; border-radius: 12px;
    font-size: 13px; font-weight: 700; color: #fff;
    box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    max-width: calc(100% - 32px);
  }
  .mn-toast-success { background: rgba(5,150,105,0.96); }
  .mn-toast-error { background: rgba(220,38,38,0.96); }
  .mn-toast-info { background: rgba(30,64,175,0.96); }

  .mn-cell {
    aspect-ratio: 1;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
    background: linear-gradient(160deg, #2a1f45 0%, #16102a 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.35);
  }
  .mn-hidden:active { transform: scale(0.94); }
  .mn-hidden:hover { box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px rgba(167,139,250,0.35), 0 6px 16px rgba(0,0,0,0.4); }
  .mn-safe {
    background: linear-gradient(160deg, #065f46 0%, #022c22 100%);
    box-shadow: inset 0 1px 0 rgba(74,222,128,0.25), 0 0 18px rgba(16,185,129,0.25);
  }
  .mn-mine {
    background: linear-gradient(160deg, #7f1d1d 0%, #450a0a 100%);
    box-shadow: inset 0 1px 0 rgba(248,113,113,0.25), 0 0 18px rgba(239,68,68,0.3);
  }
  .mn-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(148,163,184,0.25);
  }
  .mn-gem { font-size: 22px; filter: drop-shadow(0 2px 6px rgba(16,185,129,0.5)); }
  .mn-bomb { font-size: 22px; filter: drop-shadow(0 2px 6px rgba(239,68,68,0.5)); }
  .mn-flip { animation: mnFlip 0.45s cubic-bezier(0.34,1.4,0.64,1) both; }
  .mn-boom { animation: mnBoom 0.55s ease both; }
  @keyframes mnFlip {
    0% { transform: scale(0.6) rotateY(90deg); opacity: 0.3; }
    100% { transform: scale(1) rotateY(0); opacity: 1; }
  }
  @keyframes mnBoom {
    0% { transform: scale(1); }
    30% { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  .mn-cashout {
    width: 100%;
    padding: 15px 0;
    border-radius: 14px;
    border: none;
    font-family: inherit;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
    color: #1a0a00;
    background: linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b);
    background-size: 200% 100%;
    box-shadow: 0 0 28px rgba(245,158,11,0.45);
    animation: mnCash 2.2s ease infinite;
  }
  @keyframes mnCash {
    0%,100% { background-position: 0% 50%; box-shadow: 0 0 22px rgba(245,158,11,0.4); }
    50% { background-position: 100% 50%; box-shadow: 0 0 36px rgba(251,191,36,0.55); }
  }
`;

export { MinesGame };
