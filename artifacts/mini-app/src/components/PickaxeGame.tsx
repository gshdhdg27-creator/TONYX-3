/**
 * PickaxeGame — Craft & Drop style (compact)
 */
import { useCallback, useEffect, useRef, useState } from "react";

type PickTier = "wood" | "stone" | "iron" | "diamond" | null;
type Phase = "idle" | "spinning" | "craft" | "falling" | "result";
type ReelSym = "x" | "wood" | "stone" | "iron" | "diamond";

const TIER_HP = { wood: 100, stone: 150, iron: 200, diamond: 400 } as const;
const TIER_LABEL = { wood: "Деревянная", stone: "Каменная", iron: "Железная", diamond: "Алмазная" };
const TIER_COLOR = { wood: "#b45309", stone: "#94a3b8", iron: "#e2e8f0", diamond: "#22d3ee" };
const REEL_EMOJI: Record<ReelSym, string> = { x: "🚫", wood: "🪓", stone: "⛏️", iron: "⚒️", diamond: "💎" };
const BLOCKS = ["🟫","⬛","🟠","🔴","🟡","💠","🟢","🛠️","⬆️","💣","🟩"] as const;
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const API = "/api/mini/games/pickaxe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randReel(): ReelSym[] {
  const p: ReelSym[] = ["x","x","x","wood","wood","stone","stone","iron","diamond"];
  return Array.from({ length: 5 }, () => p[Math.floor(Math.random() * p.length)]);
}

export default function PickaxeGame({
  telegramId, balance, onBalanceChange, onBack,
}: {
  telegramId: string; balance: number; onBalanceChange?: () => void; onBack?: () => void;
}) {
  const [bet, setBet] = useState(0.5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reel, setReel] = useState<ReelSym[]>(["x","wood","wood","stone","diamond"]);
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [pickRow, setPickRow] = useState(-1);
  const [pickCol, setPickCol] = useState(2);
  const [lastWin, setLastWin] = useState(0);
  const [online] = useState(() => 10 + Math.floor(Math.random() * 20));
  const [error, setError] = useState<string | null>(null);
  const [multTrack, setMultTrack] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [localBal, setLocalBal] = useState(balance);
  const [floatMsg, setFloatMsg] = useState<string | null>(null);
  const [mine, setMine] = useState(() =>
    Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => BLOCKS[Math.floor(Math.random()*BLOCKS.length)]))
  );
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  useEffect(() => setLocalBal(balance), [balance]);
  const bal = localBal;
  const busy = phase === "spinning" || phase === "craft" || phase === "falling";

  const flash = (msg: string) => {
    setFloatMsg(msg);
    setTimeout(() => setFloatMsg(null), 900);
  };

  const runFall = useCallback(async (t: Exclude<PickTier, null>) => {
    setPhase("falling");
    setPickRow(-1); setPickCol(2);
    let cur = TIER_HP[t];
    setHp(cur); setMaxHp(cur);
    setMine(Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => BLOCKS[Math.floor(Math.random()*BLOCKS.length)])));
    setBroken(new Set());
    await sleep(400); setPickRow(0); await sleep(300);
    let col = 2;
    for (let r = 0; r < 6 && cur > 0; r++) {
      setPickRow(r); setPickCol(col);
      await sleep(260);
      const key = `${r},${col}`;
      setBroken((s) => new Set(s).add(key));
      const cell = mine[r]?.[col] ?? "🟫";
      if (cell === "💣") { flash("💥 BOOM"); cur = Math.max(0, cur - 8); }
      else if (cell === "🟩") { flash("↗ BOUNCE"); col = Math.max(0, Math.min(4, col + (Math.random()>0.5?1:-1))); cur = Math.max(0, cur - 1); }
      else if (cell === "🛠️") { flash("🛠️ REPAIR"); cur = TIER_HP[t]; }
      else if (cell === "⬆️") { flash("⬆️ SIZE+"); cur = Math.max(0, cur - 1); }
      else if (["🟠","🔴","🟡","💠","🟢"].includes(cell)) { flash(`+ore`); cur = Math.max(0, cur - 1); }
      else { cur = Math.max(0, cur - 1); }
      setHp(cur);
      await sleep(100);
    }
    setPhase("result"); setShowResult(true);
  }, [mine]);

  const play = useCallback(async () => {
    if (busy) return;
    if (bet <= 0 || bet > bal) { setError("Недостаточно средств"); return; }
    setError(null); setShowResult(false); setLastWin(0);
    setPhase("spinning"); setTier(null); setPickRow(-1);
    let ticks = 0;
    const iv = setInterval(() => { setReel(randReel()); if (++ticks > 14) clearInterval(iv); }, 70);
    try {
      const res = await fetch(`${API}/play`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, bet }),
      });
      const data = await res.json();
      clearInterval(iv);
      if (!res.ok) { setError(data.error || data.message || "Ошибка"); setPhase("idle"); return; }
      const st: PickTier = data.tier ?? null;
      if (st) {
        const fr = [st, st, st, "x", st] as ReelSym[];
        setReel(fr.sort(() => Math.random() - 0.5));
      } else setReel(["x","x","x","x","x"]);
      setTier(st);
      if (typeof data.balance === "number") { setLocalBal(data.balance); onBalanceChange?.(); }
      setLastWin(Number(data.payout) || 0);
      if (!st) {
        setMultTrack((m) => Math.min(7, m + 1));
        setPhase("result"); setShowResult(true); flash("ПУСТО");
        return;
      }
      setMultTrack(0); setPhase("craft");
      await sleep(500);
      await runFall(st);
      if (typeof data.balance === "number") { setLocalBal(data.balance); onBalanceChange?.(); }
    } catch {
      clearInterval(iv); setError("Сеть недоступна"); setPhase("idle");
    }
  }, [busy, bet, bal, telegramId, onBalanceChange, runFall]);

  return (
    <div style={S.root}>
      <div style={S.sky} />
      <div style={S.topBar}>
        {onBack && <button type="button" style={S.back} onClick={onBack}>←</button>}
        <div style={S.online}><span style={S.dot} />Онлайн: {online}</div>
      </div>
      <div style={S.logo}>CRAFT <span style={{ color: "#fbbf24" }}>&</span> DROP</div>
      <div style={S.track}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...S.cell, background: i < multTrack ? "#facc15" : "#1e1b1b" }} />
        ))}
        <span style={{ color: "#facc15", marginLeft: 4 }}>↗</span>
      </div>
      <div style={S.reelFrame}>
        {reel.map((sym, i) => (
          <div key={i} style={{
            ...S.reelCell,
            background: sym === "x" ? "#3f1a1a" : sym === "diamond" ? "#0c4a6e" : "#27272a",
          }}>{REEL_EMOJI[sym]}</div>
        ))}
      </div>
      <div style={S.field}>
        {floatMsg && <div style={S.float}>{floatMsg}</div>}
        {tier && (phase === "falling" || phase === "craft") && (
          <div style={{
            position: "absolute", left: `${18 + pickCol * 14}%`,
            top: pickRow < 0 ? "6%" : `${20 + pickRow * 10}%`,
            fontSize: 34, transform: "translateX(-50%)", transition: "top .25s ease-in, left .2s",
            filter: "drop-shadow(0 2px 2px #0008)", zIndex: 10,
          }}>
            ⛏️
            <div style={{ width: 36, height: 4, background: "#111", borderRadius: 2, margin: "2px auto 0" }}>
              <div style={{
                height: "100%", borderRadius: 2, width: `${maxHp ? (hp / maxHp) * 100 : 0}%`,
                background: hp / maxHp > 0.5 ? "#22c55e" : hp / maxHp > 0.25 ? "#eab308" : "#ef4444",
              }} />
            </div>
          </div>
        )}
        {(phase === "falling" || (phase === "result" && tier)) && (
          <div style={S.mine}>
            {mine.map((row, ri) => (
              <div key={ri} style={{ display: "flex", gap: 2 }}>
                {row.map((b, ci) => (
                  <div key={ci} style={{
                    width: 26, height: 26, fontSize: 16, display: "flex", alignItems: "center",
                    justifyContent: "center", opacity: broken.has(`${ri},${ci}`) ? 0.15 : 1,
                    background: "rgba(0,0,0,.2)", borderRadius: 3,
                  }}>{broken.has(`${ri},${ci}`) ? "" : b}</div>
                ))}
              </div>
            ))}
          </div>
        )}
        {(phase === "idle" || phase === "spinning" || phase === "craft" || (phase === "result" && !tier)) && (
          <div style={S.platform}>▦</div>
        )}
        <div style={S.chicken}>🐔</div>
      </div>
      <div style={S.ground}>
        <div style={{ height: 12, background: "linear-gradient(180deg,#5cbf3a,#3d8b37)" }} />
        <div style={{ height: 24, background: "linear-gradient(180deg,#9a6a3a,#6b4423)" }} />
      </div>
      <div style={S.bonus}>
        <button type="button" style={S.bonusBtn} disabled>🛒 BUY BONUS</button>
        <div style={S.hint}>
          {phase === "idle" && "СДЕЛАЙТЕ СВОЮ СТАВКУ!"}
          {phase === "spinning" && "КРУТИМ..."}
          {phase === "craft" && tier && `КИРКА: ${TIER_LABEL[tier]}`}
          {phase === "falling" && `HP ${hp}/${maxHp}`}
          {phase === "result" && (lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "ПУСТО")}
        </div>
      </div>
      <div style={S.controls}>
        <button type="button" style={S.side} onClick={onBack}>☰</button>
        <button type="button" style={S.side} disabled={busy}>▶</button>
        <button type="button" style={{ ...S.spin, opacity: busy || bet > bal ? 0.55 : 1 }}
          disabled={busy || bet > bal} onClick={() => void play()}>
          <span style={{ fontSize: 30 }}>↻</span>
        </button>
        <button type="button" style={S.side} disabled={busy}
          onClick={() => setBet((b) => Math.max(0.1, +(b / 2).toFixed(2)))}>½</button>
        <button type="button" style={S.side} disabled={busy}
          onClick={() => setBet((b) => Math.min(bal, +(b * 2).toFixed(2)))}>2×</button>
      </div>
      <div style={S.presets}>
        {PRESETS.map((p) => (
          <button key={p} type="button" style={{
            ...S.preset, borderColor: bet === p ? "#22c55e" : "#3f3f46",
            color: bet === p ? "#4ade80" : "#a1a1aa",
          }} disabled={busy} onClick={() => setBet(p)}>{p}</button>
        ))}
      </div>
      <div style={S.footer}>
        <div><div style={S.lbl}>БАЛАНС</div><div style={S.val}>{bal.toFixed(2)} TON</div></div>
        <div><div style={S.lbl}>СТАВКА</div><div style={S.val}>{bet.toFixed(2)} TON</div></div>
      </div>
      {error && <div style={S.err}>{error}</div>}
      {showResult && phase === "result" && (
        <div style={S.overlay} onClick={() => { setShowResult(false); setPhase("idle"); }}>
          <div style={S.card}>
            {tier ? (
              <>
                <div style={{ fontSize: 40 }}>{REEL_EMOJI[tier]}</div>
                <div style={{ fontWeight: 800, color: TIER_COLOR[tier] }}>{TIER_LABEL[tier]}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: lastWin > 0 ? "#4ade80" : "#f87171" }}>
                  {lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "0 TON"}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40 }}>🚫</div>
                <div style={{ fontWeight: 800, color: "#f87171" }}>ПУСТО</div>
              </>
            )}
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 8 }}>нажми чтобы продолжить</div>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { position: "relative", maxWidth: 420, margin: "0 auto", minHeight: "100dvh", overflow: "hidden",
    fontFamily: "system-ui,sans-serif", color: "#fff", userSelect: "none", background: "#0c1222" },
  sky: { position: "absolute", inset: 0, background: "linear-gradient(180deg,#5ec8f0 0%,#87d8f8 45%,#d4f0ff 100%)", zIndex: 0 },
  topBar: { position: "relative", zIndex: 5, display: "flex", justifyContent: "center", padding: "10px 12px 0" },
  back: { position: "absolute", left: 12, background: "rgba(0,0,0,.35)", border: "none", color: "#fff",
    width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer" },
  online: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(15,10,30,.75)",
    borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" },
  logo: { position: "relative", zIndex: 5, textAlign: "center", marginTop: 8, fontWeight: 900, fontSize: 26,
    textShadow: "0 3px 0 #1a1a1a", letterSpacing: 1 },
  track: { position: "relative", zIndex: 5, display: "flex", justifyContent: "center", alignItems: "center",
    gap: 4, marginTop: 10, background: "linear-gradient(180deg,#5a4a3a,#3d3228)", border: "3px solid #2a2118",
    borderRadius: 8, padding: "6px 10px", width: "fit-content", marginLeft: "auto", marginRight: "auto",
    boxShadow: "inset 0 2px 0 #7a6a55" },
  cell: { width: 18, height: 14, borderRadius: 3, border: "1px solid #0a0a0a" },
  reelFrame: { position: "relative", zIndex: 5, margin: "12px 20px 0", display: "flex", gap: 5,
    background: "linear-gradient(180deg,#6b7280,#4b5563)", borderRadius: 10, padding: 8,
    border: "3px solid #374151", boxShadow: "0 4px 0 #1f2937" },
  reelCell: { flex: 1, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 26, borderRadius: 6, border: "2px solid #4b5563" },
  field: { position: "relative", zIndex: 5, height: 190, marginTop: 6 },
  float: { position: "absolute", left: "50%", top: "30%", transform: "translate(-50%,-50%)", fontWeight: 900,
    fontSize: 16, textShadow: "0 2px 0 #000", zIndex: 30 },
  mine: { position: "absolute", left: "50%", top: "16%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", gap: 2, zIndex: 8 },
  platform: { position: "absolute", left: "50%", top: "40%", transform: "translateX(-50%)", width: 52, height: 52,
    background: "linear-gradient(180deg,#c4a574,#8b6914)", border: "3px solid #5c4a1e", borderRadius: 6,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#5c4a1e",
    boxShadow: "0 4px 0 #3d3214", zIndex: 6 },
  chicken: { position: "absolute", right: "8%", bottom: "6%", fontSize: 48, zIndex: 7,
    filter: "drop-shadow(2px 3px 0 #0006)" },
  ground: { position: "relative", zIndex: 4 },
  bonus: { position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center",
    gap: 6, marginTop: 8 },
  bonusBtn: { background: "linear-gradient(180deg,#d4a017,#a67c00)", border: "2px solid #7a5c00",
    borderRadius: 8, color: "#1a1400", fontWeight: 800, fontSize: 13, padding: "8px 20px",
    cursor: "not-allowed", opacity: 0.7, boxShadow: "0 3px 0 #5c4400" },
  hint: { fontSize: 11, fontWeight: 700, color: "#e2e8f0", textShadow: "0 1px 2px #000" },
  controls: { position: "relative", zIndex: 5, display: "flex", justifyContent: "center", gap: 10,
    marginTop: 10, padding: "0 12px" },
  side: { width: 42, height: 42, borderRadius: "50%", border: "2px solid #3f3f46",
    background: "linear-gradient(180deg,#3f3f46,#27272a)", color: "#e4e4e7", fontSize: 14,
    fontWeight: 700, cursor: "pointer", boxShadow: "0 3px 0 #18181b" },
  spin: { width: 72, height: 72, borderRadius: "50%", border: "3px solid #166534",
    background: "linear-gradient(180deg,#4ade80,#16a34a)", color: "#052e16", cursor: "pointer",
    boxShadow: "0 5px 0 #14532d,0 8px 20px rgba(22,163,74,.4)", display: "flex",
    alignItems: "center", justifyContent: "center" },
  presets: { position: "relative", zIndex: 5, display: "flex", flexWrap: "wrap", justifyContent: "center",
    gap: 5, marginTop: 8, padding: "0 12px" },
  preset: { background: "rgba(0,0,0,.35)", border: "1px solid #3f3f46", borderRadius: 6,
    fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer" },
  footer: { position: "relative", zIndex: 5, display: "flex", justifyContent: "space-between",
    padding: "12px 20px 20px" },
  lbl: { fontSize: 10, fontWeight: 700, color: "#a1a1aa", letterSpacing: 1 },
  val: { fontSize: 16, fontWeight: 800 },
  err: { position: "relative", zIndex: 10, margin: "0 16px 12px", background: "rgba(127,29,29,.9)",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, textAlign: "center" },
  overlay: { position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,.45)",
    display: "flex", alignItems: "center", justifyContent: "center" },
  card: { background: "linear-gradient(180deg,#1e293b,#0f172a)", border: "2px solid #334155",
    borderRadius: 16, padding: "24px 32px", textAlign: "center", minWidth: 200,
    boxShadow: "0 12px 40px rgba(0,0,0,.5)" },
};
