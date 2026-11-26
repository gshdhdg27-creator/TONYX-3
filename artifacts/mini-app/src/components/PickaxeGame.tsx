/**
 * PickaxeGame — Craft & Drop style (physics + side shaft like reference video)
 * artifacts/mini-app/src/components/PickaxeGame.tsx
 */
import { useCallback, useEffect, useRef, useState } from "react";

type PickTier = "wood" | "iron" | "gold" | "diamond" | null;
type Phase = "idle" | "spinning" | "reveal" | "falling" | "result";
type BlockKind =
  | "air" | "dirt" | "stone" | "copper" | "redstone" | "gold"
  | "diamond" | "emerald" | "bench" | "arrow" | "tnt" | "slime";

interface Cell {
  kind: BlockKind;
  maxHp: number;
  hp: number;
}

const TIER_HP = { wood: 100, iron: 150, gold: 200, diamond: 400 } as const;
const TIER_ORDER: Exclude<PickTier, null>[] = ["wood", "iron", "gold", "diamond"];
const TIER_LABEL = {
  wood: "Деревянная", iron: "Железная", gold: "Золотая", diamond: "Алмазная",
} as const;
const TIER_COLOR = {
  wood: "#c47a3a", iron: "#a8b0b8", gold: "#f5c542", diamond: "#5eead4",
} as const;
const TIER_SPRITE = {
  wood: "🪓", iron: "⛏️", gold: "⚒️", diamond: "💎",
} as const;

const BLOCK_DEF: Record<BlockKind, { maxHp: number; mult: number; weight: number; color: string; label: string }> = {
  air:      { maxHp: 0, mult: 0, weight: 0, color: "transparent", label: "" },
  dirt:     { maxHp: 1, mult: 0, weight: 18, color: "#8B5A2B", label: "" },
  stone:    { maxHp: 1, mult: 0, weight: 22, color: "#6B7280", label: "" },
  copper:   { maxHp: 5, mult: 0.01, weight: 10, color: "#B87333", label: "Cu" },
  redstone: { maxHp: 10, mult: 0.05, weight: 8, color: "#DC2626", label: "Rs" },
  gold:     { maxHp: 15, mult: 0.2, weight: 6, color: "#EAB308", label: "Au" },
  diamond:  { maxHp: 20, mult: 1, weight: 2, color: "#38BDF8", label: "◆" },
  emerald:  { maxHp: 30, mult: 5, weight: 1, color: "#22C55E", label: "Emerald" },
  bench:    { maxHp: 1, mult: 0, weight: 3, color: "#92400E", label: "🛠️" },
  arrow:    { maxHp: 1, mult: 0, weight: 3, color: "#15803D", label: "⬆️" },
  tnt:      { maxHp: 1, mult: 0, weight: 3, color: "#991B1B", label: "TNT" },
  slime:    { maxHp: 999, mult: 0, weight: 2, color: "#4ADE80", label: "🟩" },
};

const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const API = "/api/mini/games/pickaxe";
const COLS = 7;
const ROWS = 48;
const CELL = 28;
const VIEW_H = 340;
const EMPTY_GUARANTEE = 7;
const ARROW_MS = 3000;
const ARROW_SIZES = [1, 1.5, 2, 2.5] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function weightedKind(depth: number): BlockKind {
  const bias = Math.min(1, depth / 30);
  const table: [BlockKind, number][] = [
    ["dirt", 16 - bias * 6],
    ["stone", 20 - bias * 4],
    ["copper", 10 + bias * 2],
    ["redstone", 7 + bias * 3],
    ["gold", 4 + bias * 4],
    ["diamond", 1 + bias * 2],
    ["emerald", 0.4 + bias * 1.2],
    ["bench", 2.5],
    ["arrow", 2.5],
    ["tnt", 2 + bias],
    ["slime", 1.5],
    ["air", 8],
  ];
  const tot = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return "stone";
}

function makeMine(): Cell[][] {
  const grid: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1) {
        const k: BlockKind = Math.random() < 0.85 ? "stone" : "dirt";
        const d = BLOCK_DEF[k];
        row.push({ kind: k, maxHp: d.maxHp, hp: d.maxHp });
        continue;
      }
      if (Math.abs(c - Math.floor(COLS / 2)) <= 1 && Math.random() < 0.25) {
        row.push({ kind: "air", maxHp: 0, hp: 0 });
        continue;
      }
      const k = weightedKind(r);
      const d = BLOCK_DEF[k];
      row.push({ kind: k, maxHp: d.maxHp, hp: d.maxHp });
    }
    grid.push(row);
  }
  return grid;
}

interface FloatNum {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export default function PickaxeGame({
  telegramId, balance, onBalanceChange, onBack,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange?: () => void;
  onBack?: () => void;
}) {
  const [bet, setBet] = useState(0.5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [sizeLevel, setSizeLevel] = useState(0);
  const [spinAngle, setSpinAngle] = useState(0);
  const [spinSym, setSpinSym] = useState<"x" | PickTier>("x");
  const [lastWin, setLastWin] = useState(0);
  const [mined, setMined] = useState(0);
  const [online] = useState(() => 12 + Math.floor(Math.random() * 18));
  const [error, setError] = useState<string | null>(null);
  const [emptyStreak, setEmptyStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [localBal, setLocalBal] = useState(balance);
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [shake, setShake] = useState(0);

  const pickY = useRef(0);
  const pickX = useRef(COLS / 2);
  const pickRot = useRef(0);
  const pickScale = useRef(1);
  const vy = useRef(0);
  const gridRef = useRef<Cell[][]>(makeMine());
  const [frame, setFrame] = useState(0);
  const running = useRef(false);
  const curTierRef = useRef<Exclude<PickTier, null>>("wood");
  const curHpRef = useRef(100);
  const sizeRef = useRef(0);
  const arrowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const floatId = useRef(0);
  const minedRef = useRef(0);
  const betRef = useRef(bet);

  useEffect(() => setLocalBal(balance), [balance]);
  useEffect(() => { betRef.current = bet; }, [bet]);
  const bal = localBal;
  const busy = phase === "spinning" || phase === "reveal" || phase === "falling";
  const radius = ARROW_SIZES[sizeLevel] ?? 1;

  const addFloat = useCallback((x: number, y: number, text: string, color: string) => {
    const id = ++floatId.current;
    setFloats((f) => [...f.slice(-12), { id, x, y, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((n) => n.id !== id)), 900);
  }, []);

  const stopSpin = () => {
    if (spinTimer.current) {
      clearInterval(spinTimer.current);
      spinTimer.current = null;
    }
  };

  const clearArrow = () => {
    if (arrowTimer.current) {
      clearTimeout(arrowTimer.current);
      arrowTimer.current = null;
    }
  };

  const applyArrow = useCallback(() => {
    clearArrow();
    setSizeLevel((prev) => {
      const next = Math.min(3, prev + 1);
      sizeRef.current = next;
      pickScale.current = ARROW_SIZES[next];
      return next;
    });
    arrowTimer.current = setTimeout(() => {
      sizeRef.current = 0;
      setSizeLevel(0);
      pickScale.current = 1;
    }, ARROW_MS);
  }, []);

  const runFall = useCallback(async (startTier: Exclude<PickTier, null>) => {
    setPhase("falling");
    running.current = true;
    curTierRef.current = startTier;
    curHpRef.current = TIER_HP[startTier];
    sizeRef.current = 0;
    pickScale.current = 1;
    clearArrow();
    setSizeLevel(0);
    setTier(startTier);
    setHp(TIER_HP[startTier]);
    setMaxHp(TIER_HP[startTier]);
    setMined(0);
    minedRef.current = 0;

    const grid = makeMine();
    gridRef.current = grid;

    pickY.current = -40;
    pickX.current = Math.floor(COLS / 2);
    pickRot.current = 0;
    vy.current = 2.2;

    const GRAVITY = 0.35;
    const MAX_VY = 7.5;
    const HIT_SLOW = 0.35;

    await new Promise<void>((resolve) => {
      let last = performance.now();
      let acc = 0;

      const step = (now: number) => {
        if (!running.current) {
          resolve();
          return;
        }
        const dt = Math.min(32, now - last);
        last = now;
        acc += dt;

        while (acc >= 16) {
          acc -= 16;

          if (curHpRef.current <= 0) {
            running.current = false;
            break;
          }

          vy.current = Math.min(MAX_VY, vy.current + GRAVITY);
          pickY.current += vy.current;
          pickRot.current += vy.current * 1.8;

          const row = Math.floor(pickY.current / CELL);
          const col = Math.max(0, Math.min(COLS - 1, Math.round(pickX.current)));
          pickX.current = col;

          if (row >= ROWS) {
            running.current = false;
            break;
          }

          if (row >= 0 && row < ROWS) {
            const half = sizeRef.current >= 2 ? 1 : 0;

            for (let dc = -half; dc <= half; dc++) {
              const cc = col + dc;
              if (cc < 0 || cc >= COLS) continue;
              const cell = grid[row][cc];
              if (!cell || cell.kind === "air") continue;
              if (cell.hp <= 0 && cell.kind !== "slime") continue;

              if (cell.kind === "slime") {
                vy.current = -6.5;
                pickX.current = Math.max(1, Math.min(COLS - 2, col + (Math.random() > 0.5 ? 1 : -1)));
                addFloat(cc * CELL, pickY.current, "BOUNCE", "#4ade80");
                continue;
              }

              cell.hp -= 1;
              curHpRef.current = Math.max(0, curHpRef.current - 1);
              setHp(curHpRef.current);
              vy.current *= HIT_SLOW;
              pickRot.current += 25 + Math.random() * 40;
              setShake(4);

              if (cell.hp <= 0) {
                if (cell.kind === "tnt") {
                  addFloat(cc * CELL, pickY.current, "BOOM", "#ef4444");
                  setShake(10);
                  for (let dr = -1; dr <= 1; dr++) {
                    for (let dcc = -1; dcc <= 1; dcc++) {
                      const nr = row + dr;
                      const nc = cc + dcc;
                      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
                      const t = grid[nr][nc];
                      if (!t || t.hp <= 0) continue;
                      t.hp = 0;
                      const m = BLOCK_DEF[t.kind].mult;
                      if (m > 0) {
                        const gain = betRef.current * m;
                        minedRef.current += gain;
                        setMined(minedRef.current);
                        addFloat(nc * CELL, nr * CELL, `+${gain.toFixed(2)}`, "#fde047");
                      }
                    }
                  }
                } else if (cell.kind === "bench") {
                  const idx = TIER_ORDER.indexOf(curTierRef.current);
                  if (idx < TIER_ORDER.length - 1) {
                    curTierRef.current = TIER_ORDER[idx + 1];
                    setTier(curTierRef.current);
                    addFloat(cc * CELL, pickY.current, TIER_LABEL[curTierRef.current], "#22c55e");
                  } else {
                    addFloat(cc * CELL, pickY.current, "REPAIR", "#22c55e");
                  }
                  curHpRef.current = TIER_HP[curTierRef.current];
                  setMaxHp(TIER_HP[curTierRef.current]);
                  setHp(curHpRef.current);
                } else if (cell.kind === "arrow") {
                  applyArrow();
                  addFloat(cc * CELL, pickY.current, `SIZE ×${ARROW_SIZES[Math.min(3, sizeRef.current + 1)]}`, "#facc15");
                } else {
                  const m = BLOCK_DEF[cell.kind].mult;
                  if (m > 0) {
                    const gain = betRef.current * m;
                    minedRef.current += gain;
                    setMined(minedRef.current);
                    addFloat(cc * CELL, pickY.current, `+${gain.toFixed(2)}`, "#fde047");
                  }
                }
              }
            }

            if (vy.current < 1.2) {
              vy.current = 1.2;
            }
          }
        }

        setFrame((f) => f + 1);
        if (running.current) requestAnimationFrame(step);
        else resolve();
      };

      requestAnimationFrame(step);
    });

    setPhase("result");
    setShowResult(true);
  }, [addFloat, applyArrow]);

  const play = useCallback(async () => {
    if (busy) return;
    if (bet <= 0 || bet > bal) {
      setError("Недостаточно средств");
      return;
    }
    setError(null);
    setShowResult(false);
    setLastWin(0);
    setMined(0);
    setTier(null);
    setSizeLevel(0);
    sizeRef.current = 0;
    pickScale.current = 1;
    clearArrow();
    setPhase("spinning");
    setSpinSym("x");

    let ang = 0;
    const syms: Array<"x" | PickTier> = ["x", "wood", "iron", "gold", "diamond", "wood", "iron", "x"];
    stopSpin();
    spinTimer.current = setInterval(() => {
      ang += 28;
      setSpinAngle(ang);
      setSpinSym(syms[Math.floor(ang / 40) % syms.length]);
    }, 40);

    try {
      const res = await fetch(`${API}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, bet }),
      });
      const data = await res.json();
      await sleep(1200);
      stopSpin();

      if (!res.ok) {
        setError(data.error || data.message || "Ошибка");
        setPhase("idle");
        return;
      }

      let serverTier: PickTier = data.tier ?? null;
      if (!serverTier && emptyStreak + 1 >= EMPTY_GUARANTEE) {
        serverTier = TIER_ORDER[Math.floor(Math.random() * TIER_ORDER.length)];
      }

      if (serverTier) {
        setSpinSym(serverTier);
        setEmptyStreak(0);
      } else {
        setSpinSym("x");
        setEmptyStreak((s) => Math.min(EMPTY_GUARANTEE, s + 1));
      }
      setTier(serverTier);

      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }
      const win = Number(data.payout) || 0;
      setLastWin(win);

      if (!serverTier) {
        setPhase("result");
        setShowResult(true);
        return;
      }

      setPhase("reveal");
      await sleep(700);
      await runFall(serverTier);

      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }
    } catch {
      stopSpin();
      setError("Сеть недоступна");
      setPhase("idle");
    }
  }, [busy, bet, bal, telegramId, onBalanceChange, runFall, emptyStreak]);

  useEffect(() => {
    if (shake <= 0) return;
    const t = setTimeout(() => setShake((s) => Math.max(0, s - 1)), 40);
    return () => clearTimeout(t);
  }, [shake]);

  useEffect(() => () => {
    stopSpin();
    clearArrow();
    running.current = false;
  }, []);

  const cameraY = Math.max(0, pickY.current - VIEW_H * 0.35);
  const grid = gridRef.current;
  void frame;

  return (
    <div style={S.root}>
      <div style={S.sky} />

      <div style={S.topBar}>
        {onBack && (
          <button type="button" style={S.back} onClick={onBack}>←</button>
        )}
        <div style={S.online}><span style={S.dot} />Онлайн: {online}</div>
      </div>

      <div style={S.logo}>
        CRAFT <span style={{ color: "#fbbf24" }}>&</span> DROP
      </div>

      <div style={S.track}>
        {Array.from({ length: EMPTY_GUARANTEE }).map((_, i) => (
          <div
            key={i}
            style={{
              ...S.trackCell,
              background: i < emptyStreak ? "#facc15" : "#1e1b1b",
              boxShadow: i < emptyStreak ? "0 0 6px #facc15" : "none",
            }}
          />
        ))}
        <span style={{ color: "#facc15", marginLeft: 4, fontSize: 14 }}>↗</span>
      </div>

      {(phase === "idle" || phase === "spinning" || phase === "reveal" || (phase === "result" && !tier)) && (
        <div style={S.reelArea}>
          <div
            style={{
              ...S.circle,
              transform: `rotate(${spinAngle}deg)`,
              transition: phase === "spinning" ? "none" : "transform 0.4s ease-out",
            }}
          >
            <div style={S.circleInner}>
              {spinSym === "x" ? (
                <span style={{ color: "#ef4444", fontSize: 42, fontWeight: 900 }}>✕</span>
              ) : (
                <span style={{ fontSize: 40, filter: "drop-shadow(0 2px 0 #0008)" }}>
                  {TIER_SPRITE[spinSym]}
                </span>
              )}
            </div>
          </div>
          {phase === "spinning" && <div style={S.spinHint}>КРУТИМ...</div>}
          {phase === "reveal" && tier && (
            <div style={{ ...S.spinHint, color: TIER_COLOR[tier] }}>
              {TIER_LABEL[tier]} · {TIER_HP[tier]} HP
            </div>
          )}
          {phase === "idle" && <div style={S.spinHint}>СДЕЛАЙТЕ СТАВКУ</div>}
        </div>
      )}

      {(phase === "falling" || (phase === "result" && tier)) && (
        <div
          style={{
            ...S.shaft,
            transform: shake ? `translate(${(shake % 2 ? 3 : -3)}px, ${(shake % 3 ? 2 : -2)}px)` : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: COLS * CELL,
              height: ROWS * CELL,
              marginLeft: -(COLS * CELL) / 2,
              transform: `translateY(${-cameraY}px)`,
              willChange: "transform",
            }}
          >
            {grid.map((row, ri) =>
              row.map((cell, ci) => {
                if (cell.kind === "air" || (cell.hp <= 0 && cell.kind !== "slime")) return null;
                const cracked = cell.maxHp > 1 && cell.hp < cell.maxHp;
                return (
                  <div
                    key={`${ri}-${ci}`}
                    style={{
                      position: "absolute",
                      left: ci * CELL,
                      top: ri * CELL,
                      width: CELL - 1,
                      height: CELL - 1,
                      background:
                        cell.kind === "tnt"
                          ? "repeating-linear-gradient(0deg,#fff 0 4px,#b91c1c 4px 8px)"
                          : cell.kind === "arrow"
                            ? "#166534"
                            : cell.kind === "bench"
                              ? "#a16207"
                              : cell.kind === "slime"
                                ? "#4ade80"
                                : cell.kind === "diamond"
                                  ? "linear-gradient(135deg,#7dd3fc,#0ea5e9)"
                                  : cell.kind === "emerald"
                                    ? "linear-gradient(135deg,#86efac,#16a34a)"
                                    : cell.kind === "gold"
                                      ? "linear-gradient(135deg,#fde047,#ca8a04)"
                                      : cell.kind === "redstone"
                                        ? "#b91c1c"
                                        : cell.kind === "copper"
                                          ? "#c2410c"
                                          : BLOCK_DEF[cell.kind].color,
                      border: "1px solid rgba(0,0,0,0.35)",
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                      textShadow: "0 1px 0 #000",
                      opacity: cracked ? 0.7 : 1,
                    }}
                  >
                    {cell.kind === "tnt"
                      ? "TNT"
                      : cell.kind === "arrow"
                        ? "⬆"
                        : cell.kind === "bench"
                          ? "▣"
                          : cell.kind === "slime"
                            ? "●"
                            : cell.kind === "diamond" || cell.kind === "emerald"
                              ? "◆"
                              : ""}
                    {cracked && (
                      <div style={{ position: "absolute", bottom: 2, left: 3, right: 3, height: 3, background: "#111" }}>
                        <div style={{ height: "100%", width: `${(cell.hp / cell.maxHp) * 100}%`, background: "#facc15" }} />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {tier && (
              <div
                style={{
                  position: "absolute",
                  left: pickX.current * CELL + CELL / 2,
                  top: pickY.current,
                  transform: `translate(-50%, -50%) rotate(${pickRot.current}deg) scale(${pickScale.current})`,
                  fontSize: 26,
                  zIndex: 20,
                  filter: "drop-shadow(0 2px 2px #0008)",
                  pointerEvents: "none",
                }}
              >
                <div style={{ textAlign: "center", lineHeight: 1 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                      textShadow: "0 1px 2px #000",
                      marginBottom: 2,
                      transform: `rotate(${-pickRot.current}deg)`,
                    }}
                  >
                    ❤️ {hp}/{maxHp}
                  </div>
                  <span style={{ color: TIER_COLOR[tier] }}>⛏️</span>
                </div>
              </div>
            )}

            {floats.map((f) => (
              <div
                key={f.id}
                style={{
                  position: "absolute",
                  left: f.x,
                  top: f.y,
                  transform: "translate(-50%, -100%)",
                  color: f.color,
                  fontWeight: 900,
                  fontSize: 13,
                  textShadow: "0 1px 2px #000",
                  animation: "floatUp 0.9s ease-out forwards",
                  zIndex: 30,
                  pointerEvents: "none",
                }}
              >
                {f.text}
              </div>
            ))}
          </div>

          <div style={S.shaftEdgeL} />
          <div style={S.shaftEdgeR} />
        </div>
      )}

      {phase === "falling" && (
        <div style={S.fallStatus}>
          {TIER_LABEL[tier!]} · HP {hp}/{maxHp}
          {sizeLevel > 0 ? ` · ×${radius}` : ""} · +{mined.toFixed(3)} TON
        </div>
      )}

      <div style={S.bonus}>
        <button type="button" style={S.bonusBtn} disabled>🛒 BUY BONUS</button>
      </div>

      <div style={S.controls}>
        <button type="button" style={S.side} onClick={onBack}>☰</button>
        <button type="button" style={S.side} disabled={busy}>▶</button>
        <button
          type="button"
          style={{
            ...S.spin,
            opacity: busy || bet > bal ? 0.5 : 1,
            transform: phase === "spinning" ? "scale(0.92)" : "scale(1)",
          }}
          disabled={busy || bet > bal}
          onClick={() => void play()}
        >
          <span style={{ fontSize: 30 }}>↻</span>
        </button>
        <button type="button" style={S.side} disabled={busy}
          onClick={() => setBet((b) => Math.max(0.1, +(b / 2).toFixed(2)))}>½</button>
        <button type="button" style={S.side} disabled={busy}
          onClick={() => setBet((b) => Math.min(bal, +(b * 2).toFixed(2)))}>2×</button>
      </div>

      <div style={S.presets}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            style={{
              ...S.preset,
              borderColor: bet === p ? "#22c55e" : "#3f3f46",
              color: bet === p ? "#4ade80" : "#a1a1aa",
            }}
            disabled={busy}
            onClick={() => setBet(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={S.footer}>
        <div>
          <div style={S.lbl}>БАЛАНС</div>
          <div style={S.val}>{bal.toFixed(2)} TON</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.lbl}>СТАВКА</div>
          <div style={S.val}>{bet.toFixed(2)} TON</div>
        </div>
      </div>

      {error && <div style={S.err}>{error}</div>}

      {showResult && phase === "result" && (
        <div style={S.overlay} onClick={() => { setShowResult(false); setPhase("idle"); }}>
          <div style={S.card}>
            {tier ? (
              <>
                <div style={{ fontSize: 44 }}>{TIER_SPRITE[tier]}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: TIER_COLOR[tier] }}>{TIER_LABEL[tier]}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: lastWin > 0 ? "#4ade80" : "#f87171", marginTop: 4 }}>
                  {lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "0 TON"}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, color: "#ef4444" }}>✕</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#f87171" }}>ПУСТО</div>
              </>
            )}
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 10 }}>нажми чтобы продолжить</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translate(-50%, -100%); }
          100% { opacity: 0; transform: translate(-50%, -180%); }
        }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    position: "relative", maxWidth: 420, margin: "0 auto", minHeight: "100dvh",
    overflow: "hidden", fontFamily: "system-ui,sans-serif", color: "#fff",
    userSelect: "none", background: "#0c1222",
  },
  sky: {
    position: "absolute", inset: 0, zIndex: 0,
    background: "linear-gradient(180deg,#7dd3fc 0%,#bae6fd 40%,#e0f2fe 70%,#f0f9ff 100%)",
  },
  topBar: {
    position: "relative", zIndex: 5, display: "flex", justifyContent: "center",
    padding: "10px 12px 0",
  },
  back: {
    position: "absolute", left: 12, background: "rgba(0,0,0,.35)", border: "none",
    color: "#fff", width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer",
  },
  online: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(15,10,30,.75)", borderRadius: 20, padding: "6px 14px",
    fontSize: 13, fontWeight: 600,
  },
  dot: {
    width: 8, height: 8, borderRadius: "50%", background: "#22c55e",
    boxShadow: "0 0 6px #22c55e",
  },
  logo: {
    position: "relative", zIndex: 5, textAlign: "center", marginTop: 6,
    fontWeight: 900, fontSize: 26, letterSpacing: 1,
    textShadow: "0 3px 0 #1a1a1a, 0 5px 10px rgba(0,0,0,.3)", color: "#0f172a",
  },
  track: {
    position: "relative", zIndex: 5, display: "flex", justifyContent: "center",
    alignItems: "center", gap: 4, marginTop: 8,
    background: "linear-gradient(180deg,#5a4a3a,#3d3228)", border: "3px solid #2a2118",
    borderRadius: 8, padding: "6px 10px", width: "fit-content",
    marginLeft: "auto", marginRight: "auto",
    boxShadow: "inset 0 2px 0 #7a6a55, 0 3px 0 #1a140f",
  },
  trackCell: {
    width: 18, height: 14, borderRadius: 3, border: "1px solid #0a0a0a",
  },
  reelArea: {
    position: "relative", zIndex: 5, display: "flex", flexDirection: "column",
    alignItems: "center", marginTop: 24, marginBottom: 8,
  },
  circle: {
    width: 140, height: 140, borderRadius: "50%",
    background: "conic-gradient(from 0deg,#1e293b,#334155,#1e293b,#475569,#1e293b)",
    border: "6px solid #0f172a",
    boxShadow: "0 8px 0 #020617, inset 0 0 20px #0008",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  circleInner: {
    width: 88, height: 88, borderRadius: "50%",
    background: "radial-gradient(circle at 40% 35%,#1e293b,#0f172a)",
    border: "3px solid #334155",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  spinHint: {
    marginTop: 10, fontSize: 13, fontWeight: 800, color: "#0f172a",
    textShadow: "0 1px 0 #fff8",
  },
  shaft: {
    position: "relative", zIndex: 5, height: 340, margin: "8px 12px 0",
    borderRadius: 12, overflow: "hidden",
    background: "linear-gradient(180deg,#87CEEB 0%,#5a8f3a 18%,#3d5c2e 22%,#1c1917 100%)",
    border: "3px solid #292524",
    boxShadow: "inset 0 0 30px #0006",
  },
  shaftEdgeL: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 18,
    background: "linear-gradient(90deg,#44403c,#29252400)", pointerEvents: "none", zIndex: 5,
  },
  shaftEdgeR: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 18,
    background: "linear-gradient(270deg,#44403c,#29252400)", pointerEvents: "none", zIndex: 5,
  },
  fallStatus: {
    position: "relative", zIndex: 5, textAlign: "center", marginTop: 6,
    fontSize: 12, fontWeight: 700, color: "#0f172a",
  },
  bonus: {
    position: "relative", zIndex: 5, display: "flex", justifyContent: "center", marginTop: 8,
  },
  bonusBtn: {
    background: "linear-gradient(180deg,#d4a017,#a67c00)", border: "2px solid #7a5c00",
    borderRadius: 8, color: "#1a1400", fontWeight: 800, fontSize: 13, padding: "8px 20px",
    cursor: "not-allowed", opacity: 0.7, boxShadow: "0 3px 0 #5c4400",
  },
  controls: {
    position: "relative", zIndex: 5, display: "flex", justifyContent: "center",
    gap: 10, marginTop: 10, padding: "0 12px",
  },
  side: {
    width: 42, height: 42, borderRadius: "50%", border: "2px solid #3f3f46",
    background: "linear-gradient(180deg,#3f3f46,#27272a)", color: "#e4e4e7",
    fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 3px 0 #18181b",
  },
  spin: {
    width: 72, height: 72, borderRadius: "50%", border: "3px solid #166534",
    background: "linear-gradient(180deg,#4ade80,#16a34a)", color: "#052e16",
    cursor: "pointer", boxShadow: "0 5px 0 #14532d, 0 8px 20px rgba(22,163,74,.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "transform .1s, opacity .15s",
  },
  presets: {
    position: "relative", zIndex: 5, display: "flex", flexWrap: "wrap",
    justifyContent: "center", gap: 5, marginTop: 8, padding: "0 12px",
  },
  preset: {
    background: "rgba(0,0,0,.35)", border: "1px solid #3f3f46", borderRadius: 6,
    fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer",
  },
  footer: {
    position: "relative", zIndex: 5, display: "flex", justifyContent: "space-between",
    padding: "12px 20px 20px",
  },
  lbl: { fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: 1 },
  val: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  err: {
    position: "relative", zIndex: 10, margin: "0 16px 12px",
    background: "rgba(127,29,29,.9)", borderRadius: 8, padding: "8px 12px",
    fontSize: 13, textAlign: "center",
  },
  overlay: {
    position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  card: {
    background: "linear-gradient(180deg,#1e293b,#0f172a)", border: "2px solid #334155",
    borderRadius: 16, padding: "24px 32px", textAlign: "center", minWidth: 210,
    boxShadow: "0 12px 40px rgba(0,0,0,.5)", color: "#fff",
  },
};
