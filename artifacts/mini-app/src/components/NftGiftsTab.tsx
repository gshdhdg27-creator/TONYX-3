import { useEffect, useMemo, useState } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const RAW = "https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main";
const COVER = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;
const MODEL_WEBP = (short: string, slug: string) =>
  `${RAW}/models/${short}/${slug}.webp`;

type GiftRow = { name: string; short: string; floor: number };
type AttrRow = {
  name: string;
  slug: string;
  img?: string;
  rarity?: number;
  price?: number;
  color?: string;
};

type BuiltGift = {
  gift: GiftRow;
  model: AttrRow;
  backdrop: AttrRow;
  symbol: AttrRow;
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function prettyName(slugOrName: string): string {
  return slugOrName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Approximate color for backdrop name (many are color titles) */
function backdropColor(name: string): string {
  const n = name.toLowerCase();
  const map: Record<string, string> = {
    black: "#0a0a0a", "onyx black": "#0b0b0b", "midnight blue": "#0a1a3a",
    purple: "#6b21a8", grape: "#6b2d7b", lavender: "#a78bfa",
    "electric purple": "#a855f7", "electric indigo": "#6366f1",
    gold: "#eab308", "pure gold": "#facc15", "satin gold": "#d4a017",
    turquoise: "#14b8a6", emerald: "#059669", "hunter green": "#14532d",
    red: "#dc2626", "coral red": "#f43f5e", strawberry: "#e11d48",
    blue: "#2563eb", "sky blue": "#38bdf8", "navy blue": "#1e3a8a",
    "neon blue": "#22d3ee", silver: "#94a3b8", "roman silver": "#9ca3af",
    orange: "#f97316", caramel: "#d97706", chocolate: "#78350f",
    white: "#f8fafc", platinum: "#e2e8f0", pink: "#ec4899",
  };
  for (const [k, v] of Object.entries(map)) {
    if (n.includes(k)) return v;
  }
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

export function NftGiftsTab() {
  const [mode, setMode] = useState<"market" | "catalog">("catalog");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ModeBtn active={mode === "market"} onClick={() => setMode("market")} label="💎 NFT Market" />
        <ModeBtn active={mode === "catalog"} onClick={() => setMode("catalog")} label="🎁 Каталог" />
      </div>
      {mode === "market" ? <NftMarketAdminTab /> : <NftGiftsCatalog />}
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 0", borderRadius: 12, fontWeight: 800, fontSize: 13,
        fontFamily: "inherit", cursor: "pointer",
        border: active ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
        background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#7dd3fc" : "#94a3b8",
      }}
    >
      {label}
    </button>
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
        const res = await fetch(PRICES_URL, { cache: "force-cache" });
        const data = (await res.json()) as {
          upgraded?: {
            full_name: string;
            short_name: string;
            portal_price_ton?: number;
            floor_price_ton?: number;
          }[];
        };
        const rows: GiftRow[] = (data.upgraded ?? [])
          .map((g) => ({
            name: g.full_name || g.short_name,
            short: g.short_name,
            floor: Number(g.portal_price_ton) || Number(g.floor_price_ton) || 0,
          }))
          .filter((g) => !!g.short)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setGifts(rows);
      } catch {
        if (!cancelled) setGifts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return gifts;
    return gifts.filter((g) => g.name.toLowerCase().includes(s) || g.short.includes(s));
  }, [gifts, q]);

  if (selected) {
    return <GiftBuilder gift={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6, color: "#e2e8f0" }}>
        Каталог NFT-подарков ({loading ? "…" : gifts.length})
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
        Подарок → модель → фон → символ → выдать / на маркет
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск…"
        style={inputStyle}
      />
      {loading && <CenterMsg>Загрузка…</CenterMsg>}
      {!loading && list.length === 0 && <CenterMsg>Ничего не найдено</CenterMsg>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {list.map((g) => (
          <button key={g.short} type="button" onClick={() => setSelected(g)} style={cardBtn}>
            <img src={COVER(g.short)} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} loading="lazy"
              onError={(e) => { e.currentTarget.style.opacity = "0.3"; }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginTop: 4, lineHeight: 1.2 }}>{g.name}</div>
            {g.floor > 0 && <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{g.floor.toFixed(2)} TON</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

type Step = "model" | "backdrop" | "symbol" | "done";

function GiftBuilder({ gift, onBack }: { gift: GiftRow; onBack: () => void }) {
  const [step, setStep] = useState<Step>("model");
  const [models, setModels] = useState<AttrRow[]>([]);
  const [backdrops, setBackdrops] = useState<AttrRow[]>([]);
  const [symbols, setSymbols] = useState<AttrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [model, setModel] = useState<AttrRow | null>(null);
  const [backdrop, setBackdrop] = useState<AttrRow | null>(null);
  const [symbol, setSymbol] = useState<AttrRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [cfgRes, pricesRes, bdCfgRes, patCfgRes] = await Promise.all([
          fetch(`${RAW}/models/${gift.short}/config.json`, { cache: "force-cache" }).catch(() => null),
          fetch(`${RAW}/models/${gift.short}/prices.json`, { cache: "force-cache" }).catch(() => null),
          fetch(`${RAW}/backdrops/${gift.short}/config.json`, { cache: "force-cache" }).catch(() => null),
          fetch(`${RAW}/patterns/${gift.short}/config.json`, { cache: "force-cache" }).catch(() => null),
        ]);

        const prices = pricesRes && pricesRes.ok
          ? (await pricesRes.json()) as { models?: Record<string, number>; backdrops?: Record<string, number>; symbols?: Record<string, number> }
          : { models: {}, backdrops: {}, symbols: {} };

        // Models: merge config (slug+img) + prices (display names)
        const modelMap = new Map<string, AttrRow>();
        if (cfgRes && cfgRes.ok) {
          const cfg = (await cfgRes.json()) as { name?: string; webp_path?: string; rarity_percent?: number }[];
          if (Array.isArray(cfg)) {
            for (const m of cfg) {
              if (!m?.name) continue;
              const slug = String(m.name);
              modelMap.set(slug, {
                name: prettyName(slug),
                slug,
                img: m.webp_path ? `${RAW}/${m.webp_path}` : MODEL_WEBP(gift.short, slug),
                rarity: m.rarity_percent,
              });
            }
          }
        }
        for (const [name, price] of Object.entries(prices.models ?? {})) {
          const slug = toSlug(name);
          const prev = modelMap.get(slug);
          if (prev) {
            prev.name = name; // prefer human name from prices
            prev.price = typeof price === "number" ? price : prev.price;
          } else {
            modelMap.set(slug, {
              name,
              slug,
              img: MODEL_WEBP(gift.short, slug),
              price: typeof price === "number" ? price : undefined,
            });
          }
        }
        const modelRows = [...modelMap.values()].sort((a, b) => a.name.localeCompare(b.name));

        // Backdrops
        const bdRarity = new Map<string, number>();
        if (bdCfgRes && bdCfgRes.ok) {
          const arr = (await bdCfgRes.json()) as { name?: string; rarity_percent?: number }[];
          if (Array.isArray(arr)) for (const b of arr) if (b?.name) bdRarity.set(b.name, b.rarity_percent ?? 0);
        }
        const bdRows: AttrRow[] = Object.entries(prices.backdrops ?? {}).map(([name, price]) => ({
          name,
          slug: toSlug(name),
          rarity: bdRarity.get(name),
          price: typeof price === "number" ? price : undefined,
          color: backdropColor(name),
        }));
        // if prices empty but config has names
        if (!bdRows.length && bdRarity.size) {
          for (const [name, rarity] of bdRarity) {
            bdRows.push({ name, slug: toSlug(name), rarity, color: backdropColor(name) });
          }
        }
        bdRows.sort((a, b) => a.name.localeCompare(b.name));

        // Symbols / patterns
        const syRarity = new Map<string, number>();
        if (patCfgRes && patCfgRes.ok) {
          const arr = (await patCfgRes.json()) as { name?: string; rarity_percent?: number }[];
          if (Array.isArray(arr)) for (const s of arr) if (s?.name) syRarity.set(s.name, s.rarity_percent ?? 0);
        }
        const syRows: AttrRow[] = Object.entries(prices.symbols ?? {}).map(([name, price]) => ({
          name,
          slug: toSlug(name),
          rarity: syRarity.get(name),
          price: typeof price === "number" ? price : undefined,
        }));
        if (!syRows.length && syRarity.size) {
          for (const [name, rarity] of syRarity) {
            syRows.push({ name, slug: toSlug(name), rarity });
          }
        }
        syRows.sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setModels(modelRows);
          setBackdrops(bdRows);
          setSymbols(syRows);
          if (!modelRows.length) setErr("У этого подарка пока нет моделей в CDN (config/prices пустые).");
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gift.short]);

  const filterList = (rows: AttrRow[]) => {
    const s = q.toLowerCase().trim();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s) || r.slug.includes(s));
  };

  if (step === "done" && model && backdrop && symbol) {
    return (
      <AssembledPanel
        built={{ gift, model, backdrop, symbol }}
        onBack={() => { setStep("symbol"); setSymbol(null); }}
        onReset={onBack}
      />
    );
  }

  const title =
    step === "model" ? "Выбери модель"
      : step === "backdrop" ? "Выбери фон"
        : "Выбери символ";

  const rows =
    step === "model" ? filterList(models)
      : step === "backdrop" ? filterList(backdrops)
        : filterList(symbols);

  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={() => {
        if (step === "model") onBack();
        else if (step === "backdrop") { setStep("model"); setModel(null); setQ(""); }
        else { setStep("backdrop"); setBackdrop(null); setQ(""); }
      }} style={backBtn}>
        ← Назад
      </button>

      <Header gift={gift} model={model} backdrop={backdrop} />

      <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
        {title}{" "}
        <span style={{ color: "#64748b", fontWeight: 600 }}>
          ({loading ? "…" : rows.length})
        </span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" style={inputStyle} />

      {err && step === "model" && (
        <div style={errBox}>{err}</div>
      )}
      {loading && <CenterMsg>Загрузка…</CenterMsg>}

      {!loading && step === "model" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((m) => (
            <button key={m.slug} type="button" style={cardBtn} onClick={() => { setModel(m); setStep("backdrop"); setQ(""); }}>
              <img src={m.img} alt={m.name} style={imgSq}
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.tried) {
                    el.dataset.tried = "1";
                    el.src = MODEL_WEBP(gift.short, toSlug(m.name));
                  } else el.style.opacity = "0.25";
                }} />
              <div style={nameStyle}>{m.name}</div>
              {m.rarity != null && <div style={rarityStyle}>{m.rarity}%</div>}
            </button>
          ))}
        </div>
      )}

      {!loading && step === "backdrop" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((b) => (
            <button key={b.slug} type="button" style={cardBtn} onClick={() => { setBackdrop(b); setStep("symbol"); setQ(""); }}>
              <div style={{
                width: "100%", aspectRatio: "1", borderRadius: 8,
                background: `linear-gradient(145deg, ${b.color}, #0f172a 120%)`,
                border: "1px solid rgba(255,255,255,0.12)",
              }} />
              <div style={nameStyle}>{b.name}</div>
              {b.rarity != null && <div style={rarityStyle}>{b.rarity}%</div>}
            </button>
          ))}
          {!rows.length && <CenterMsg>Нет фонов в данных</CenterMsg>}
        </div>
      )}

      {!loading && step === "symbol" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((s) => (
            <button key={s.slug} type="button" style={cardBtn} onClick={() => { setSymbol(s); setStep("done"); setQ(""); }}>
              <div style={{
                width: "100%", aspectRatio: "1", borderRadius: 8,
                background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 900, color: "#e2e8f0",
              }}>
                {s.name.slice(0, 1).toUpperCase()}
              </div>
              <div style={nameStyle}>{s.name}</div>
              {s.rarity != null && <div style={rarityStyle}>{s.rarity}%</div>}
            </button>
          ))}
          {!rows.length && <CenterMsg>Нет символов в данных</CenterMsg>}
        </div>
      )}
    </div>
  );
}

function Header({ gift, model, backdrop }: { gift: GiftRow; model: AttrRow | null; backdrop: AttrRow | null }) {
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center", marginBottom: 12,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: 12,
    }}>
      <img src={COVER(gift.short)} alt="" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 10, background: "rgba(0,0,0,0.25)" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900 }}>{gift.name}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{gift.short}</div>
        {(model || backdrop) && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {model ? model.name : "—"} · {backdrop ? backdrop.name : "…"}
          </div>
        )}
      </div>
    </div>
  );
}

function AssembledPanel({
  built, onBack, onReset,
}: { built: BuiltGift; onBack: () => void; onReset: () => void }) {
  const { gift, model, backdrop, symbol } = built;
  const [targetId, setTargetId] = useState("");
  const [price, setPrice] = useState(gift.floor > 0 ? String(gift.floor) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);

  const adminId =
    typeof window !== "undefined"
      ? (localStorage.getItem("adminId") ||
          new URLSearchParams(window.location.search).get("adminId") ||
          "")
      : "";

  const grant = async (list: boolean) => {
    const id = targetId.trim();
    if (!id) {
      setMsgErr(true);
      setMsg("Укажи Telegram ID получателя");
      return;
    }
    if (list) {
      const p = Number(price.replace(",", "."));
      if (!Number.isFinite(p) || p <= 0) {
        setMsgErr(true);
        setMsg("Укажи цену TON > 0");
        return;
      }
    }
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        adminId,
        short: gift.short,
        giftName: gift.name,
        model: model.name,
        backdrop: backdrop.name,
        symbol: symbol.name,
        imageUrl: model.img || COVER(gift.short),
        list,
      };
      if (list) body.priceTon = Number(price.replace(",", "."));

      const r = await fetch(`/api/mini/admin/users/${encodeURIComponent(id)}/grant-gift`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": adminId,
        },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsgErr(true);
        setMsg(d.error || `Ошибка ${r.status}`);
      } else {
        setMsgErr(false);
        setMsg(d.message || "Готово");
      }
    } catch (e) {
      setMsgErr(true);
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={onBack} style={backBtn}>← Сменить символ</button>

      <div style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,189,248,0.25)",
        borderRadius: 16, padding: 14, marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, color: "#7dd3fc", fontWeight: 800, marginBottom: 10 }}>✨ Собранный NFT</div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ position: "relative", width: 88, height: 88 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: 12,
              background: `linear-gradient(145deg, ${backdrop.color}, #0f172a)`,
            }} />
            <img src={model.img || COVER(gift.short)} alt="" style={{
              position: "relative", width: 88, height: 88, objectFit: "contain", borderRadius: 12,
            }} onError={(e) => { e.currentTarget.src = COVER(gift.short); }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{gift.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>
              <div>🪖 {model.name}{model.rarity != null ? ` · ${model.rarity}%` : ""}</div>
              <div>🎨 {backdrop.name}{backdrop.rarity != null ? ` · ${backdrop.rarity}%` : ""}</div>
              <div>☘ {symbol.name}{symbol.rarity != null ? ` · ${symbol.rarity}%` : ""}</div>
            </div>
          </div>
        </div>
      </div>

      <label style={labelStyle}>Telegram ID получателя</label>
      <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="например 7257793582" style={inputStyle} />

      <label style={labelStyle}>Цена на маркете (TON)</label>
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12.5" style={inputStyle} />

      {msg && (
        <div style={{
          marginBottom: 12, padding: 10, borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: msgErr ? "rgba(248,113,113,0.12)" : "rgba(34,197,94,0.12)",
          border: `1px solid ${msgErr ? "rgba(248,113,113,0.35)" : "rgba(34,197,94,0.35)"}`,
          color: msgErr ? "#fca5a5" : "#86efac",
        }}>{msg}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => grant(false)} style={btnPrimary}>
          {busy ? "…" : "🎁 Выдать на аккаунт"}
        </button>
        <button type="button" disabled={busy} onClick={() => grant(true)} style={btnCyan}>
          {busy ? "…" : "🏷 Выдать и выставить на NFT Market"}
        </button>
        <button type="button" onClick={onReset} style={backBtn}>К каталогу</button>
      </div>
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", marginBottom: 12,
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", fontSize: 13,
  fontFamily: "inherit", outline: "none",
};
const cardBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12, padding: 8, textAlign: "center", cursor: "pointer",
  fontFamily: "inherit", color: "inherit",
};
const backBtn: React.CSSProperties = {
  display: "inline-flex", marginBottom: 12, padding: "8px 12px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const imgSq: React.CSSProperties = {
  width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8, background: "rgba(0,0,0,0.25)",
};
const nameStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#e2e8f0", marginTop: 6, lineHeight: 1.25, wordBreak: "break-word",
};
const rarityStyle: React.CSSProperties = { fontSize: 9, color: "#a78bfa", marginTop: 2 };
const errBox: React.CSSProperties = {
  background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
  borderRadius: 12, padding: 12, color: "#fca5a5", fontSize: 12, marginBottom: 12,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff",
  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const btnCyan: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#0e7490,#22d3ee)", color: "#fff",
  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
