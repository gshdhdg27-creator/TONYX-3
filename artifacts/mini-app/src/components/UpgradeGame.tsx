import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type InvItem = { id: number; itemId: string; nameRu: string; nameEn?: string; valueTon: number; imageUrl: string | null; rarity?: string | null };
type Target = { id: string; nameRu: string; nameEn?: string; valueTon: number; rarity: string; imageUrl: string | null };
type PlayResult = { won: boolean; roll: number; chance: number; multiplier: number; fromValue: number; toValue: number; source: { id: number; itemId: string; nameRu: string; valueTon: number }; target: { id: string; nameRu: string; valueTon: number; imageUrl: string | null; rarity: string }; newItem: InvItem | null };

const HOUSE = 0.05;
const R = 80;
const C = 2 * Math.PI * R;

const TG_IMG = "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";
const PHOTO_SHORT: Record<string, string> = {
  telegram_premium: "input_key", royal_dogg: "snoop_dogg", durov_cap: "durovs_cap",
  snow_mitten: "snow_mittens", golden_star: "hanging_star", luxury_watch: "swiss_watch",
};
function giftImg(id?: string | null, fallback?: string | null): string | null {
  if (fallback && /^https?:\/\//.test(fallback)) return fallback;
  if (!id) return fallback || null;
  const key = PHOTO_SHORT[id] ?? id;
  return `${TG_IMG}${key}.webp`;
}

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
    case "epic": return "#a78bfa";
    case "rare": return "#22d3ee";
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

  const availableTargets = useMemo(() => {
    if (!source) return [];
    return targets.filter((t) => t.valueTon > source.valueTon);
  }, [targets, source]);

  const filteredTargets = useMemo(() => {
    let list = [...availableTargets];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.nameRu.toLowerCase().includes(q) || (t.nameEn || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.valueTon - b.valueTon);
  }, [availableTargets, search]);

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
          c: ["#22d3ee", "#fbbf24", "#34d399", "#a78bfa", "#fff", "#67e8f9"][i % 6]!,
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
  const chanceTone = chance >= 40 ? "#34d399" : chance >= 15 ? "#fbbf24" : chance > 0 ? "#f87171" : "#64748b";

  return (
    <div style={S.root}>
      <style>{`
        @keyframes upSpark{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(.15) translateY(-48px)}}
        .up-spark{position:absolute;width:8px;height:8px;border-radius:50%;animation:upSpark 1.15s ease-out forwards;pointer-events:none;box-shadow:0 0 8px currentColor}
        @keyframes upBreath{0%,100%{box-shadow:0 0 24px rgba(34,211,238,.1),inset 0 1px 0 rgba(255,255,255,.05)}50%{box-shadow:0 0 40px rgba(34,211,238,.2),inset 0 1px 0 rgba(255,255,255,.08)}}
        @keyframes upShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        .up-btn-ready{background:linear-gradient(110deg,#0891b2,#0ea5e9,#6366f1,#0891b2);background-size:200% 100%;animation:upShimmer 2.8s linear infinite}
      `}</style>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.header}>
        <div>
          <div style={S.title}>Upgrade</div>
          <div style={S.sub}>Свой NFT → только более дорогой</div>
        </div>
        <div style={S.bal}>
          <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>TON</span>
          <b style={{ fontSize: 14, color: "#67e8f9" }}>{balance.toFixed(2)}</b>
        </div>
      </div>

      <div style={S.steps}>
        <div style={{ ...S.step, ...(source ? S.stepDone : S.stepActive) }}>1. Свой</div>
        <div style={S.stepLine} />
        <div style={{ ...S.step, ...(target ? S.stepDone : source ? S.stepActive : {}) }}>2. Цель</div>
        <div style={S.stepLine} />
        <div style={{ ...S.step, ...(canPlay ? S.stepActive : {}) }}>3. Upgrade</div>
      </div>

      <div style={S.dial}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id="winG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#059669"/><stop offset="100%" stopColor="#34d399"/></linearGradient>
            <linearGradient id="loseG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7f1d1d"/><stop offset="100%" stopColor="#f87171"/></linearGradient>
            <radialGradient id="coreBg" cx="50%" cy="42%" r="55%"><stop offset="0%" stopColor="rgba(34,211,238,.12)"/><stop offset="100%" stopColor="#0a0f14"/></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="1"/>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="20"/>
          {chance > 0 ? (
            <>
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#loseG)" strokeWidth="20" strokeDasharray={`${((100 - chance) / 100) * C} ${C}`} strokeDashoffset={-((chance / 100) * C)} transform="rotate(-90 100 100)" opacity={.9}/>
              <circle cx="100" cy="100" r={R} fill="none" stroke="url(#winG)" strokeWidth="20" strokeDasharray={`${(chance / 100) * C} ${C}`} strokeDashoffset={0} transform="rotate(-90 100 100)" filter="url(#glow)"/>
            </>
          ) : (
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(148,163,184,.15)" strokeWidth="20" transform="rotate(-90 100 100)"/>
          )}
          <circle cx="100" cy="100" r="58" fill="url(#coreBg)" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
          <text x="100" y="84" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700" letterSpacing="2">CHANCE</text>
          <text x="100" y="112" textAnchor="middle" fill={chanceTone} fontSize="30" fontWeight="900">{chance > 0 ? `${Number(chance.toFixed(1))}%` : "—"}</text>
          {mult > 0 && <text x="100" y="130" textAnchor="middle" fill="#67e8f9" fontSize="12" fontWeight="800">{mult}×</text>}
          {/* Static top marker — does not spin */}
          <rect x="98" y="8" width="4" height="10" rx="2" fill="#22d3ee" filter="url(#glow)" />
          {/* ONE rotating pointer */}
          <g transform={`rotate(${angle} 100 100)`}>
            <polygon points="100,16 109,34 100,29 91,34" fill="#ecfeff" stroke="#22d3ee" strokeWidth="1.2" filter="url(#glow)" />
          </g>
        </svg>
        {sparks.map((s) => <span key={s.id} className="up-spark" style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.c, color: s.c }} />)}
        {result && !busy && (
          <div style={{ ...S.result, background: result.won ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)", color: result.won ? "#6ee7b7" : "#fca5a5", borderColor: result.won ? "rgba(52,211,153,.4)" : "rgba(248,113,113,.35)" }}>
            {result.won ? `УСПЕХ · ${result.target.nameRu}` : `МИМО · ${result.roll.toFixed(1)}% · сгорел`}
          </div>
        )}
      </div>

      <div style={S.pair}>
        <button type="button" disabled={busy} onClick={() => { setSearch(""); setPickSide("source"); }} style={{ ...S.slot, borderColor: source ? "rgba(34,211,238,.5)" : "rgba(255,255,255,.08)", background: source ? "linear-gradient(165deg,rgba(34,211,238,.12),rgba(10,15,20,.95))" : "rgba(15,20,28,.9)" }}>
          <div style={S.slotLab}>ТВОЙ</div>
          {source ? (
            <>
              <div style={S.imgBox}>{giftImg(source.itemId, source.imageUrl) ? <img src={giftImg(source.itemId, source.imageUrl)!} alt="" style={S.img} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <span style={{ fontSize: 28 }}>🎁</span>}</div>
              <div style={S.name}>{source.nameRu}</div>
              <div style={S.price}>{source.valueTon} TON</div>
            </>
          ) : (
            <div style={S.empty}><div style={S.plus}>＋</div>Выбрать NFT</div>
          )}
        </button>
        <div style={S.mid}><div style={S.midArrow}>→</div></div>
        <button type="button" disabled={busy || !source} onClick={() => source && (setSearch(""), setPickSide("target"))} style={{ ...S.slot, borderColor: target ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.08)", background: target ? "linear-gradient(165deg,rgba(16,185,129,.12),rgba(10,15,20,.95))" : "rgba(15,20,28,.9)", opacity: source ? 1 : .4 }}>
          <div style={{ ...S.slotLab, color: "#34d399" }}>ЦЕЛЬ</div>
          {target ? (
            <>
              <div style={{ ...S.imgBox, borderColor: "rgba(52,211,153,.25)" }}>{giftImg(target.id, target.imageUrl) ? <img src={giftImg(target.id, target.imageUrl)!} alt="" style={S.img} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <span style={{ fontSize: 28 }}>✨</span>}</div>
              <div style={S.name}>{target.nameRu}</div>
              <div style={{ ...S.price, color: "#6ee7b7" }}>{target.valueTon} TON</div>
            </>
          ) : (
            <div style={S.empty}><div style={{ ...S.plus, borderColor: "rgba(52,211,153,.3)", color: "#6ee7b7" }}>＋</div>{source ? "Только дороже" : "Сначала свой"}</div>
          )}
        </button>
      </div>

      {source && target && (
        <div style={S.stats}>
          <div style={S.stat}><div style={S.statL}>Шанс</div><div style={{ ...S.statV, color: chanceTone }}>{chance}%</div></div>
          <div style={S.stat}><div style={S.statL}>Множитель</div><div style={{ ...S.statV, color: "#67e8f9" }}>{mult}×</div></div>
          <div style={S.stat}><div style={S.statL}>Edge</div><div style={S.statV}>{HOUSE * 100}%</div></div>
        </div>
      )}

      <button type="button" disabled={!canPlay} onClick={play} className={canPlay && !busy ? "up-btn-ready" : undefined} style={{ ...S.btn, opacity: canPlay ? 1 : .35, background: canPlay ? undefined : "rgba(30,41,59,.8)" }}>
        {busy ? "Крутим…" : "Upgrade"}
      </button>
      <div style={S.hint}>Проигрыш — NFT сгорает. В целях только дороже твоего.</div>

      {pickSide && (
        <div style={S.overlay} onClick={() => setPickSide(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.handle} />
            <div style={S.modalHead}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>{pickSide === "source" ? "Твой NFT" : "Цель апгрейда"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                  {pickSide === "source"
                    ? `${myItems.length} в инвентаре`
                    : source
                      ? `Только > ${source.valueTon} TON · ${filteredTargets.length} шт.`
                      : "Сначала выбери свой NFT"}
                </div>
              </div>
              <button type="button" onClick={() => setPickSide(null)} style={S.close}>✕</button>
            </div>
            <input type="search" placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} style={S.search} />
            {loading ? (
              <div style={{ color: "#64748b", padding: 28, textAlign: "center" }}>Загрузка…</div>
            ) : pickSide === "source" ? (
              filteredMy.length === 0 ? <div style={S.emptyBox}>Нет NFT в инвентаре</div> : (
                <div style={S.grid}>
                  {filteredMy.map((it) => (
                    <button key={it.id} type="button" onClick={() => { setSource(it); setTarget(null); setResult(null); setPickSide(null); haptic("light"); }} style={{ ...S.card, borderColor: source?.id === it.id ? "rgba(34,211,238,.55)" : "rgba(255,255,255,.07)" }}>
                      {giftImg(it.itemId, it.imageUrl) ? <img src={giftImg(it.itemId, it.imageUrl)!} alt="" style={S.cardImg} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div style={{ fontSize: 36 }}>🎁</div>}
                      <div style={S.cardName}>{it.nameRu}</div>
                      <div style={S.cardPrice}>{it.valueTon} TON</div>
                    </button>
                  ))}
                </div>
              )
            ) : !source ? (
              <div style={S.emptyBox}>Сначала выбери свой NFT</div>
            ) : filteredTargets.length === 0 ? (
              <div style={S.emptyBox}>
                {availableTargets.length === 0
                  ? `Нет подарков дороже ${source.valueTon} TON`
                  : "Ничего не найдено"}
              </div>
            ) : (
              <div style={S.grid}>
                {filteredTargets.map((t) => {
                  const c = calcChance(source.valueTon, t.valueTon);
                  return (
                    <button key={t.id} type="button" onClick={() => { setTarget(t); setResult(null); setPickSide(null); haptic("light"); }} style={{ ...S.card, borderColor: target?.id === t.id ? "rgba(52,211,153,.55)" : "rgba(255,255,255,.07)" }}>
                      {giftImg(t.id, t.imageUrl) ? <img src={giftImg(t.id, t.imageUrl)!} alt="" style={S.cardImg} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div style={{ fontSize: 36 }}>✨</div>}
                      <div style={S.cardName}>{t.nameRu}</div>
                      <div style={{ ...S.cardPrice, color: rarityColor(t.rarity) }}>{t.valueTon} TON</div>
                      <div style={S.chance}>{c}%</div>
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: "-.03em", background: "linear-gradient(100deg,#ecfeff,#22d3ee,#67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  sub: { fontSize: 12, color: "#64748b", marginTop: 4 },
  bal: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, padding: "8px 12px", borderRadius: 12, background: "rgba(15,23,42,.8)", border: "1px solid rgba(34,211,238,.15)" },
  steps: { display: "flex", alignItems: "center", gap: 6, marginBottom: 14, padding: "8px 10px", borderRadius: 12, background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.06)" },
  step: { fontSize: 11, fontWeight: 800, color: "#475569", padding: "4px 8px", borderRadius: 8 },
  stepActive: { color: "#67e8f9", background: "rgba(34,211,238,.12)" },
  stepDone: { color: "#34d399", background: "rgba(16,185,129,.1)" },
  stepLine: { flex: 1, height: 1, background: "rgba(255,255,255,.08)" },
  dial: { position: "relative", height: 260, marginBottom: 14, borderRadius: 24, overflow: "hidden", background: "radial-gradient(ellipse at 50% 30%,rgba(34,211,238,.14) 0%,rgba(15,23,42,.5) 45%,#070b10 72%)", border: "1px solid rgba(34,211,238,.18)", padding: 10, animation: "upBreath 3.6s ease-in-out infinite" },
  result: { position: "absolute", left: 12, right: 12, bottom: 10, textAlign: "center", fontWeight: 900, fontSize: 13, padding: "8px 12px", borderRadius: 12, border: "1px solid", zIndex: 2 },
  pair: { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "stretch", marginBottom: 12 },
  slot: { border: "1px solid", borderRadius: 18, padding: "12px 8px 14px", textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit", minHeight: 150 },
  slotLab: { fontSize: 10, fontWeight: 800, color: "#22d3ee", letterSpacing: ".1em", marginBottom: 8 },
  imgBox: { width: 64, height: 64, margin: "0 auto 8px", borderRadius: 14, background: "rgba(0,0,0,.35)", border: "1px solid rgba(34,211,238,.15)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: { width: 54, height: 54, objectFit: "contain", display: "block" },
  name: { fontSize: 12, fontWeight: 800, lineHeight: 1.25, marginBottom: 3 },
  price: { fontSize: 13, fontWeight: 900, color: "#e2e8f0" },
  empty: { fontSize: 12, color: "#64748b", padding: "16px 4px", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minHeight: 100, justifyContent: "center" },
  plus: { width: 40, height: 40, borderRadius: 12, border: "1px dashed rgba(34,211,238,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#67e8f9", background: "rgba(34,211,238,.06)" },
  mid: { display: "flex", alignItems: "center", justifyContent: "center" },
  midArrow: { width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#94a3b8" },
  stats: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 },
  stat: { background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 8px", textAlign: "center" },
  statL: { fontSize: 10, color: "#64748b", fontWeight: 700 },
  statV: { fontSize: 17, fontWeight: 900, marginTop: 3 },
  btn: { width: "100%", padding: "16px 0", borderRadius: 16, border: "none", color: "#fff", fontSize: 16, fontWeight: 900, fontFamily: "inherit", boxShadow: "0 10px 28px rgba(14,165,233,.25)", letterSpacing: ".03em" },
  hint: { fontSize: 11, color: "#475569", marginTop: 10, textAlign: "center", lineHeight: 1.4 },
  toast: { position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 90, padding: "12px 18px", borderRadius: 14, fontWeight: 800, fontSize: 13, background: "rgba(8,12,18,.95)", border: "1px solid rgba(34,211,238,.2)", color: "#fff", maxWidth: "90%", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.5)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modal: { width: "100%", maxWidth: 480, maxHeight: "82vh", overflow: "auto", background: "linear-gradient(180deg,#0f172a,#0a0f14)", borderRadius: "22px 22px 0 0", border: "1px solid rgba(34,211,238,.15)", borderBottom: "none", padding: "10px 14px 36px" },
  handle: { width: 40, height: 4, borderRadius: 999, background: "rgba(255,255,255,.15)", margin: "4px auto 12px" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  close: { width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: "#e2e8f0", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  search: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(34,211,238,.15)", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit", marginBottom: 10, outline: "none" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  card: { background: "rgba(15,23,42,.8)", border: "1px solid", borderRadius: 16, padding: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit", color: "inherit" },
  cardImg: { width: 64, height: 64, objectFit: "contain", display: "block", margin: "0 auto 8px" },
  cardName: { fontSize: 12, fontWeight: 800, lineHeight: 1.2 },
  cardPrice: { fontSize: 12, fontWeight: 900, marginTop: 3, color: "#e2e8f0" },
  chance: { display: "inline-block", marginTop: 6, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900, color: "#6ee7b7", background: "rgba(16,185,129,.15)", border: "1px solid rgba(52,211,153,.3)" },
  emptyBox: { color: "#64748b", padding: 32, textAlign: "center", fontSize: 13, lineHeight: 1.5 },
};
