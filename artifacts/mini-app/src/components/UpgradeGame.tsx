import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type InvItem = {
  id: number;
  itemId: string;
  nameRu: string;
  nameEn?: string;
  valueTon: number;
  imageUrl: string | null;
  rarity?: string | null;
};

type Target = {
  id: string;
  nameRu: string;
  nameEn?: string;
  valueTon: number;
  rarity: string;
  imageUrl: string | null;
};

type PlayResult = {
  won: boolean;
  roll: number;
  chance: number;
  multiplier: number;
  fromValue: number;
  toValue: number;
  source: { id: number; itemId: string; nameRu: string; valueTon: number };
  target: { id: string; nameRu: string; valueTon: number; imageUrl: string | null; rarity: string };
  newItem: InvItem | null;
};

const HOUSE = 0.05;

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t);
  } catch {
    /* */
  }
}
function hapticNotify(t: "success" | "error") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t);
  } catch {
    /* */
  }
}

function calcChance(from: number, to: number): number {
  if (to <= 0 || from <= 0) return 1;
  const raw = (from / to) * (1 - HOUSE) * 100;
  return Math.max(1, Math.min(85, Math.round(raw * 100) / 100));
}

function rarityColor(r?: string | null) {
  switch ((r || "").toLowerCase()) {
    case "legendary":
      return "#fbbf24";
    case "epic":
      return "#a855f7";
    case "rare":
      return "#38bdf8";
    default:
      return "#94a3b8";
  }
}

export default function UpgradeGame({
  telegramId,
  balance,
  onBalanceChange,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
}) {
  const [myItems, setMyItems] = useState<InvItem[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [source, setSource] = useState<InvItem | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [angle, setAngle] = useState(-90);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; c: string }[]>([]);
  const [pickSide, setPickSide] = useState<"source" | "target" | null>(null);
  const animRef = useRef(0);

  const chance = useMemo(() => {
    if (!source || !target) return 0;
    return calcChance(source.valueTon, target.valueTon);
  }, [source, target]);

  const mult = useMemo(() => {
    if (!source || !target || source.valueTon <= 0) return 0;
    return Math.round((target.valueTon / source.valueTon) * 1000) / 1000;
  }, [source, target]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    if (!telegramId) return;
    setLoading(true);
    try {
      const [itemsRes, targetsRes] = await Promise.all([
        fetch(`/api/mini/games/upgrade/my-items?telegramId=${encodeURIComponent(telegramId)}`),
        fetch("/api/mini/games/upgrade/targets"),
      ]);
      const itemsData = await itemsRes.json().catch(() => ({}));
      const targetsData = await targetsRes.json().catch(() => ({}));
      if (itemsRes.ok) setMyItems(Array.isArray(itemsData.items) ? itemsData.items : []);
      if (targetsRes.ok) setTargets(Array.isArray(targetsData.targets) ? targetsData.targets : []);
    } catch {
      flash("Не удалось загрузить предметы");
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableTargets = useMemo(() => {
    if (!source) return targets;
    return targets.filter((t) => t.valueTon > source.valueTon);
  }, [targets, source]);

  const spinTo = (rollPercent: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(animRef.current);
      const targetDeg = -90 + rollPercent * 3.6 + 360 * (5 + Math.floor(Math.random() * 3));
      const start = angle;
      const t0 = performance.now();
      const dur = 3200;

      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        const a = start + (targetDeg - start) * e;
        setAngle(a);
        if (p < 1) {
          if (Math.floor(p * 24) !== Math.floor((p - 0.016) * 24)) haptic("light");
          animRef.current = requestAnimationFrame(tick);
        } else {
          setAngle(-90 + rollPercent * 3.6);
          resolve();
        }
      };
      animRef.current = requestAnimationFrame(tick);
    });

  const play = async () => {
    if (busy || !telegramId || !source || !target) return;
    if (target.valueTon <= source.valueTon) {
      flash("Цель должна быть дороже");
      return;
    }
    setBusy(true);
    setResult(null);
    setSparks([]);
    haptic("medium");
    try {
      const res = await fetch("/api/mini/games/upgrade/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          inventoryId: source.id,
          targetId: target.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error ?? "Ошибка");
        setBusy(false);
        void load();
        return;
      }
      const roll = Number(d.roll) || 0;
      await spinTo(roll);
      const won = !!d.won;
      setResult(d as PlayResult);
      if (won) {
        hapticNotify("success");
        haptic("heavy");
        const s = Array.from({ length: 22 }, (_, i) => ({
          id: i,
          x: 50 + (Math.random() - 0.5) * 85,
          y: 42 + (Math.random() - 0.5) * 55,
          c: ["#f472b6", "#fbbf24", "#4ade80", "#38bdf8", "#fff", "#a855f7"][i % 6]!,
        }));
        setSparks(s);
        setTimeout(() => setSparks([]), 1100);
        flash(`УСПЕХ · ${d.target?.nameRu ?? "NFT"} (+${Number(d.toValue).toFixed(1)} TON)`);
      } else {
        hapticNotify("error");
        flash(`МИМО · предмет сгорел`);
      }
      setSource(null);
      setTarget(null);
      void load();
      onBalanceChange();
      try {
        window.dispatchEvent(new CustomEvent("tonyx-inventory-updated"));
      } catch {
        /* */
      }
    } catch {
      flash("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  };

  const canPlay = !!source && !!target && !busy && target.valueTon > source.valueTon;

  return (
    <div style={root}>
      <style>{`
        @keyframes upSpark {
          0% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0) translateY(-36px); }
        }
        .up-spark { position:absolute; width:8px; height:8px; border-radius:50%; animation:upSpark .95s ease-out forwards; pointer-events:none; }
        @keyframes upPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(236,72,153,0.35); }
          50% { box-shadow: 0 0 24px 4px rgba(236,72,153,0.25); }
        }
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>Upgrade</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
          Свой NFT → более дорогой · чем дороже цель — тем ниже %
        </div>
      </div>

      {/* Dial */}
      <div style={dialWrap}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id="winG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
            <linearGradient id="loseG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7f1d1d" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
          {chance > 0 ? (
            <>
              <circle
                cx="100"
                cy="100"
                r="78"
                fill="none"
                stroke="url(#loseG)"
                strokeWidth="16"
                strokeDasharray={`${(100 - chance) * 4.9} 490`}
                strokeDashoffset={-chance * 4.9}
                transform="rotate(-90 100 100)"
                strokeLinecap="butt"
                opacity={0.85}
              />
              <circle
                cx="100"
                cy="100"
                r="78"
                fill="none"
                stroke="url(#winG)"
                strokeWidth="16"
                strokeDasharray={`${chance * 4.9} 490`}
                strokeDashoffset={0}
                transform="rotate(-90 100 100)"
                strokeLinecap="butt"
                filter="url(#glow)"
              />
            </>
          ) : (
            <circle
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="16"
              transform="rotate(-90 100 100)"
            />
          )}
          <circle cx="100" cy="100" r="58" fill="#0b1020" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x="100" y="88" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">
            CHANCE
          </text>
          <text x="100" y="112" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="900">
            {chance > 0 ? `${chance}%` : "—"}
          </text>
          {mult > 0 && (
            <text x="100" y="128" textAnchor="middle" fill="#f472b6" fontSize="11" fontWeight="800">
              {mult}x
            </text>
          )}
          <g transform={`rotate(${angle} 100 100)`}>
            <polygon points="100,28 106,100 94,100" fill="#fff" filter="url(#glow)" />
            <circle cx="100" cy="100" r="8" fill="#fff" />
            <circle cx="100" cy="100" r="4" fill="#ec4899" />
          </g>
        </svg>

        {sparks.map((s) => (
          <span key={s.id} className="up-spark" style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.c }} />
        ))}

        {result && !busy && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 8,
              textAlign: "center",
              fontWeight: 900,
              fontSize: 14,
              color: result.won ? "#4ade80" : "#f87171",
            }}
          >
            {result.won
              ? `УСПЕХ · ${result.target.nameRu}`
              : `МИМО (${result.roll.toFixed(1)}%) · предмет сгорел`}
          </div>
        )}
      </div>

      {/* Source + Target cards */}
      <div style={pair}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPickSide("source")}
          style={{
            ...slotCard,
            borderColor: source ? "rgba(236,72,153,0.55)" : "rgba(255,255,255,0.1)",
            animation: source ? "upPulse 2.2s ease-in-out infinite" : undefined,
          }}
        >
          <div style={slotLab}>ТВОЙ</div>
          {source ? (
            <>
              {source.imageUrl ? (
                <img src={source.imageUrl} alt="" style={slotImg} />
              ) : (
                <div style={slotPlaceholder}>🎁</div>
              )}
              <div style={slotName}>{source.nameRu}</div>
              <div style={slotPrice}>{source.valueTon} TON</div>
            </>
          ) : (
            <div style={slotEmpty}>Выбрать NFT</div>
          )}
        </button>

        <div style={arrow}>→</div>

        <button
          type="button"
          disabled={busy || !source}
          onClick={() => source && setPickSide("target")}
          style={{
            ...slotCard,
            borderColor: target ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)",
            opacity: source ? 1 : 0.5,
          }}
        >
          <div style={{ ...slotLab, color: "#4ade80" }}>ЦЕЛЬ</div>
          {target ? (
            <>
              {target.imageUrl ? (
                <img src={target.imageUrl} alt="" style={slotImg} />
              ) : (
                <div style={slotPlaceholder}>✨</div>
              )}
              <div style={slotName}>{target.nameRu}</div>
              <div style={{ ...slotPrice, color: "#4ade80" }}>{target.valueTon} TON</div>
            </>
          ) : (
            <div style={slotEmpty}>{source ? "Выбрать цель" : "Сначала свой"}</div>
          )}
        </button>
      </div>

      {source && target && (
        <div style={stats}>
          <div style={stat}>
            <div style={statL}>Шанс</div>
            <div style={statV}>{chance}%</div>
          </div>
          <div style={stat}>
            <div style={statL}>Множитель</div>
            <div style={{ ...statV, color: "#f472b6" }}>{mult}x</div>
          </div>
          <div style={stat}>
            <div style={statL}>Edge</div>
            <div style={statV}>{HOUSE * 100}%</div>
          </div>
        </div>
      )}

      <button type="button" disabled={!canPlay} onClick={play} style={{ ...btn, opacity: canPlay ? 1 : 0.45 }}>
        {busy ? "Крутим…" : "⬆️  Upgrade"}
      </button>

      <div style={{ fontSize: 11, color: "#64748b", marginTop: 10, textAlign: "center" }}>
        При проигрыше предмет сгорает. Баланс TON: <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)}</b>
      </div>

      {/* Picker modal */}
      {pickSide && (
        <div style={modalOverlay} onClick={() => setPickSide(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {pickSide === "source" ? "Твой предмет" : "Цель апгрейда"}
              </div>
              <button type="button" onClick={() => setPickSide(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            {loading ? (
              <div style={{ color: "#64748b", padding: 20, textAlign: "center" }}>Загрузка…</div>
            ) : pickSide === "source" ? (
              myItems.length === 0 ? (
                <div style={{ color: "#64748b", padding: 20, textAlign: "center", fontSize: 13 }}>
                  Нет NFT в инвентаре. Открой кейсы или собери коллекцию.
                </div>
              ) : (
                <div style={grid}>
                  {myItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setSource(it);
                        setTarget(null);
                        setResult(null);
                        setPickSide(null);
                        haptic("light");
                      }}
                      style={{
                        ...itemCard,
                        borderColor: source?.id === it.id ? "rgba(236,72,153,0.6)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      {it.imageUrl ? <img src={it.imageUrl} alt="" style={itemImg} /> : <div style={itemPh}>🎁</div>}
                      <div style={itemName}>{it.nameRu}</div>
                      <div style={itemPrice}>{it.valueTon} TON</div>
                    </button>
                  ))}
                </div>
              )
            ) : availableTargets.length === 0 ? (
              <div style={{ color: "#64748b", padding: 20, textAlign: "center", fontSize: 13 }}>
                Нет более дорогих целей для этого предмета.
              </div>
            ) : (
              <div style={grid}>
                {availableTargets.map((t) => {
                  const c = source ? calcChance(source.valueTon, t.valueTon) : 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTarget(t);
                        setResult(null);
                        setPickSide(null);
                        haptic("light");
                      }}
                      style={{
                        ...itemCard,
                        borderColor: target?.id === t.id ? "rgba(74,222,128,0.55)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      {t.imageUrl ? <img src={t.imageUrl} alt="" style={itemImg} /> : <div style={itemPh}>✨</div>}
                      <div style={itemName}>{t.nameRu}</div>
                      <div style={{ ...itemPrice, color: rarityColor(t.rarity) }}>{t.valueTon} TON</div>
                      <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, marginTop: 2 }}>{c}%</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const dialWrap: CSSProperties = {
  position: "relative",
  height: 230,
  marginBottom: 14,
  borderRadius: 20,
  overflow: "hidden",
  background: "radial-gradient(ellipse at 50% 40%, rgba(236,72,153,0.22) 0%, #0a0612 70%)",
  border: "1px solid rgba(244,114,182,0.3)",
  boxShadow: "0 0 40px rgba(236,72,153,0.12)",
  padding: 8,
};
const pair: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 8,
  alignItems: "center",
  marginBottom: 12,
};
const slotCard: CSSProperties = {
  background: "rgba(15,23,42,0.85)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  padding: "12px 10px",
  textAlign: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "inherit",
  minHeight: 130,
};
const slotLab: CSSProperties = { fontSize: 10, fontWeight: 800, color: "#f472b6", letterSpacing: "0.06em", marginBottom: 6 };
const slotImg: CSSProperties = { width: 56, height: 56, objectFit: "contain", borderRadius: 10, margin: "0 auto 6px", display: "block" };
const slotPlaceholder: CSSProperties = { fontSize: 36, marginBottom: 6 };
const slotName: CSSProperties = { fontSize: 12, fontWeight: 800, lineHeight: 1.2, marginBottom: 2 };
const slotPrice: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#e2e8f0" };
const slotEmpty: CSSProperties = { fontSize: 12, color: "#64748b", padding: "28px 4px", fontWeight: 700 };
const arrow: CSSProperties = { fontSize: 22, fontWeight: 900, color: "#64748b" };
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 };
const stat: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "10px 8px",
  textAlign: "center",
};
const statL: CSSProperties = { fontSize: 10, color: "#64748b", fontWeight: 700 };
const statV: CSSProperties = { fontSize: 16, fontWeight: 900, marginTop: 2 };
const btn: CSSProperties = {
  width: "100%",
  padding: "15px 0",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg,#db2777,#f472b6)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(236,72,153,0.35)",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 72,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 50,
  padding: "10px 18px",
  borderRadius: 12,
  fontWeight: 800,
  fontSize: 13,
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff",
  maxWidth: "90%",
  textAlign: "center",
};
const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  zIndex: 80,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
};
const modal: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  maxHeight: "70vh",
  overflow: "auto",
  background: "#0f172a",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.12)",
  padding: 16,
  paddingBottom: 28,
};
const closeBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#e2e8f0",
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};
const itemCard: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 10,
  textAlign: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "inherit",
};
const itemImg: CSSProperties = { width: 64, height: 64, objectFit: "contain", borderRadius: 10, margin: "0 auto 6px", display: "block" };
const itemPh: CSSProperties = { fontSize: 40, marginBottom: 6 };
const itemName: CSSProperties = { fontSize: 12, fontWeight: 800, lineHeight: 1.2 };
const itemPrice: CSSProperties = { fontSize: 12, fontWeight: 900, marginTop: 2, color: "#e2e8f0" };
