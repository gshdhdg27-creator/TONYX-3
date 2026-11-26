/**
 * PickaxeGame — Craft & Drop style
 * artifacts/mini-app/src/components/PickaxeGame.tsx
 */
import { useCallback, useEffect, useRef, useState } from "react";

type PickTier = "wood" | "stone" | "iron" | "diamond" | null;
type Phase = "idle" | "spinning" | "craft" | "falling" | "result";
type ReelSym = "x" | "wood" | "stone" | "iron" | "diamond";
type FloatText = { id: number; text: string; color: string; x: number; y: number };
type Particle = { id: number; x: number; y: number; vx: number; vy: number; color: string; life: number; size: number };
type MineBlock = {
  id: number;
  kind: "dirt" | "stone" | "copper" | "redstone" | "gold" | "diamond" | "emerald" | "bench" | "arrow" | "tnt" | "slime";
  broken: boolean;
  flash: boolean;
};

const TIER_HP = { wood: 100, stone: 150, iron: 200, diamond: 400 } as const;
const TIER_LABEL = { wood: "Деревянная", stone: "Каменная", iron: "Железная", diamond: "Алмазная" };
const TIER_COLOR = { wood: "#b45309", stone: "#94a3b8", iron: "#e2e8f0", diamond: "#22d3ee" };
const REEL_EMOJI: Record<ReelSym, string> = { x: "🚫", wood: "🪓", stone: "⛏️", iron: "⚒️", diamond: "💎" };
const BLOCK_EMOJI: Record<MineBlock["kind"], string> = {
  dirt: "🟫", stone: "⬛", copper: "🟠", redstone: "🔴", gold: "🟡",
  diamond: "💠", emerald: "🟢", bench: "🛠️", arrow: "⬆️", tnt: "💣", slime: "🟩",
};
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const API = "/api/mini/games/pickaxe";

function randReel(): ReelSym[] {
  const pool: ReelSym[] = ["x", "x", "x", "wood", "wood", "stone", "stone", "iron", "diamond"];
  return Array.from({ length: 5 }, () => pool[Math.floor(Math.random() * pool.length)]);
}

function makeMine(rows = 6, cols = 5): MineBlock[][] {
  const kinds: MineBlock["kind"][] = [
    "dirt", "dirt", "dirt", "stone", "stone", "copper", "copper", "redstone",
    "gold", "diamond", "emerald", "bench", "arrow", "tnt", "slime",
  ];
  const w = [18, 18, 18, 12, 12, 8, 8, 5, 4, 2, 1, 3, 3, 2, 2];
  const tot = w.reduce((a, b) => a + b, 0);
  const pick = (): MineBlock["kind"] => {
    let r = Math.random() * tot;
    for (let i = 0; i < kinds.length; i++) { r -= w[i]; if (r <= 0) return kinds[i]; }
    return "dirt";
  };
  let id = 0;
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ id: id++, kind: pick(), broken: false, flash: false }))
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PickaxeGame({
  telegramId,
  balance,
  onBalanceChange,
  onBack,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange?: () => void;
  onBack?: () => void;
}) {
  const [bet, setBet] = useState(0.5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reel, setReel] = useState<ReelSym[]>(["x", "wood", "wood", "stone", "diamond"]);
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [mine, setMine] = useState<MineBlock[][]>(() => makeMine());
  const [pickCol, setPickCol] = useState(2);
  const [pickRow, setPickRow] = useState(-1);
  const [lastWin, setLastWin] = useState(0);
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [online] = useState(() => 10 + Math.floor(Math.random() * 20));
  const [error, setError] = useState<string | null>(null);
  const [multTrack, setMultTrack] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [localBal, setLocalBal] = useState(balance);
  const pid = useRef(0);
  const mineRef = useRef(mine);
  mineRef.current = mine;

  useEffect(() => setLocalBal(balance), [balance]);
  const bal = localBal;

  const addFloat = useCallback((text: string, color: string, x = 50, y = 40) => {
    const id = ++pid.current;
    setFloats((f) => [...f, { id, text, color, x, y }]);
    setTimeout(() => setFloats((f) => f.filter((t) => t.id !== id)), 1200);
  }, []);

  const burst = useCallback((x: number, y: number, color: string, n = 8) => {
    const batch: Particle[] = [];
    for (let i = 0; i < n; i++) {
      batch.push({
        id: ++pid.current, x, y,
        vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3 - 1,
        color, life: 40 + Math.random() * 20, size: 3 + Math.random() * 4,
      });
    }
    setParticles((p) => [...p, ...batch]);
  }, []);

  useEffect(() => {
    if (!particles.length) return;
    const t = setInterval(() => {
      setParticles((prev) =>
        prev.map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 1 }))
          .filter((p) => p.life > 0)
      );
    }, 30);
    return () => clearInterval(t);
  }, [particles.length > 0]);

  const runFallAnimation = useCallback(async (t: Exclude<PickTier, null>) => {
    setPhase("falling");
    setPickRow(-1);
    setPickCol(2);
    let curHp = TIER_HP[t];
    setHp(curHp);
    setMaxHp(curHp);
    const grid = makeMine();
    setMine(grid);
    mineRef.current = grid;

    await sleep(400);
    setPickRow(0);
    await sleep(350);

    const rows = 6, cols = 5;
    let col = 2;

    for (let r = 0; r < rows && curHp > 0; r++) {
      setPickRow(r);
      setPickCol(col);
      await sleep(280);

      const kind = mineRef.current[r]?.[col]?.kind ?? "dirt";
      setMine((m) => {
        const next = m.map((row) => row.map((b) => ({ ...b })));
        const c = next[r]?.[col];
        if (c && !c.broken) { c.flash = true; c.broken = true; }
        return next;
      });

      const cx = 20 + col * 15;
      const cy = 28 + r * 8;

      if (kind === "tnt") {
        burst(cx, cy, "#ef4444", 14);
        addFloat("💥 BOOM", "#ef4444", cx, cy);
        setMine((m) => {
          const next = m.map((row) => row.map((b) => ({ ...b })));
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const cell = next[r + dr]?.[col + dc];
              if (cell) { cell.broken = true; cell.flash = true; }
            }
          return next;
        });
        curHp = Math.max(0, curHp - 8);
      } else if (kind === "slime") {
        burst(cx, cy, "#4ade80", 10);
        addFloat("↗ BOUNCE", "#4ade80", cx, cy);
        col = Math.max(0, Math.min(cols - 1, col + (Math.random() > 0.5 ? 1 : -1)));
        setPickCol(col);
        curHp = Math.max(0, curHp - 1);
      } else if (kind === "bench") {
        burst(cx, cy, "#22c55e", 12);
        addFloat<fim-prefix>"🛠️ REPAIR", "#22c55e", cx, cy);
        curHp = TIER_HP[t];
        setHp(curHp);
      } else if (kind === "arrow") {
        burst(cx, cy, "#facc15", 10);
        addFloat("⬆️ SIZE+", "#facc15", cx, cy);
        curHp = Math.max(0, curHp - 1);
      } else {
        const multMap: Partial<Record<string, number>> = {
          copper: 0.02, redstone: 0.08, gold: 0.25, diamond: 0.8, emerald: 2.5,
        };
        const m = multMap[kind];
        if (m) {
          burst(cx, cy, TIER_COLOR[t], 8);
          addFloat(`+${(bet * m).toFixed(3)}`, "#4ade80", cx, cy);
        } else {
          burst(cx, cy, "#78716c", 5);
        }
        curHp = Math.max(0, curHp - 1);
      }

      setHp(curHp);
      await sleep(120);
      setMine((m) => m.map((row) => row.map((b) => ({ ...b, flash: false }))));
    }

    setPhase("result");
    setShowResult(true);
  }, [addFloat, bet, burst]);

  const play = useCallback(async () => {
    if (phase !== "idle" && phase !== "result") return;
    if (bet <= 0 || bet > bal) { setError("Недостаточно средств"); return; }
    setError(null);
    setShowResult(false);
    setLastWin(0);
    setPhase("spinning");
    setTier(null);
    setPickRow(-1);

    let ticks = 0;
    const spinIv = setInterval(() => {
      setReel(randReel());
      ticks++;
      if (ticks > 14) clearInterval(spinIv);
    }, 70);

    try {
      const res = await fetch(`${API}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, bet }),
      });
      const data = await res.json();
      clearInterval(spinIv);

      if (!res.ok) {
        setError(data.error || data.message || "Ошибка");
        setPhase("idle");
        return;
      }

      const serverTier: PickTier = data.tier ?? null;
      let finalReel: ReelSym[];
      if (serverTier) {
        finalReel = [serverTier, serverTier, serverTier, "x", serverTier] as ReelSym[];
        finalReel = finalReel.sort(() => Math.random() - 0.5);
      } else {
        finalReel = ["x", "x", "x", "x", "x"];
      }
      setReel(finalReel);
      setTier(serverTier);

      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }

      const win = Number(data.payout) || 0;
      setLastWin(win);

      if (!serverTier) {
        setMultTrack((m) => Math.min(7, m + 1));
        setPhase("result");
        setShowResult(true);
        addFloat("ПУСТО", "#ef4444", 50, 35);
        return;
      }

      setMultTrack(0);
      setPhase("craft");
      await sleep(600);
      await runFallAnimation(serverTier);
      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }
    } catch {
      clearInterval(spinIv);
      setError("Сеть недоступна");
      setPhase("idle");
    }
  }, [phase, bet, bal, telegramId, onBalanceChange, runFallAnimation, addFloat]);

  const busy = phase === "spinning" || phase === "craft" || phase === "falling";

  return (
    <div style={S.root}>
      <div style={S.sky}>
        <div style={S.cloud1} />
        <div style={S.cloud2} />
        <div style={S.hillL} />
        <div style={S.hillR} />
        <div style={S.tree1}>🌲</div>
        <div style={S.tree2}>🌳</div>
      </div>

      <div style={S.topBar}>
        {onBack && <button type="button" style={S.backBtn} onClick={onBack}>←</button>}
        <div style={S.online}><span style={S.onlineDot} />Онлайн: {online}</div>
      </div>

      <div style={S.logoWrap}>
        <div style={S.logo}>
          <span style={S.logoCraft}>CRAFT</span>
          <span style={S.logoAnd}>&</span>
          <span style={S.logoDrop}>DROP</span>
        </div>
      </div>

      <div style={S.trackWrap}>
        <div style={S.track}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              ...S.trackCell,
              background: i < multTrack ? "#facc15" : "#1e1b1b",
              boxShadow: i < multTrack ? "0 0 6px #facc15" : "none",
            }} />
          ))}
          <span style={S.trackArrow}>↗</span>
        </div>
      </div>

      <div style={S.reelFrame}>
        <div style={S.reelInner}>
          {reel.map((sym, i) => (
            <div key={i} style={{
              ...S.reelCell,
              animation: phase === "spinning" ? "pdSpin 0.08s linear infinite" : "none",
              borderColor: sym === "x" ? "#7f1d1d" : "#4b5563",
              background: sym === "x"
                ? "linear-gradient(180deg,#3f1a1a,#1c1010)"
                : sym === "diamond"
                ? "linear-gradient(180deg,#164e63,#0c4a6e)"
                : "linear-gradient(180deg,#3f3f46,#27272a)",
            }}>
              <span style={{ fontSize: sym === "x" ? 22 : 26, filter: "drop-shadow(0 1px 0 #000)" }}>
                {REEL_EMOJI[sym]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.field}>
        {floats.map((f) => (
          <div key={f.id} style={{ ...S.float, left: `${f.x}%`, top: `${f.y}%`, color: f.color }}>{f.text}</div>
        ))}
        {particles.map((p) => (
          <div key={p.id} style={{
            position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size, borderRadius: 1, background: p.color,
            opacity: Math.min(1, p.life / 20), pointerEvents: "none", zIndex: 20,
          }} />
        ))}

        {tier && pickRow >= -1 && (phase === "falling" || phase === "craft") && (
          <div style={{
            ...S.pickaxe,
            left: `${18 + pickCol * 14}%`,
            top: pickRow < 0 ? "8%" : `${22 + pickRow * 9}%`,
            color: TIER_COLOR[tier],
            transition: "top 0.25s ease-in, left 0.2s ease",
          }}>
            ⛏️
            {maxHp > 0 && (
              <div style={S.hpBarWrap}>
                <div style={{
                  ...S.hpBar,
                  width: `${(hp / maxHp) * 100}%`,
                  background: hp / maxHp > 0.5 ? "#22c55e" : hp / maxHp > 0.25 ? "#eab308" : "#ef4444",
                }} />
              </div>
            )}
          </div>
        )}

        {(phase === "falling" || (phase === "result" && tier)) && (
          <div style={S.mineGrid}>
            {mine.map((row, ri) => (
              <div key={ri} style={S.mineRow}>
                {row.map((b) => (
                  <div key={b.id} style={{
                    ...S.mineCell,
                    opacity: b.broken ? 0.15 : 1,
                    transform: b.flash ? "scale(1.15)" : "scale(1)",
                    filter: b.flash ? "brightness(1.8)" : "none",
                  }}>
                    {b.broken ? "" : BLOCK_EMOJI[b.kind]}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {(phase === "idle" || phase === "spinning" || phase === "craft" || (phase === "result" && !tier)) && (
          <div style={S.platform}><div style={S.platformFace}>▦</div></div>
        )}

        <div style={S.chicken}><span style={{ fontSize: 48, filter: "drop-shadow(2px 3px 0 #0006)" }}>🐔</span></div>
      </div>

      <div style={S.ground}>
        <div style={S.grass} />
        <div style={S.dirt} />
      </div>

      <div style={S.bonusWrap}>
        <button type="button" style={S.bonusBtn} disabled title="Скоро">🛒 BUY BONUS</button>
        <div style={S.hint}>
          {phase === "idle" && "СДЕЛАЙТЕ СВОЮ СТАВКУ!"}
          {phase === "spinning" && "КРУТИМ..."}
          {phase === "craft" && tier && `КИРКА: ${TIER_LABEL[tier]}`}
          {phase === "falling" && `HP ${hp}/${maxHp}`}
          {phase === "result" && (lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "ПУСТО")}
        </div>
      </div>

      <div style={S.controls}>
        <button type="button" style={S.sideBtn} onClick={onBack} title="Меню">☰</button>
        <button type="button" style={S.sideBtn} disabled={busy} title="Авто">▶</button>
        <button
          type="button"
          style={{ ...S.spinBtn, opacity: busy || bet > bal ? 0.55 : 1, transform: phase === "spinning" ? "scale(0.94)" : "scale(1)" }}
          disabled={busy || bet > bal}
          onClick={play}
        >
          <span style={{ fontSize: 32 }}>↻</span>
        </button>
        <button type="button" style={S.sideBtn} disabled={busy} onClick={() => setBet((b) => Math.max(0.1, +(b / 2).toFixed(2)))}>½</button>
        <button type="button" style={S.sideBtn} disabled={busy} onClick={() => setBet((b) => Math.min(bal, +(b * 2).toFixed(2)))}>2×</button>
      </div>

      <div style={S.presets}>
        {PRESETS.map((p) => (
          <button key={p} type="button" style={{
            ...S.preset,
            borderColor: bet === p ? "#22c55e" : "#3f3f46",
            color: bet === p ? "#4ade80" : "#a1a1aa",
          }} disabled={busy} onClick={() => setBet(p)}>{p}</button>
        ))}
      </div>

      <div style={S.footer}>
        <div style={S.stat}>
          <span style={S.statLabel}>БАЛАНС</span>
          <span style={S.statVal}>{bal.toFixed(2)} TON</span>
        </div>
        <div style={S.stat}>
          <span style={S.statLabel}>СТАВКА</span>
          <span style={S.statVal}>{bet.toFixed(2)} TON</span>
        </div>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {showResult && phase === "result" && (
        <div style={S.resultOverlay} onClick={() => { setShowResult(false); setPhase("idle"); }}>
          <div style={S.resultCard}>
            {tier ? (
              <>
                <div style={{ fontSize: 40 }}>{REEL_EMOJI[tier]}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: TIER_COLOR[tier] }}>{TIER_LABEL[tier]}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: lastWin > 0 ? "#4ade80" : "#f87171" }}>
                  {lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "0 TON"}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40 }}>🚫</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#f87171" }}>ПУСТО</div>
                <div style={{ fontSize: 14, color: "#a1a1aa" }}>Кирка не выпала</div>
              </>
            )}
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 8 }}>нажми чтобы продолжить</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pdSpin { 0%{transform:translateY(0)} 50%{transform:translateY(-3px)} 100%{transform:translateY(0)} }
        @keyframes pdFloat { 0%{opacity:1;transform:translate(-50%,-50%) translateY(0)} 100%{opacity:0;transform:translate(-50%,-50%) translateY(-28px)} }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { position: "relative", width: "100%", maxWidth: 420, margin: "0 auto", minHeight: "100dvh", background: "#0c1222", overflow: "hidden", fontFamily: "system-ui,-apple-system,sans-serif", color: "#fff", userSelect: "none" },
  sky: { position: "absolute", inset: 0, background: "linear-gradient(180deg,#5ec8f0 0%,#87d8f8 40%,#b8e8ff 70%,#d4f0ff 100%)", zIndex: 0 },
  cloud1: { position: "absolute", top: "6%", left: "8%", width: 70, height: 28, borderRadius: 20, background: "#fff", opacity: 0.85, boxShadow: "30px 8px 0 #fff,50px 4px 0 #fff" },
  cloud2: { position: "absolute", top: "12%", right: "12%", width: 50, height: 22, borderRadius: 16, background: "#fff", opacity: 0.75, boxShadow: "22px 6px 0 #fff" },
  hillL: { position: "absolute", bottom: "28%", left: "-10%", width: "55%", height: "35%", background: "linear-gradient(180deg,#5a9e3a,#3d7a28)", borderRadius: "50% 50% 0 0", opacity: 0.9 },
  hillR: { position: "absolute", bottom: "28%", right: "-15%", width: "60%", height: "40%", background: "linear-gradient(180deg,#4d8f32,#356b22)", borderRadius: "50% 50% 0 0", opacity: 0.95 },
  tree1: { position: "absolute", bottom: "38%", left: "8%", fontSize: 28, opacity: 0.85 },
  tree2: { position: "absolute", bottom: "42%", right: "18%", fontSize: 32, opacity: 0.9 },
  topBar: { position: "relative", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 12px 0" },
  backBtn: { position: "absolute", left: 12, background: "rgba(0,0,0,0.35)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer" },
  online: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(15,10,30,0.75)", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
  onlineDot: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" },
  logoWrap: { position: "relative", zIndex: 5, textAlign: "center", marginTop: 8 },
  logo: { display: "inline-block", fontWeight: 900, letterSpacing: 1, lineHeight: 1, textShadow: "0 3px 0 #1a1a1a,0 5px 8px rgba(0,0,0,0.35)" },
  logoCraft: { display: "block", fontSize: 28, color: "#fff", WebkitTextStroke: "1px #1c1917" },
  logoAnd: { fontSize: 16, color: "#fbbf24", margin: "0 2px", verticalAlign: "super" },
  logoDrop: { display: "block", fontSize: 28, color: "#fff", WebkitTextStroke: "1px #1c1917", marginTop: -2 },
  trackWrap: { position: "relative", zIndex: 5, display: "flex", justifyContent: "center", marginTop: 10 },
  track: { display: "flex", alignItems: "center", gap: 4, background: "linear-gradient(180deg,#5a4a3a,#3d3228)", border: "3px solid #2a2118", borderRadius: 8, padding: "6px 10px", boxShadow: "inset 0 2px 0 #7a6a55,0 3px 0 #1a140f" },
  trackCell: { width: 18, height: 14, borderRadius: 3, border: "1px solid #0a0a0a" },
  trackArrow: { marginLeft: 4, fontSize: 14, color: "#facc15" },
  reelFrame: { position: "relative", zIndex: 5, margin: "12px 20px 0", background: "linear-gradient(180deg,#6b7280,#4b5563)", borderRadius: 10, padding: 6, border: "3px solid #374151", boxShadow: "inset 0 2px 0 #9ca3af,0 4px 0 #1f2937,0 8px 20px rgba(0,0,0,0.35)" },
  reelInner: { display: "flex", gap: 5, background: "#1c1917", borderRadius: 6, padding: 5 },
  reelCell: { flex: 1, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "2px solid #4b5563", minHeight: 48 },
  field: { position: "relative", zIndex: 5, height: 200, marginTop: 8 },
  float: { position: "absolute", transform: "translate(-50%,-50%)", fontWeight: 900, fontSize: 14, textShadow: "0 2px 0 #000,0 0 8px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 30, animation: "pdFloat 1.1s ease-out forwards" },
  pickaxe: { position: "absolute", fontSize: 36, transform: "translateX(-50%)", zIndex: 15, filter: "drop-shadow(0 3px 2px rgba(0,0,0,0.5))" },
  hpBarWrap: { width: 36, height: 5, background: "#1c1917", borderRadius: 3, margin: "2px auto 0", overflow: "hidden", border: "1px solid #000" },
  hpBar: { height: "100%", borderRadius: 2, transition: "width 0.15s" },
  mineGrid: { position: "absolute", left: "50%", top: "18%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2, zIndex: 8 },
  mineRow: { display: "flex", gap: 2 },
  mineCell: { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: "rgba(0,0,0,0.25)", borderRadius: 4, transition: "transform 0.1s, opacity 0.2s" },
  platform: { position: "absolute", left: "50%", top: "42%", transform: "translateX(-50%)", zIndex: 6 },
  platformFace: { width: 52, height: 52, background: "linear-gradient(180deg,#c4a574,#8b6914)", border: "3px solid #5c4a1e", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#5c4a1e", boxShadow: "0 4px 0 #3d3214,0 6px 12px rgba(0,0,0,0.3)" },
  chicken: { position: "absolute", right: "8%", bottom: "8%", zIndex: 7 },
  ground: { position: "relative", zIndex: 4, marginTop: -4 },
  grass: { height: 14, background: "linear-gradient(180deg,#5cbf3a,#3d8b37)", boxShadow: "inset 0 3px 0 #7dce6a" },
  dirt: { height: 28, background: "linear-gradient(180deg,#9a6a3a,#6b4423)", borderTop: "2px solid #5a3a1a" },
  bonusWrap: { position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 10 },
  bonusBtn: { background: "linear-gradient(180deg,#d4a017,#a67c00)", border: "2px solid #7a5c00", borderRadius: 8, color: "#1a1400", fontWeight: 800, fontSize: 13, padding: "8px 20px", cursor: "not-allowed", opacity: 0.7, boxShadow: "0 3px 0 #5c4400" },
  hint: { fontSize: 11, fontWeight: 700, color: "#e2e8f0", textShadow: "0 1px 2px #000", letterSpacing: 0.5 },
  controls: { position: "relative", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 12, padding: "0 12px" },
  sideBtn: { width: 42, height: 42, borderRadius: "50%", border: "2px solid #3f3f46", background: "linear-gradient(180deg,#3f3f46,#27272a)", color: "#e4e4e7", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 3px 0 #18181b" },
  spinBtn: { width: 72, height: 72, borderRadius: "50%", border: "3px solid #166534", background: "linear-gradient(180deg,#4ade80,#16a34a)", color: "#052e16", cursor: "pointer", boxShadow: "0 5px 0 #14532d,0 8px 20px rgba(22,163,74,0.4)", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.1s, opacity 0.15s" },
  presets: { position: "relative", zIndex: 5, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5, marginTop: 10, padding: "0 12px" },
  preset: { background: "rgba(0,0,0,0.35)", border: "1px solid #3f3f46", borderRadius: 6, color: "#a1a1aa", fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer" },
  footer: { position: "relative", zIndex: 5, display: "flex", justifyContent: "space-between", padding: "12px 20px 20px" },
  stat: { display: "flex", flexDirection: "column", gap: 2 },
  statLabel: { fontSize: 10, fontWeight: 700, color: "#a1a1aa", letterSpacing: 1 },
  statVal: { fontSize: 16, fontWeight: 800, color: "#fafafa" },
  error: { position: "relative", zIndex: 10, margin: "0 16px 12px", background: "rgba(127,29,29,0.9)", borderRadius: 8, padding: "8px 12px", fontSize: 13, textAlign: "center" },
  resultOverlay: { position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" },
  resultCard: { background: "linear-gradient(180deg,#1e293b,#0f172a)", border: "2px solid #334155", borderRadius: 16, padding: "24px 32px", textAlign: "center", minWidth: 200, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" },
};
