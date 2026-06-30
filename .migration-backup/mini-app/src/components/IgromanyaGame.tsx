import { useState, useEffect, useCallback } from "react";
import { haptic, hapticNotify } from "@/lib/telegram";

/* ─── Types ─── */
interface IgroGame {
  id: number;
  betTon: number;
  bombCount: number;
  cellsOpen: number;
  multiplier: number;
  nextMultiplier: number;
  safeCells: number;
  status: "active" | "won" | "lost";
  payout: number | null;
  revealed: boolean[][];
  board: boolean[][] | null;
}

const BOMB_OPTIONS = [1, 3, 5, 7] as const;
const BET_OPTIONS  = [0.1, 0.25, 0.5, 1, 2, 5];
const GRID         = 5;

function fmtTON(v: number) {
  return v % 1 === 0 ? v.toFixed(1) : v.toFixed(4).replace(/\.?0+$/, "");
}

function BombIcon({ size = 22 }: { size?: number }) {
  return <span style={{ fontSize: size }}>💣</span>;
}
function GemIcon({ size = 22 }: { size?: number }) {
  return <span style={{ fontSize: size }}>💎</span>;
}

/* ─── Cell component ─── */
function Cell({
  row, col, game, onReveal, disabled,
}: {
  row: number; col: number;
  game: IgroGame;
  onReveal: (r: number, c: number) => void;
  disabled: boolean;
}) {
  const isRevealed = game.revealed[row]?.[col] ?? false;
  const isBomb     = game.board ? game.board[row]?.[col] : false;
  const isActive   = game.status === "active";

  let bg    = "#161B22";
  let border = "1px solid #21262D";
  let content: React.ReactNode = null;
  let cursor = "pointer";

  if (isRevealed) {
    if (isBomb) {
      bg     = "rgba(239,68,68,0.2)";
      border = "1px solid rgba(239,68,68,0.5)";
      content = <BombIcon />;
    } else {
      bg     = "rgba(34,197,94,0.15)";
      border = "1px solid rgba(34,197,94,0.4)";
      content = <GemIcon />;
    }
    cursor = "default";
  } else if (!isActive || disabled) {
    cursor = "not-allowed";
    if (game.status !== "active" && game.board && game.board[row]?.[col]) {
      bg     = "rgba(239,68,68,0.08)";
      border = "1px solid rgba(239,68,68,0.25)";
      content = <span style={{ fontSize: 16, opacity: 0.5 }}>💣</span>;
    }
  }

  return (
    <div
      onClick={() => isActive && !isRevealed && !disabled && onReveal(row, col)}
      style={{
        width: "100%", aspectRatio: "1",
        background: bg, border, borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor,
        transition: "all 0.15s ease",
        boxShadow: isRevealed && !isBomb ? "0 0 10px rgba(34,197,94,0.3)" : "none",
        transform: isRevealed ? "scale(0.95)" : "scale(1)",
      }}
    >
      {content}
    </div>
  );
}

/* ─── Main component ─── */
export default function IgromanyaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
}: {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
}) {
  const [game, setGame]       = useState<IgroGame | null>(null);
  const [betTon, setBet]      = useState(0.25);
  const [betInput, setBetInput] = useState("0.25");
  const [bombCount, setBombs] = useState<1 | 3 | 5 | 7>(3);
  const [busy, setBusy]       = useState(false);
  const [toast, setToast]     = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── Load active game on mount ── */
  const loadActive = useCallback(async () => {
    try {
      const r = await fetch(`/api/mini/games/igro/active?telegramId=${encodeURIComponent(telegramId)}`);
      if (r.ok) {
        const d = await r.json();
        if (d.game) setGame(d.game);
      }
    } catch { /* offline */ }
  }, [telegramId]);

  useEffect(() => { loadActive(); }, [loadActive]);

  /* ── Start game ── */
  const startGame = async () => {
    if (betTon < 0.01) { flash("Минимальная ставка: 0.01 TON", "error"); return; }
    if (betTon > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/igro/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, betTon, bombCount }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); }
      else { setGame(d.game); onBalanceChange(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  /* ── Reveal cell ── */
  const revealCell = async (row: number, col: number) => {
    if (!game || game.status !== "active" || busy) return;
    setBusy(true); haptic("medium");
    try {
      const r = await fetch("/api/mini/games/igro/reveal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, row, col }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); }
      else {
        setGame(d.game);
        if (d.hit === "bomb") {
          hapticNotify("error");
          flash("💥 Бомба! Ставка сгорела", "error");
          onBalanceChange();
        } else if (d.autoWin) {
          hapticNotify("success");
          flash(`🏆 Все клетки открыты! +${fmtTON(d.game.payout)} TON`, "success");
          onBalanceChange();
        }
      }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  /* ── Cashout ── */
  const cashout = async () => {
    if (!game || game.status !== "active" || game.cellsOpen === 0 || busy) return;
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/igro/cashout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); }
      else {
        hapticNotify("success");
        setGame(d.game);
        flash(`✅ Выплата: ${fmtTON(d.payout)} TON`, "success");
        onBalanceChange();
      }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  /* ── New round ── */
  const newRound = () => { setGame(null); };

  const isActive  = game?.status === "active";
  const isOver    = game && game.status !== "active";

  return (
    <div style={{
      background: "#0B0F14", minHeight: "100%",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "0 0 24px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes pulse-glow { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes fadeIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "success" ? "rgba(22,163,74,0.95)" : toast.type === "error" ? "rgba(220,38,38,0.95)" : "rgba(30,64,175,0.95)",
          color: "#fff", padding: "12px 20px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "88vw",
          boxShadow: "0 8px 28px rgba(0,0,0,0.5)", textAlign: "center",
        }}>{toast.msg}</div>
      )}

      {/* ── Stats strip ── */}
      {game && (
        <div style={{
          display: "flex", gap: 8, padding: "12px 16px",
          animation: "slideUp 0.25s ease",
        }}>
          <div style={{ flex: 1, background: "#111827", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, marginBottom: 4 }}>СТАВКА</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#F59E0B" }}>{fmtTON(game.betTon)} ▽</div>
          </div>
          <div style={{ flex: 1, background: "#111827", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, marginBottom: 4 }}>МНОЖИТЕЛЬ</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: game.cellsOpen > 0 ? "#4ADE80" : "#6B7280" }}>
              {game.cellsOpen > 0 ? `${game.multiplier}×` : "—"}
            </div>
          </div>
          <div style={{ flex: 1, background: "#111827", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, marginBottom: 4 }}>ВЫПЛАТА</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#E5E7EB" }}>
              {game.cellsOpen > 0 ? `${fmtTON(Math.round(game.betTon * game.multiplier * 10000) / 10000)} ▽` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      {game ? (
        <div style={{ padding: "0 16px" }}>
          {/* Win/Loss overlay pill */}
          {isOver && (
            <div style={{
              background: game.status === "won" ? "rgba(74,222,128,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${game.status === "won" ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.4)"}`,
              borderRadius: 12, padding: "12px 16px", marginBottom: 12,
              textAlign: "center", animation: "fadeIn 0.3s ease",
            }}>
              <div style={{ fontSize: 26, marginBottom: 4 }}>{game.status === "won" ? "🏆" : "💥"}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: game.status === "won" ? "#4ADE80" : "#F87171", marginBottom: 2 }}>
                {game.status === "won" ? `+${fmtTON(game.payout ?? 0)} TON` : "Бомба!"}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {game.status === "won" ? `${game.multiplier}× | выплата зачислена` : "Ставка сгорела"}
              </div>
            </div>
          )}

          {/* 5x5 Grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
            marginBottom: 12,
          }}>
            {Array.from({ length: GRID }, (_, r) =>
              Array.from({ length: GRID }, (_, c) => (
                <Cell key={`${r}-${c}`} row={r} col={c} game={game} onReveal={revealCell} disabled={busy} />
              ))
            )}
          </div>

          {/* Next multiplier hint */}
          {isActive && game.cellsOpen < game.safeCells && (
            <div style={{ textAlign: "center", fontSize: 12, color: "#4B5563", marginBottom: 10 }}>
              Следующая клетка → <span style={{ color: "#4ADE80", fontWeight: 700 }}>{game.nextMultiplier}×</span>
            </div>
          )}

          {/* Action buttons */}
          {isActive && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={cashout}
                disabled={busy || game.cellsOpen === 0}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: busy || game.cellsOpen === 0
                    ? "#1F2937"
                    : "linear-gradient(135deg,#4ADE80,#22C55E)",
                  color: game.cellsOpen === 0 ? "#4B5563" : "#fff",
                  fontSize: 14, fontWeight: 800, cursor: game.cellsOpen === 0 ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: game.cellsOpen > 0 ? "0 0 20px rgba(74,222,128,0.35)" : "none",
                }}
              >
                {busy ? "..." : game.cellsOpen === 0 ? "Открой клетку" : `💰 Забрать ${fmtTON(Math.round(game.betTon * game.multiplier * 10000) / 10000)} ▽`}
              </button>
            </div>
          )}

          {isOver && (
            <button
              onClick={newRound}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#1D4ED8,#3B82F6)",
                color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >🔄 Новая игра</button>
          )}
        </div>
      ) : (
        /* ── Setup panel ── */
        <div style={{ padding: "0 16px" }}>

          {/* Bet amount */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 700, marginBottom: 8 }}>СТАВКА (TON)</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {BET_OPTIONS.map(v => (
                <button
                  key={v}
                  onClick={() => { setBet(v); setBetInput(String(v)); }}
                  style={{
                    flex: "1 1 auto", minWidth: 44, padding: "9px 4px", borderRadius: 10, border: "none",
                    background: betTon === v ? "linear-gradient(135deg,#D97706,#F59E0B)" : "#111827",
                    color: betTon === v ? "#fff" : "#4B5563",
                    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: betTon === v ? "0 0 12px rgba(245,158,11,0.4)" : "none",
                  }}
                >{v}</button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <input
                value={betInput}
                onChange={e => {
                  setBetInput(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setBet(Math.round(v * 10000) / 10000);
                }}
                placeholder="Своя сумма..."
                type="number" step="0.01" min="0.01"
                style={{
                  width: "100%", background: "#111827",
                  border: "1px solid #21262D", borderRadius: 10,
                  padding: "10px 52px 10px 14px", color: "#E5E7EB",
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#4B5563", fontWeight: 700 }}>TON</span>
            </div>
          </div>

          {/* Bomb count */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 700, marginBottom: 8 }}>КОЛИЧЕСТВО БОМБ</div>
            <div style={{ display: "flex", gap: 8 }}>
              {BOMB_OPTIONS.map(b => {
                const safePct = Math.round((1 - b / 25) * 100);
                return (
                  <button
                    key={b}
                    onClick={() => setBombs(b)}
                    style={{
                      flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                      background: bombCount === b
                        ? b <= 1 ? "linear-gradient(135deg,#22C55E,#16A34A)"
                        : b <= 3 ? "linear-gradient(135deg,#3B82F6,#1D4ED8)"
                        : b <= 5 ? "linear-gradient(135deg,#F59E0B,#D97706)"
                        : "linear-gradient(135deg,#EF4444,#DC2626)"
                        : "#111827",
                      color: bombCount === b ? "#fff" : "#4B5563",
                      fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      boxShadow: bombCount === b ? "0 0 14px rgba(255,255,255,0.15)" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 2 }}>💣{b}</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>{safePct}% safe</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview grid (decorative) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginBottom: 14, opacity: 0.35, pointerEvents: "none" }}>
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} style={{ aspectRatio: "1", background: "#161B22", borderRadius: 8, border: "1px solid #21262D" }} />
            ))}
          </div>

          {/* Start */}
          <button
            onClick={startGame}
            disabled={busy || betTon < 0.01 || betTon > tonBalance}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
              background: busy || betTon < 0.01 || betTon > tonBalance
                ? "#1F2937"
                : "linear-gradient(135deg,#6366F1,#8B5CF6)",
              color: betTon > tonBalance ? "#6B7280" : "#fff",
              fontSize: 16, fontWeight: 900, cursor: busy || betTon < 0.01 || betTon > tonBalance ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              boxShadow: betTon <= tonBalance && betTon >= 0.01 ? "0 0 24px rgba(139,92,246,0.45)" : "none",
            }}
          >
            {busy ? "..." : betTon > tonBalance ? "Недостаточно TON" : `🎮 Начать · ${fmtTON(betTon)} TON`}
          </button>
          <div style={{ fontSize: 11, color: "#1F2937", textAlign: "center", marginTop: 8 }}>
            RTP 97% · Честная игра
          </div>
        </div>
      )}
    </div>
  );
}
