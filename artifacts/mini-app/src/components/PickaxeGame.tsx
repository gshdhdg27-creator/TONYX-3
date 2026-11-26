/**
 * PickaxeGame — Craft & Drop
 * artifacts/mini-app/src/components/PickaxeGame.tsx
 *
 * Play → барабан крутит кирки (дерево→алмаз / пусто) → стоп → падение → добыча
 * Верстак: полный HP + +1 уровень (алмаз только хил)
 * Стрелка ↑: больше радиус ломания
 * Руды → TON
 */
import { useCallback, useEffect, useRef, useState } from "react";

type PickTier = "wood" | "stone" | "iron" | "diamond" | null;
type Phase = "idle" | "spinning" | "reveal" | "falling" | "result";
type ReelSym = "x" | "wood" | "stone" | "iron" | "diamond";
type BlockKind =
  | "dirt" | "stone" | "copper" | "redstone" | "gold"
  | "diamond" | "emerald" | "bench" | "arrow" | "tnt" | "slime";

const TIER_HP = { wood: 100, stone: 150, iron: 200, diamond: 400 } as const;
const TIER_ORDER: Exclude<PickTier, null>[] = ["wood", "stone", "iron", "diamond"];
const TIER_LABEL = { wood: "Деревянная", stone: "Каменная", iron: "Железная", diamond: "Алмазная" };
const TIER_COLOR = { wood: "#b45309", stone: "#94a3b8", iron: "#e2e8f0", diamond: "#22d3ee" };
const REEL_EMOJI: Record<ReelSym, string> = {
  x: "🚫", wood: "🪓", stone: "⛏️", iron: "⚒️", diamond: "💎",
};
const BLOCK_EMOJI: Record<BlockKind, string> = {
  dirt: "🟫", stone: "⬛", copper: "🟠", redstone: "🔴", gold: "🟡",
  diamond: "💠", emerald: "🟢", bench: "🛠️", arrow: "⬆️", tnt: "💣", slime: "🟩",
};
const ORE_MULT: Partial<Record<BlockKind, number>> = {
  copper: 0.03, redstone: 0.1, gold: 0.3, diamond: 0.9, emerald: 2.5,
};
const PRESETS = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const API = "/api/mini/games/pickaxe";
const ROWS = 7;
const COLS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function weightedBlock(): BlockKind {
  const table: [BlockKind, number][] = [
    ["dirt", 22], ["stone", 18], ["copper", 12], ["redstone", 8],
    ["gold", 5], ["diamond", 2], ["emerald", 1],
    ["bench", 4], ["arrow", 4], ["tnt", 3], ["slime", 3],
  ];
  const tot = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return "dirt";
}

function makeMine(): BlockKind[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => weightedBlock())
  );
}

function randReelFrame(): ReelSym[] {
  const p: ReelSym[] = ["x", "x", "wood", "wood", "stone", "stone", "iron", "diamond"];
  return Array.from({ length: 5 }, () => p[Math.floor(Math.random() * p.length)]);
}

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
  const [reel, setReel] = useState<ReelSym[]>(["wood", "stone", "iron", "diamond", "x"]);
  const [spinIdx, setSpinIdx] = useState(0);
  const [tier, setTier] = useState<PickTier>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [radius, setRadius] = useState(1);
  const [pickRow, setPickRow] = useState(-1);
  const [pickCol, setPickCol] = useState(2);
  const [lastWin, setLastWin] = useState(0);
  const [mined, setMined] = useState(0);
  const [online] = useState(() => 12 + Math.floor(Math.random() * 18));
  const [error, setError] = useState<string | null>(null);
  const [multTrack, setMultTrack] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [localBal, setLocalBal] = useState(balance);
  const [floatMsg, setFloatMsg] = useState<{ t: string; c: string } | null>(null);
  const [mine, setMine] = useState(makeMine);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [flashCell, setFlashCell] = useState<string | null>(null);
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setLocalBal(balance), [balance]);
  const bal = localBal;
  const busy = phase === "spinning" || phase === "reveal" || phase === "falling";

  const flash = (t: string, c = "#fafafa") => {
    setFloatMsg({ t, c });
    setTimeout(() => setFloatMsg(null), 1000);
  };

  const stopSpinTimer = () => {
    if (spinTimer.current) {
      clearInterval(spinTimer.current);
      spinTimer.current = null;
    }
  };

  const DRUM: ReelSym[] = ["x", "wood", "stone", "iron", "diamond", "wood", "stone", "x", "iron", "diamond"];

  const runFall = useCallback(async (startTier: Exclude<PickTier, null>) => {
    setPhase("falling");
    let curTier = startTier;
    let curHp = TIER_HP[curTier];
    let rad = 1;
    setTier(curTier);
    setHp(curHp);
    setMaxHp(TIER_HP[curTier]);
    setRadius(1);
    setPickRow(-1);
    setPickCol(2);
    const grid = makeMine();
    setMine(grid);
    setBroken(new Set());
    setMined(0);
    let localMined = 0;

    await sleep(350);
    setPickRow(0);
    await sleep(280);

    let col = 2;
    for (let r = 0; r < ROWS && curHp > 0; r++) {
      setPickRow(r);
      setPickCol(col);
      await sleep(240);

      const hits: { rr: number; cc: number; kind: BlockKind }[] = [];
      for (let dc = -(rad - 1); dc <= rad - 1; dc++) {
        const cc = col + dc;
        if (cc < 0 || cc >= COLS) continue;
        const kind = grid[r][cc];
        hits.push({ rr: r, cc, kind });
      }

      for (const h of hits) {
        const key = `${h.rr},${h.cc}`;
        setBroken((s) => new Set(s).add(key));
        setFlashCell(key);
        const kind = h.kind;

        if (kind === "tnt") {
          flash("💥 BOOM", "#ef4444");
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = h.rr + dr;
              const nc = h.cc + dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                setBroken((s) => new Set(s).add(`${nr},${nc}`));
                const k2 = grid[nr][nc];
                const m = ORE_MULT[k2];
                if (m) {
                  localMined += bet * m;
                  setMined(localMined);
                }
              }
            }
          }
          curHp = Math.max(0, curHp - 6);
        } else if (kind === "slime") {
          flash("↗ BOUNCE", "#4ade80");
          col = Math.max(0, Math.min(COLS - 1, col + (Math.random() > 0.5 ? 1 : -1)));
          setPickCol(col);
          curHp = Math.max(0, curHp - 1);
        } else if (kind === "bench") {
          const idx = TIER_ORDER.indexOf(curTier);
          if (idx < TIER_ORDER.length - 1) {
            curTier = TIER_ORDER[idx + 1];
            setTier(curTier);
            flash(`🛠️ ${TIER_LABEL[curTier]}`, "#22c55e");
          } else {
            flash("🛠️ REPAIR", "#22c55e");
          }
          curHp = TIER_HP[curTier];
          setMaxHp(TIER_HP[curTier]);
        } else if (kind === "arrow") {
          rad = Math.min(3, rad + 1);
          setRadius(rad);
          flash(`⬆️ SIZE ×${rad}`, "#facc15");
          curHp = Math.max(0, curHp - 1);
        } else {
          const m = ORE_MULT[kind];
          if (m) {
            localMined += bet * m;
            setMined(localMined);
            flash(`+${(bet * m).toFixed(3)}`, "#4ade80");
          }
          curHp = Math.max(0, curHp - 1);
        }
      }

      setHp(curHp);
      await sleep(90);
      setFlashCell(null);
    }

    setPhase("result");
    setShowResult(true);
  }, [bet]);

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
    setPickRow(-1);
    setRadius(1);
    setPhase("spinning");

    let tick = 0;
    stopSpinTimer();
    spinTimer.current = setInterval(() => {
      tick++;
      setSpinIdx((i) => (i + 1) % DRUM.length);
      setReel(randReelFrame());
    }, 55);

    try {
      const res = await fetch(`${API}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, bet }),
      });
      const data = await res.json();

      await sleep(900);
      stopSpinTimer();

      if (!res.ok) {
        setError(data.error || data.message || "Ошибка");
        setPhase("idle");
        return;
      }

      const serverTier: PickTier = data.tier ?? null;

      if (serverTier) {
        const fr: ReelSym[] = [serverTier, serverTier, serverTier, "x", serverTier];
        setReel(fr.sort(() => Math.random() - 0.5) as ReelSym[]);
        setSpinIdx(DRUM.indexOf(serverTier) >= 0 ? DRUM.indexOf(serverTier) : 1);
      } else {
        setReel(["x", "x", "x", "x", "x"]);
        setSpinIdx(0);
      }
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
        flash("ПУСТО", "#ef4444");
        return;
      }

      setMultTrack(0);
      setPhase("reveal");
      flash(TIER_LABEL[serverTier], TIER_COLOR[serverTier]);
      await sleep(700);
      await runFall(serverTier);

      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }
    } catch {
      stopSpinTimer();
      setError("Сеть недоступна");
      setPhase("idle");
    }
  }, [busy, bet, bal, telegramId, onBalanceChange, runFall]);

  useEffect(() => () => stopSpinTimer(), []);

  const centerSym = phase === "spinning" ? DRUM[spinIdx] : (tier ?? (reel[2] || "x"));

  return (
    <div style={S.root}>
      <div style={S.sky} />
      <div style={S.hillL} />
      <div style={S.hillR} />

      <div style={S.topBar}>
        {onBack && (
          <button type="button" style={S.back} onClick={onBack}>←</button>
        )}
        <div style={S.online}>
          <span style={S.dot} />Онлайн: {online}
        </div>
      </div>

      <div style={S.logo}>
        CRAFT <span style={{ color: "#fbbf24" }}>&</span> DROP
      </div>

      <div style={S.track}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              ...S.trackCell,
              background: i < multTrack ? "#facc15" : "#1e1b1b",
              boxShadow: i < multTrack ? "0 0 6px #facc15" : "none",
            }}
          />
        ))}
        <span style={{ color: "#facc15", marginLeft: 4, fontSize: 14 }}>↗</span>
      </div>

      <div style={S.reelWrap}>
        <div style={S.reelFrame}>
          {reel.map((sym, i) => (
            <div
              key={i}
              style={{
                ...S.reelCell,
                transform: phase === "spinning" ? `translateY(${(spinIdx % 3) - 1}px)` : "none",
                background:
                  sym === "x"
                    ? "linear-gradient(180deg,#4a1515,#1c0a0a)"
                    : sym === "diamond"
                    ? "linear-gradient(180deg,#0e7490,#164e63)"
                    : "linear-gradient(180deg,#3f3f46,#1c1917)",
                borderColor: sym === "x" ? "#7f1d1d" : "#52525b",
                boxShadow:
                  phase === "reveal" && tier && sym === tier
                    ? `0 0 12px ${TIER_COLOR[tier]}`
                    : "inset 0 1px 0 #fff2",
              }}
            >
              <span style={{ fontSize: 28, filter: "drop-shadow(0 2px 0 #000)" }}>
                {REEL_EMOJI[sym]}
              </span>
            </div>
          ))}
        </div>

        {(phase === "spinning" || phase === "reveal") && (
          <div style={S.bigDrum}>
            <div
              style={{
                ...S.bigSym,
                animation: phase === "spinning" ? "pdDrum 0.08s linear infinite" : "none",
                color: centerSym !== "x" && centerSym in TIER_COLOR
                  ? TIER_COLOR[centerSym as Exclude<PickTier, null>]
                  : "#f87171",
              }}
            >
              {REEL_EMOJI[centerSym]}
            </div>
            {phase === "spinning" && (
              <div style={S.spinLabel}>КРУТИМ...</div>
            )}
            {phase === "reveal" && tier && (
              <div style={{ ...S.spinLabel, color: TIER_COLOR[tier] }}>
                {TIER_LABEL[tier]}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={S.field}>
        {floatMsg && (
          <div style={{ ...S.float, color: floatMsg.c }}>{floatMsg.t}</div>
        )}

        {tier && (phase === "falling" || phase === "reveal") && pickRow >= -1 && (
          <div
            style={{
              position: "absolute",
              left: `${12 + pickCol * (76 / COLS)}%`,
              top: pickRow < 0 ? "2%" : `${8 + pickRow * 11}%`,
              fontSize: 32 + radius * 4,
              transform: "translateX(-50%)",
              transition: "top 0.22s ease-in, left 0.18s ease, font-size 0.2s",
              zIndex: 12,
              filter: "drop-shadow(0 3px 2px #0008)",
              color: TIER_COLOR[tier],
            }}
          >
            ⛏️
            <div style={S.hpWrap}>
              <div
                style={{
                  ...S.hpFill,
                  width: `${maxHp ? (hp / maxHp) * 100 : 0}%`,
                  background:
                    hp / maxHp > 0.5 ? "#22c55e" : hp / maxHp > 0.25 ? "#eab308" : "#ef4444",
                }}
              />
            </div>
            {radius > 1 && (
              <div style={{ fontSize: 10, textAlign: "center", color: "#facc15", fontWeight: 800 }}>
                ×{radius}
              </div>
            )}
          </div>
        )}

        {(phase === "falling" || (phase === "result" && tier)) && (
          <div style={S.mine}>
            {mine.map((row, ri) => (
              <div key={ri} style={{ display: "flex", gap: 3 }}>
                {row.map((b, ci) => {
                  const key = `${ri},${ci}`;
                  const isBroken = broken.has(key);
                  const isFlash = flashCell === key;
                  return (
                    <div
                      key={ci}
                      style={{
                        width: 30,
                        height: 30,
                        fontSize: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isBroken ? 0.12 : 1,
                        transform: isFlash ? "scale(1.2)" : "scale(1)",
                        filter: isFlash ? "brightness(1.8)" : "none",
                        background: "rgba(0,0,0,0.28)",
                        borderRadius: 4,
                        transition: "transform 0.1s, opacity 0.2s",
                      }}
                    >
                      {isBroken ? "" : BLOCK_EMOJI[b]}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {(phase === "idle" || phase === "spinning" || (phase === "result" && !tier)) && (
          <div style={S.platform}>▦</div>
        )}

        <div style={S.chicken}>🐔</div>
      </div>

      <div style={S.ground}>
        <div style={{ height: 12, background: "linear-gradient(180deg,#5cbf3a,#3d8b37)" }} />
        <div style={{ height: 22, background: "linear-gradient(180deg,#9a6a3a,#6b4423)" }} />
      </div>

      <div style={S.bonus}>
        <button type="button" style={S.bonusBtn} disabled title="Скоро">
          🛒 BUY BONUS
        </button>
        <div style={S.hint}>
          {phase === "idle" && "СДЕЛАЙТЕ СВОЮ СТАВКУ!"}
          {phase === "spinning" && "БАРАБАН КРУТИТСЯ..."}
          {phase === "reveal" && tier && `ВЫПАЛА: ${TIER_LABEL[tier]}`}
          {phase === "falling" && `HP ${hp}/${maxHp} · добыто ${mined.toFixed(3)}`}
          {phase === "result" && (lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "ПУСТО")}
        </div>
      </div>

      <div style={S.controls}>
        <button type="button" style={S.side} onClick={onBack} title="Меню">☰</button>
        <button type="button" style={S.side} disabled={busy} title="Авто">▶</button>
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
        <button
          type="button"
          style={S.side}
          disabled={busy}
          onClick={() => setBet((b) => Math.max(0.1, +(b / 2).toFixed(2)))}
        >
          ½
        </button>
        <button
          type="button"
          style={S.side}
          disabled={busy}
          onClick={() => setBet((b) => Math.min(bal, +(b * 2).toFixed(2)))}
        >
          2×
        </button>
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
        <div
          style={S.overlay}
          onClick={() => {
            setShowResult(false);
            setPhase("idle");
          }}
        >
          <div style={S.card}>
            {tier ? (
              <>
                <div style={{ fontSize: 44 }}>{REEL_EMOJI[tier]}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: TIER_COLOR[tier] }}>
                  {TIER_LABEL[tier]}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: lastWin > 0 ? "#4ade80" : "#f87171",
                    marginTop: 4,
                  }}
                >
                  {lastWin > 0 ? `+${lastWin.toFixed(3)} TON` : "0 TON"}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44 }}>🚫</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#f87171" }}>ПУСТО</div>
                <div style={{ fontSize: 13, color: "#a1a1aa" }}>Кирка не выпала</div>
              </>
            )}
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 10 }}>
              нажми чтобы продолжить
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pdDrum {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
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
    background: "linear-gradient(180deg,#5ec8f0 0%,#87d8f8 40%,#c8ecff 70%,#e8f7ff 100%)",
  },
  hillL: {
    position: "absolute", bottom: "26%", left: "-12%", width: "55%", height: "32%",
    background: "linear-gradient(180deg,#5a9e3a,#3d7a28)", borderRadius: "50% 50% 0 0",
    opacity: 0.9, zIndex: 0,
  },
  hillR: {
    position: "absolute", bottom: "26%", right: "-14%", width: "58%", height: "36%",
    background: "linear-gradient(180deg,#4d8f32,#356b22)", borderRadius: "50% 50% 0 0",
    opacity: 0.92, zIndex: 0,
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
    textShadow: "0 3px 0 #1a1a1a, 0 5px 10px rgba(0,0,0,.3)",
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
  reelWrap: {
    position: "relative", zIndex: 5, marginTop: 10,
  },
  reelFrame: {
    margin: "0 16px", display: "flex", gap: 5,
    background: "linear-gradient(180deg,#6b7280,#4b5563)", borderRadius: 12, padding: 8,
    border: "3px solid #374151",
    boxShadow: "inset 0 2px 0 #9ca3af, 0 5px 0 #1f2937, 0 10px 24px rgba(0,0,0,.35)",
  },
  reelCell: {
    flex: 1, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, border: "2px solid #52525b", transition: "background .1s",
  },
  bigDrum: {
    position: "absolute", left: "50%", top: "100%", transform: "translate(-50%, 8px)",
    textAlign: "center", zIndex: 15, pointerEvents: "none",
  },
  bigSym: {
    fontSize: 48, filter: "drop-shadow(0 4px 0 #0006)",
  },
  spinLabel: {
    marginTop: 2, fontSize: 12, fontWeight: 800, color: "#e2e8f0",
    textShadow: "0 1px 2px #000", letterSpacing: 0.5,
  },
  field: {
    position: "relative", zIndex: 5, height: 210, marginTop: 56,
  },
  float: {
    position: "absolute", left: "50%", top: "28%", transform: "translate(-50%,-50%)",
    fontWeight: 900, fontSize: 16, textShadow: "0 2px 0 #000", zIndex: 30,
  },
  hpWrap: {
    width: 40, height: 5, background: "#111", borderRadius: 3, margin: "2px auto 0",
    overflow: "hidden", border: "1px solid #000",
  },
  hpFill: {
    height: "100%", borderRadius: 2, transition: "width .12s",
  },
  mine: {
    position: "absolute", left: "50%", top: "10%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", gap: 3, zIndex: 8,
  },
  platform: {
    position: "absolute", left: "50%", top: "38%", transform: "translateX(-50%)",
    width: 54, height: 54,
    background: "linear-gradient(180deg,#c4a574,#8b6914)", border: "3px solid #5c4a1e",
    borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, color: "#5c4a1e", boxShadow: "0 4px 0 #3d3214", zIndex: 6,
  },
  chicken: {
    position: "absolute", right: "6%", bottom: "4%", fontSize: 48, zIndex: 7,
    filter: "drop-shadow(2px 3px 0 #0006)",
  },
  ground: { position: "relative", zIndex: 4 },
  bonus: {
    position: "relative", zIndex: 5, display: "flex", flexDirection: "column",
    alignItems: "center", gap: 5, marginTop: 8,
  },
  bonusBtn: {
    background: "linear-gradient(180deg,#d4a017,#a67c00)", border: "2px solid #7a5c00",
    borderRadius: 8, color: "#1a1400", fontWeight: 800, fontSize: 13, padding: "8px 20px",
    cursor: "not-allowed", opacity: 0.7, boxShadow: "0 3px 0 #5c4400",
  },
  hint: {
    fontSize: 11, fontWeight: 700, color: "#e2e8f0", textShadow: "0 1px 2px #000",
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
  lbl: { fontSize: 10, fontWeight: 700, color: "#a1a1aa", letterSpacing: 1 },
  val: { fontSize: 16, fontWeight: 800 },
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
    boxShadow: "0 12px 40px rgba(0,0,0,.5)",
  },
};
