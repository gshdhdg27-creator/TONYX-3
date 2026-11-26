/**
 * PickaxeGame — shaft like original video: open well, side walls, ore columns, bounce physics
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
const COLS = 13;
const CELL = 28;
const VIEW_H = 460;
const EMPTY_G = 7;
const ARROW_MS = 3500;
const ARROW_SIZES = [1, 1.6, 2.2, 2.8] as const;
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const G = 0.38;
const V_MAX = 6.8;
const BOUNCE = 3.8;
const HIT_CD = 48;

const REEL_ITEMS: PickTier[] = [
  null, "wood", "stone", null, "iron", "wood", null, "diamond", "stone", null, "iron", "wood",
];

function makeRow(depth: number): Cell[] {
  const row: Cell[] = [];
  const wall = (k: BlockKind = "stone"): Cell => {
    const d = BLOCK_DEF[k];
    return { kind: k, maxHp: d.maxHp, hp: d.maxHp };
  };
  const air = (): Cell => ({ kind: "air", maxHp: 0, hp: 0 });

  for (let c = 0; c < COLS; c++) {
    if (c <= 1 || c >= COLS - 2) {
      row.push(wall(depth < 2 && Math.random() < 0.3 ? "dirt" : "stone"));
      continue;
    }
    if (depth < 2) {
      if (Math.random() < 0.55) { row.push(air()); continue; }
      row.push(wall(Math.random() < 0.6 ? "dirt" : "stone"));
      continue;
    }
    const distCenter = Math.abs(c - (COLS - 1) / 2);
    const openChance = distCenter < 2.2 ? 0.72 : 0.38;
    if (Math.random() < openChance) {
      if (Math.random() < 0.08) {
        const k = pickOreOrSpecial(depth);
        row.push(wall(k));
      } else {
        row.push(air());
      }
      continue;
    }
    const k = pickSolid(depth);
    row.push(wall(k));
  }
  return row;
}

function pickOreOrSpecial(depth: number): BlockKind {
  const r = Math.random();
  if (r < 0.12 * Math.exp(-depth * 0.06)) return "bench";
  if (r < 0.22) return "arrow";
  if (r < 0.30) return "tnt";
  if (r < 0.36) return "slime";
  if (depth >= 40 && r < 0.48) return "emerald";
  if (depth >= 30 && r < 0.58) return "diamond";
  if (depth >= 20 && r < 0.72) return "gold";
  if (depth >= 10 && r < 0.82) return "redstone";
  if (r < 0.92) return "copper";
  return "stone";
}

function pickSolid(depth: number): BlockKind {
  const r = Math.random();
  if (r < 0.04 * Math.exp(-depth * 0.07)) return "bench";
  if (r < 0.09) return "arrow";
  if (r < 0.13) return "tnt";
  if (r < 0.16) return "slime";
  if (depth >= 40 && r < 0.22) return "emerald";
  if (depth >= 30 && r < 0.30) return "diamond";
  if (depth >= 20 && r < 0.42) return "gold";
  if (depth >= 10 && r < 0.55) return "redstone";
  if (r < 0.68) return "copper";
  if (r < 0.78) return "dirt";
  return "stone";
}

function makeMine(n = 60): Cell[][] {
  return Array.from({ length: n }, (_, i) => makeRow(i));
}
function ensure(g: Cell[][], row: number) {
  while (g.length <= row + 18) g.push(makeRow(g.length));
}
function hitRadius(sizeMul: number): number {
  if (sizeMul >= 2.5) return 2;
  if (sizeMul >= 1.6) return 1;
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
    setFloats((f) => [...f.slice(-18), { id, x, y, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 900);
  }, []);

  const play = async () => {
    if (busy || phase === "falling" || phase === "spinning") return;
    if (!telegramId) { setErr("Нет telegramId"); return; }
    if (bet <= 0 || bet > balance + 1e-9) { setErr("Недостаточно DEMO"); return; }
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

    const forced = apiTier;

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
    await sleep(320);
    setPhase("falling");
    runId.current++;
    const my = runId.current;

    let curHp = H;
    let curTier: Exclude<PickTier, null> = forced;
    let x = (COLS * CELL) / 2;
    let y = 4;
    let vx = (Math.random() - 0.5) * 1.2;
    let vy = 0;
    let sizeIdx = 0;
    let curSize = 1;
    let arrowEnd = 0;
    let total = 0;
    const g = makeMine(80);
    const lastHit = new Map<string, number>();
    const syncGrid = () => setGrid(g.map((r) => r.map((c) => ({ ...c }))));

    while (curHp > 0 && my === runId.current) {
      const now = performance.now();
      if (now > arrowEnd) { sizeIdx = 0; curSize = 1; setSizeMul(1); }

      vy = Math.min(V_MAX, vy + G);
      y += vy;
      x += vx;
      vx *= 0.92;
      if (Math.abs(vx) < 0.04) vx = 0;

      const minX = 2 * CELL + 6;
      const maxX = (COLS - 2) * CELL - 6;
      if (x < minX) { x = minX; vx = Math.abs(vx) * 0.7 + 0.8; setTilt(12); }
      if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.7 - 0.8; setTilt(-12); }

      const tipRow = Math.floor((y + 8) / CELL);
      const tipCol = Math.floor(x / CELL);
      ensure(g, tipRow + 14);
      const rad = hitRadius(curSize);

      let anyHit = false;
      let solidUnder = false;

      for (let dc = -rad; dc <= rad; dc++) {
        const cc = tipCol + dc;
        const rr = tipRow;
        if (cc < 0 || cc >= COLS || rr < 0) continue;
        const cell = g[rr]?.[cc];
        if (!cell || cell.kind === "air" || cell.hp <= 0) continue;
        solidUnder = true;
        const key = `${rr},${cc}`;
        if (now - (lastHit.get(key) || 0) < HIT_CD) continue;

        if (cell.kind === "slime") {
          const dir = x < (cc + 0.5) * CELL ? -1 : 1;
          vx = dir * (5.2 + Math.random() * 2.5);
          vy = -BOUNCE * 1.1;
          setTilt(dir * 22);
          addF(cc * CELL + 14, rr * CELL, "↗", "#6ee7a8");
          lastHit.set(key, now);
          anyHit = true;
          continue;
        }
        if (cell.kind === "tnt") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const r2 = rr + a, c2 = cc + b;
            if (r2 < 0 || c2 < 0 || c2 >= COLS) continue;
            ensure(g, r2);
            const n = g[r2][c2];
            if (!n || n.kind === "air") continue;
            if (BLOCK_DEF[n.kind].mult > 0) {
              total += bet * BLOCK_DEF[n.kind].mult;
              addF(c2 * CELL + 14, r2 * CELL, `+${(bet * BLOCK_DEF[n.kind].mult).toFixed(2)}`, "#fbbf24");
            }
            n.hp = 0; n.kind = "air";
          }
          addF(cc * CELL + 14, rr * CELL, "💥", "#f87171");
          vy = -BOUNCE * 1.35;
          vx += (Math.random() - 0.5) * 4;
          curHp -= 1; setHp(Math.max(0, curHp));
          anyHit = true; syncGrid();
          continue;
        }
        if (cell.kind === "bench") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          const idx = TIER_ORDER.indexOf(curTier);
          if (idx < 3) {
            curTier = TIER_ORDER[idx + 1]; setTier(curTier);
            curHp = TIER_HP[curTier]; setMaxHp(curHp); setHp(curHp);
            addF(cc * CELL + 14, rr * CELL, "⬆ LVL", "#6ee7a8");
          } else {
            curHp = TIER_HP[curTier]; setHp(curHp);
            addF(cc * CELL + 14, rr * CELL, "❤ FULL", "#f472b6");
          }
          vy = -BOUNCE * 0.85;
          anyHit = true; syncGrid();
          continue;
        }
        if (cell.kind === "arrow") {
          cell.hp = 0; cell.kind = "air";
          lastHit.set(key, now);
          sizeIdx = Math.min(3, sizeIdx + 1);
          curSize = ARROW_SIZES[sizeIdx];
          arrowEnd = now + ARROW_MS;
          setSizeMul(curSize);
          addF(cc * CELL + 14, rr * CELL, `×${curSize}`, "#86efac");
          vy = -BOUNCE * 0.7;
          anyHit = true; syncGrid();
          continue;
        }

        lastHit.set(key, now);
        cell.hp -= 1;
        curHp -= 1;
        setHp(Math.max(0, curHp));
        anyHit = true;
        vy = -BOUNCE * (0.7 + Math.random() * 0.45);
        vx += (Math.random() - 0.5) * 2.8;
        setTilt((Math.random() - 0.5) * 28);

        if (cell.hp <= 0) {
          const m = BLOCK_DEF[cell.kind].mult;
          if (m > 0) {
            const gain = bet * m;
            total += gain; setWin(total);
            addF(cc * CELL + 14, rr * CELL, `+${gain.toFixed(2)}`, "#fde047");
          }
          cell.kind = "air";
        }
      }

      if (anyHit) syncGrid();

      if (solidUnder && vy > 0) {
        const surface = tipRow * CELL;
        if (y + 10 > surface) y = surface - 10;
      }

      setPickX(x); setPickY(y);
      setCamY(Math.max(0, y - VIEW_H * 0.38));
      setTilt((t) => t * 0.82);

      await sleep(20);
    }

    setPayout(apiPay > 0 ? apiPay : total);
    setWin(apiPay > 0 ? apiPay : total);
    setPhase("result");
    setBusy(false);
  };

  const nItems = REEL_ITEMS.length;
  const seg = 360 / nItems;
  const mineW = COLS * CELL;

  return (
    <div className="tx-pickaxe" style={S.root}>
      <div style={S.bg}>
        <div style={S.sky} />
        <div style={S.mountains} />
        <div style={S.island} />
      </div>

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
                    transform: `rotate(${ang}deg) translateY(-72px) rotate(${-ang}deg)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {it ? <PickSprite tier={it} size={28} /> : <span style={{ fontSize: 20, color: "#ef4444", fontWeight: 900 }}>✕</span>}
                  </div>
                );
              })}
            </div>
            <div style={S.circleCenter}><div style={S.pointer} /></div>
          </div>
        </div>
      )}

      <div style={S.mineOuter}>
        <div style={{ ...S.mineInner, width: mineW }}>
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            background: "linear-gradient(180deg,#1a3024 0%,#233e2e 40%,#101c15 100%)",
            opacity: 0.9,
          }} />
          <div style={{ position: "absolute", top: -camY, left: 0, width: mineW, zIndex: 1 }}>
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
                transform: `translate(-50%, -50%) scale(${sizeMul}) rotate(${tilt + 15}deg)`,
                zIndex: 6,
                willChange: "transform, left, top",
                filter: sizeMul > 1.5 ? "drop-shadow(0 0 12px rgba(94,234,212,.6))" : undefined,
              }}>
                <PickSprite tier={tier} size={Math.round(36 * Math.min(1.15, sizeMul * 0.5 + 0.7))} />
              </div>
              <div style={{
                position: "absolute", left: "50%", top: Math.max(6, pickY - camY - 48),
                transform: "translateX(-50%)", zIndex: 7,
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(0,0,0,.55)", padding: "2px 10px", borderRadius: 8,
                fontSize: 13, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000",
              }}>
                <span style={{ color: "#f43f5e" }}>❤</span>
                {hp}/{maxHp}
                {sizeMul > 1 && <span style={{ color: "#86efac", marginLeft: 4 }}>×{sizeMul.toFixed(1)}</span>}
              </div>
            </>
          )}

          {floats.map((f) => (
            <div key={f.id} style={{
              position: "absolute", left: f.x, top: f.y - camY, color: f.color,
              fontWeight: 900, fontSize: 12, animation: "floatUp .9s ease-out forwards",
              zIndex: 10, textShadow: "0 1px 3px #000", pointerEvents: "none",
            }}>{f.text}</div>
          ))}
        </div>
      </div>

      <div style={S.bottomBar}>
        <button type="button" style={S.bonusBtn} disabled>BONUS BUY</button>
        <div style={S.statBox}><div style={S.statLabel}>DEMO</div><div style={S.statVal}>{balance.toFixed(2)}</div></div>
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
  bg: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" },
  sky: { position: "absolute", inset: 0, background: "linear-gradient(180deg,#17231d 0%,#20372a 42%,#15241c 72%,#0b120e 100%)" },
  mountains: { position: "absolute", left: 0, right: 0, bottom: "22%", height: "50%", background: "radial-gradient(ellipse 90% 70% at 15% 100%, #4a6a4a 0%, transparent 65%), radial-gradient(ellipse 80% 60% at 85% 100%, #3d5a3d 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 50% 90%, #5a7a5a 0%, transparent 50%)", opacity: 0.55 },
  island: { position: "absolute", left: "8%", top: "12%", width: 70, height: 40, borderRadius: "50% 50% 40% 40%", background: "linear-gradient(180deg, #5a8a4a 30%, #6b4423 70%)", opacity: 0.35, boxShadow: "0 8px 0 -4px #4a7a3a" },
  hudTop: { position: "relative", zIndex: 2, width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  back: { background: "rgba(0,0,0,.35)", border: "1px solid #475569", color: "#cbd5e1", borderRadius: 8, padding: "4px 10px", cursor: "pointer" },
  logo: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 900, fontSize: 13, letterSpacing: 0.5, background: "rgba(0,0,0,.5)", padding: "4px 10px", borderRadius: 6 },
  streak: { fontSize: 11, color: "#94a3b8", background: "rgba(0,0,0,.35)", padding: "2px 8px", borderRadius: 6 },
  circleWrap: { position: "relative", zIndex: 2, marginBottom: 8 },
  circleOuter: { width: 184, height: 184, borderRadius: "50%", border: "5px solid #1e293b", background: "rgba(15,23,42,.92)", position: "relative", boxShadow: "0 0 0 2px #334155, inset 0 0 28px rgba(0,0,0,.55)" },
  circleInner: { position: "absolute", inset: 10, borderRadius: "50%" },
  circleCenter: { position: "absolute", left: "50%", top: "50%", width: 38, height: 38, marginLeft: -19, marginTop: -19, borderRadius: "50%", background: "#0f172a", border: "2px solid #475569", zIndex: 3 },
  pointer: { position: "absolute", left: "50%", top: -7, marginLeft: -7, width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: "11px solid #22c77a" },
  mineOuter: { position: "relative", zIndex: 2, display: "flex", justifyContent: "center", marginBottom: 6 },
  mineInner: { position: "relative", height: VIEW_H, overflow: "hidden", borderRadius: 4, border: "3px solid #1e293b", boxShadow: "0 0 0 1px #475569, inset 0 0 50px rgba(0,0,0,.25)" },
  bottomBar: { position: "relative", zIndex: 2, width: "100%", maxWidth: 400, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "6px 4px", marginTop: 4 },
  bonusBtn: { background: "linear-gradient(180deg, #fbbf24, #d97706)", border: "2px solid #92400e", color: "#1c1917", fontWeight: 900, fontSize: 10, borderRadius: 8, padding: "8px 10px", opacity: 0.7, cursor: "not-allowed" },
  statBox: { textAlign: "center", minWidth: 64 },
  statLabel: { fontSize: 9, color: "#94a3b8", letterSpacing: 1, fontWeight: 700 },
  statVal: { fontSize: 14, fontWeight: 800, color: "#f8fafc" },
  controls: { position: "relative", zIndex: 2, marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center" },
  pm: { width: 36, height: 36, borderRadius: "50%", background: "rgba(19,35,27,.96)", border: "2px solid #475569", color: "#e2e8f0", fontSize: 18, fontWeight: 700, cursor: "pointer" },
  spinCircle: { width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(180deg, #22c77a, #15803d)", border: "3px solid #0b5a3a", color: "#fff", fontSize: 28, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 0 #052e16, 0 0 20px rgba(34,197,122,.4)" },
  preset: { background: "rgba(30,41,59,.8)", border: "1px solid #334155", color: "#cbd5e1", borderRadius: 6, padding: "3px 7px", fontSize: 10, cursor: "pointer" },
  presetOn: { borderColor: "#22c77a", color: "#6ee7a8" },
};
