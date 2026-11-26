/**
 * PickaxeGame — Falling Pickaxe 1:1 physics + shaft
 * Bounce, multi-hit, multi-column when enlarged, depth-scaled bench
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
const COLS = 11;
const CELL = 32;
const VIEW_H = 440;
const EMPTY_G = 7;
const ARROW_MS = 3500;
const ARROW_SIZES = [1, 1.5, 2, 2.5] as const;
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const G = 0.42;
const V_MAX = 7.2;
const BOUNCE = 3.4;
const HIT_CD = 55;

const REEL_ITEMS: PickTier[] = [
  null, "wood", "stone", null, "iron", "wood", null, "diamond", "stone", null, "iron", "wood",
];

function weightedKind(depth: number): BlockKind {
  const b = Math.min(1, depth / 45);
  const benchW = Math.max(0.02, 3.2 * Math.exp(-depth * 0.08));
  const arrowW = Math.max(0.25, 2.0 * Math.exp(-depth * 0.03));
  const t: [BlockKind, number][] = [
    ["dirt", Math.max(2, 11 - b * 4)], ["stone", 26 + b * 2],
    ["copper", 7 + b * 2], ["redstone", depth < 10 ? 2 : 5 + b * 2.5],
    ["gold", depth < 20 ? 1 : 2.5 + b * 3.5], ["diamond", depth < 30 ? 0.3 : 0.7 + b * 2],
    ["emerald", depth < 40 ? 0.05 : 0.15 + b * 1.1],
    ["bench", benchW], ["arrow", arrowW], ["tnt", 1.4 + b * 0.6], ["slime", 1.1], ["air", 3.5],
  ];
  let r = Math.random() * t.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of t) { r -= w; if (r <= 0) return k; }
  return "stone";
}

function makeRow(depth: number): Cell[] {
  return Array.from({ length: COLS }, (_, c) => {
    if (c === 0 || c === COLS - 1) return { kind: "stone" as const, maxHp: 1, hp: 1 };
    if (depth < 1 && Math.random() < 0.35) return { kind: "air" as const, maxHp: 0, hp: 0 };
    const k = weightedKind(depth);
    const d = BLOCK_DEF[k];
    return { kind: k, maxHp: d.maxHp, hp: d.maxHp };
  });
}
function makeMine(n = 55): Cell[][] {
  return Array.from({ length: n }, (_, i) => makeRow(i));
}
function ensure(g: Cell[][], row: number) {
  while (g.length <= row + 16) g.push(makeRow(g.length));
}
function hitRadius(sizeMul: number): number {
  if (sizeMul >= 2.5) return 2;
  if (sizeMul >= 2) return 1;
  if (sizeMul >= 1.5) return 1;
  return 0;
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
  const [spinAngle, setSpinAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [grid, setGrid] = useState<Cell[][]>(() => makeMine());
  const [pickX, setPickX] = useState(COLS * CELL / 2);
  const [pickY, setPickY] = useState(0);
  const [camY, setCamY] = useState(0);
  const [sizeMul, setSizeMul] = useState(1);
  const [tilt, setTilt] = useState(0);
  const [win, setWin] = useState(0);
  const [payout, setPayout] = useState<number | null>(null);
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fid = useRef(0);
  const runId = useRef(0);

  const addF = useCallback((x: number, y: number, text: string, color: string) => {
    const id = ++fid.current;
    setFloats((f) => [...f.slice(-16), { id, x, y, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 900);
  }, []);

  const play = async () => {
    if (busy || phase === "falling" || phase === "spinning") return;
    if (!telegramId) { setErr("Нет telegramId"); return; }
    if (bet <= 0 || bet > balance + 1e-9) { setErr("Недостаточно TON"); return; }
    setBusy(true); setErr(""); setPayout(null);
    setPhase("spinning"); setSpinning(true);
    setGrid(makeMine()); setPickX(COLS * CELL / 2); setPickY(0); setCamY(0);
    setSizeMul(1); setTilt(0); setWin(0);

    let apiTier: PickTier = null;
    let apiPay = 0;
    try {
      const res = await fetch(`${API}/play`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId: String(telegramId), bet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Ошибка");
      const raw = data.tier as string | null;
      if (raw === "gold") apiTier = "iron";
      else if (raw === "wood" || raw === "stone" || raw === "iron" || raw === "diamond") apiTier = raw;
      else apiTier = raw as PickTier;
      apiPay = Number(data.payout || 0);
      if (typeof data.balance === "number") onBalanceChange?.(data.balance);
    } catch (e: any) {
      setErr(e?.message || "Сеть"); setBusy(false); setPhase("idle"); setSpinning(false); return;
    }

    const forced = empty >= EMPTY_G - 1 && !apiTier
      ? TIER_ORDER[Math.floor(Math.random() * TIER_ORDER.length)] : apiTier;

    const nItems = REEL_ITEMS.length;
    let targetIdx = 0;
    if (forced) {
      const m = REEL_ITEMS.map((v, i) => (v === forced ? i : -1)).filter((i) => i >= 0);
      targetIdx = m[Math.floor(Math.random() * m.length)] ?? 0;
    } else {
      const m = REEL_ITEMS.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      targetIdx = m[Math.floor(Math.random() * m.length)] ?? 0;
    }
    const seg = 360 / nItems;
    const finalAngle = 360 * 5 + (360 - targetIdx * seg);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / 2800);
        setSpinAngle((1 - Math.pow(1 - t, 3)) * finalAngle);
        if (t < 1) requestAnimationFrame(tick); else { setSpinAngle(finalAngle); resolve(); }
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
    await sleep(350);
    setPhase("falling");
    runId.current++;
    const my = runId.current;

    let curHp = H;
    let curTier: Exclude<PickTier, null> = forced;
    let x = (COLS * CELL) / 2;
    let y = 8;
    let vx = 0;
    let vy = 0;
    let sizeIdx = 0;
    let curSize = 1;
    let arrowEnd = 0;
    let total = 0;
    const g = makeMine(70);
    const lastHit = new Map<string, number>();

    const syncGrid = () => setGrid(g.map((r) => r.map((c) => ({ ...c }))));

    while (curHp > 0 && my === runId.current) {
      const now = performance.now();
      if (now > arrowEnd) { sizeIdx = 0; curSize = 1; setSizeMul(1); }

      vy = Math.min(V_MAX, vy + G);
      y += vy;
      x += vx;
      vx *= 0.88;
      if (Math.abs(vx) < 0.05) vx = 0;

      const minX = CELL + 4;
      const maxX = (COLS - 1) * CELL - 4;
      if (x < minX) { x = minX; vx = Math.abs(vx) * 0.6; }
      if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.6; }

      const tipRow = Math.floor((y + 10) / CELL);
      const tipCol = Math.floor(x / CELL);
      ensure(g, tipRow + 12);
      const rad = hitRadius(curSize);

      let anyHit = false;
      let solidUnder = false;

      for (let dc = -rad; dc <= rad; dc++) {
        const cc = tipCol + dc;
        if (cc < 1 || cc >= COLS - 1) continue;
        const rr = tipRow;
        if (rr < 0) continue;
        const cell = g[rr]?.[cc];
        if (!cell || cell.kind === "air" || cell.hp <= 0) continue;
        solidUnder = true;
        const key = `${rr},${cc}`;
        const last = lastHit.get(key) || 0;
        if (now - last < HIT_CD) continue;

        if (cell.kind === "slime") {
          const dir = x < (cc + 0.5) * CELL ? -1 : 1;
          vx = dir * (4.5 + Math.random() * 2);
          vy = -BOUNCE * 0.9;
          setTilt(dir * 18);
          addF(cc * CELL + 16, rr * CELL, "↗", "#4ade80");
          lastHit.set(key, now);
          anyHit = true;
          continue;
        }

        if (cell.kind === "tnt") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          for (let dr = -1; dr <= 1; dr++) for (let d2 = -1; d2 <= 1; d2++) {
            const r2 = rr + dr, c2 = cc + d2;
            if (r2 < 0 || c2 < 0 || c2 >= COLS) continue;
            ensure(g, r2);
            const n = g[r2][c2];
            if (!n || n.kind === "air") continue;
            if (BLOCK_DEF[n.kind].mult > 0) {
              total += bet * BLOCK_DEF[n.kind].mult;
              addF(c2 * CELL + 16, r2 * CELL, `+${(bet * BLOCK_DEF[n.kind].mult).toFixed(2)}`, "#fbbf24");
            }
            n.hp = 0; n.kind = "air";
          }
          addF(cc * CELL + 16, rr * CELL, "💥", "#f87171");
          vy = -BOUNCE * 1.2;
          vx += (Math.random() - 0.5) * 3;
          curHp -= 1; setHp(Math.max(0, curHp));
          anyHit = true;
          syncGrid();
          continue;
        }

        if (cell.kind === "bench") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          const idx = TIER_ORDER.indexOf(curTier);
          if (idx < 3) {
            curTier = TIER_ORDER[idx + 1]; setTier(curTier);
            curHp = TIER_HP[curTier]; setMaxHp(curHp); setHp(curHp);
            addF(cc * CELL + 16, rr * CELL, "⬆ LVL", "#4ade80");
          } else {
            curHp = TIER_HP[curTier]; setHp(curHp);
            addF(cc * CELL + 16, rr * CELL, "❤ FULL", "#f472b6");
          }
          vy = -BOUNCE * 0.7;
          anyHit = true;
          syncGrid();
          continue;
        }

        if (cell.kind === "arrow") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          sizeIdx = Math.min(3, sizeIdx + 1);
          curSize = ARROW_SIZES[sizeIdx];
          arrowEnd = now + ARROW_MS;
          setSizeMul(curSize);
          addF(cc * CELL + 16, rr * CELL, `×${curSize}`, "#86efac");
          vy = -BOUNCE * 0.6;
          anyHit = true;
          syncGrid();
          continue;
        }

        lastHit.set(key, now);
        cell.hp -= 1;
        curHp -= 1;
        setHp(Math.max(0, curHp));
        anyHit = true;

        vy = -BOUNCE * (0.75 + Math.random() * 0.35);
        vx += (Math.random() - 0.5) * 2.2;
        setTilt((Math.random() - 0.5) * 22);

        if (cell.hp <= 0) {
          const m = BLOCK_DEF[cell.kind].mult;
          if (m > 0) {
            const gain = bet * m;
            total += gain; setWin(total);
            addF(cc * CELL + 16, rr * CELL, `+${gain.toFixed(2)}`, "#fde047");
          }
          cell.kind = "air";
        }
      }

      if (anyHit) syncGrid();

      if (solidUnder && vy > 0) {
        const surface = tipRow * CELL;
        if (y + 12 > surface) y = surface - 12;
      }

      setPickX(x); setPickY(y);
      setCamY(Math.max(0, y - VIEW_H * 0.35));
      setTilt((t) => t * 0.85);

      await sleep(22);
    }

    setPayout(apiPay > 0 ? apiPay : total);
    setWin(apiPay > 0 ? apiPay : total);
    setPhase("result");
    setBusy(false);
  };

  const nItems = REEL_ITEMS.length;
  const seg = 360 / nItems;

  return (
    <div style={S.root}>
      <div style={S.bg}><div style={S.sky} /><div style={S.hills} /></div>

      <div style={S.hudTop}>
        {onBack && <button type="button" style={S.back} onClick={onBack}>←</button>}
        <div style={S.logo}>
          <span style={{ filter: "drop-shadow(0 0 4px #5eead4)" }}>⛏️</span>
          <span>FALLING PICKAXE</span>
        </div>
        <div style={S.streak}>{empty}/{EMPTY_G}</div>
      </div>

      {(phase === "idle" || phase === "spinning" || phase === "result") && (
        <div style={S.circleWrap}>
          <div style={S.circleOuter}>
            <div style={{
              ...S.circleInner,
              transform: `rotate(${spinAngle}deg)`,
              transition: spinning ? "none" : "transform 0.2s ease-out",
            }}>
              {REEL_ITEMS.map((it, i) => {
                const ang = i * seg;
                return (
                  <div key={i} style={{
                    position: "absolute", left: "50%", top: "50%", width: 44, height: 44,
                    marginLeft: -22, marginTop: -22,
                    transform: `rotate(${ang}deg) translateY(-70px) rotate(${-ang}deg)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {it ? <PickSprite tier={it} size={28} /> : <span style={{ fontSize: 18, opacity: 0.5 }}>✕</span>}
                  </div>
                );
              })}
            </div>
            <div style={S.circleCenter}><div style={S.pointer} /></div>
          </div>
        </div>
      )}

      <div style={S.mineOuter}>
        <div style={S.mineInner}>
          <div style={{ position: "absolute", top: -camY, left: 0, width: COLS * CELL }}>
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
            <>
              <div style={{
                position: "absolute",
                left: pickX,
                top: pickY - camY,
                transform: `translate(-50%, -50%) scale(${sizeMul}) rotate(${tilt}deg)`,
                zIndex: 6,
                willChange: "transform, left, top",
              }}>
                <PickSprite tier={tier} size={40} />
              </div>
              <div style={{
                position: "absolute", left: "50%", top: Math.max(8, pickY - camY - 54),
                transform: "translateX(-50%)", zIndex: 7,
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(0,0,0,.6)", padding: "2px 10px", borderRadius: 8,
                fontSize: 13, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000",
              }}>
                <span style={{ color: "#f43f5e" }}>❤</span>
                {hp}/{maxHp}
                {sizeMul > 1 && <span style={{ color: "#86efac", marginLeft: 4 }}>×{sizeMul}</span>}
              </div>
            </>
          )}

          {floats.map((f) => (
            <div key={f.id} style={{
              position: "absolute", left: f.x, top: f.y - camY, color: f.color,
              fontWeight: 900, fontSize: 13, animation: "floatUp .9s ease-out forwards",
              zIndex: 10, textShadow: "0 1px 3px #000", pointerEvents: "none",
            }}>{f.text}</div>
          ))}
        </div>
      </div>

      <div style={S.bottomBar}>
        <button type="button" style={S.bonusBtn} disabled>BONUS BUY</button>
        <div style={S.statBox}><div style={S.statLabel}>CASH</div><div style={S.statVal}>{balance.toFixed(2)}</div></div>
        <div style={S.statBox}><div style={S.statLabel}>WIN</div><div style={{ ...S.statVal, color: "#fde047" }}>{(payout ?? win).toFixed(2)}</div></div>
        <div style={S.statBox}><div style={S.statLabel}>BET</div><div style={S.statVal}>{bet.toFixed(2)}</div></div>
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{err}</div>}

      <div style={S.controls}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" style={S.pm} onClick={() => setBet(Math.max(0.1, +(bet / 2).toFixed(2)))} disabled={busy}>−</button>
          <button type="button" style={S.spinCircle}
            onClick={() => { if (phase === "result") { setPhase("idle"); setTier(null); } else play(); }}
            disabled={busy && phase !== "result"}>
            {phase === "result" ? "↻" : busy ? "…" : "↻"}
          </button>
          <button type="button" style={S.pm} onClick={() => setBet(+(bet * 2).toFixed(2))} disabled={busy}>+</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 6 }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" style={{ ...S.preset, ...(bet === p ? S.presetOn : {}) }}
              onClick={() => setBet(p)} disabled={busy}>{p}</button>
          ))}
        </div>
      </div>

      <style>{`@keyframes floatUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-28px); } }`}</style>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  root: { position: "relative", minHeight: "100%", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 8px 20px", fontFamily: "system-ui, sans-serif", color: "#e2e8f0" },
  bg: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" },
  sky: { position: "absolute", inset: 0, background: "linear-gradient(180deg, #7ec8e8 0%, #a8d4e8 35%, #c5e0c8 55%, #6a8a6a 75%, #3a4a3a 100%)" },
  hills: { position: "absolute", left: 0, right: 0, bottom: "28%", height: "42%", background: `radial-gradient(ellipse 80% 60% at 20% 100%, #4a7a4a 0%, transparent 70%), radial-gradient(ellipse 70% 50% at 80% 100%, #3d6a3d 0%, transparent 70%)`, opacity: 0.5 },
  hudTop: { position: "relative", zIndex: 2, width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  back: { background: "rgba(0,0,0,.35)", border: "1px solid #475569", color: "#cbd5e1", borderRadius: 8, padding: "4px 10px", cursor: "pointer" },
  logo: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 900, fontSize: 13, letterSpacing: 0.5, background: "rgba(0,0,0,.5)", padding: "4px 10px", borderRadius: 6 },
  streak: { fontSize: 11, color: "#94a3b8", background: "rgba(0,0,0,.35)", padding: "2px 8px", borderRadius: 6 },
  circleWrap: { position: "relative", zIndex: 2, marginBottom: 8 },
  circleOuter: { width: 180, height: 180, borderRadius: "50%", border: "4px solid #334155", background: "rgba(15,23,42,.9)", position: "relative", boxShadow: "0 0 0 2px #1e293b, inset 0 0 30px rgba(0,0,0,.5)" },
  circleInner: { position: "absolute", inset: 8, borderRadius: "50%" },
  circleCenter: { position: "absolute", left: "50%", top: "50%", width: 36, height: 36, marginLeft: -18, marginTop: -18, borderRadius: "50%", background: "#0f172a", border: "2px solid #475569", zIndex: 3 },
  pointer: { position: "absolute", left: "50%", top: -6, marginLeft: -6, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "10px solid #22c55e" },
  mineOuter: { position: "relative", zIndex: 2, display: "flex", justifyContent: "center", marginBottom: 6 },
  mineInner: { position: "relative", width: COLS * CELL, height: VIEW_H, overflow: "hidden", borderRadius: 6, border: "3px solid #1e293b", boxShadow: "0 0 0 1px #475569, inset 0 0 40px rgba(0,0,0,.3)" },
  bottomBar: { position: "relative", zIndex: 2, width: "100%", maxWidth: 400, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "6px 4px", marginTop: 4 },
  bonusBtn: { background: "linear-gradient(180deg, #fbbf24, #d97706)", border: "2px solid #92400e", color: "#1c1917", fontWeight: 900, fontSize: 10, borderRadius: 8, padding: "8px 10px", opacity: 0.7, cursor: "not-allowed" },
  statBox: { textAlign: "center", minWidth: 64 },
  statLabel: { fontSize: 9, color: "#94a3b8", letterSpacing: 1, fontWeight: 700 },
  statVal: { fontSize: 14, fontWeight: 800, color: "#f8fafc" },
  controls: { position: "relative", zIndex: 2, marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center" },
  pm: { width: 36, height: 36, borderRadius: "50%", background: "rgba(30,41,59,.9)", border: "2px solid #475569", color: "#e2e8f0", fontSize: 18, fontWeight: 700, cursor: "pointer" },
  spinCircle: { width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(180deg, #22c55e, #15803d)", border: "3px solid #14532d", color: "#fff", fontSize: 28, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 0 #052e16, 0 0 20px rgba(34,197,94,.4)" },
  preset: { background: "rgba(30,41,59,.8)", border: "1px solid #334155", color: "#cbd5e1", borderRadius: 6, padding: "3px 7px", fontSize: 10, cursor: "pointer" },
  presetOn: { borderColor: "#22c55e", color: "#4ade80" },
};
