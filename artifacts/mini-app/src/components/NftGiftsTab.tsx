import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

const API = "https://api.changes.tg";
const COVER = (name: string) => `${API}/original/${encodeURIComponent(name)}.png?size=256`;
const MODEL_PNG = (gift: string, model: string) =>
  `${API}/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=256`;
const SYMBOL_PNG = (gift: string, symbol: string) =>
  `${API}/symbol/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;
const PATTERN_PNG = (gift: string, symbol: string) =>
  `${API}/pattern/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;

export function TgGiftVisual(props: {
  giftName: string;
  modelName: string;
  symbolName: string;
  centerColor?: string | null;
  edgeColor?: string | null;
  number?: number | null;
  size?: number;
  modelImageUrl?: string | null;
  symbolImageUrl?: string | null;
  patternImageUrl?: string | null;
}) {
  const { giftName, modelName, symbolName, centerColor, edgeColor, number, size = 168 } = props;
  const center = centerColor || "#64748b";
  const edge = edgeColor || "#1e293b";
  const modelUrl = props.modelImageUrl || MODEL_PNG(giftName, modelName);
  const patternUrl = props.patternImageUrl || PATTERN_PNG(giftName, symbolName);
  const symbolUrl = props.symbolImageUrl || SYMBOL_PNG(giftName, symbolName);
  const radius = Math.round(size * 0.22);
  const modelSz = Math.round(size * 0.74);
  const symSz = Math.round(size * 0.2);
  const pat = Math.round(size * 0.28);
  return (
    <div style={{
      position: "relative", width: size, height: size, margin: "0 auto", borderRadius: radius, overflow: "hidden",
      background: `radial-gradient(circle at 50% 36%, ${center} 0%, ${edge} 70%, #0a0f1a 100%)`,
      boxShadow: "0 14px 36px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div aria-hidden style={{
        position: "absolute", inset: 0, opacity: 0.26,
        backgroundImage: `url("${patternUrl}")`, backgroundSize: `${pat}px ${pat}px`,
        backgroundRepeat: "repeat", mixBlendMode: "soft-light", pointerEvents: "none",
      }} />
      {number != null && Number.isFinite(number) && (
        <div style={{
          position: "absolute", top: 8, left: 0, right: 0, zIndex: 4, textAlign: "center",
          fontSize: Math.max(11, Math.round(size * 0.07)), fontWeight: 900, color: "rgba(255,255,255,0.9)",
        }}>#{number}</div>
      )}
      <img src={modelUrl} alt="" style={{
        position: "relative", zIndex: 2, width: modelSz, height: modelSz, objectFit: "contain",
        display: "block", margin: `${Math.round(size * 0.1)}px auto 0`,
      }} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = COVER(giftName); } }} />
      <img src={symbolUrl} alt="" style={{
        position: "absolute", right: Math.round(size * 0.07), bottom: Math.round(size * 0.07),
        width: symSz, height: symSz, objectFit: "contain", zIndex: 3,
      }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
    </div>
  );
}

type GiftRow = { name: string };
type AttrRow = { name: string; rarity?: number; img?: string; color?: string; edgeColor?: string };
type BuiltGift = { gift: GiftRow; model: AttrRow; backdrop: AttrRow; symbol: AttrRow };

export function NftGiftsTab() {
  const [mode, setMode] = useState<"market" | "catalog">("catalog");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode("market")} style={modeBtn(mode === "market")}>NFT Market</button>
        <button type="button" onClick={() => setMode("catalog")} style={modeBtn(mode === "catalog")}>Каталог TG Gifts</button>
      </div>
      {mode === "market" ? <NftMarketAdminTab /> : <NftGiftsCatalog />}
    </div>
  );
}

function modeBtn(active: boolean): CSSProperties {
  return {
    flex: 1, padding: "10px 0", borderRadius: 12, fontWeight: 800, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
    border: active ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
    color: active ? "#7dd3fc" : "#94a3b8",
  };
}

function NftGiftsCatalog() {
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<GiftRow | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/gifts`, { cache: "force-cache" });
        const j = await r.json();
        const list: GiftRow[] = (Array.isArray(j) ? j : [])
          .map((x: { name?: string } | string) => (typeof x === "string" ? { name: x } : x?.name ? { name: x.name } : null))
          .filter(Boolean) as GiftRow[];
        if (!cancelled) setGifts(list);
      } catch {
        if (!cancelled) setGifts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (selected) return <GiftBuilder gift={selected} onBack={() => setSelected(null)} />;
  const filtered = q.trim() ? gifts.filter((g) => g.name.toLowerCase().includes(q.toLowerCase().trim())) : gifts;
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск подарка…" style={inputStyle} />
      {loading && <div style={{ textAlign: "center", color: "#64748b", padding: 20 }}>Загрузка…</div>}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {filtered.map((g) => (
            <button key={g.name} type="button" style={cardBtn} onClick={() => setSelected(g)}>
              <img src={COVER(g.name)} alt="" style={imgSq} loading="lazy" />
              <div style={nameStyle}>{g.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GiftBuilder({ gift, onBack }: { gift: GiftRow; onBack: () => void }) {
  const [step, setStep] = useState<"model" | "backdrop" | "symbol" | "done">("model");
  const [models, setModels] = useState<AttrRow[]>([]);
  const [backdrops, setBackdrops] = useState<AttrRow[]>([]);
  const [symbols, setSymbols] = useState<AttrRow[]>([]);
  const [model, setModel] = useState<AttrRow | null>(null);
  const [backdrop, setBackdrop] = useState<AttrRow | null>(null);
  const [symbol, setSymbol] = useState<AttrRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const g = encodeURIComponent(gift.name);
        let sRes = await fetch(`${API}/symbols/${g}?sorted`, { cache: "force-cache" });
        if (!sRes.ok) sRes = await fetch(`${API}/patterns/${g}?sorted`, { cache: "force-cache" });
        const [mRes, bRes] = await Promise.all([
          fetch(`${API}/models/${g}?sorted`, { cache: "force-cache" }),
          fetch(`${API}/backdrops/${g}?sorted`, { cache: "force-cache" }),
        ]);
        const parseArr = async (res: Response) => {
          if (!res.ok) return [];
          const j = await res.json();
          return Array.isArray(j) ? j : [];
        };
        const mRaw = await parseArr(mRes);
        const bRaw = await parseArr(bRes);
        const sRaw = await parseArr(sRes);
        const modelRows = mRaw.map((m: { name?: string; telegramName?: string; rarity?: number; rarityPermille?: number }) => {
          const name = m.telegramName || m.name;
          if (!name) return null;
          return { name, rarity: m.rarity ?? (m.rarityPermille != null ? m.rarityPermille / 10 : undefined), img: MODEL_PNG(gift.name, name) };
        }).filter(Boolean) as AttrRow[];
        const bdRows = bRaw.map((b: { name?: string; rarity?: number; rarityPermille?: number; hex?: { centerColor?: string; edgeColor?: string }; centerColor?: number; edgeColor?: number }) => {
          if (!b?.name) return null;
          const center = b.hex?.centerColor || (typeof b.centerColor === "number" ? `#${b.centerColor.toString(16).padStart(6, "0")}` : "#334155");
          const edge = b.hex?.edgeColor || (typeof b.edgeColor === "number" ? `#${b.edgeColor.toString(16).padStart(6, "0")}` : "#0f172a");
          return { name: b.name, rarity: b.rarity ?? (b.rarityPermille != null ? b.rarityPermille / 10 : undefined), color: center, edgeColor: edge };
        }).filter(Boolean) as AttrRow[];
        const syRows = sRaw.map((s: { name?: string; rarity?: number; rarityPermille?: number }) => {
          if (!s?.name) return null;
          return { name: s.name, rarity: s.rarity ?? (s.rarityPermille != null ? s.rarityPermille / 10 : undefined), img: SYMBOL_PNG(gift.name, s.name) };
        }).filter(Boolean) as AttrRow[];
        if (!cancelled) { setModels(modelRows); setBackdrops(bdRows); setSymbols(syRows); }
      } catch { /* */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [gift.name]);
  if (step === "done" && model && backdrop && symbol) {
    return <AssembledPanel built={{ gift, model, backdrop, symbol }} onBack={() => { setStep("symbol"); setSymbol(null); }} onReset={onBack} />;
  }
  const title = step === "model" ? "Модель" : step === "backdrop" ? "Фон" : "Символ";
  const rows = step === "model" ? models : step === "backdrop" ? backdrops : symbols;
  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={() => {
        if (step === "model") onBack();
        else if (step === "backdrop") { setStep("model"); setModel(null); }
        else { setStep("backdrop"); setBackdrop(null); }
      }} style={backBtn}>← Назад</button>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>{gift.name} · {title}</div>
      {loading && <div style={{ textAlign: "center", color: "#64748b", padding: 16 }}>Загрузка…</div>}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {rows.map((row) => (
            <button key={row.name} type="button" style={cardBtn} onClick={() => {
              if (step === "model") { setModel(row); setStep("backdrop"); }
              else if (step === "backdrop") { setBackdrop(row); setStep("symbol"); }
              else { setSymbol(row); setStep("done"); }
            }}>
              {step === "backdrop" ? (
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: `radial-gradient(circle, ${row.color || "#475569"}, ${row.edgeColor || "#0f172a"})` }} />
              ) : (
                <img src={row.img} alt="" style={imgSq} loading="lazy" />
              )}
              <div style={nameStyle}>{row.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getAdminTelegramId(): string {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tg) return String(tg);
  } catch { /* */ }
  return localStorage.getItem("adminId") || new URLSearchParams(window.location.search).get("adminId") || "";
}
function adminHeaders(adminId: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Admin-Id": adminId };
  try {
    const initData = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData;
    if (initData) h["x-telegram-init-data"] = initData;
  } catch { /* */ }
  return h;
}
function giftShortName(name: string): string {
  return name.trim().toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function normAttrName(s: string): string {
  return (s || "").toLowerCase().replace(/[''`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function lookupPrice(map: Record<string, number> | undefined, name: string): number | null {
  if (!map || !name) return null;
  const direct = map[name];
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;
  const target = normAttrName(name);
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && normAttrName(k) === target) return v;
  }
  return null;
}
function rarityToTon(rarityPct: number | undefined | null, kind: "model" | "symbol" | "backdrop"): number {
  const base = kind === "model" ? 8 : kind === "symbol" ? 6 : 4.5;
  if (rarityPct == null || !Number.isFinite(rarityPct) || rarityPct <= 0) return kind === "model" ? 25 : kind === "symbol" ? 18 : 12;
  const r = Math.max(0.05, Math.min(80, rarityPct));
  return Math.max(base * 0.6, Math.min(base * Math.pow(12 / r, 0.85), kind === "model" ? 5000 : kind === "symbol" ? 8000 : 3000));
}
function fmtTon(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function AssembledPanel({ built, onBack, onReset }: { built: BuiltGift; onBack: () => void; onReset: () => void }) {
  const { gift, model, backdrop, symbol } = built;
  const [targetId, setTargetId] = useState("");
  const [giftNumber, setGiftNumber] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);
  const [modelPrice, setModelPrice] = useState<number | null>(null);
  const [symbolPrice, setSymbolPrice] = useState<number | null>(null);
  const [backdropPrice, setBackdropPrice] = useState<number | null>(null);
  const adminId = getAdminTelegramId();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const short = giftShortName(gift.name);
      const urls = [
        `https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main/models/${short}/prices.json`,
        `https://fastly.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/models/${short}/prices.json`,
        `https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/models/${short}/prices.json`,
      ];
      let data: { models?: Record<string, number>; symbols?: Record<string, number>; backdrops?: Record<string, number> } | null = null;
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) continue;
          data = await res.json();
          break;
        } catch { /* */ }
      }
      if (cancelled) return;
      const m = lookupPrice(data?.models, model.name) ?? rarityToTon(model.rarity, "model");
      const s = lookupPrice(data?.symbols, symbol.name) ?? rarityToTon(symbol.rarity, "symbol");
      const b = lookupPrice(data?.backdrops, backdrop.name) ?? rarityToTon(backdrop.rarity, "backdrop");
      setModelPrice(m); setSymbolPrice(s); setBackdropPrice(b);
      const fl = Math.max(m, s, b);
      setPrice(String(Number(fl.toFixed(2))));
    })();
    return () => { cancelled = true; };
  }, [gift.name, model.name, model.rarity, symbol.name, symbol.rarity, backdrop.name, backdrop.rarity]);
  const estimatedFloor = [modelPrice, symbolPrice, backdropPrice].filter((x): x is number => x != null && x > 0);
  const floor = estimatedFloor.length ? Math.max(...estimatedFloor) : null;
  const postGrant = async (opts: { toId: string; list: boolean; priceTon?: number }) => {
    const num = giftNumber.trim() ? Number(giftNumber.replace(/[^0-9]/g, "")) : null;
    const est = opts.priceTon ?? floor ?? 0;
    const body: Record<string, unknown> = {
      adminId, short: giftShortName(gift.name), giftName: gift.name,
      tgBaseName: gift.name, collectionName: gift.name,
      model: model.name, backdrop: backdrop.name, symbol: symbol.name,
      imageUrl: model.img || COVER(gift.name),
      modelImageUrl: MODEL_PNG(gift.name, model.name),
      symbolImageUrl: SYMBOL_PNG(gift.name, symbol.name),
      patternImageUrl: PATTERN_PNG(gift.name, symbol.name),
      backdropCenter: backdrop.color || null, backdropEdge: backdrop.edgeColor || null, list: opts.list,
      valueTon: est,
    };
    if (num != null && Number.isFinite(num) && num > 0) body.giftNumber = num;
    if (opts.list && opts.priceTon != null) body.priceTon = opts.priceTon;
    else if (est > 0) body.priceTon = est;
    const r = await fetch(`/api/mini/admin/users/${encodeURIComponent(opts.toId)}/grant-gift`, {
      method: "POST", headers: adminHeaders(adminId), body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
    return d;
  };
  const flash = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsgErr(false); setMsg("OK"); }
    catch (e) { setMsgErr(true); setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const n = giftNumber.trim() ? Number(giftNumber.replace(/[^0-9]/g, "")) : null;
  const titleName = n != null && n > 0 ? `${gift.name} #${n}` : gift.name;
  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={onBack} style={backBtn}>← Назад</button>
      <button type="button" onClick={onReset} style={{ ...backBtn, marginLeft: 8 }}>← Каталог</button>
      <div style={{ marginTop: 12, borderRadius: 18, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98))", padding: 18, textAlign: "center" }}>
        <TgGiftVisual giftName={gift.name} modelName={model.name} symbolName={symbol.name} centerColor={backdrop.color} edgeColor={backdrop.edgeColor} number={n != null && n > 0 ? n : null} size={180} />
        <div style={{ fontSize: 17, fontWeight: 900, marginTop: 12, color: "#f8fafc" }}>{titleName}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{model.name} · {backdrop.name} · {symbol.name}</div>
        <div style={{ marginTop: 12, textAlign: "left", background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}><span style={{ color: "#94a3b8", width: 70 }}>Model</span><span style={{ flex: 1 }}>{model.name}</span><b>{fmtTon(modelPrice)}</b></div>
          <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}><span style={{ color: "#94a3b8", width: 70 }}>Symbol</span><span style={{ flex: 1 }}>{symbol.name}</span><b>{fmtTon(symbolPrice)}</b></div>
          <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}><span style={{ color: "#94a3b8", width: 70 }}>Backdrop</span><span style={{ flex: 1 }}>{backdrop.name}</span><b>{fmtTon(backdropPrice)}</b></div>
          <div style={{ display: "flex", gap: 8, fontSize: 13, marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 6 }}><span style={{ color: "#94a3b8", flex: 1 }}>Оценка</span><b style={{ color: "#7dd3fc" }}>{fmtTon(floor)} TON</b></div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <input value={giftNumber} onChange={(e) => setGiftNumber(e.target.value)} placeholder="Номер гифта (опц.)" inputMode="numeric" style={inputStyle} />
        <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Telegram ID получателя" inputMode="numeric" style={inputStyle} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена TON" inputMode="decimal" style={inputStyle} />
        <button type="button" disabled={busy || !targetId.trim()} onClick={() => void flash(async () => { await postGrant({ toId: targetId.trim(), list: false }); })} style={actionBtn("#0ea5e9")}>{busy ? "…" : "Выдать пользователю"}</button>
        <button type="button" disabled={busy || !adminId} onClick={() => void flash(async () => { await postGrant({ toId: adminId, list: false }); })} style={actionBtn("#22c55e")}>{busy ? "…" : "Выдать себе"}</button>
        <button type="button" disabled={busy || !adminId} onClick={() => {
          const p = Number(String(price).replace(",", "."));
          if (!Number.isFinite(p) || p <= 0) { setMsgErr(true); setMsg("Цена > 0"); return; }
          void flash(async () => { await postGrant({ toId: adminId, list: true, priceTon: p }); });
        }} style={actionBtn("#a855f7")}>{busy ? "…" : "Выдать себе и на маркет"}</button>
        {msg && <div style={{ color: msgErr ? "#f87171" : "#4ade80", fontSize: 13, textAlign: "center" }}>{msg}</div>}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14,
};
const backBtn: CSSProperties = {
  padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#94a3b8", fontWeight: 700, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
};
const cardBtn: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(15,23,42,0.7)", padding: 8,
  cursor: "pointer", fontFamily: "inherit", color: "#e2e8f0",
};
const imgSq: CSSProperties = { width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8, display: "block" };
const nameStyle: CSSProperties = { fontSize: 10, marginTop: 6, fontWeight: 700, lineHeight: 1.2, textAlign: "center" };
function actionBtn(bg: string): CSSProperties {
  return {
    width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", background: bg, color: "#fff",
    fontWeight: 800, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
  };
}
