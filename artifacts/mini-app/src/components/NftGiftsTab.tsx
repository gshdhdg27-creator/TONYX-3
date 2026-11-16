import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

const API = "https://api.changes.tg";
const COVER = (name: string) => `${API}/original/${encodeURIComponent(name)}.png?size=256`;
const MODEL_PNG = (gift: string, model: string) =>
  `${API}/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=256`;
const SYMBOL_PNG = (gift: string, symbol: string) =>
  `${API}/symbol/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;
const PATTERN_PNG = (gift: string, symbol: string) =>
  `${API}/pattern/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;

/** Telegram-style unique gift tile */
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
      boxShadow: "0 14px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div aria-hidden style={{
        position: "absolute", inset: 0, opacity: 0.26,
        backgroundImage: `url("${patternUrl}")`, backgroundSize: `${pat}px ${pat}px`,
        backgroundRepeat: "repeat", mixBlendMode: "soft-light", pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 18%, rgba(255,255,255,0.22), transparent 55%)",
        pointerEvents: "none",
      }} />
      {number != null && Number.isFinite(number) && (
        <div style={{
          position: "absolute", top: 8, left: 0, right: 0, zIndex: 4, textAlign: "center",
          fontSize: Math.max(11, Math.round(size * 0.07)), fontWeight: 900,
          color: "rgba(255,255,255,0.9)", textShadow: "0 1px 4px rgba(0,0,0,0.65)",
        }}>#{number}</div>
      )}
      <img src={modelUrl} alt="" style={{
        position: "relative", zIndex: 2, width: modelSz, height: modelSz, objectFit: "contain",
        display: "block", margin: `${Math.round(size * 0.1)}px auto 0`,
        filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.5))",
      }} onError={(e) => {
        const el = e.currentTarget;
        if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = COVER(giftName); }
      }} />
      <img src={symbolUrl} alt="" style={{
        position: "absolute", right: Math.round(size * 0.07), bottom: Math.round(size * 0.07),
        width: symSz, height: symSz, objectFit: "contain", zIndex: 3,
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
      }} onError={(e) => {
        const el = e.currentTarget;
        if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = patternUrl; }
      }} />
    </div>
  );
}

type GiftRow = { name: string };
type AttrRow = { name: string; rarity?: number; img?: string; color?: string; edgeColor?: string; patternColor?: string };
type BuiltGift = { gift: GiftRow; model: AttrRow; backdrop: AttrRow; symbol: AttrRow };

export function NftGiftsTab() {
  const [mode, setMode] = useState<"market" | "catalog">("catalog");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ModeBtn active={mode === "market"} onClick={() => setMode("market")} label="NFT Market" />
        <ModeBtn active={mode === "catalog"} onClick={() => setMode("catalog")} label="Каталог TG Gifts" />
      </div>
      {mode === "market" ? <NftMarketAdminTab /> : <NftGiftsCatalog />}
      <div style={{ marginTop: 16, fontSize: 10, color: "#475569", textAlign: "center" }}>
        thanks to @GiftChanges for this API (api.changes.tg)
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "10px 0", borderRadius: 12, fontWeight: 800, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
      border: active ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
      background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
      color: active ? "#7dd3fc" : "#94a3b8",
    }}>{label}</button>
  );
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
          .map((x: { name?: string } | string) => typeof x === "string" ? { name: x } : x?.name ? { name: x.name } : null)
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
      {loading && <CenterMsg>Загрузка каталога…</CenterMsg>}
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
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
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

        const modelRows: AttrRow[] = mRaw.map((m: { name?: string; telegramName?: string; rarity?: number; rarityPermille?: number }) => {
          const name = m.telegramName || m.name;
          if (!name) return null;
          return { name, rarity: m.rarity ?? (m.rarityPermille != null ? m.rarityPermille / 10 : undefined), img: MODEL_PNG(gift.name, name) };
        }).filter(Boolean) as AttrRow[];

        const bdRows: AttrRow[] = bRaw.map((b: { name?: string; rarity?: number; rarityPermille?: number; hex?: { centerColor?: string; edgeColor?: string; patternColor?: string }; centerColor?: number; edgeColor?: number }) => {
          if (!b?.name) return null;
          const center = b.hex?.centerColor || (typeof b.centerColor === "number" ? `#${b.centerColor.toString(16).padStart(6, "0")}` : "#334155");
          const edge = b.hex?.edgeColor || (typeof b.edgeColor === "number" ? `#${b.edgeColor.toString(16).padStart(6, "0")}` : "#0f172a");
          return { name: b.name, rarity: b.rarity ?? (b.rarityPermille != null ? b.rarityPermille / 10 : undefined), color: center, edgeColor: edge, patternColor: b.hex?.patternColor };
        }).filter(Boolean) as AttrRow[];

        const syRows: AttrRow[] = sRaw.map((s: { name?: string; rarity?: number; rarityPermille?: number }) => {
          if (!s?.name) return null;
          return { name: s.name, rarity: s.rarity ?? (s.rarityPermille != null ? s.rarityPermille / 10 : undefined), img: SYMBOL_PNG(gift.name, s.name) };
        }).filter(Boolean) as AttrRow[];

        if (!cancelled) {
          setModels(modelRows); setBackdrops(bdRows); setSymbols(syRows);
          if (!modelRows.length) setErr("Нет моделей в GiftChanges для этого подарка");
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gift.name]);

  const filterList = (rows: AttrRow[]) => {
    const s = q.toLowerCase().trim();
    return s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows;
  };

  if (step === "done" && model && backdrop && symbol) {
    return <AssembledPanel built={{ gift, model, backdrop, symbol }} onBack={() => { setStep("symbol"); setSymbol(null); }} onReset={onBack} />;
  }

  const title = step === "model" ? "Модель" : step === "backdrop" ? "Фон" : "Символ";
  const rows = step === "model" ? filterList(models) : step === "backdrop" ? filterList(backdrops) : filterList(symbols);

  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={() => {
        if (step === "model") onBack();
        else if (step === "backdrop") { setStep("model"); setModel(null); setQ(""); }
        else { setStep("backdrop"); setBackdrop(null); setQ(""); }
      }} style={backBtn}>← Назад</button>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
        <img src={COVER(gift.name)} alt="" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }} />
        <div>
          <div style={{ fontWeight: 800, color: "#f1f5f9" }}>{gift.name}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{[model?.name, backdrop?.name, symbol?.name].filter(Boolean).join(" · ") || "выбери атрибуты"}</div>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>{title} · шаг {step === "model" ? "1" : step === "backdrop" ? "2" : "3"}/3</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск ${title.toLowerCase()}…`} style={inputStyle} />
      {err && <div style={errBox}>{err}</div>}
      {loading && <CenterMsg>Загрузка…</CenterMsg>}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {rows.map((row) => (
            <button key={row.name} type="button" style={cardBtn} onClick={() => {
              if (step === "model") { setModel(row); setStep("backdrop"); setQ(""); }
              else if (step === "backdrop") { setBackdrop(row); setStep("symbol"); setQ(""); }
              else { setSymbol(row); setStep("done"); setQ(""); }
            }}>
              {step === "backdrop" ? (
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: `radial-gradient(circle, ${row.color || "#475569"}, ${row.edgeColor || "#0f172a"})` }} />
              ) : (
                <img src={row.img} alt="" style={imgSq} loading="lazy" />
              )}
              <div style={nameStyle}>{row.name}</div>
              {row.rarity != null && <div style={rarityStyle}>{row.rarity}%</div>}
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
  try {
    const id = localStorage.getItem("adminId") || new URLSearchParams(window.location.search).get("adminId");
    if (id) return String(id);
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

function AssembledPanel({ built, onBack, onReset }: { built: BuiltGift; onBack: () => void; onReset: () => void }) {
  const { gift, model, backdrop, symbol } = built;
  const [targetId, setTargetId] = useState("");
  const [giftNumber, setGiftNumber] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);
  const adminId = getAdminTelegramId();

  const postGrant = async (opts: { toId: string; list: boolean; priceTon?: number }) => {
    const num = giftNumber.trim() ? Number(giftNumber.replace(/[^0-9]/g, "")) : null;
    const body: Record<string, unknown> = {
      adminId,
      short: gift.name.replace(/\s+/g, "_").toLowerCase(),
      giftName: gift.name,
      model: model.name,
      backdrop: backdrop.name,
      symbol: symbol.name,
      imageUrl: model.img || COVER(gift.name),
      modelImageUrl: MODEL_PNG(gift.name, model.name),
      symbolImageUrl: SYMBOL_PNG(gift.name, symbol.name),
      patternImageUrl: PATTERN_PNG(gift.name, symbol.name),
      backdropCenter: backdrop.color || null,
      backdropEdge: backdrop.edgeColor || null,
      list: opts.list,
    };
    if (num != null && Number.isFinite(num) && num > 0) body.giftNumber = num;
    if (opts.list && opts.priceTon != null) body.priceTon = opts.priceTon;
    const r = await fetch(`/api/mini/admin/users/${encodeURIComponent(opts.toId)}/grant-gift`, {
      method: "POST",
      headers: adminHeaders(adminId),
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
    return d;
  };

  const flash = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsgErr(false); }
    catch (e) { setMsgErr(true); setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const titleName = giftNumber.trim() && Number(giftNumber.replace(/[^0-9]/g, "")) > 0
    ? `${gift.name} #${giftNumber.replace(/[^0-9]/g, "")}`
    : gift.name;

  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={onBack} style={backBtn}>← К символам</button>
      <button type="button" onClick={onReset} style={{ ...backBtn, marginLeft: 8 }}>← Каталог</button>

      <div style={{ marginTop: 12, borderRadius: 18, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98))", padding: 18, textAlign: "center" }}>
        <TgGiftVisual
          giftName={gift.name}
          modelName={model.name}
          symbolName={symbol.name}
          centerColor={backdrop.color}
          edgeColor={backdrop.edgeColor}
          number={(() => { const n = giftNumber.trim() ? Number(giftNumber.replace(/[^0-9]/g, "")) : null; return n != null && Number.isFinite(n) && n > 0 ? n : null; })()}
          size={180}
        />
        <div style={{ fontSize: 17, fontWeight: 900, marginTop: 12, color: "#f8fafc" }}>{titleName}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{model.name} · {backdrop.name} · {symbol.name}</div>
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>Номер подарка</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Как в Telegram, напр. 12345 → {gift.name} #12345</div>
        <input value={giftNumber} onChange={(e) => setGiftNumber(e.target.value)} placeholder="Номер (необязательно)" inputMode="numeric" style={inputStyle} />
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>Выдать в инвентарь</div>
        <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={adminId ? `ID (пусто = себе ${adminId})` : "Telegram ID"} style={inputStyle} />
        <button type="button" disabled={busy} style={btnGreen} onClick={() => void flash(async () => {
          const id = targetId.trim() || adminId;
          if (!id) throw new Error("Укажи Telegram ID");
          await postGrant({ toId: id, list: false });
          setMsg(`Выдано → ${id}` + (giftNumber.trim() ? ` #${giftNumber}` : ""));
        })}>{busy ? "…" : "Выдать"}</button>
        <button type="button" disabled={busy || !adminId} style={{ ...btnGreen, marginTop: 8, background: "linear-gradient(135deg,#1d4ed8,#3b82f6)" }} onClick={() => void flash(async () => {
          await postGrant({ toId: adminId, list: false });
          setMsg(`Выдано себе (${adminId})`);
        })}>{busy ? "…" : "Выдать себе"}</button>
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>На NFT Market</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>С аккаунта {adminId || "—"} сразу listed</div>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена TON" inputMode="decimal" style={inputStyle} />
        <button type="button" disabled={busy} style={btnCyan} onClick={() => void flash(async () => {
          if (!adminId) throw new Error("Открой админку из Telegram");
          const p = Number(String(price).replace(",", "."));
          if (!Number.isFinite(p) || p <= 0) throw new Error("Цена TON > 0");
          await postGrant({ toId: adminId, list: true, priceTon: p });
          setMsg(`На маркете за ${p} TON`);
        })}>{busy ? "…" : "Выставить со своего акка"}</button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, fontSize: 12, fontWeight: 700, background: msgErr ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: msgErr ? "#fca5a5" : "#86efac" }}>{msg}</div>
      )}
    </div>
  );
}

function CenterMsg({ children }: { children: ReactNode }) {
  return <div style={{ textAlign: "center", color: "#64748b", padding: 20, fontSize: 13 }}>{children}</div>;
}

const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)", color: "#e2e8f0", fontSize: 13, marginBottom: 10, fontFamily: "inherit" };
const cardBtn: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", padding: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit" };
const imgSq: CSSProperties = { width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8 };
const nameStyle: CSSProperties = { fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginTop: 4, textAlign: "center", lineHeight: 1.2 };
const rarityStyle: CSSProperties = { fontSize: 9, color: "#64748b", marginTop: 2 };
const backBtn: CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 };
const errBox: CSSProperties = { padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 12, marginBottom: 10 };
const sectionBox: CSSProperties = { marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" };
const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 };
const btnGreen: CSSProperties = { width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const btnCyan: CSSProperties = { width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#0e7490,#22d3ee)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
