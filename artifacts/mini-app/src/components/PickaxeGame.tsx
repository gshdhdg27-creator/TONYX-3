/**
 * PickaxeGame — Craft & Drop / Falling Pickaxe
 */
import { useCallback, useRef, useState, type CSSProperties } from "react";
import {
  BlockFace, PickSprite, BLOCK_DEF, TIER_HP, TIER_ORDER, TIER_LABEL, TIER_COLOR,
  type BlockKind, type PickTier,
} from "./PickaxeBlocks";

type Phase = "idle" | "spinning" | "falling" | "result";
interface Cell { kind: BlockKind; maxHp: number; hp: number; }
interface FloatNum { id: number; x: number; y: number; text: string; color: string; }

const API = "/api/mini/games/pickaxe";
const COLS = 9, CELL = 28, VIEW_H = 400, EMPTY_G = 7, ARROW_MS = 3000;
const ARROW_SIZES = [1, 1.5, 2, 2.5] as const;
const REEL_H = 64, REEL_LEN = 40;
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function weightedKind(depth: number): BlockKind {
  const b = Math.min(1, depth / 40);
  const t: [BlockKind, number][] = [
    ["dirt", 12 - b * 4], ["stone", 24], ["copper", 9 + b * 2], ["redstone", 6 + b * 3],
    ["gold", 3 + b * 4], ["diamond", 1 + b * 2], ["emerald", 0.3 + b],
    ["bench", Math.max(0.35, 2.4 - depth * 0.035)], ["arrow", Math.max(0.5, 2.2 - depth * 0.02)],
    ["tnt", 1.6], ["slime", 1.3], ["air", 5],
  ];
  let r = Math.random() * t.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of t) { r -= w; if (r <= 0) return k; }
  return "stone";
}

function makeRow(depth: number): Cell[] {
  return Array.from({ length: COLS }, (_, c) => {
    if (c === 0 || c === COLS - 1) {
      const k: BlockKind = Math.random() < 0.85 ? "stone" : "dirt";
      return { kind: k, maxHp: BLOCK_DEF[k].maxHp, hp: BLOCK_DEF[k].maxHp };
    }
    if (depth < 2 && Math.random() < 0.5) return { kind: "air" as const, maxHp: 0, hp: 0 };
    const k = weightedKind(depth);
    return { kind: k, maxHp: BLOCK_DEF[k].maxHp, hp: BLOCK_DEF[k].maxHp };
  });
}

function makeMine(n = 40): Cell[][] {
  return Array.from({ length: n }, (_, i) => makeRow(i));
}

function ensure(g: Cell[][], row: number) {
  while (g.length <= row + 12) g.push(makeRow(g.length));
}

function buildStrip(final: PickTier): PickTier[] {
  const pool: PickTier[] = [null, null, null, "wood", "wood", "iron", "gold", "diamond"];
  const items: PickTier[] = Array.from({ length: REEL_LEN - 1 }, () => pool[Math.floor(Math.random() * pool.length)]);
  items.push(final);
  return items;
}

export default function PickaxeGame({
  telegramId, balance = 0, onBalanceChange, onBack,
}: {
  telegramId?: string | number;
  balance?: number;
  onBalanceChange?: (n: number) => void;
  onBack?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [bet, setBet] = useState(1);
  const [empty, setEmpty] = useState(0);
  const [reel, setReel] = useState<PickTier[]>(() => buildStrip(null));
  const [off, setOff] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [grid, setGrid] = useState<Cell[][]>(() => makeMine());
  const [col, setCol] = useState(4);
  const [pickY, setPickY] = useState(0);
  const [camY, setCamY] = useState(0);
  const [sizeMul, setSizeMul] = useState(1);
  const [win, setWin] = useState(0);
  const [payout, setPayout] = useState<number | null>(null);
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fid = useRef(0);
  const runId = useRef(0);

  const addF = useCallback((x: number, y: number, text: string, color: string) => {
    const id = ++fid.current;
    setFloats((f) => [...f.slice(-12), { id, x, y, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 900);
  }, []);

  const play = async () => {
    if (busy || phase === "falling" || phase === "spinning") return;
    if (!telegramId) { setErr("Нет telegramId"); return; }
    if (bet <= 0 || bet > balance + 1e-9) { setErr("Недостаточно TON"); return; }
    setBusy(true); setErr(""); setPayout(null);
    setPhase("spinning"); setSpinning(true);
    setGrid(makeMine()); setCol(4); setPickY(0); setCamY(0); setSizeMul(1); setWin(0);

    let apiTier: PickTier = null;
    let apiPay = 0;
    try {
      const res = await fetch(`${API}/play`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId: String(telegramId), bet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Ошибка");
      apiTier = data.tier ?? null;
      apiPay = Number(data.payout || 0);
      if (typeof data.balance === "number") onBalanceChange?.(data.balance);
    } catch (e: any) {
      setErr(e?.message || "Сеть"); setBusy(false); setPhase("idle"); setSpinning(false); return;
    }

    const forced = empty >= EMPTY_G - 1 && !apiTier
      ? TIER_ORDER[Math.floor(Math.random() * TIER_ORDER.length)] : apiTier;
    const strip = buildStrip(forced);
    setReel(strip);
    const target = (strip.length - 1) * REEL_H;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / 2800);
        const ease = 1 - Math.pow(1 - t, 3);
        setOff(ease * target);
        if (t < 1) requestAnimationFrame(tick); else { setOff(target); resolve(); }
      };
      requestAnimationFrame(tick);
    });
    setSpinning(false); setTier(forced);
    if (!forced) {
      setEmpty((s) => s + 1); setPhase("result"); setPayout(0); setBusy(false); return;
    }
    setEmpty(0);
    const H = TIER_HP[forced];
    setHp(H); setMaxHp(H);
    await sleep(400);
    setPhase("falling");
    runId.current++;
    const my = runId.current;
    let curHp = H, curTier: Exclude<PickTier, null> = forced, c = 4, y = 0, sizeIdx = 0, arrowEnd = 0, total = 0;
    const g = makeMine(50);

    while (curHp > 0 && my === runId.current) {
      ensure(g, Math.floor(y / CELL) + 8);
      const row = Math.floor(y / CELL);
      const rad = performance.now() > arrowEnd ? 0 : (ARROW_SIZES[sizeIdx] >= 2.5 ? 2 : ARROW_SIZES[sizeIdx] >= 1.5 ? 1 : 0);
      let hit = false;
      for (let dc = -rad; dc <= rad; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= COLS) continue;
        const cell = g[row]?.[cc];
        if (!cell || cell.kind === "air" || cell.hp <= 0) continue;
        hit = true;
        if (cell.kind === "slime") {
          c = Math.max(1, Math.min(COLS - 2, c + (Math.random() < 0.5 ? -1 : 1)));
          setCol(c); addF(cc * CELL + 14, row * CELL, "↗", "#4ade80"); y += CELL * 0.4; break;
        }
        if (cell.kind === "tnt") {
          cell.hp = 0; cell.kind = "air";
          for (let dr = -1; dr <= 1; dr++) for (let d2 = -1; d2 <= 1; d2++) {
            const rr = row + dr, c2 = cc + d2;
            if (rr < 0 || c2 < 0 || c2 >= COLS) continue;
            ensure(g, rr);
            const n = g[rr][c2];
            if (!n || n.kind === "air") continue;
            if (BLOCK_DEF[n.kind].mult > 0) {
              total += bet * BLOCK_DEF[n.kind].mult;
              addF(c2 * CELL + 14, rr * CELL, `+${(bet * BLOCK_DEF[n.kind].mult).toFixed(3)}`, "#fbbf24");
            }
            n.hp = 0; n.kind = "air";
          }
          addF(cc * CELL + 14, row * CELL, "💥", "#f87171");
          setGrid(g.map((r) => r.map((x) => ({ ...x }))));
          continue;
        }
        if (cell.kind === "bench") {
          cell.hp = 0; cell.kind = "air";
          const idx = TIER_ORDER.indexOf(curTier);
          if (idx < 3) {
            curTier = TIER_ORDER[idx + 1]; setTier(curTier);
            curHp = TIER_HP[curTier]; setMaxHp(curHp); setHp(curHp);
            addF(cc * CELL + 14, row * CELL, "⬆ LVL", "#4ade80");
          } else {
            curHp = TIER_HP[curTier]; setHp(curHp);
            addF(cc * CELL + 14, row * CELL, "❤ FULL", "#f472b6");
          }
          setGrid(g.map((r) => r.map((x) => ({ ...x }))));
          continue;
        }
        if (cell.kind === "arrow") {
          cell.hp = 0; cell.kind = "air";
          sizeIdx = Math.min(3, sizeIdx + 1);
          arrowEnd = performance.now() + ARROW_MS;
          setSizeMul(ARROW_SIZES[sizeIdx]);
          addF(cc * CELL + 14, row * CELL, `×${ARROW_SIZES[sizeIdx]}`, "#86efac");
          setGrid(g.map((r) => r.map((x) => ({ ...x }))));
          continue;
        }
        cell.hp -= 1; curHp -= 1; setHp(curHp);
        if (cell.hp <= 0) {
          const m = BLOCK_DEF[cell.kind].mult;
          if (m > 0) { total += bet * m; setWin(total); addF(cc * CELL + 14, row * CELL, `+${(bet * m).toFixed(3)}`, "#fde047"); }
          cell.kind = "air";
        }
        setGrid(g.map((r) => r.map((x) => ({ ...x }))));
      }
      y += hit ? CELL * 0.35 : CELL * 0.55;
      setPickY(y); setCamY(Math.max(0, y - VIEW_H * 0.35)); setCol(c);
      await sleep(hit ? 70 : 45);
    }
    setPayout(apiPay > 0 ? apiPay : total);
    setWin(apiPay > 0 ? apiPay : total);
    setPhase("result"); setBusy(false);
  };

  const pad = REEL_H * 2.5;

  return (
    <div style={S.root}>
      <div style={S.top}>
        {onBack && <button type="button" style={S.back} onClick={onBack}>←</button>}
        <div style={S.logo}>CRAFT & DROP</div>
        <div style={S.streak}>Пустых: {empty}/{EMPTY_G}</div>
      </div>
      <div style={S.reelWrap}>
        <div style={S.reelWin}>
          <div style={{ transform: `translateY(${pad - off}px)`, transition: spinning ? "none" : "transform .15s" }}>
            {reel.map((it, i) => (
              <div key={i} style={S.reelItem}>
                {it ? <PickSprite tier={it} size={40} /> : <span style={{ fontSize: 28, opacity: 0.5 }}>🚫</span>}
                <span style={{ fontSize: 11, color: it ? TIER_COLOR[it] : "#666" }}>{it ? TIER_LABEL[it] : "пусто"}</span>
              </div>
            ))}
          </div>
          <div style={S.reelCenter} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <div style={{ position: "relative", width: COLS * CELL, height: VIEW_H, overflow: "hidden",
          background: "linear-gradient(#87CEEB,#5ba3c9 30%,#2d4a3e 60%,#1a1a1a)", borderRadius: 8, border: "2px solid #333" }}>
          <div style={{ position: "absolute", top: -camY, width: COLS * CELL }}>
            {grid.map((row, ri) => (
              <div key={ri} style={{ display: "flex", height: CELL }}>
                {row.map((cell, ci) => (
                  <div key={ci} style={{ width: CELL, height: CELL, flexShrink: 0 }}>
                    {cell.kind !== "air" && cell.hp > 0 && (
                      <BlockFace kind={cell.kind} cracked={cell.hp < cell.maxHp} hp={cell.hp} maxHp={cell.maxHp} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {tier && phase === "falling" && (
            <div style={{ position: "absolute", left: col * CELL + 14, top: pickY - camY,
              transform: `translate(-50%,-50%) scale(${sizeMul})`, zIndex: 5 }}>
              <PickSprite tier={tier} size={32} />
            </div>
          )}
          {floats.map((f) => (
            <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y - camY, color: f.color,
              fontWeight: 800, fontSize: 12, animation: "floatUp .9s ease-out forwards", zIndex: 10, textShadow: "0 1px 2px #000" }}>{f.text}</div>
          ))}
        </div>
      </div>
      {(phase === "falling" || phase === "result") && tier && (
        <div style={S.hpBar}>
          <div style={{ height: "100%", width: `${maxHp ? (hp / maxHp) * 100 : 0}%`,
            background: hp < maxHp * 0.3 ? "#ef4444" : hp < maxHp * 0.6 ? "#eab308" : "#22c55e", transition: "width .15s" }} />
          <span style={S.hpTxt}>{hp}/{maxHp} · {TIER_LABEL[tier]}</span>
        </div>
      )}
      <div style={{ fontSize: 14, marginBottom: 6 }}>Добыча: <b style={{ color: "#fde047" }}>{(payout ?? win).toFixed(4)} TON</b></div>
      {err && <div style={{ color: "#f87171", fontSize: 12 }}>{err}</div>}
      <div style={S.controls}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" style={{ ...S.preset, ...(bet === p ? S.presetOn : {}) }}
              onClick={() => setBet(p)} disabled={busy}>{p}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" style={S.pm} onClick={() => setBet(Math.max(0.1, +(bet / 2).toFixed(2)))} disabled={busy}>½</button>
          <input style={S.input} type="number" value={bet} min={0.1} step={0.1}
            onChange={(e) => setBet(Math.max(0.1, Number(e.target.value) || 0.1))} disabled={busy} />
          <button type="button" style={S.pm} onClick={() => setBet(+(bet * 2).toFixed(2))} disabled={busy}>2×</button>
        </div>
        <button type="button" style={S.spin}
          onClick={() => { if (phase === "result") { setPhase("idle"); setTier(null); } else play(); }}
          disabled={busy && phase !== "result"}>
          {phase === "result" ? "Ещё раз" : busy ? "..." : "↻ Играть"}
        </button>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Баланс: {balance.toFixed(2)} TON</div>
      </div>
      <style>{`@keyframes floatUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-28px)}}`}</style>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  root: { minHeight: "100%", background: "#0b1220", color: "#e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 10px 24px", fontFamily: "system-ui,sans-serif" },
  top: { width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  back: { background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 8, padding: "4px 10px", cursor: "pointer" },
  logo: { flex: 1, textAlign: "center", fontWeight: 900, letterSpacing: 1, fontSize: 16 },
  streak: { fontSize: 11, color: "#94a3b8" },
  reelWrap: { width: "100%", maxWidth: 280, marginBottom: 8 },
  reelWin: { height: REEL_H * 5, overflow: "hidden", position: "relative", borderRadius: 12, border: "2px solid #334155", background: "#0f172a" },
  reelItem: { height: REEL_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 },
  reelCenter: { position: "absolute", left: 0, right: 0, top: "50%", height: REEL_H, marginTop: -REEL_H / 2, borderTop: "2px solid #22c55e", borderBottom: "2px solid #22c55e", pointerEvents: "none" },
  hpBar: { width: "100%", maxWidth: 280, height: 16, background: "#1e293b", borderRadius: 8, position: "relative", overflow: "hidden", marginBottom: 6 },
  hpTxt: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 },
  controls: { width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" },
  preset: { background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" },
  presetOn: { borderColor: "#22c55e", color: "#4ade80" },
  pm: { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
  input: { width: 80, background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", borderRadius: 6, padding: "6px 8px", textAlign: "center" },
  spin: { width: "100%", maxWidth: 220, background: "linear-gradient(180deg,#22c55e,#16a34a)", border: "none", color: "#052e16", fontWeight: 900, fontSize: 18, borderRadius: 14, padding: "12px 16px", cursor: "pointer", boxShadow: "0 4px 0 #14532d" },
};
