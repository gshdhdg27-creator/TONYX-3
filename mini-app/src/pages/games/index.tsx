import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SectionBar from "@/components/ui/SectionBar";
import ArenaGame from "@/components/ArenaGame";
import SpinGame from "@/components/SpinGame";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { translations, type Lang } from "@/lib/i18n";

/* ─────────────────────────────────────────
   Toast
───────────────────────────────────────── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg =
    type === "success" ? "rgba(22,163,74,0.95)"
    : type === "error" ? "rgba(220,38,38,0.95)"
    : "rgba(30,64,175,0.95)";
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
    }}>{msg}</div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MINES
═══════════════════════════════════════════════════════════ */
type Cell = "hidden" | "safe" | "mine";
interface MineGameState {
  id: number; stake: number; minesCount: number;
  revealed: Cell[][]; multiplier: number;
  status: "active" | "won" | "lost"; payout: number | null; safeCount: number;
}

const MINE_OPTIONS = [1, 3, 5, 7];
const BET_OPTIONS  = [1, 2.5, 5, 10];
const MIN_BET = 0.1;

function formatTon(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}

function nextStepMult(safeOpened: number, mines: number): number {
  const total = 25; const safe = total - mines;
  let m = 1;
  for (let i = 0; i < safeOpened; i++) m *= (total - i) / (safe - i);
  const rem = total - safeOpened; const safeRem = safe - safeOpened;
  if (safeRem <= 0 || rem <= 0) return Math.round(m * 0.97 * 100) / 100;
  return Math.round(m * (rem / safeRem) * 0.97 * 100) / 100;
}

function multSteps(safeOpened: number, mines: number, count = 5): number[] {
  const arr: number[] = [];
  for (let i = 0; i < count; i++) arr.push(nextStepMult(safeOpened + i, mines));
  return arr;
}

function MinesGame({ telegramId, balance, lang, onBalanceChange }: {
  telegramId: string; balance: number; lang: Lang; onBalanceChange: () => void;
}) {
  const t = translations[lang].games.mines;
  const [bet, setBet]     = useState(MIN_BET);
  const [mines, setMines] = useState(3);
  const [game, setGame]   = useState<MineGameState | null>(null);
  const [busy, setBusy]   = useState(false);
  const [exploding, setExploding] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2800);
  };

  const countSafe = (grid: Cell[][]) => grid.flat().filter(c => c === "safe").length;

  const startGame = async () => {
    if (bet > balance) { flash(t.errInsufficient, "error"); return; }
    haptic("medium"); setBusy(true);
    try {
      const r = await fetch("/api/mini/games/mines/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake: bet, minesCount: mines }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? t.errNetwork, "error"); return; }
      setGame({ id: d.id, stake: d.stake, minesCount: d.minesCount, revealed: d.revealed,
                multiplier: d.multiplier, status: d.status, payout: null, safeCount: 0 });
      onBalanceChange();
    } catch { flash(t.errNetwork, "error"); } finally { setBusy(false); }
  };

  const reveal = async (row: number, col: number) => {
    if (!game || game.status !== "active" || game.revealed[row][col] !== "hidden") return;
    haptic("light");
    try {
      const r = await fetch("/api/mini/games/mines/reveal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, telegramId, row, col }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? t.errNetwork, "error"); return; }
      const sc = countSafe(d.game.revealed);
      setGame({ ...game, revealed: d.game.revealed, multiplier: d.multiplier,
                status: d.game.status, payout: d.payout, safeCount: sc });
      if (d.hit) {
        setExploding(`${row}-${col}`);
        setTimeout(() => setExploding(null), 800);
        hapticNotify("error");
        flash(t.lost(game.stake), "error");
        onBalanceChange();
      } else {
        haptic("light");
      }
    } catch { flash(t.errNetwork, "error"); }
  };

  const cashout = async () => {
    if (!game || game.status !== "active") return;
    haptic("heavy"); setBusy(true);
    try {
      const r = await fetch("/api/mini/games/mines/cashout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, telegramId }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? t.errNetwork, "error"); return; }
      hapticNotify("success");
      flash(t.won(d.payout, d.multiplier), "success");
      setGame(prev => prev ? { ...prev, status: "won", payout: d.payout } : null);
      onBalanceChange();
    } catch { flash(t.errNetwork, "error"); } finally { setBusy(false); }
  };

  if (!game || game.status !== "active") {
    return (
      <div style={{ paddingBottom: 8 }}>
        <style>{`
          @keyframes minesBounce { 0%,100%{transform:scale(1)} 40%{transform:scale(1.15)} 60%{transform:scale(0.95)} }
          @keyframes minesShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
          @keyframes crystalFlip { 0%{transform:rotateY(90deg) scale(0.7);opacity:0} 60%{transform:rotateY(-10deg) scale(1.1)} 100%{transform:rotateY(0deg) scale(1);opacity:1} }
          @keyframes explodeCell { 0%{transform:scale(1);opacity:1} 30%{transform:scale(1.4);opacity:0.8} 60%{transform:scale(0.9);opacity:0.5} 100%{transform:scale(1.05);opacity:1} }
        `}</style>
        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {game?.status === "won" && (
          <div style={{ textAlign: "center", background: "rgba(22,163,74,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 20, padding: "20px 0", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>🎉</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#4ade80" }}>{t.wonCard(game.payout ?? 0)}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{t.wonSub(game.multiplier)}</div>
          </div>
        )}
        {game?.status === "lost" && (
          <div style={{ textAlign: "center", background: "rgba(220,38,38,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 20, padding: "20px 0", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>💥</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f87171" }}>{t.lostCard(game.stake)}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{t.lostSub}</div>
          </div>
        )}

        <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 18, padding: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>{t.stake}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            {BET_OPTIONS.map(v => (
              <button key={v} onClick={() => setBet(v)} style={{
                padding: "8px 14px", borderRadius: 10, border: "none", fontFamily: "inherit",
                background: bet === v ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "rgba(30,45,69,0.8)",
                color: bet === v ? "#fff" : "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer",
                boxShadow: bet === v ? "0 0 12px rgba(37,99,235,0.35)" : "none",
                transition: "all 0.15s",
              }}>{v} TON</button>
            ))}
          </div>
          <input value={bet} onChange={e => setBet(Math.max(MIN_BET, parseFloat(e.target.value) || 0))}
            type="number" step="0.1" min={MIN_BET} placeholder={`мин. ${MIN_BET} TON`}
            style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          <div style={{ fontSize: 12, color: "#334155", marginTop: 6 }}>{t.balance(balance)}</div>
        </div>

        <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 18, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>{t.minesCount}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {MINE_OPTIONS.map(m => (
              <button key={m} onClick={() => setMines(m)} style={{
                flex: 1, padding: "11px 0", borderRadius: 11, border: "none", fontFamily: "inherit",
                background: mines === m
                  ? "linear-gradient(135deg,#7f1d1d,#dc2626)"
                  : "rgba(30,45,69,0.8)",
                color: mines === m ? "#fff" : "#64748b",
                fontSize: 15, fontWeight: 900, cursor: "pointer",
                boxShadow: mines === m ? "0 0 18px rgba(220,38,38,0.4)" : "none",
                transition: "all 0.15s",
              }}>{m}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 12 }}>
            <span>💎 {t.diamonds(25 - mines)}</span>
            <span>📈 {t.startMult(nextStepMult(0, mines).toFixed(2))}</span>
          </div>
        </div>

        <button onClick={startGame} disabled={busy || bet > balance || bet < MIN_BET} style={{
          width: "100%", padding: "17px 0", borderRadius: 16, border: "none", fontFamily: "inherit",
          background: bet > balance
            ? "rgba(30,58,143,0.15)"
            : "linear-gradient(135deg,#065f46,#10b981)",
          color: bet > balance ? "#334155" : "#fff", fontSize: 16, fontWeight: 800,
          cursor: bet > balance ? "not-allowed" : "pointer",
          boxShadow: bet <= balance ? "0 0 32px rgba(16,185,129,0.35)" : "none",
          transition: "all 0.2s",
          letterSpacing: "0.02em",
        }}>
          {busy ? t.busy : t.startGame}
        </button>
      </div>
    );
  }

  const cashoutAmt = Math.round(game.stake * game.multiplier * 1000) / 1000;
  const steps = multSteps(game.safeCount, game.minesCount, 5);

  return (
    <div>
      <style>{`
        @keyframes crystalFlip { 0%{transform:rotateY(90deg) scale(0.7);opacity:0} 60%{transform:rotateY(-10deg) scale(1.1)} 100%{transform:rotateY(0deg) scale(1);opacity:1} }
        @keyframes explodeCell { 0%{transform:scale(1)} 25%{transform:scale(1.5);filter:brightness(2)} 50%{transform:scale(0.85)} 75%{transform:scale(1.1)} 100%{transform:scale(1)} }
        @keyframes minesPulse { 0%,100%{box-shadow:0 0 14px rgba(16,185,129,0.4)} 50%{box-shadow:0 0 28px rgba(16,185,129,0.7)} }
      `}</style>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[
          { label: t.stake, val: formatTon(game.stake) + " TON", col: "#94a3b8" },
          { label: translations[lang].games.minesLabel, val: "💣 " + game.minesCount, col: "#f87171" },
          { label: translations[lang].games.multLabel, val: "×" + game.multiplier, col: "#22d3ee" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 14, padding: "10px 0", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.12em", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const cell = game.revealed[r]?.[c] ?? "hidden";
            const isExploding = exploding === `${r}-${c}`;
            return (
              <button key={`${r}-${c}`} onClick={() => reveal(r, c)} style={{
                aspectRatio: "1", borderRadius: 13, border: "none",
                cursor: cell === "hidden" && game.status === "active" ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: cell === "hidden" ? 0 : 22,
                background: cell === "hidden"
                  ? "linear-gradient(145deg,#1e40af,#1d4ed8,#1e3a8a)"
                  : cell === "safe"
                  ? "linear-gradient(145deg,rgba(5,150,105,0.5),rgba(6,78,59,0.6))"
                  : "linear-gradient(145deg,rgba(185,28,28,0.65),rgba(127,29,29,0.7))",
                boxShadow: cell === "hidden"
                  ? "0 5px 0 #1e3a8a, inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.3)"
                  : cell === "safe"
                  ? "0 0 14px rgba(16,185,129,0.4)"
                  : "0 0 16px rgba(239,68,68,0.5)",
                transform: cell === "hidden" ? "translateY(-3px)" : "translateY(0)",
                animation: cell === "safe"
                  ? "crystalFlip 0.4s ease both"
                  : isExploding
                  ? "explodeCell 0.6s ease"
                  : undefined,
                transition: "transform 0.1s, background 0.15s",
              }}>
                {cell === "safe" ? (
                  <svg width="22" height="22" viewBox="0 0 22 22" style={{ filter: "drop-shadow(0 0 6px #34d399)" }}>
                    <polygon points="11,2 13.5,8 20,8.5 15,13 16.5,20 11,16.5 5.5,20 7,13 2,8.5 8.5,8" fill="#34d399" stroke="#10b981" strokeWidth="0.5" />
                  </svg>
                ) : cell === "mine" ? (
                  <svg width="22" height="22" viewBox="0 0 22 22" style={{ filter: "drop-shadow(0 0 8px #ef4444)" }}>
                    <circle cx="11" cy="11" r="7" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1" />
                    <circle cx="11" cy="11" r="4" fill="#b91c1c" />
                    <line x1="11" y1="1" x2="11" y2="5" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="11" y1="17" x2="11" y2="21" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="1" y1="11" x2="5" y2="11" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="17" y1="11" x2="21" y2="11" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="8.5" cy="8.5" r="1.2" fill="rgba(255,255,255,0.5)"/>
                  </svg>
                ) : ""}
              </button>
            );
          })
        )}
      </div>

      <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.2)", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 22 22"><polygon points="11,2 13.5,8 20,8.5 15,13 16.5,20 11,16.5 5.5,20 7,13 2,8.5 8.5,8" fill="#34d399"/></svg>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{t.nextStep}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#10b981", marginLeft: "auto" }}>
            {formatTon(game.stake * steps[1])} TON
          </span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {steps.map((m, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 8,
              background: i === 0 ? "rgba(16,185,129,0.15)" : "rgba(30,45,69,0.6)",
              border: i === 0 ? "1px solid rgba(16,185,129,0.4)" : "1px solid transparent",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? "#10b981" : "#475569" }}>
                ×{m.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 14, padding: "12px 14px", minWidth: 88, textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.1em" }}>{t.stake}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginTop: 2 }}>{formatTon(game.stake)}</div>
        </div>
        {game.safeCount > 0 ? (
          <button onClick={cashout} disabled={busy} style={{
            flex: 1, padding: "13px 0", borderRadius: 14, border: "none", fontFamily: "inherit",
            background: "linear-gradient(135deg,#b45309,#f59e0b)",
            color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
            boxShadow: "0 0 28px rgba(245,158,11,0.45)",
            animation: "minesPulse 2s ease infinite",
          }}>
            {t.cashout(cashoutAmt)}
          </button>
        ) : (
          <div style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "rgba(30,45,69,0.5)", textAlign: "center", fontSize: 13, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {t.openCell}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PvP БАРАБАН
═══════════════════════════════════════════════════════════ */
const SECTOR_COLORS = [
  "#1d4ed8","#dc2626","#15803d","#b45309","#6d28d9",
  "#0e7490","#be185d","#065f46","#92400e","#3730a3",
];

const TON_QUICK_BETS = [1, 5, 10, 50];

interface SpinPlayer { telegramId: string; username: string | null; stake: number; chance: number }

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

interface SpinLastWinner {
  telegramId: string;
  username: string | null;
  payout: number;
  totalPool: number;
  finishedAt: string | null;
}

function fmtTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* JackpotWheel and SpinGame moved to @/components/SpinGame */

/* ── SpinGame is now @/components/SpinGame ── */
function _SpinGameInline_REMOVED({ telegramId, tonBalance, onBalanceChange, onOpenHistory }: {
  telegramId: string; tonBalance: number; onBalanceChange: () => void; onOpenHistory?: () => void;
}) {
  const [round, setRound]               = useState<SpinRound | null>(null);
  const [stake, setStake]               = useState(1);
  const [busy, setBusy]                 = useState(false);
  const [toast, setToast]               = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [countdown, setCountdown]       = useState<number | null>(null);
  const [spinning, setSpinning]         = useState(false);
  const [lastWinner, setLastWinner]     = useState<SpinLastWinner | null>(null);
  const [biggestWinner, setBiggestWinner]   = useState<SpinLastWinner | null>(null);
  const [increaseBusy, setIncreaseBusy]     = useState(false);
  const [showFairness, setShowFairness]     = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const prevIdRef     = useRef<number | null>(null);
  const resolvedRef   = useRef(false);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const handleUpdate = (fresh: SpinRound) => {
    const prev = prevStatusRef.current;
    const prevId = prevIdRef.current;
    if (
      fresh.status === "finished" && fresh.winnerId &&
      (prev === "starting" || prev === "waiting") &&
      prevId === fresh.id && !resolvedRef.current
    ) {
      resolvedRef.current = true;
      setSpinning(true);
      setTimeout(() => {
        setSpinning(false);
        const won = fresh.winnerId === telegramId;
        const wp = fresh.players.find(p => p.telegramId === fresh.winnerId);
        const others = fresh.totalPool - (wp?.stake ?? 0);
        const payout = Math.round(((wp?.stake ?? 0) + others * 0.80) * 1000) / 1000;
        hapticNotify(won ? "success" : "error");
        const lw: SpinLastWinner = { telegramId: fresh.winnerId!, username: fresh.winnerUsername, payout, totalPool: fresh.totalPool, finishedAt: new Date().toISOString() };
        setLastWinner(lw);
        if (won) flash(`🏆 Победа! +${payout} TON`, "success");
        else flash((fresh.winnerUsername ? "@" + fresh.winnerUsername : "Другой игрок") + " забрал банк", "info");
        onBalanceChange();
        setTimeout(() => { resolvedRef.current = false; }, 5000);
      }, 4200);
    }
    if (fresh.status !== "finished") prevIdRef.current = fresh.id;
    prevStatusRef.current = fresh.status;
    setRound(fresh);
    if (fresh.status === "starting" && fresh.startAt) {
      setCountdown(Math.max(0, Math.ceil((new Date(fresh.startAt).getTime() - Date.now()) / 1000)));
    } else if (fresh.status !== "starting") {
      setCountdown(null);
    }
  };

  const fetchState = async () => {
    try { const r = await fetch("/api/mini/games/spin/state"); if (r.ok) handleUpdate(await r.json()); }
    catch { /* offline */ }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/mini/games/spin/last-winner").then(r => r.json()).catch(() => null),
      fetch("/api/mini/games/spin/biggest-winner").then(r => r.json()).catch(() => null),
    ]).then(([lw, bw]) => {
      if (lw?.winner) setLastWinner(lw.winner);
      if (bw?.winner) setBiggestWinner(bw.winner);
    });
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) {
        // Countdown just hit zero — poll aggressively so the spin starts ASAP
        fetchState();
        const t1 = setTimeout(fetchState, 500);
        const t2 = setTimeout(fetchState, 1000);
        const t3 = setTimeout(fetchState, 1600);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null && c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const joinRound = async () => {
    if (stake < 0.1) { flash("Мин. 0.1 TON", "error"); return; }
    if (stake > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/spin/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d); onBalanceChange(); hapticNotify("success");
      flash("✅ Ставка сделана!", "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  const handleIncreaseStake = async (add: number) => {
    if (increaseBusy || add > tonBalance) return;
    setIncreaseBusy(true); haptic("medium");
    try {
      const r = await fetch("/api/mini/games/spin/increase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, additionalStake: add }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d); onBalanceChange();
      hapticNotify("success"); flash(`+${add} TON добавлено!`, "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setIncreaseBusy(false); }
  };

  const players   = round?.players ?? [];
  const isIn      = players.some(p => p.telegramId === telegramId);
  const myP       = players.find(p => p.telegramId === telegramId);
  const othersPool = players.filter(p => p.telegramId !== telegramId).reduce((s, p) => s + p.stake, 0);
  const myWinPayout = myP ? Math.round((myP.stake + othersPool * 0.80) * 1000) / 1000 : 0;

  /* ── Top winners row ── */
  const historyTopRow = (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {lastWinner && (
        <div
          onClick={() => onOpenHistory?.()}
          style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: "8px 10px", minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: "0.08em", marginBottom: 2 }}>🟢 ПОСЛЕДНИЙ</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{lastWinner.username ?? lastWinner.telegramId.slice(-6)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24" }}>+{lastWinner.payout} TON</div>
        </div>
      )}
      {biggestWinner && (
        <div
          onClick={() => onOpenHistory?.()}
          style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "8px 10px", minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: "0.08em", marginBottom: 2 }}>🟡 РЕКОРД</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{biggestWinner.username ?? biggestWinner.telegramId.slice(-6)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24" }}>+{biggestWinner.payout} TON</div>
        </div>
      )}
      <button onClick={() => setShowFairness(true)} style={{
        flexShrink: 0, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)",
        borderRadius: 12, padding: "8px 10px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit",
        cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      }}>
        <span style={{ fontSize: 18 }}>🔐</span>
        <span>Честность</span>
      </button>
      <button onClick={() => onOpenHistory?.()} style={{
        flexShrink: 0, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)",
        borderRadius: 12, padding: "8px 10px", color: "#60a5fa", fontSize: 11, fontFamily: "inherit",
        cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      }}>
        <span style={{ fontSize: 18 }}>📋</span>
        <span>История</span>
      </button>
    </div>
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {historyTopRow}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[
          { label: "БАНК", val: (round?.totalPool ?? 0).toFixed(3) + " TON", col: "#fbbf24" },
          { label: "ИГРОКОВ", val: String(players.length), col: "#22d3ee" },
          { label: "МОЙ ШАНС", val: myP ? myP.chance.toFixed(1) + "%" : "—", col: "#4ade80" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 11, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Countdown */}
      {round?.status === "starting" && countdown !== null && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>Спин через</div>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums",
            color: countdown <= 5 ? "#f87171" : "#60a5fa",
            textShadow: countdown <= 5 ? "0 0 20px rgba(248,113,113,0.6)" : "0 0 20px rgba(96,165,250,0.4)",
          }}>{fmtTimer(countdown)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Ещё можно увеличить ставку!</div>
        </div>
      )}

      {round?.status === "waiting" && players.length < 2 && (
        <div style={{ textAlign: "center", fontSize: 12, color: "#475569", marginBottom: 8 }}>
          ⏳ Нужно минимум 2 игрока для старта
        </div>
      )}

      <JackpotWheel players={players} spinning={spinning} winnerId={round?.winnerId} />

      {isIn && myP && players.length >= 2 && (
        <div style={{ background: "rgba(30,58,143,0.1)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 12, padding: "10px 14px", marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>💡 Если победишь</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Твоя ставка: <span style={{ color: "#94a3b8" }}>{myP.stake} TON</span></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Чужие (−20%): <span style={{ color: "#94a3b8" }}>{(othersPool * 0.80).toFixed(3)} TON</span></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>+{myWinPayout} TON</div>
          </div>
        </div>
      )}

      {isIn && round?.status === "starting" && countdown !== null && countdown > 2 && (
        <div style={{ background: "rgba(30,58,143,0.08)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 12, padding: "10px 14px", marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>⚡ Увеличить ставку</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[0.5, 1, 2, 5].map(add => (
              <button key={add} onClick={() => void handleIncreaseStake(add)}
                disabled={increaseBusy || add > tonBalance}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: add > tonBalance ? "rgba(30,45,69,0.4)" : "rgba(37,99,235,0.2)", color: add > tonBalance ? "#334155" : "#60a5fa", fontSize: 12, fontWeight: 800, cursor: add > tonBalance ? "not-allowed" : "pointer" }}>
                +{add}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>Баланс: <span style={{ color: "#fbbf24" }}>{tonBalance.toFixed(3)} TON</span></div>
        </div>
      )}

      {isIn && myP && round?.status !== "starting" && (
        <div style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 12, padding: "12px 14px", marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>✅ Ты в раунде</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>Ставка: {myP.stake} TON · Шанс: {myP.chance.toFixed(1)}%</div>
          </div>
          <div style={{ fontSize: 22 }}>🎡</div>
        </div>
      )}

      {!isIn && (
        <div style={{ marginTop: 14 }}>
          <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 16, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>🎡 Сделать ставку</div>
              <div style={{ fontSize: 12, color: "#334155" }}>Баланс: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{tonBalance.toFixed(3)} TON</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {TON_QUICK_BETS.map(v => (
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
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input value={stake} onChange={e => setStake(Math.max(0.1, parseFloat(e.target.value) || 0))}
                type="number" step="0.1" placeholder="Своя сумма..."
                style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 60px 10px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#475569", fontWeight: 700 }}>TON</span>
            </div>
            <div style={{ background: "rgba(30,58,143,0.08)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#475569" }}>💡 Комиссия 20% только с чужих монет. Своя ставка возвращается всегда.</div>
            </div>
          </div>
          <button onClick={joinRound} disabled={busy || stake > tonBalance || stake < 0.1} style={{
            width: "100%", padding: "16px 0", borderRadius: 13, border: "none", fontFamily: "inherit",
            background: stake > tonBalance ? "rgba(30,45,69,0.5)" : "linear-gradient(135deg,#0e7490,#06b6d4)",
            color: stake > tonBalance ? "#334155" : "#fff",
            fontSize: 16, fontWeight: 800, cursor: stake > tonBalance ? "not-allowed" : "pointer",
            boxShadow: stake <= tonBalance ? "0 0 28px rgba(6,182,212,0.4)" : "none",
          }}>
            {busy ? "⏳..." : stake > tonBalance ? "Недостаточно TON" : `🎡 Сделать ставку · ${stake} TON`}
          </button>
        </div>
      )}

      {players.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", margin: "14px 0 8px" }}>
            УЧАСТНИКИ РАУНДА ({players.length})
          </div>
          {players.map((p, i) => {
            const isMe = p.telegramId === telegramId;
            const isWin = round?.winnerId === p.telegramId;
            return (
              <div key={p.telegramId} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(15,23,42,0.95)",
                border: `1px solid ${isWin ? "rgba(74,222,128,0.45)" : isMe ? "rgba(34,211,238,0.35)" : "rgba(30,58,143,0.2)"}`,
                borderRadius: 13, padding: "10px 14px", marginBottom: 7,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: SECTOR_COLORS[i % SECTOR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "white", border: "2px solid rgba(255,255,255,0.15)" }}>
                  {(p.username ?? p.telegramId).slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isWin ? "#4ade80" : "#e2e8f0" }}>
                    {p.username ? "@" + p.username : "#" + p.telegramId.slice(-5)}
                    {isMe && <span style={{ color: "#22d3ee" }}> · ты</span>}
                    {isWin && " 🏆"}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 4, height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(30,45,69,0.6)" }}>
                    <div style={{ width: `${p.chance}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length], borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{p.stake} TON</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{p.chance.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </>
      )}

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

/* ═══════════════════════════════════════════════════════════
   UNIFIED HISTORY MODAL
═══════════════════════════════════════════════════════════ */

interface ArenaHistoryRoom {
  id: number;
  totalPool: number;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerPayout: number;
  players: Array<{ telegramId: string; username: string | null; stake: number; chance: number }>;
  finishedAt: string | null;
  fair?: FairData;
}

interface SpinHistoryRoom {
  id: number;
  totalPool: number;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerPayout: number;
  players: SpinPlayer[];
  finishedAt: string | null;
  fair?: FairData;
}

interface LuckyEntry {
  telegramId: string;
  username: string | null;
  minChance: number;
  wins: number;
  totalWon: number;
}

type HistoryGameTab = "arena" | "spin";
type HistoryFilter = "all" | "lucky" | "big" | "mine";

/* Mini arena board for replay */
const REPLAY_SQ = 220;
const REPLAY_CX = REPLAY_SQ / 2;
const REPLAY_CY = REPLAY_SQ / 2;
const REPLAY_HW = REPLAY_SQ / 2;
const REPLAY_HH = REPLAY_SQ / 2;
const REPLAY_BALL_R = 7;
const REPLAY_INNER_R = 32;

const ARENA_COLORS_R = [
  "#5BE12C","#FF4136","#FF9F00","#00C0FF",
  "#B044FF","#FFEB3B","#FF69B4","#00FFB2",
  "#FF6E40","#39CCCC",
];

function replaySquarePoint(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const t = ax < 1e-9 ? REPLAY_HH / ay : ay < 1e-9 ? REPLAY_HW / ax : Math.min(REPLAY_HW / ax, REPLAY_HH / ay);
  return [REPLAY_CX + t * dx, REPLAY_CY + t * dy];
}

function replaySquareSectorPoints(startDeg: number, endDeg: number, steps = 36): string {
  const pts: [number, number][] = [[REPLAY_CX, REPLAY_CY]];
  for (let i = 0; i <= steps; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / steps;
    pts.push(replaySquarePoint(a));
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function replaySectorCentroid(startDeg: number, endDeg: number): [number, number] {
  const N = 24;
  let sx = REPLAY_CX, sy = REPLAY_CY; let count = 1;
  for (let i = 0; i <= N; i++) {
    const a = startDeg + (endDeg - startDeg) * i / N;
    const [px, py] = replaySquarePoint(a);
    sx += px; sy += py; count++;
  }
  return [sx / count, sy / count];
}

function ArenaReplayBoard({ room, replaying }: {
  room: ArenaHistoryRoom;
  replaying: boolean;
}) {
  const ballRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const posRef  = useRef({ x: REPLAY_CX, y: REPLAY_CY });
  const velRef  = useRef({ vx: 0, vy: 0 });
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const players = room.players;
  const totalPool = room.totalPool;

  const sectors = (() => {
    if (players.length === 0) return [];
    let acc = 0;
    return players.map((p, i) => {
      const frac = totalPool > 0 ? p.stake / totalPool : 1 / players.length;
      const startDeg = acc * 360;
      const endDeg = (acc + frac) * 360;
      acc += frac;
      const midDeg = (startDeg + endDeg) / 2;
      const [px, py] = replaySquarePoint(midDeg);
      const ax = REPLAY_CX + (px - REPLAY_CX) * 0.58;
      const ay = REPLAY_CY + (py - REPLAY_CY) * 0.58;
      return {
        points: replaySquareSectorPoints(startDeg, endDeg),
        color: ARENA_COLORS_R[i % ARENA_COLORS_R.length],
        startDeg, endDeg, ax, ay, p,
        centroid: replaySectorCentroid(startDeg, endDeg),
      };
    });
  })();

  const place = (nx: number, ny: number) => {
    posRef.current = { x: nx, y: ny };
    ballRef.current?.setAttribute("cx", nx.toFixed(2));
    ballRef.current?.setAttribute("cy", ny.toFixed(2));
    glowRef.current?.setAttribute("cx", nx.toFixed(2));
    glowRef.current?.setAttribute("cy", ny.toFixed(2));
  };

  useEffect(() => {
    if (!replaying) {
      /* reset ball to center */
      stoppedRef.current = false;
      posRef.current = { x: REPLAY_CX, y: REPLAY_CY };
      velRef.current = { vx: 0, vy: 0 };
      targetRef.current = null;
      startTimeRef.current = null;
      place(REPLAY_CX, REPLAY_CY);
      return;
    }

    /* find winner sector centroid */
    const winSector = sectors.find(s => s.p.telegramId === room.winnerId);
    if (winSector) {
      targetRef.current = { x: winSector.centroid[0], y: winSector.centroid[1] };
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 1.5;
    posRef.current = { x: REPLAY_CX, y: REPLAY_CY };
    velRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    stoppedRef.current = false;
    startTimeRef.current = performance.now();

    let active = true;
    const EDGE = 2;
    const ATTRACT_MS = 3200;

    const step = () => {
      if (!active || stoppedRef.current) return;
      const elapsed = startTimeRef.current ? performance.now() - startTimeRef.current : 0;
      const pos = posRef.current;
      let { vx, vy } = velRef.current;

      if (elapsed >= ATTRACT_MS && targetRef.current) {
        const dx = targetRef.current.x - pos.x;
        const dy = targetRef.current.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1.5) {
          stoppedRef.current = true;
          place(targetRef.current.x, targetRef.current.y);
          return;
        }
        vx = dx * 0.10; vy = dy * 0.10;
        velRef.current = { vx, vy };
        place(pos.x + vx, pos.y + vy);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      vx *= 0.995; vy *= 0.995;
      let nx = pos.x + vx; let ny = pos.y + vy;
      if (nx - REPLAY_BALL_R <= EDGE)           { nx = REPLAY_BALL_R + EDGE;           vx =  Math.abs(vx); }
      if (nx + REPLAY_BALL_R >= REPLAY_SQ - EDGE) { nx = REPLAY_SQ - REPLAY_BALL_R - EDGE; vx = -Math.abs(vx); }
      if (ny - REPLAY_BALL_R <= EDGE)           { ny = REPLAY_BALL_R + EDGE;           vy =  Math.abs(vy); }
      if (ny + REPLAY_BALL_R >= REPLAY_SQ - EDGE) { ny = REPLAY_SQ - REPLAY_BALL_R - EDGE; vy = -Math.abs(vy); }
      velRef.current = { vx, vy };
      place(nx, ny);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [replaying]);

  return (
    <div style={{ position: "relative", width: REPLAY_SQ, height: REPLAY_SQ, margin: "0 auto", borderRadius: 12, overflow: "hidden", boxShadow: "0 0 0 1px #1F2937" }}>
      <svg width={REPLAY_SQ} height={REPLAY_SQ} style={{ display: "block" }}>
        <rect x={0} y={0} width={REPLAY_SQ} height={REPLAY_SQ} fill="#111827" />
        {sectors.map((s, i) => (
          <polygon key={i} points={s.points} fill={s.color} opacity={0.90} />
        ))}
        {sectors.length >= 2 && sectors.map((s, i) => {
          const [ex, ey] = replaySquarePoint(s.startDeg);
          return <line key={i} x1={REPLAY_CX} y1={REPLAY_CY} x2={ex} y2={ey} stroke="#111827" strokeWidth={2} />;
        })}
        <circle cx={REPLAY_CX} cy={REPLAY_CY} r={REPLAY_INNER_R} fill="#0d1117" />
        {players.length > 0 && (
          <>
            <circle ref={glowRef} cx={REPLAY_CX} cy={REPLAY_CY} r={REPLAY_BALL_R + 5} fill="white" opacity={0.12} />
            <circle ref={ballRef} cx={REPLAY_CX} cy={REPLAY_CY} r={REPLAY_BALL_R} fill="white" stroke="rgba(0,0,0,0.3)" strokeWidth={1} style={{ filter: "drop-shadow(0 2px 8px rgba(255,255,255,0.8))" }} />
          </>
        )}
      </svg>
      {sectors.map((s, i) => (
        <div key={i} style={{
          position: "absolute",
          left: s.ax - 14, top: s.ay - 14,
          width: 28, height: 28, borderRadius: "50%",
          background: s.color + (s.p.telegramId === room.winnerId ? "ff" : "30"),
          border: `2px solid ${s.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#fff",
          boxShadow: s.p.telegramId === room.winnerId ? `0 0 12px ${s.color}` : "none",
        }}>
          {(s.p.username ?? s.p.telegramId).slice(0, 2).toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function UnifiedHistoryModal({ telegramId, initialTab, onClose }: {
  telegramId: string;
  initialTab?: HistoryGameTab;
  onClose: () => void;
}) {
  const [gameTab, setGameTab] = useState<HistoryGameTab>(initialTab ?? "arena");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [loading, setLoading] = useState(false);

  const [arenaRooms, setArenaRooms] = useState<ArenaHistoryRoom[]>([]);
  const [spinRooms, setSpinRooms] = useState<SpinHistoryRoom[]>([]);
  const [arenaLucky, setArenaLucky] = useState<LuckyEntry[]>([]);
  const [spinLucky, setSpinLucky] = useState<LuckyEntry[]>([]);

  const [detailGame, setDetailGame] = useState<ArenaHistoryRoom | SpinHistoryRoom | null>(null);
  const [replayGame, setReplayGame] = useState<ArenaHistoryRoom | SpinHistoryRoom | null>(null);
  const [replaySpinning, setReplaySpinning] = useState(false);
  const [arenaReplaying, setArenaReplaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetchAll = async () => {
      try {
        const [arH, arL, spH, spL] = await Promise.all([
          fetch("/api/mini/games/arena/history?limit=50").then(r => r.json()).catch(() => null),
          fetch("/api/mini/games/arena/lucky-players").then(r => r.json()).catch(() => null),
          fetch("/api/mini/games/spin/history?limit=50").then(r => r.json()).catch(() => null),
          fetch("/api/mini/games/spin/lucky-players").then(r => r.json()).catch(() => null),
        ]);
        if (arH?.rooms) setArenaRooms(arH.rooms);
        if (arL?.players) setArenaLucky(arL.players);
        if (spH?.rooms) setSpinRooms(spH.rooms);
        if (spL?.players) setSpinLucky(spL.players);
      } finally { setLoading(false); }
    };
    void fetchAll();
  }, []);

  const rooms = gameTab === "arena" ? arenaRooms : spinRooms;
  const lucky = gameTab === "arena" ? arenaLucky : spinLucky;

  const filteredRooms = (() => {
    if (filter === "all") return rooms;
    if (filter === "big") return [...rooms].sort((a, b) => b.winnerPayout - a.winnerPayout);
    if (filter === "mine") return rooms.filter(r =>
      r.players.some(p => p.telegramId === telegramId)
    );
    return rooms; // lucky handled separately
  })();

  /* Replay screen */
  if (replayGame) {
    const isArena = "players" in replayGame && gameTab === "arena";
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "#050814", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 10px", gap: 10, borderBottom: "1px solid rgba(30,58,143,0.25)", flexShrink: 0 }}>
          <button onClick={() => { setReplayGame(null); setReplaySpinning(false); setArenaReplaying(false); }}
            style={{ background: "rgba(30,45,69,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, color: "#94a3b8", fontSize: 13, padding: "6px 12px", fontFamily: "inherit", cursor: "pointer" }}>
            ← Назад
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "#e2e8f0", textAlign: "center" }}>
            🎥 Повтор · Игра #{replayGame.id}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", overflowY: "auto" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, textAlign: "center" }}>
            Банк: {replayGame.totalPool} TON · {replayGame.players.length} игроков
          </div>

          {isArena ? (
            <ArenaReplayBoard room={replayGame as ArenaHistoryRoom} replaying={arenaReplaying} />
          ) : (
            <JackpotWheel
              key={`replay-${replayGame.id}-${replaySpinning}`}
              players={replayGame.players as SpinPlayer[]}
              spinning={replaySpinning}
              winnerId={replayGame.winnerId}
            />
          )}

          <div style={{ marginTop: 16, padding: "10px 20px", background: "rgba(22,163,74,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 2 }}>🏆 ПОБЕДИТЕЛЬ</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>
              @{replayGame.winnerUsername ?? replayGame.winnerId?.slice(-6) ?? "?"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>+{replayGame.winnerPayout} TON</div>
          </div>

          <div style={{ marginTop: 14, width: "100%", maxWidth: 340 }}>
            {replayGame.players.map((p, i) => (
              <div key={p.telegramId} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(15,23,42,0.95)",
                border: `1px solid ${p.telegramId === replayGame.winnerId ? "rgba(74,222,128,0.4)" : "rgba(30,58,143,0.2)"}`,
                borderRadius: 10, padding: "8px 12px", marginBottom: 6,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: (gameTab === "arena" ? ARENA_COLORS_R : SECTOR_COLORS)[i % 10], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {(p.username ?? p.telegramId).slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: p.telegramId === replayGame.winnerId ? "#4ade80" : "#e2e8f0" }}>
                    {p.username ? "@" + p.username : "#" + p.telegramId.slice(-5)}
                    {p.telegramId === replayGame.winnerId && " 🏆"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{p.stake} TON</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{p.chance.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 16px 20px", flexShrink: 0 }}>
          <button
            onClick={() => {
              if (isArena) {
                setArenaReplaying(false);
                setTimeout(() => setArenaReplaying(true), 80);
              } else {
                setReplaySpinning(false);
                setTimeout(() => setReplaySpinning(true), 80);
              }
            }}
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}
          >
            ▶ Открыть повтор
          </button>
        </div>
      </div>
    );
  }

  /* Detail screen */
  if (detailGame) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "#050814", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 10px", gap: 10, borderBottom: "1px solid rgba(30,58,143,0.25)", flexShrink: 0 }}>
          <button onClick={() => setDetailGame(null)} style={{ background: "rgba(30,45,69,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, color: "#94a3b8", fontSize: 13, padding: "6px 12px", fontFamily: "inherit", cursor: "pointer" }}>← Назад</button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "#e2e8f0", textAlign: "center" }}>
            {gameTab === "arena" ? "⚔️" : "🎡"} Игра #{detailGame.id}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { label: "БАНК", val: detailGame.totalPool + " TON", col: "#fbbf24" },
              { label: "ИГРОКОВ", val: String(detailGame.players.length), col: "#22d3ee" },
              { label: "ДАТА", val: detailGame.finishedAt ? new Date(detailGame.finishedAt).toLocaleDateString("ru") : "—", col: "#94a3b8" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 10, padding: "8px 0", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: col }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>УЧАСТНИКИ</div>
          {detailGame.players.map((p, i) => (
            <div key={p.telegramId} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(15,23,42,0.95)",
              border: `1px solid ${p.telegramId === detailGame.winnerId ? "rgba(74,222,128,0.45)" : "rgba(30,58,143,0.2)"}`,
              borderRadius: 12, padding: "10px 14px", marginBottom: 8,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: (gameTab === "arena" ? ARENA_COLORS_R : SECTOR_COLORS)[i % 10], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>
                {(p.username ?? p.telegramId).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.telegramId === detailGame.winnerId ? "#4ade80" : "#e2e8f0" }}>
                  {p.username ? "@" + p.username : "#" + p.telegramId.slice(-5)}
                  {p.telegramId === telegramId && <span style={{ color: "#22d3ee", fontSize: 11 }}> · ты</span>}
                  {p.telegramId === detailGame.winnerId && " 🏆"}
                </div>
                <div style={{ display: "flex", gap: 2, marginTop: 4, height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(30,45,69,0.6)" }}>
                  <div style={{ width: `${p.chance}%`, background: (gameTab === "arena" ? ARENA_COLORS_R : SECTOR_COLORS)[i % 10], borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{p.stake} TON</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{p.chance.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 16px 20px", flexShrink: 0 }}>
          <button
            onClick={() => { setReplayGame(detailGame); setDetailGame(null); setReplaySpinning(false); setArenaReplaying(false); }}
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}
          >
            🎥 Открыть повтор
          </button>
        </div>
      </div>
    );
  }

  /* Main history list */
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(5,8,20,0.98)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 10px", gap: 10, borderBottom: "1px solid rgba(30,58,143,0.25)", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "rgba(30,45,69,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, color: "#94a3b8", fontSize: 13, padding: "6px 12px", fontFamily: "inherit", cursor: "pointer" }}>← Назад</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>История игр</div>
      </div>

      {/* Game type tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(30,58,143,0.2)", flexShrink: 0 }}>
        {([["arena", "⚔️ Арена"], ["spin", "🎡 Барабан"]] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => { setGameTab(tab); setFilter("all"); }} style={{
            flex: 1, padding: "11px 4px", border: "none", fontFamily: "inherit",
            background: "transparent",
            color: gameTab === tab ? "#60a5fa" : "#475569",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            borderBottom: gameTab === tab ? "2px solid #2563eb" : "2px solid transparent",
          }}>{label}</button>
        ))}
        <button style={{
          flex: 1, padding: "11px 4px", border: "none", fontFamily: "inherit",
          background: "transparent", color: "#374151",
          fontSize: 13, fontWeight: 700, cursor: "default",
          borderBottom: "2px solid transparent",
        }}>
          💣 Mines
          <span style={{ fontSize: 9, marginLeft: 4, color: "#374151", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>скоро</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 12px", flexShrink: 0, overflowX: "auto" }}>
        {([
          ["all", "🔘 Все"],
          ["lucky", "🍀 Везучие"],
          ["big", "💰 Крупные"],
          ["mine", "👤 Мои"],
        ] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: 20, fontFamily: "inherit",
            background: filter === f ? "rgba(37,99,235,0.3)" : "rgba(30,45,69,0.7)",
            color: filter === f ? "#60a5fa" : "#64748b",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${filter === f ? "rgba(37,99,235,0.5)" : "transparent"}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#334155", padding: "40px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            Загрузка...
          </div>
        ) : filter === "lucky" ? (
          lucky.length === 0
            ? <div style={{ textAlign: "center", color: "#334155", padding: "40px 0" }}>Нет данных</div>
            : lucky.map((lp, i) => (
              <div key={lp.telegramId} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: i < 3 ? (["#fbbf24","#94a3b8","#b45309"] as const)[i] : "#334155", width: 22, textAlign: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                    @{lp.username ?? lp.telegramId.slice(-6)}
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{lp.wins} побед · {lp.totalWon.toFixed(2)} TON</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#f87171" }}>{lp.minChance.toFixed(1)}%</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>мин. шанс</div>
                </div>
              </div>
            ))
        ) : filteredRooms.length === 0 ? (
          <div style={{ textAlign: "center", color: "#334155", padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{filter === "mine" ? "👤" : "📋"}</div>
            {filter === "mine" ? "Вы ещё не играли" : "Нет завершённых игр"}
          </div>
        ) : (
          filteredRooms.map(room => {
            const myParticipated = room.players.some(p => p.telegramId === telegramId);
            const iWon = room.winnerId === telegramId;
            return (
              <div
                key={room.id}
                onClick={() => setDetailGame(room)}
                style={{
                  background: "rgba(15,23,42,0.95)",
                  border: `1px solid ${iWon ? "rgba(74,222,128,0.35)" : myParticipated ? "rgba(34,211,238,0.25)" : "rgba(30,58,143,0.2)"}`,
                  borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
                      Игра #{room.id} · {room.players.length} игроков
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: iWon ? "#4ade80" : "#e2e8f0" }}>
                      🏆 @{room.winnerUsername ?? room.winnerId?.slice(-6) ?? "—"}
                      {iWon && <span style={{ color: "#4ade80", fontSize: 11 }}> · ты победил!</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fbbf24" }}>+{room.winnerPayout} TON</div>
                    <div style={{ fontSize: 10, color: "#334155" }}>{room.finishedAt ? new Date(room.finishedAt).toLocaleDateString("ru") : "—"}</div>
                  </div>
                </div>

                {/* Mini player row */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  {room.players.slice(0, 6).map((p, i) => (
                    <div key={p.telegramId} style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: (gameTab === "arena" ? ARENA_COLORS_R : SECTOR_COLORS)[i % 10],
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, fontWeight: 800, color: "#fff",
                      border: p.telegramId === room.winnerId ? "1.5px solid #fff" : "none",
                    }}>
                      {(p.username ?? p.telegramId).slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {room.players.length > 6 && (
                    <div style={{ fontSize: 10, color: "#475569" }}>+{room.players.length - 6}</div>
                  )}
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>
                    банк: {room.totalPool} TON
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); setDetailGame(room); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                    👥 Участники
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setReplayGame(room); setReplaySpinning(false); setArenaReplaying(false); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid rgba(109,40,217,0.4)", background: "rgba(109,40,217,0.12)", color: "#a78bfa", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                    🎥 Повтор
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE — GAME CARDS
═══════════════════════════════════════════════════════════ */

const GAME_CARDS = [
  {
    id: "arena",
    titleRu: "PvP Арена",
    titleEn: "PvP Arena",
    descRu: "Сражайся в реальном времени",
    descEn: "Fight in real-time",
    ready: true,
    baseOnline: 34,
    primary: "#F59E0B",
    gradient: "linear-gradient(180deg,#D97706,#92400E)",
    glow: "rgba(245,158,11,0.7)",
    cardGlow: "rgba(245,158,11,0.15)",
    border: "#D97706",
    accentA: "#fbbf24",
    accentB: "#d97706",
  },
  {
    id: "spin",
    titleRu: "PvP Барабан",
    titleEn: "PvP Spin",
    descRu: "Крути барабан и забирай банк",
    descEn: "Spin the wheel and take the bank",
    ready: true,
    baseOnline: 28,
    primary: "#06B6D4",
    gradient: "linear-gradient(180deg,#0891B2,#164E63)",
    glow: "rgba(6,182,212,0.7)",
    cardGlow: "rgba(6,182,212,0.12)",
    border: "#0891B2",
    accentA: "#22d3ee",
    accentB: "#0891b2",
  },
  {
    id: "mines",
    titleRu: "Mines",
    titleEn: "Mines",
    descRu: "Ищи кристаллы и обходи мины",
    descEn: "Find crystals and avoid mines",
    ready: true,
    baseOnline: 19,
    primary: "#EF4444",
    gradient: "linear-gradient(180deg,#DC2626,#7F1D1D)",
    glow: "rgba(239,68,68,0.7)",
    cardGlow: "rgba(239,68,68,0.12)",
    border: "#DC2626",
    accentA: "#f87171",
    accentB: "#dc2626",
  },
] as const;

type ActiveGame = null | "arena" | "spin" | "mines";

function useOnlineCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const t = setInterval(() => {
      setCounts(prev => {
        const next = { ...prev };
        for (const card of GAME_CARDS) {
          const base = prev[card.id] ?? card.baseOnline;
          next[card.id] = Math.max(5, base + Math.floor(Math.random() * 7) - 3);
        }
        return next;
      });
    }, 8000);
    return () => clearInterval(t);
  }, []);
  return counts;
}

/* SVG illustrations per game */
function MinesIllustration({ glow }: { glow: string }) {
  return (
    <svg width="80" height="76" viewBox="0 0 80 76" fill="none" style={{ filter: `drop-shadow(0 0 10px ${glow})` }}>
      {/* Bomb body */}
      <circle cx="40" cy="44" r="22" fill="url(#bombGrad)" stroke="#7f1d1d" strokeWidth="1.5"/>
      <defs>
        <radialGradient id="bombGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4b5563"/>
          <stop offset="60%" stopColor="#1f2937"/>
          <stop offset="100%" stopColor="#111827"/>
        </radialGradient>
      </defs>
      {/* Shine */}
      <ellipse cx="33" cy="36" rx="7" ry="5" fill="rgba(255,255,255,0.12)" transform="rotate(-20,33,36)"/>
      {/* Fuse */}
      <path d="M40 22 Q48 14 44 6" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      {/* Spark */}
      <circle cx="44" cy="5" r="3" fill="#fbbf24">
        <animate attributeName="opacity" values="1;0.2;1" dur="0.5s" repeatCount="indefinite"/>
        <animate attributeName="r" values="3;5;3" dur="0.5s" repeatCount="indefinite"/>
      </circle>
      {/* Neon spikes */}
      <line x1="40" y1="20" x2="40" y2="15" stroke="#f87171" strokeWidth="1.5" opacity="0.6"/>
      <line x1="56" y1="28" x2="60" y2="24" stroke="#f87171" strokeWidth="1.5" opacity="0.6"/>
      <line x1="56" y1="56" x2="60" y2="60" stroke="#f87171" strokeWidth="1.5" opacity="0.6"/>
      <line x1="22" y1="56" x2="18" y2="60" stroke="#f87171" strokeWidth="1.5" opacity="0.6"/>
      {/* Crystal 1 */}
      <polygon points="14,30 18,22 22,30 18,38" fill="#34d399" stroke="#10b981" strokeWidth="0.8" opacity="0.9"/>
      {/* Crystal 2 */}
      <polygon points="60,20 63,14 66,20 63,26" fill="#22d3ee" stroke="#0891b2" strokeWidth="0.8" opacity="0.85"/>
      {/* Crystal 3 small */}
      <polygon points="68,50 70,45 72,50 70,55" fill="#a78bfa" stroke="#7c3aed" strokeWidth="0.7" opacity="0.8"/>
      {/* Neon ring */}
      <circle cx="40" cy="44" r="27" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.35"/>
    </svg>
  );
}

function ArenaIllustration({ glow }: { glow: string }) {
  return (
    <svg width="80" height="76" viewBox="0 0 80 76" fill="none" style={{ filter: `drop-shadow(0 0 10px ${glow})` }}>
      <defs>
        <radialGradient id="arenaGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Glow background */}
      <circle cx="40" cy="38" r="28" fill="url(#arenaGlow)"/>
      {/* Arena diamond outline */}
      <polygon points="40,6 70,38 40,70 10,38" stroke="#fbbf24" strokeWidth="1.8" fill="rgba(245,158,11,0.06)" strokeLinejoin="round"/>
      {/* Inner diamond */}
      <polygon points="40,16 60,38 40,60 20,38" stroke="#d97706" strokeWidth="1" fill="rgba(217,119,6,0.05)" strokeLinejoin="round" strokeDasharray="3 2"/>
      {/* Pulse ring 1 */}
      <circle cx="40" cy="38" r="12" stroke="#fbbf24" strokeWidth="0.8" opacity="0.5">
        <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
      </circle>
      {/* Pulse ring 2 */}
      <circle cx="40" cy="38" r="8" stroke="#fbbf24" strokeWidth="0.8" opacity="0.4">
        <animate attributeName="r" values="8;16;8" dur="2s" begin="0.7s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" begin="0.7s" repeatCount="indefinite"/>
      </circle>
      {/* Center sphere */}
      <circle cx="40" cy="38" r="9" fill="url(#sphereGrad)" stroke="#fbbf24" strokeWidth="1.2"/>
      <defs>
        <radialGradient id="sphereGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fde68a"/>
          <stop offset="50%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#92400e"/>
        </radialGradient>
      </defs>
      <circle cx="37" cy="35" r="2.5" fill="rgba(255,255,255,0.3)"/>
      {/* Corner accents */}
      <circle cx="40" cy="6" r="2.5" fill="#fbbf24" opacity="0.9"/>
      <circle cx="70" cy="38" r="2.5" fill="#fbbf24" opacity="0.9"/>
      <circle cx="40" cy="70" r="2.5" fill="#fbbf24" opacity="0.9"/>
      <circle cx="10" cy="38" r="2.5" fill="#fbbf24" opacity="0.9"/>
    </svg>
  );
}

function SpinIllustration({ glow }: { glow: string }) {
  const colors = ["#1d4ed8","#dc2626","#15803d","#b45309","#6d28d9","#0e7490","#be185d","#065f46"];
  const n = colors.length;
  const cx = 40; const cy = 42; const r = 26; const inner = 9;
  const slices = colors.map((color, i) => {
    const startAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return { color, d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z` };
  });
  return (
    <svg width="80" height="76" viewBox="0 0 80 76" fill="none" style={{ filter: `drop-shadow(0 0 10px ${glow})` }}>
      <defs>
        <radialGradient id="spinGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="32" fill="url(#spinGlow)"/>
      {/* Wheel outer ring */}
      <circle cx={cx} cy={cy} r={r + 3} fill="rgba(30,45,69,0.8)" stroke="#22d3ee" strokeWidth="1.5"/>
      {/* Slices */}
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
      ))}
      {/* Center hub */}
      <circle cx={cx} cy={cy} r={inner} fill="#0a0f1e" stroke="#22d3ee" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r="4" fill="#22d3ee" opacity="0.8"/>
      {/* Pointer triangle */}
      <polygon points={`${cx},${cy - r - 10} ${cx - 6},${cy - r + 2} ${cx + 6},${cy - r + 2}`} fill="white" stroke="#22d3ee" strokeWidth="1"/>
      {/* Glow dots on rim */}
      {[0, 1, 2, 3].map(i => {
        const a = (i / 4) * 2 * Math.PI;
        return <circle key={i} cx={cx + (r+3) * Math.cos(a)} cy={cy + (r+3) * Math.sin(a)} r="2" fill="#22d3ee" opacity="0.7"/>;
      })}
    </svg>
  );
}

function GameCard({
  card, online, lang, onSelect, index,
}: {
  card: typeof GAME_CARDS[number];
  online: number;
  lang: Lang;
  onSelect: () => void;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const title = lang === "en" ? card.titleEn : card.titleRu;
  const desc  = lang === "en" ? card.descEn  : card.descRu;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        position: "relative",
        borderRadius: 20,
        background: pressed
          ? "rgba(14,18,26,0.99)"
          : hovered
          ? "rgba(18,24,36,0.98)"
          : "rgba(13,17,25,0.96)",
        cursor: "pointer",
        border: `1px solid ${pressed ? card.border : hovered ? card.border + "88" : "#1e2a3a"}`,
        boxShadow: pressed
          ? `0 2px 8px rgba(0,0,0,0.7)`
          : hovered
          ? `0 0 32px ${card.cardGlow}, 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)`
          : `0 0 20px ${card.cardGlow}, 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)`,
        transform: pressed ? "scale(0.965)" : "translateY(0)",
        animation: `fadeSlide 0.45s ease ${index * 0.09}s both`,
        transition: pressed
          ? "transform 0.08s ease, box-shadow 0.08s ease"
          : "transform 0.18s ease, box-shadow 0.28s ease, border-color 0.22s ease",
        minHeight: 100,
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
      }}
    >
      {/* Left accent bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: card.gradient, borderRadius: "20px 0 0 20px" }} />
      {/* Top shimmer */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 45%)", pointerEvents: "none" }} />
      {/* Bottom accent line */}
      <div style={{ position: "absolute", bottom: 0, left: "15%", right: "30%", height: 1, background: `linear-gradient(90deg, transparent, ${card.primary}55, transparent)` }} />

      {/* Text section */}
      <div style={{ flex: 1, padding: "16px 10px 16px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 7px rgba(34,197,94,0.8)", animation: "pulse-dot 2s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280" }}>{online} {translations[lang].games.onlineText}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 5 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 400, color: "#6B7280", lineHeight: 1.45 }}>{desc}</div>
      </div>

      {/* Illustration section */}
      <div style={{ width: 96, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, paddingRight: 4 }}>
        {card.id === "mines" && <MinesIllustration glow={card.glow} />}
        {card.id === "arena" && <ArenaIllustration glow={card.glow} />}
        {card.id === "spin"  && <SpinIllustration glow={card.glow} />}
      </div>
    </div>
  );
}

export default function GamesPage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const [active, setActive] = useState<ActiveGame>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const online = useOnlineCounts();

  /* History state */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyInitialTab, setHistoryInitialTab] = useState<HistoryGameTab>("arena");

  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { queryKey: getGetUserProfileQueryKey(telegramId ?? ""), enabled: !!telegramId, refetchInterval: 10000 },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });

  const lang: Lang = ((profile as any)?.language ?? "ru") as Lang;
  const tonBalance = Number(profile?.ton ?? 0);

  const showToast = (msg: string, type: "success"|"error"|"info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSelect = (card: typeof GAME_CARDS[number]) => {
    haptic("light");
    setActive(card.id as ActiveGame);
  };

  const openHistory = (tab: HistoryGameTab = "arena") => {
    setHistoryInitialTab(tab);
    setHistoryOpen(true);
  };

  /* Unified history modal */
  const historyModal = historyOpen && telegramId ? (
    <UnifiedHistoryModal
      telegramId={telegramId}
      initialTab={historyInitialTab}
      onClose={() => setHistoryOpen(false)}
    />
  ) : null;

  /* Arena is full-screen */
  if (active === "arena") {
    if (!telegramId) return null;
    return (
      <>
        {historyModal}
        <ArenaGame
          telegramId={telegramId}
          tonBalance={tonBalance}
          onBalanceChange={refresh}
          onClose={() => { setActive(null); refresh(); }}
          onOpenHistory={() => openHistory("arena")}
        />
      </>
    );
  }

  if (active) {
    const activeCard = GAME_CARDS.find(g => g.id === active);
    return (
      <div style={{ padding: "0 0 32px" }}>
        <style>{`
          @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }
          @keyframes fadeSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
          @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        `}</style>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        {historyModal}

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0", marginBottom: 6 }}>
          <button
            onClick={() => { haptic("light"); setActive(null); refresh(); }}
            style={{ background: "#151C26", border: "1px solid #222C3A", borderRadius: 10, padding: "7px 14px", color: "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
          >
            {translations[lang].games.back}
          </button>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#E5E7EB" }}>
            {activeCard && (lang === "en" ? activeCard.titleEn : activeCard.titleRu)}
          </div>
        </div>

        {!telegramId ? (
          <div style={{ textAlign: "center", padding: "52px 0", color: "#334155" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>
            <div style={{ fontSize: 14 }}>{translations[lang].games.openInTelegram}</div>
          </div>
        ) : active === "mines" ? (
          <div style={{ padding: "0 16px" }}>
            <MinesGame telegramId={telegramId} balance={tonBalance} lang={lang} onBalanceChange={refresh} />
          </div>
        ) : active === "spin" ? (
          <SpinGame
            telegramId={telegramId}
            tonBalance={tonBalance}
            onBalanceChange={refresh}
            onOpenHistory={() => openHistory("spin")}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 32px", background: "#0B0F14", minHeight: "100vh" }}>
      <SectionBar gradient="linear-gradient(135deg, #14532d 0%, #16a34a 100%)" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }
        @keyframes fadeSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      `}</style>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {historyModal}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.03em" }}>{translations[lang].games.title}</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>{translations[lang].games.subtitle}</div>
        </div>
      </div>

      <div data-tour="games-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {GAME_CARDS.map((card, i) => (
          <GameCard
            key={card.id}
            card={card}
            online={online[card.id] ?? card.baseOnline}
            lang={lang}
            onSelect={() => handleSelect(card)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}
