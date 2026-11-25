import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type InvItem = { id: number; itemId: string; nameRu: string; nameEn?: string; valueTon: number; imageUrl: string | null; rarity?: string | null };
type Target = { id: string; nameRu: string; nameEn?: string; valueTon: number; rarity: string; imageUrl: string | null };
type PlayResult = { won: boolean; roll: number; chance: number; multiplier: number; fromValue: number; toValue: number; source: { id: number; itemId: string; nameRu: string; valueTon: number }; target: { id: string; nameRu: string; valueTon: number; imageUrl: string | null; rarity: string }; newItem: InvItem | null };

const HOUSE = 0.05;
const R = 80;
const C = 2 * Math.PI * R;

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}
function calcChance(from: number, to: number): number {
  if (to <= 0 || from <= 0) return 1;
  return Math.max(1, Math.min(85, Math.round((from / to) * (1 - HOUSE) * 10000) / 100));
}
function rarityColor(r?: string | null) {
  switch ((r || "").toLowerCase()) {
    case "legendary": return "#fbbf24";
    case "epic": return "#c084fc";
    case "rare": return "#38bdf8";
    default: return "#94a3b8";
  }
}

export default function UpgradeGame({ telegramId, balance, onBalanceChange }: { telegramId: string; balance: number; onBalanceChange: () => void }) {
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

  const chance = useMemo(() => (!source || !target ? 0 : calcChance(source.valueTon, target.valueTon)), [source, target]);
  const mult = useMemo(() => (!source || !target || source.valueTon <= 0 ? 0 : Math.round((target.valueTon / source.valueTon) * 1000) / 1000), [source, target]);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const load = useCallback(async () => {
    if (!telegramId) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/mini/games/upgrade/my-items?telegramId=${encodeURIComponent(telegramId)}`),
        fetch("/api/mini/games/upgrade/targets"),
      ]);
      const ad = await a.json().catch(() => ({}));
      const bd = await b.json().catch(() => ({}));
      if (a.ok) setMyItems(Array.isArray(ad.items) ? ad.items : []);
      if (b.ok) setTargets(Array.isArray(bd.targets) ? bd.targets : []);
    } catch { flash("Не удалось загрузить"); }
    finally { setLoading(false); }
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

  const spinTo = (rollPercent: number) => new Promise<void>((resolve) => {
    cancelAnimationFrame(animRef.current);
    const spins = 5 + Math.floor(Math.random() * 3);
    const finalMod = ((rollPercent % 100) + 100) % 100;
    const start = angle;
    const targetDeg = start - (start % 360) + 360 * spins + finalMod * 3.6;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 3600);
      const e = 1 - Math.pow(1 - p, 4);
      setAngle(start + (targetDeg - start) * e);
      if (p < 1) {
        if (Math.floor(p * 30) !== Math.floor((p - 0.016) * 30)) haptic("light");
        animRef.current = requestAnimationFrame(tick);
      } else { setAngle(targetDeg); resolve(); }
    };
    animRef.current = requestAnimationFrame(tick);
  });

  const play = async () => {
    if (busy || !telegramId || !source || !target) return;
    if (target.valueTon <= source.valueTon) { flash("Цель должна быть дороже"); return; }
    setBusy(true); setResult(null); setSparks([]); haptic("medium");
    try {
      const res = await fetch("/api/mini/games/upgrade/play", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, inventoryId: source.id, targetId: target.id }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error ?? "Ошибка"); setBusy(false); void load(); return; }
      await spinTo(Number(d.roll) || 0);
      setResult(d as PlayResult);
      if (d.won) {
        hapticNotify("success"); haptic("heavy");
        setSparks(Array.from({ length: 26 }, (_, i) => ({
          id: i, x: 50 + (Math.random() - 0.5) * 80, y: 42 + (Math.random() - 0.5) * 50,
          c: ["#f9a8d4", "#fbbf24", "#34d399", "#38bdf8", "#fff", "#c084fc"][i % 6]!,
        })));
        setTimeout(() => setSparks([]), 1300);
        flash(`✨ УСПЕХ · ${d.target?.nameRu ?? "NFT"}`);
      } else {
        hapticNotify("error");
        flash("💔 Мимо · предмет сгорел");
      }
      setSource(null); setTarget(null); void load(); onBalanceChange();
      try { window.dispatchEvent(new CustomEvent("tonyx-inventory-updated")); } catch { /* */ }
    } catch { flash("Сеть недоступна"); }
    finally { setBusy(false); }
  };

  const canPlay = !!source && !!target && !busy && target.valueTon > source.valueTon;
  const chanceTone = chance >= 40 ? "#34d399" : chance >= 15 ? "#fbbf24" : chance > 0 ? "#f87171" : "#94a3b8";

  return (
    <div style={S.root}>
      <style>{`
        @keyframes upSpark{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(.15) translateY(-48px)}}
        .up-spark{position:absolute;width:8px;height:8px;border-radius:50%;animation:upSpark 1.15s ease-out forwards;pointer-events:none;box-shadow:0 0 8px currentColor}
        @keyframes upBreath{0%,100%{box-shadow:0 0 28px rgba(236,72,153,.12),inset 0 1px 0 rgba(255,255,255,.06)}50%{box-shadow:0 0 48px rgba(236,72,153,.24),inset 0 1px 0 rgba(255,255,255,.1)}}
        @keyframes upShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        .up-btn-ready{background:linear-gradient(110deg,#db2777,#a855f7,#7c3aed,#db2777);background-size:200% 100%;animation:upShimmer 2.8s linear infinite}
      `}</style>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.header}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={S.titleIcon}>⬆</span>
            <span style={S.title}>Upgrade</span>
            <span style={S.badge}>PREMIUM</span>
          </div>
          <div style={S.sub}>Рискни NFT · выиграй дороже · или потеряй</div>
        </div>
        <div style={S.bal}>
          <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>Баланс</span>
          <b style={{ fontSize: 13 }}>{balance.toFixed(2)} TON</b>
        </div>
      </div>

      <div style={S.dial}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id="winG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#059669"/><stop offset="100%" stopColor="#6ee7b7"/></linearGradient>
            <linearGradient id="loseG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7f1d1d"/><stop offset="100%" stopColor="#fca5a5"/></linearGradient>
            <radialGradient id="coreBg" cx="50%" cy="40%" r="55%"><stop offset="0%" stopColor="rgba(236,72,153,.2)"/><stop offset="100%" stopColor="#07050e"/></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="1"/>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="20"/>
          {chance > 0 ? (
            <>
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#loseG)" strokeWidth="20" strokeDasharray={`${((100 - chance) / 100) * C} ${C}`} strokeDashoffset={-((chance / 100) * C)} transform="rotate(-90 100 100)" opacity={.92}/>
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#winG)" strokeWidth="20" strokeDasharray={`${(chance / 100) * C} ${C}`} strokeDashoffset={0} transform="rotate(-90 100 100)" filter="url(#glow)"/>
            </>
          ) : (
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="20" transform="rotate(-90 100 100)"/>
          )}
          <circle cx="100" cy="100" r="58" fill="url(#coreBg)" stroke="rgba(255,255,255,.08)" strokeWidth="1.2"/>
          <text x="100" y="84" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700" letterSpacing="2">CHANCE</text>
          <text x="100" y="112" textAnchor="middle" fill={chanceTone} fontSize="30" fontWeight="900">{chance > 0 ? `${Number(chance.toFixed(1))}%` : "—"}</text>
          {mult > 0 && <text x="100" y="130" textAnchor="middle" fill="#f9a8d4" fontSize="12" fontWeight="800">{mult}×</text>}
          <polygon points="100,6 108,20 92,20" fill="#fff" filter="url(#glow)"/>
          <circle cx="100" cy="12" r="3" fill="#ec4899"/>
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="52" x2="100" y2="22" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" filter="url(#glow)"/>
            <circle cx="100" cy="22" r="5" fill="#fff" filter="url(#glow)"/>
            <circle cx="100" cy="22" r="2.2" fill="#ec4899"/>
          </g>
        </svg>
        {sparks.map((s) => <span key={s.id} className="up-spark" style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.c, color: s.c }} />)}
        {result && !busy && (
          <div style={{ ...S.result, background: result.won ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)", color: result.won ? "#6ee7b7" : "#fca5a5", borderColor: result.won ? "rgba(52,211,153,.4)" : "rgba(248,113,113,.35)" }}>
            {result.won ? `УСПЕХ · ${result.target.nameRu}` : `МИМО · ${result.roll.toFixed(1)}% · сгорел`}
          </div>
        )}
      </div>

      <div style={S.pair}>
        <button type="button" disabled={busy} onClick={() => { setSearch(""); setPickSide("source"); }} style={{ ...S.slot, borderColor: source ? "rgba(244,114,182,.55)" : "rgba(255,255,255,.08)", background: source ? "linear-gradient(165deg,rgba(236,72,153,.16),rgba(12,10,20,.92))" : "linear-gradient(165deg,rgba(255,255,255,.04),rgba(12,10,20,.9))", boxShadow: source ? "0 0 24px rgba(236,72,153,.12)" : "none" }}>
          <div style={S.slotLab}>ТВОЙ NFT</div>
          {source ? (
            <>
              <div style={S.imgFrame}>{source.imageUrl ? <img src={source.imageUrl} alt="" style={S.img} /> : <div style={{ fontSize: 32 }}>🎁</div>}</div>
              <div style={S.name}>{source.nameRu}</div>
              <div style={S.price}>{source.valueTon} TON</div>
            </>
          ) : (
            <div style={S.empty}><div style={S.plus}>＋</div>Выбрать NFT</div>
          )}
        </button>
        <div style={S.arrowWrap}><div style={S.arrow}>→</div></div>
        <button type="button" disabled={busy || !source} onClick={() => source && (setSearch(""), setPickSide("target"))} style={{ ...S.slot, borderColor: target ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.08)", background: target ? "linear-gradient(165deg,rgba(16,185,129,.14),rgba(12,10,20,.92))" : "linear-gradient(165deg,rgba(255,255,255,.04),rgba(12,10,20,.9))", opacity: source ? 1 : .42, boxShadow: target ? "0 0 24px rgba(52,211,153,.1)" : "none" }}>
          <div style={{ ...S.slotLab, color: "#34d399" }}>ЦЕЛЬ</div>
          {target ? (
            <>
              <div style={{ ...S.imgFrame, borderColor: "rgba(52,211,153,.25)" }}>{target.imageUrl ? <img src={target.imageUrl} alt="" style={S.img} /> : <div style={{ fontSize: 32 }}>✨</div>}</div>
              <div style={S.name}>{target.nameRu}</div>
              <div style={{ ...S.price, color: "#6ee7b7" }}>{target.valueTon} TON</div>
            </>
          ) : (
            <div style={S.empty}><div style={{ ...S.plus, borderColor: "rgba(52,211,153,.3)" }}>＋</div>{source ? "Выбрать цель" : "Сначала свой"}</div>
          )}
        </button>
      </div>

      {source && target && (
        <div style={S.stats}>
          <div style={S.stat}><div style={S.statL}>Шанс</div><div style={{ ...S.statV, color: chanceTone }}>{chance}%</div></div>
          <div style={S.stat}><div style={S.statL}>Множитель</div><div style={{ ...S.statV, color: "#f9a8d4" }}>{mult}×</div></div>
          <div style={S.stat}><div style={S.statL}>Edge</div><div style={S.statV}>{HOUSE * 100}%</div></div>
        </div>
      )}

      <button type="button" disabled={!canPlay} onClick={play} className={canPlay && !busy ? "up-btn-ready" : undefined} style={{ ...S.btn, opacity: canPlay ? 1 : .38, background: canPlay ? undefined : "linear-gradient(135deg,#4c1d3a,#3b1d5c)" }}>
        {busy ? "Крутим…" : "Upgrade"}
      </button>
      <div style={S.hint}>При проигрыше NFT сгорает · обычный подарок из каталога</div>

      {pickSide && (
        <div style={S.overlay} onClick={() => setPickSide(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.handle} />
            <div style={S.modalHead}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{pickSide === "source" ? "Твой предмет" : "Каталог целей"}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{pickSide === "source" ? `${myItems.length} в инвентаре` : `${targets.length} подарков`}</div>
              </div>
              <button type="button" onClick={() => setPickSide(null)} style={S.close}>✕</button>
            </div>
            <input type="search" placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} style={S.search} />
            {loading ? (
              <div style={{ color: "#64748b", padding: 28, textAlign: "center" }}>Загрузка…</div>
            ) : pickSide === "source" ? (
              filteredMy.length === 0 ? <div style={S.emptyBox}>Нет NFT</div> : (
                <div style={S.grid}>
                  {filteredMy.map((it) => (
                    <button key={it.id} type="button" onClick={() => { setSource(it); setTarget(null); setResult(null); setPickSide(null); haptic("light"); }} style={{ ...S.card, borderColor: source?.id === it.id ? "rgba(244,114,182,.65)" : "rgba(255,255,255,.07)" }}>
                      {it.imageUrl ? <img src={it.imageUrl} alt="" style={S.cardImg} /> : <div style={{ fontSize: 36 }}>🎁</div>}
                      <div style={S.cardName}>{it.nameRu}</div>
                      <div style={S.cardPrice}>{it.valueTon} TON</div>
                    </button>
                  ))}
                </div>
              )
            ) : filteredTargets.length === 0 ? <div style={S.emptyBox}>Ничего не найдено</div> : (
              <div style={S.grid}>
                {filteredTargets.map((t) => {
                  const ok = source ? t.valueTon > source.valueTon : false;
                  const c = source && ok ? calcChance(source.valueTon, t.valueTon) : 0;
                  return (
                    <button key={t.id} type="button" disabled={!ok} onClick={() => { if (!ok) return; setTarget(t); setResult(null); setPickSide(null); haptic("light"); }} style={{ ...S.card, borderColor: target?.id === t.id ? "rgba(52,211,153,.55)" : "rgba(255,255,255,.07)", opacity: ok ? 1 : .36 }}>
                      {t.imageUrl ? <img src={t.imageUrl} alt="" style={{ ...S.cardImg, filter: ok ? undefined : "grayscale(.65)" }} /> : <div style={{ fontSize: 36 }}>✨</div>}
                      <div style={S.cardName}>{t.nameRu}</div>
                      <div style={{ ...S.cardPrice, color: rarityColor(t.rarity) }}>{t.valueTon} TON</div>
                      {ok ? <div style={S.chance}>{c}%</div> : <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>дешевле</div>}
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

const S: Record<string, CSSProperties> = {
  root: { color: "#e2e8f0", position: "relative", fontFamily: "Inter,system-ui,sans-serif", paddingBottom: 8 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 },
  titleIcon: { width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg,#db2777,#a855f7)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff", boxShadow: "0 4px 14px rgba(168,85,247,.35)" },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: "-.03em", background: "linear-gradient(100deg,#fce7f3,#f9a8d4,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  badge: { fontSize: 9, fontWeight: 900, letterSpacing: ".08em", padding: "3px 8px", borderRadius: 999, background: "linear-gradient(90deg,rgba(251,191,36,.2),rgba(244,114,182,.2))", border: "1px solid rgba(251,191,36,.35)", color: "#fbbf24" },
  sub: { fontSize: 11, color: "#64748b", marginTop: 5 },
  bal: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, padding: "8px 12px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" },
  dial: { position: "relative", height: 268, marginBottom: 16, borderRadius: 28, overflow: "hidden", background: "radial-gradient(ellipse at 50% 30%,rgba(236,72,153,.22) 0%,rgba(88,28,135,.12) 40%,#06040c 72%)", border: "1px solid rgba(244,114,182,.22)", padding: 12, animation: "upBreath 3.6s ease-in-out infinite" },
  result: { position: "absolute", left: 14, right: 14, bottom: 12, textAlign: "center", fontWeight: 900, fontSize: 13, padding: "8px 12px", borderRadius: 12, border: "1px solid", zIndex: 2 },
  pair: { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "stretch", marginBottom: 14 },
  slot: { border: "1px solid", borderRadius: 20, padding: "14px 10px 16px", textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit", minHeight: 158 },
  slotLab: { fontSize: 10, fontWeight: 800, color: "#f472b6", letterSpacing: ".1em", marginBottom: 10 },
  imgFrame: { width: 68, height: 68, margin: "0 auto 10px", borderRadius: 16, background: "rgba(0,0,0,.35)", border: "1px solid rgba(244,114,182,.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: { width: 58, height: 58, objectFit: "contain", display: "block" },
  name: { fontSize: 12, fontWeight: 800, lineHeight: 1.25, marginBottom: 4 },
  price: { fontSize: 14, fontWeight: 900, color: "#f1f5f9" },
  empty: { fontSize: 12, color: "#64748b", padding: "18px 4px", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minHeight: 110 },
  plus: { width: 44, height: 44, borderRadius: 14, border: "1px dashed rgba(244,114,182,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#f9a8d4", background: "rgba(236,72,153,.06)" },
  arrowWrap: { display: "flex", alignItems: "center" },
  arrow: { width: 36, height: 36, borderRadius: 999, background: "linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#cbd5e1" },
  stats: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 },
  stat: { background: "linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "12px 8px", textAlign: "center" },
  statL: { fontSize: 10, color: "#64748b", fontWeight: 700 },
  statV: { fontSize: 18, fontWeight: 900, marginTop: 4 },
  btn: { width: "100%", padding: "17px 0", borderRadius: 18, border: "none", color: "#fff", fontSize: 16, fontWeight: 900, fontFamily: "inherit", boxShadow: "0 12px 36px rgba(168,85,247,.35)", letterSpacing: ".04em" },
  hint: { fontSize: 11, color: "#475569", marginTop: 12, textAlign: "center" },
  toast: { position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 90, padding: "12px 18px", borderRadius: 16, fontWeight: 800, fontSize: 13, background: "rgba(10,8,18,.94)", border: "1px solid rgba(255,255,255,.12)", color: "#fff", maxWidth: "90%", textAlign: "center", boxShadow: "0 16px 48px rgba(0,0,0,.5)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" },
  modal: { width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto", background: "linear-gradient(180deg,#16121f,#0a0812)", borderRadius: "24px 24px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", padding: "10px 14px 36px", boxShadow: "0 -20px 60px rgba(0,0,0,.45)" },
  handle: { width: 40, height: 4, borderRadius: 999, background: "rgba(255,255,255,.15)", margin: "4px auto 12px" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  close: { width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: "#e2e8f0", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  search: { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit", marginBottom: 12, outline: "none" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  card: { background: "linear-gradient(165deg,rgba(255,255,255,.05),rgba(255,255,255,.02))", border: "1px solid", borderRadius: 18, padding: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit" },
  cardImg: { width: 64, height: 64, objectFit: "contain", display: "block", margin: "0 auto 8px" },
  cardName: { fontSize: 12, fontWeight: 800, lineHeight: 1.2 },
  cardPrice: { fontSize: 12, fontWeight: 900, marginTop: 3, color: "#e2e8f0" },
  chance: { display: "inline-block", marginTop: 6, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900, color: "#6ee7b7", background: "rgba(16,185,129,.15)", border: "1px solid rgba(52,211,153,.3)" },
  emptyBox: { color: "#64748b", padding: 32, textAlign: "center", fontSize: 13 },
};
