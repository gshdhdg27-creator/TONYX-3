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
const R = 78;
const C = 2 * Math.PI * R;

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

function calcChance(from: number, to: number): number {
  if (to <= 0 || from <= 0) return 1;
  const raw = (from / to) * (1 - HOUSE) * 100;
  return Math.max(1, Math.min(85, Math.round(raw * 100) / 100));
}

function rarityColor(r?: string | null) {
  switch ((r || "").toLowerCase()) {
    case "legendary": return "#fbbf24";
    case "epic": return "#c084fc";
    case "rare": return "#38bdf8";
    default: return "#94a3b8";
  }
}

export default function UpgradeGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [myItems, setMyItems] = useState<InvItem[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [source, setSource] = useState<InvItem | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; c: string }[]>([]);
  const [pickSide, setPickSide] = useState<"source" | "target" | null>(null);
  const [search, setSearch] = useState("");
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
    setTimeout(() => setToast(null), 2800);
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

  useEffect(() => { void load(); }, [load]);

  const filteredTargets = useMemo(() => {
    let list = [...targets];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.nameRu.toLowerCase().includes(q) || (t.nameEn || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.valueTon - b.valueTon);
  }, [targets, search]);

  const filteredMy = useMemo(() => {
    if (!search.trim()) return myItems;
    const q = search.trim().toLowerCase();
    return myItems.filter((it) => it.nameRu.toLowerCase().includes(q));
  }, [myItems, search]);

  /** 0° = top under fixed pointer. Green = 0..chance% clockwise. Server won iff roll < chance. */
  const spinTo = (rollPercent: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(animRef.current);
      const spins = 5 + Math.floor(Math.random() * 3);
      const finalMod = ((rollPercent % 100) + 100) % 100;
      const start = angle;
      const targetDeg = start - (start % 360) + 360 * spins + finalMod * 3.6;
      const t0 = performance.now();
      const dur = 3400;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setAngle(start + (targetDeg - start) * e);
        if (p < 1) {
          if (Math.floor(p * 28) !== Math.floor((p - 0.016) * 28)) haptic("light");
          animRef.current = requestAnimationFrame(tick);
        } else {
          setAngle(targetDeg);
          resolve();
        }
      };
      animRef.current = requestAnimationFrame(tick);
    });

  const play = async () => {
    if (busy || !telegramId || !source || !target) return;
    if (target.valueTon <= source.valueTon) { flash("Цель должна быть дороже"); return; }
    setBusy(true);
    setResult(null);
    setSparks([]);
    haptic("medium");
    try {
      const res = await fetch("/api/mini/games/upgrade/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, inventoryId: source.id, targetId: target.id }),
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
        const s = Array.from({ length: 20 }, (_, i) => ({
          id: i,
          x: 50 + (Math.random() - 0.5) * 80,
          y: 45 + (Math.random() - 0.5) * 50,
          c: ["#f472b6", "#fbbf24", "#4ade80", "#38bdf8", "#fff"][i % 5]!,
        }));
        setSparks(s);
        setTimeout(() => setSparks([]), 1100);
        flash(`✨ УСПЕХ · ${d.target?.nameRu ?? "NFT"}`);
      } else {
        hapticNotify("error");
        flash("💔 Мимо · предмет сгорел");
      }
      setSource(null);
      setTarget(null);
      void load();
      onBalanceChange();
      try { window.dispatchEvent(new CustomEvent("tonyx-inventory-updated")); } catch { /* */ }
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
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0.2) translateY(-40px); }
        }
        .up-spark { position:absolute; width:7px; height:7px; border-radius:50%; animation:upSpark 1s ease-out forwards; pointer-events:none; }
        @keyframes upGlow {
          0%,100% { box-shadow: 0 0 20px rgba(236,72,153,0.15); }
          50% { box-shadow: 0 0 36px rgba(236,72,153,0.28); }
        }
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={header}>
        <div>
          <div style={title}>Upgrade</div>
          <div style={subtitle}>NFT → более дорогой · % падает с ценой цели</div>
        </div>
        <div style={balancePill}><span style={{ opacity: 0.7 }}>TON</span><b>{balance.toFixed(2)}</b></div>
      </div>

      <div style={dialWrap}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id="winG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="loseG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#991b1b" /><stop offset="100%" stopColor="#f87171" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
          {chance > 0 ? (
            <>
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#loseG)" strokeWidth="18"
                strokeDasharray={`${((100 - chance) / 100) * C} ${C}`}
                strokeDashoffset={-((chance / 100) * C)}
                transform="rotate(-90 100 100)" strokeLinecap="butt" opacity={0.9} />
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#winG)" strokeWidth="18"
                strokeDasharray={`${(chance / 100) * C} ${C}`}
                strokeDashoffset={0}
                transform="rotate(-90 100 100)" strokeLinecap="butt" filter="url(#glow)" />
            </>
          ) : (
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="18" transform="rotate(-90 100 100)" />
          )}
          <circle cx="100" cy="100" r="56" fill="#0c0a14" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x="100" y="86" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700" letterSpacing="1.5">CHANCE</text>
          <text x="100" y="112" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="900">{chance > 0 ? `${Number(chance.toFixed(1))}%` : "—"}</text>
          {mult > 0 && <text x="100" y="130" textAnchor="middle" fill="#f9a8d4" fontSize="12" fontWeight="800">{mult}×</text>}

          {/* Fixed pointer at top */}
          <polygon points="100,8 106,20 94,20" fill="#fff" filter="url(#glow)" />
          <circle cx="100" cy="14" r="2.5" fill="#ec4899" />

          {/* Thin needle on the ring only — does not cover center % */}
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="50" x2="100" y2="24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow)" />
            <circle cx="100" cy="24" r="4.5" fill="#fff" filter="url(#glow)" />
            <circle cx="100" cy="24" r="2" fill="#ec4899" />
          </g>
        </svg>

        {sparks.map((s) => (
          <span key={s.id} className="up-spark" style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.c }} />
        ))}

        {result && !busy && (
          <div style={{
            position: "absolute", left: 12, right: 12, bottom: 10, textAlign: "center",
            fontWeight: 900, fontSize: 13, padding: "6px 10px", borderRadius: 10,
            background: result.won ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)",
            color: result.won ? "#6ee7b7" : "#fca5a5",
            border: `1px solid ${result.won ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`,
          }}>
            {result.won ? `УСПЕХ · ${result.target.nameRu}` : `МИМО · roll ${result.roll.toFixed(1)}% · сгорел`}
          </div>
        )}
      </div>

      <div style={pair}>
        <button type="button" disabled={busy} onClick={() => { setSearch(""); setPickSide("source"); }} style={{
          ...slotCard,
          borderColor: source ? "rgba(244,114,182,0.55)" : "rgba(255,255,255,0.1)",
          background: source ? "linear-gradient(160deg,rgba(236,72,153,0.12),rgba(15,23,42,0.95))" : "rgba(15,23,42,0.9)",
        }}>
          <div style={slotLab}>ТВОЙ</div>
          {source ? (
            <>
              {source.imageUrl ? <img src={source.imageUrl} alt="" style={slotImg} /> : <div style={slotPh}>🎁</div>}
              <div style={slotName}>{source.nameRu}</div>
              <div style={slotPrice}>{source.valueTon} TON</div>
            </>
          ) : (
            <div style={slotEmpty}><div style={{ fontSize: 28, marginBottom: 6 }}>＋</div>Выбрать NFT</div>
          )}
        </button>

        <div style={arrowWrap}><div style={arrowCircle}>→</div></div>

        <button type="button" disabled={busy || !source} onClick={() => source && (setSearch(""), setPickSide("target"))} style={{
          ...slotCard,
          borderColor: target ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.1)",
          background: target ? "linear-gradient(160deg,rgba(16,185,129,0.12),rgba(15,23,42,0.95))" : "rgba(15,23,42,0.9)",
          opacity: source ? 1 : 0.45,
        }}>
          <div style={{ ...slotLab, color: "#34d399" }}>ЦЕЛЬ</div>
          {target ? (
            <>
              {target.imageUrl ? <img src={target.imageUrl} alt="" style={slotImg} /> : <div style={slotPh}>✨</div>}
              <div style={slotName}>{target.nameRu}</div>
              <div style={{ ...slotPrice, color: "#6ee7b7" }}>{target.valueTon} TON</div>
            </>
          ) : (
            <div style={slotEmpty}><div style={{ fontSize: 28, marginBottom: 6 }}>＋</div>{source ? "Выбрать цель" : "Сначала свой"}</div>
          )}
        </button>
      </div>

      {source && target && (
        <div style={stats}>
          <div style={stat}><div style={statL}>Шанс</div><div style={{ ...statV, color: chance >= 40 ? "#6ee7b7" : chance >= 15 ? "#fbbf24" : "#f87171" }}>{chance}%</div></div>
          <div style={stat}><div style={statL}>Множитель</div><div style={{ ...statV, color: "#f9a8d4" }}>{mult}×</div></div>
          <div style={stat}><div style={statL}>Edge</div><div style={statV}>{HOUSE * 100}%</div></div>
        </div>
      )}

      <button type="button" disabled={!canPlay} onClick={play} style={{ ...btn, opacity: canPlay ? 1 : 0.4 }}>
        {busy ? "Крутим…" : "Upgrade"}
      </button>
      <div style={hint}>При проигрыше предмет сгорает · обычный NFT из каталога</div>

      {pickSide && (
        <div style={modalOverlay} onClick={() => setPickSide(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalHead}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>{pickSide === "source" ? "Твой предмет" : "Каталог целей"}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {pickSide === "source" ? `${myItems.length} в инвентаре` : `${targets.length} NFT · яркие можно выбрать`}
                </div>
              </div>
              <button type="button" onClick={() => setPickSide(null)} style={closeBtn}>✕</button>
            </div>
            <input type="search" placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} style={searchInput} />
            {loading ? (
              <div style={{ color: "#64748b", padding: 28, textAlign: "center" }}>Загрузка…</div>
            ) : pickSide === "source" ? (
              filteredMy.length === 0 ? (
                <div style={emptyBox}>Нет NFT в инвентаре</div>
              ) : (
                <div style={grid}>
                  {filteredMy.map((it) => (
                    <button key={it.id} type="button" onClick={() => {
                      setSource(it); setTarget(null); setResult(null); setPickSide(null); haptic("light");
                    }} style={{ ...itemCard, borderColor: source?.id === it.id ? "rgba(244,114,182,0.65)" : "rgba(255,255,255,0.08)" }}>
                      {it.imageUrl ? <img src={it.imageUrl} alt="" style={itemImg} /> : <div style={itemPh}>🎁</div>}
                      <div style={itemName}>{it.nameRu}</div>
                      <div style={itemPrice}>{it.valueTon} TON</div>
                    </button>
                  ))}
                </div>
              )
            ) : filteredTargets.length === 0 ? (
              <div style={emptyBox}>Ничего не найдено</div>
            ) : (
              <div style={grid}>
                {filteredTargets.map((t) => {
                  const ok = source ? t.valueTon > source.valueTon : false;
                  const c = source && ok ? calcChance(source.valueTon, t.valueTon) : 0;
                  return (
                    <button key={t.id} type="button" disabled={!ok} onClick={() => {
                      if (!ok) return;
                      setTarget(t); setResult(null); setPickSide(null); haptic("light");
                    }} style={{
                      ...itemCard,
                      borderColor: target?.id === t.id ? "rgba(52,211,153,0.6)" : "rgba(255,255,255,0.08)",
                      opacity: ok ? 1 : 0.38,
                      cursor: ok ? "pointer" : "not-allowed",
                    }}>
                      {t.imageUrl ? <img src={t.imageUrl} alt="" style={{ ...itemImg, filter: ok ? undefined : "grayscale(0.6)" }} /> : <div style={itemPh}>✨</div>}
                      <div style={itemName}>{t.nameRu}</div>
                      <div style={{ ...itemPrice, color: rarityColor(t.rarity) }}>{t.valueTon} TON</div>
                      {ok ? <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 900, marginTop: 3 }}>{c}%</div>
                        : <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>дешевле</div>}
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

const root: CSSProperties = { color: "#e2e8f0", position: "relative", fontFamily: "Inter, system-ui, sans-serif" };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 };
const title: CSSProperties = { fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#f9a8d4,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" };
const subtitle: CSSProperties = { fontSize: 11, color: "#64748b", marginTop: 3 };
const balancePill: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, padding: "6px 12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11, fontWeight: 800 };
const dialWrap: CSSProperties = { position: "relative", height: 248, marginBottom: 14, borderRadius: 24, overflow: "hidden", background: "radial-gradient(ellipse at 50% 35%, rgba(236,72,153,0.18) 0%, #08060f 68%)", border: "1px solid rgba(244,114,182,0.28)", padding: 10, animation: "upGlow 3.5s ease-in-out infinite" };
const pair: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "stretch", marginBottom: 12 };
const slotCard: CSSProperties = { border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "14px 10px", textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit", minHeight: 148 };
const slotLab: CSSProperties = { fontSize: 10, fontWeight: 800, color: "#f472b6", letterSpacing: "0.08em", marginBottom: 8 };
const slotImg: CSSProperties = { width: 58, height: 58, objectFit: "contain", borderRadius: 12, margin: "0 auto 8px", display: "block" };
const slotPh: CSSProperties = { fontSize: 36, marginBottom: 6 };
const slotName: CSSProperties = { fontSize: 12, fontWeight: 800, lineHeight: 1.25, marginBottom: 3 };
const slotPrice: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#e2e8f0" };
const slotEmpty: CSSProperties = { fontSize: 12, color: "#64748b", padding: "22px 4px", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 100 };
const arrowWrap: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };
const arrowCircle: CSSProperties = { width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#94a3b8" };
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 };
const stat: CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "11px 8px", textAlign: "center" };
const statL: CSSProperties = { fontSize: 10, color: "#64748b", fontWeight: 700 };
const statV: CSSProperties = { fontSize: 17, fontWeight: 900, marginTop: 3 };
const btn: CSSProperties = { width: "100%", padding: "16px 0", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#db2777,#a855f7,#7c3aed)", color: "#fff", fontSize: 16, fontWeight: 900, fontFamily: "inherit", boxShadow: "0 10px 32px rgba(168,85,247,0.35)" };
const hint: CSSProperties = { fontSize: 11, color: "#64748b", marginTop: 12, textAlign: "center" };
const toastStyle: CSSProperties = { position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 90, padding: "11px 18px", borderRadius: 14, fontWeight: 800, fontSize: 13, background: "rgba(12,10,20,0.96)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", maxWidth: "90%", textAlign: "center" };
const modalOverlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const modal: CSSProperties = { width: "100%", maxWidth: 480, maxHeight: "78vh", overflow: "auto", background: "linear-gradient(180deg,#12101c,#0a0812)", borderRadius: "22px 22px 0 0", border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none", padding: "16px 14px 32px" };
const modalHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 };
const closeBtn: CSSProperties = { width: 34, height: 34, borderRadius: 11, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const searchInput: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit", marginBottom: 10, outline: "none" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const itemCard: CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit" };
const itemImg: CSSProperties = { width: 68, height: 68, objectFit: "contain", borderRadius: 12, margin: "0 auto 8px", display: "block" };
const itemPh: CSSProperties = { fontSize: 40, marginBottom: 6 };
const itemName: CSSProperties = { fontSize: 12, fontWeight: 800, lineHeight: 1.2 };
const itemPrice: CSSProperties = { fontSize: 12, fontWeight: 900, marginTop: 3, color: "#e2e8f0" };
const emptyBox: CSSProperties = { color: "#64748b", padding: 28, textAlign: "center", fontSize: 13 };
