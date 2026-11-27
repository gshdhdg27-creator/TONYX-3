/**
 * Premium Mines — Stake-style 5×5
 * Resume on re-entry + abandon stuck games
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

const MINE_OPTIONS = [1, 3, 5, 7];
const BET_PRESETS = [0.1, 0.5, 1, 2, 5, 10];
const MIN_BET = 0.1;
const GRID = 5;
const LS_KEY = (tid: string) => `mines_active_${tid}`;

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

  const clearActiveLs = () => {
    try {
      if (telegramId) localStorage.removeItem(LS_KEY(telegramId));
    } catch {
      /* */
    }
  };

  const applyServerGame = (d: any) => {
    if (!d || !d.id) return;
    const revealed = d.revealed as Cell[][];
    const sc = typeof d.safeCount === "number" ? d.safeCount : countSafe(revealed ?? []);
    const status =
      d.status === "active" || d.status === "won" || d.status === "lost" ? d.status : "active";
    setGame({
      id: d.id,
      stake: Number(d.stake) || 0,
      minesCount: Number(d.minesCount) || 3,
      revealed: Array.isArray(revealed)
        ? revealed
        : Array.from({ length: 5 }, () => Array(5).fill("hidden" as Cell)),
      multiplier: Number(d.multiplier) || 1,
      status,
      payout: d.payout ?? null,
      safeCount: sc,
    });
    setLastFlip(null);
    setDisplayMult(Number(d.multiplier) || 1);
    try {
      if (status === "active" && telegramId) localStorage.setItem(LS_KEY(telegramId), String(d.id));
      else if (telegramId) localStorage.removeItem(LS_KEY(telegramId));
    } catch {
      /* */
    }
  };

  const abandonStuck = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/mines/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId }),
      });
      const d = await r.json().catch(() => ({}));
      clearActiveLs();
      setGame(null);
      onBalanceChange();
      if (r.ok) flash(d.refunded ? `Ставка ${d.refunded} демо-кредитов возвращена` : "Игра сброшена", "success");
      else flash(d.error ?? "Не удалось сбросить", "error");
    } catch {
      flash(t.errNetwork, "error");
    } finally {
      setBusy(false);
    }
  };

  // Resume on mount: /active then localStorage gameId
  useEffect(() => {
    if (!telegramId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/mini/games/mines/active?telegramId=${encodeURIComponent(telegramId)}`,
        );
        if (r.ok) {
          const d = await r.json();
          if (d?.game && d.game.status === "active" && !cancelled) {
            applyServerGame(d.game);
            return;
          }
        }
      } catch {
        /* */
      }
      try {
        const saved = localStorage.getItem(LS_KEY(telegramId));
        if (saved && !cancelled) {
          const r2 = await fetch(`/api/mini/games/mines/${saved}`);
          if (r2.ok) {
            const g = await r2.json();
            if (g?.status === "active" && !cancelled) {
              applyServerGame(g);
              return;
            }
          }
          localStorage.removeItem(LS_KEY(telegramId));
        }
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramId]);

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
    const stake = Math.max(MIN_BET, Math.round(Number(bet) * 1000) / 1000);
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
        // Old API still returns 400 — try resume then abandon
        if (String(d.error ?? "").toLowerCase().includes("active")) {
          try {
            const ar = await fetch(
              `/api/mini/games/mines/active?telegramId=${encodeURIComponent(telegramId)}`,
            );
            if (ar.ok) {
              const ad = await ar.json();
              if (ad?.game?.status === "active") {
                applyServerGame(ad.game);
                flash("Продолжаем текущую игру", "info");
                return;
              }
            }
          } catch {
            /* */
          }
          // Last resort: abandon stuck + user can press start again
          flash("Есть зависшая игра — нажми «Сбросить» ниже", "error");
          return;
        }
        flash(d.error ?? t.errNetwork, "error");
        return;
      }
      // New API returns game (new or resumed) with 200
      applyServerGame(d);
      if (!d.resumed) onBalanceChange();
      else flash("Продолжаем текущую игру", "info");
    } catch {
      flash(t.errNetwork, "error");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (row: number, col: number) => {
    if (!game || game.status !== "active" || game.revealed[row]?.[col] !== "hidden") return;
    haptic("light");
    setBusy(true);
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
        clearActiveLs();
        onBalanceChange();
      } else {
        try {
          localStorage.setItem(LS_KEY(telegramId), String(game.id));
        } catch {
          /* */
        }
        haptic("light");
      }
    } catch {
      flash(t.errNetwork, "error");
    } finally {
      setBusy(false);
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
      setGame((prev) =>
        prev ? { ...prev, status: "won", payout: d.payout, multiplier: d.multiplier } : null,
      );
      clearActiveLs();
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
    <div className={`mn-game ${isPlaying ? "mn-active" : "mn-setup"}`} style={root}>
      <style>{CSS}</style>

      {toast && <div className={`mn-toast mn-toast-${toast.type}`}>{toast.msg}</div>}

      <div className="mn-game-header" style={header}>
        <div>
          <div style={title}>Mines</div>
          <div style={subtitle}>TONYX ORIGINAL · 5×5</div>
        </div>
        <div style={balPill}>
          <span style={{ opacity: 0.55, fontSize: 10, letterSpacing: "0.06em" }}>БАЛАНС</span>
          <span style={{ fontWeight: 800, color: "#f8fafc", fontVariantNumeric: "tabular-nums" }}>
            {formatTon(balance)} <span style={{ color: "#94a3b8", fontWeight: 600 }}>ДЕМО-КРЕДИТЫ</span>
          </span>
        </div>
      </div>

      <div className="mn-game-hero" style={hero}>
        <div style={heroLabel}>
          {isPlaying
            ? "ТЕКУЩИЙ"
            : isOver
              ? game!.status === "won"
                ? "ВЫИГРЫШ"
                : "ПРОИГРЫШ"
              : "СЛЕДУЮЩИЙ"}
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

      <div className="mn-game-board" style={gridWrap}>
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

      <div className="mn-game-ladder" style={ladder}>
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
        <div className="mn-game-controls" style={panel}>
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
              onClick={() => {
                setBet((b) => {
                  const cur = Number(b) || 0;
                  const next = Math.round((cur / 2) * 1000) / 1000;
                  return next < MIN_BET ? MIN_BET : next;
                });
                haptic("light");
              }}
            >
              ½
            </button>
            <input
              value={bet === 0 ? "" : bet}
              onChange={(e) => {
                const raw = e.target.value.replace(",", ".").trim();
                if (raw === "" || raw === ".") {
                  setBet(0);
                  return;
                }
                const v = parseFloat(raw);
                if (!Number.isNaN(v) && v >= 0) setBet(Math.round(v * 1000) / 1000);
              }}
              style={betInput}
              inputMode="decimal"
            />
            <button
              type="button"
              style={betAdj}
              onClick={() => {
                setBet((b) => {
                  const cur = Number(b) || MIN_BET;
                  let next = Math.round(cur * 2 * 1000) / 1000;
                  if (balance > 0 && next > balance) next = Math.round(balance * 1000) / 1000;
                  return next < MIN_BET ? MIN_BET : next;
                });
                haptic("light");
              }}
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
                  background: bet === v ? "rgba(32,184,121,0.28)" : "rgba(30,41,59,0.9)",
                  borderColor: bet === v ? "rgba(52,211,153,0.55)" : "rgba(148,163,184,0.1)",
                  color: bet === v ? "#bbf7d0" : "#94a3b8",
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const max = Math.round(Math.max(0, balance) * 1000) / 1000;
                setBet(max >= MIN_BET ? max : MIN_BET);
                haptic("light");
              }}
              style={{
                ...pill,
                flex: 1.15,
                background: "linear-gradient(135deg,#20b879,#34d399)",
                borderColor: "transparent",
                color: "#fff",
                fontWeight: 900,
                boxShadow: "0 0 16px rgba(32,184,121,0.35)",
              }}
            >
              Max
            </button>
          </div>

          <button
            type="button"
            disabled={busy || Number(bet) < MIN_BET}
            onClick={startGame}
            style={{
              ...startBtn,
              opacity: busy || Number(bet) < MIN_BET ? 0.55 : 1,
              cursor: busy || Number(bet) < MIN_BET ? "not-allowed" : "pointer",
            }}
          >
            {busy ? t.busy : t.startGame}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={abandonStuck}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "11px 0",
              borderRadius: 12,
              border: "1px solid rgba(248,113,113,0.35)",
              background: "rgba(127,29,29,0.25)",
              color: "#fca5a5",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Сбросить зависшую игру (возврат ставки)
          </button>
        </div>
      ) : (
        <div className="mn-game-controls" style={panel}>
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
          className="mn-result mn-game-result"
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
              clearActiveLs();
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

const heroSub: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  marginTop: 6,
  fontWeight: 600,
};

const gridWrap: CSSProperties = {
  padding: 10,
  borderRadius: 20,
  background: "linear-gradient(160deg, rgba(21,36,29,0.95), rgba(8,15,12,0.98))",
  border: "1px solid rgba(32,184,121,0.18)",
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
  background: "rgba(12,22,17,0.75)",
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
  border: "1px solid rgba(32,184,121,0.3)",
  background: "rgba(8,15,12,0.95)",
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
  background: "linear-gradient(135deg,#20b879 0%,#34d399 50%,#9be7bd 100%)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(32,184,121,0.35)",
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
  background: "rgba(12,22,17,0.9)",
  border: "1px solid",
  textAlign: "center",
};

const CSS = `
  .mn-game{width:100%!important;max-width:1040px!important;margin:0 auto!important;padding:12px 0 32px!important;box-sizing:border-box;display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);grid-template-rows:auto auto auto auto;gap:14px 18px;align-items:start;color:#edf4f8}
  .mn-game-header{grid-column:1/-1;grid-row:1;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0!important;padding:0 2px 12px;border-bottom:1px solid #2a3c46;min-width:0}
  .mn-game-hero{grid-column:2;grid-row:2;margin:0!important;padding:12px 0 4px!important;text-align:center}
  .mn-game .mn-hero-mult{font-size:clamp(38px,5vw,58px);font-weight:900;letter-spacing:-.06em;line-height:1.05;font-variant-numeric:tabular-nums}
  .mn-game-board{grid-column:2;grid-row:3;position:relative;isolation:isolate;width:100%;min-width:0;box-sizing:border-box;margin:0!important;padding:clamp(12px,2vw,20px)!important;border-radius:18px!important;background:radial-gradient(ellipse at 50% 30%,#1b4933 0%,#102c1e 58%,#09170f 100%)!important;border:1px solid #80683b!important;box-shadow:0 18px 44px #0008,inset 0 1px #ffffff12!important;overflow:hidden}
  .mn-game-board:before{content:"";position:absolute;inset:8px;border:1px solid #d5b46a35;border-radius:12px;pointer-events:none}
  .mn-game-board>div{position:relative;z-index:1;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;width:100%;max-width:520px;margin:0 auto;gap:clamp(6px,1.2vw,10px)!important}
  .mn-game .mn-cell{width:100%;min-width:0;aspect-ratio:1;border:1px solid #66844b!important;border-radius:11px!important;background:linear-gradient(155deg,#326448,#1c432e 70%,#153524)!important;box-shadow:inset 0 2px #ffffff20,0 4px 0 #0a2115,0 8px 14px #0007!important;display:flex;align-items:center;justify-content:center;transition:transform .16s,filter .16s,box-shadow .16s;transform:translateY(-2px)}
  .mn-game .mn-cell.mn-hidden:not(:disabled):hover{filter:brightness(1.16);transform:translateY(-4px);box-shadow:inset 0 2px #ffffff30,0 6px 0 #0a2115,0 12px 18px #0009!important}
  .mn-game .mn-cell.mn-hidden:not(:disabled):active{transform:translateY(1px) scale(.97)!important}
  .mn-game .mn-cell.mn-safe{background:linear-gradient(145deg,#26a66c,#087443)!important;border-color:#8bca83!important;box-shadow:inset 0 2px #ffffff35,0 0 20px #31d58b44!important}
  .mn-game .mn-cell.mn-mine{background:linear-gradient(145deg,#c84c43,#72251e)!important;border-color:#e18b5c!important;box-shadow:inset 0 2px #ffffff30,0 0 22px #ff514d55!important}
  .mn-game .mn-cell:disabled{cursor:default}
  .mn-game .mn-dot{width:7px;height:7px;border-radius:50%;background:#b8d9c2;box-shadow:0 0 9px #b8d9c277}
  .mn-game .mn-cell.mn-flip{animation:mnPortReveal .4s cubic-bezier(.2,.8,.2,1) both}
  .mn-game .mn-cell.mn-boom{animation:mnPortBoom .6s ease both}
  @keyframes mnPortReveal{0%{transform:rotateY(90deg) scale(.82);filter:brightness(1.8)}70%{transform:rotateY(-7deg) scale(1.04)}100%{transform:rotateY(0) scale(1);filter:brightness(1)}}
  @keyframes mnPortBoom{0%{transform:scale(.8);filter:brightness(2.5)}45%{transform:scale(1.13);filter:brightness(1.4)}100%{transform:scale(1);filter:brightness(1)}}
  .mn-game-ladder{grid-column:2;grid-row:4;display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px!important;margin:0!important;padding:0 2px 4px;min-width:0}
  .mn-game-ladder>div{min-width:0!important;padding:9px 3px!important;border-radius:8px!important;text-align:center;font-size:11px;font-weight:850;font-variant-numeric:tabular-nums;background:#14231a!important;border:1px solid #57482b!important;color:#b8aa84!important}
  .mn-game-ladder>div:first-child,.mn-game-ladder>.mn-ladder-active{background:linear-gradient(145deg,#4b3b20,#2b2718)!important;border-color:#d4ad5e!important;color:#f5d98f!important;box-shadow:0 0 16px #d5a84b25!important}
  .mn-game-controls{grid-column:1;grid-row:2/span 3;width:100%;min-width:0;box-sizing:border-box;margin:0!important;padding:18px!important;border-radius:16px!important;background:linear-gradient(155deg,#1b2b20,#101b15)!important;border:1px solid #5e4c2d!important;box-shadow:0 14px 32px #0008,inset 0 1px #fff1!important}
  .mn-game-controls input{min-width:0;background:#09150f!important;border:1px solid #78623a!important;border-radius:9px!important;color:#fff6df!important}
  .mn-game-controls button{font-family:inherit;border-radius:9px!important;transition:filter .16s,transform .16s}
  .mn-game-controls button:not(:disabled):hover{filter:brightness(1.12)}
  .mn-game-controls button:not(:disabled):active{transform:translateY(1px)}
  .mn-game-controls button[style*="linear-gradient(135deg,#20b879"]{background:linear-gradient(180deg,#e5c574,#ae8134)!important;color:#241908!important;border:1px solid #f0d68f!important;box-shadow:0 4px 0 #6e5123!important}
  .mn-game-controls .mn-cashout{width:100%;min-height:48px;padding:13px!important;background:linear-gradient(180deg,#e6c879,#b78b3c)!important;color:#201707!important;border:1px solid #f1d995!important;border-radius:10px!important;box-shadow:0 4px 0 #745323,0 8px 18px #0006!important;font-size:14px;font-weight:900}
  .mn-game-result{grid-column:1/-1;grid-row:5;margin-top:0!important}
  .mn-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;color:#fff;box-shadow:0 10px 30px #0007;max-width:calc(100% - 32px)}
  .mn-toast-success{background:rgba(5,150,105,.96)}.mn-toast-error{background:rgba(220,38,38,.96)}.mn-toast-info{background:rgba(30,64,175,.96)}
  .mn-ladder-active{animation:mnLadderPulse 1.6s ease infinite}
  @keyframes mnLadderPulse{0%,100%{box-shadow:0 0 10px #d5a84b25}50%{box-shadow:0 0 18px #d5a84b55}}
  .mn-hero-mult{font-variant-numeric:tabular-nums}
  .mn-cashout{animation:mnCash 2.2s ease infinite}
  @keyframes mnCash{0%,100%{filter:brightness(1)}50%{filter:brightness(1.12)}}
  .mn-result{animation:mnResultIn .4s cubic-bezier(.34,1.4,.64,1) both}
  @keyframes mnResultIn{0%{transform:scale(.94);opacity:0}100%{transform:scale(1);opacity:1}}
  @container solo-game (max-width:720px){
    .mn-game{display:flex!important;flex-direction:column!important;width:100%!important;max-width:520px!important;margin:0 auto!important;padding:8px 8px 28px!important;gap:11px!important;align-items:stretch!important}
    .mn-game-header,.mn-game-hero,.mn-game-board,.mn-game-ladder,.mn-game-controls,.mn-game-result{order:initial!important;width:100%!important;min-width:0!important;max-width:none!important;box-sizing:border-box!important;margin:0!important}
    .mn-game-header{order:0!important;padding:0 2px 10px!important}
    .mn-game-hero{order:1!important;padding:3px 0!important}
    .mn-game .mn-hero-mult{font-size:clamp(38px,11vw,54px)!important}
    .mn-game-board{order:2!important;padding:clamp(9px,2.5vw,14px)!important}
    .mn-game-board>div{width:100%!important;max-width:480px!important;gap:clamp(5px,1.8vw,9px)!important}
    .mn-game .mn-cell{border-radius:clamp(7px,2.3vw,12px)!important;transform:none}
    .mn-game-ladder{order:3!important;gap:4px!important;overflow:hidden}
    .mn-game-ladder>div{padding:8px 1px!important;font-size:clamp(8px,2.5vw,11px)!important}
    .mn-game-controls{order:4!important;padding:clamp(12px,3vw,16px)!important}
    .mn-game-result{order:5!important}
  }
  @container solo-game (max-width:380px){
    .mn-game{padding-left:6px!important;padding-right:6px!important}
    .mn-game-board>div{gap:5px!important}
    .mn-game-controls{padding:11px!important}
    .mn-game .mn-cell{border-radius:7px!important}
  }
`;
