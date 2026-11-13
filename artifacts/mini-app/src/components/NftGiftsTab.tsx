import { useEffect, useMemo, useState } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const COVER = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;
const MODEL_WEBP = (short: string, slug: string) =>
  `https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main/models/${short}/${slug}.webp`;
const MODEL_CONFIG = (short: string) =>
  `https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main/models/${short}/config.json`;
const MODEL_PRICES = (short: string) =>
  `https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main/models/${short}/prices.json`;

type GiftRow = { name: string; short: string; floor: number };
type ModelRow = { name: string; slug: string; img: string; rarity?: number; price?: number };

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
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return gifts;
    return gifts.filter(
      (g) => g.name.toLowerCase().includes(s) || g.short.includes(s),
    );
  }, [gifts, q]);

  if (selected) {
    return (
      <GiftModelsView
        gift={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: "#e2e8f0" }}>
        Каталог NFT-подарков ({loading ? "…" : gifts.length})
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
        Нажми на подарок — откроются все модели с фото и названием
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по названию…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 12,
          background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", fontSize: 13,
          fontFamily: "inherit", outline: "none",
        }}
      />
      {loading && (
        <div style={{ color: "#64748b", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
          Загрузка всех подарков…
        </div>
      )}
      {!loading && list.length === 0 && (
        <div style={{ color: "#64748b", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
          Ничего не найдено
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {list.map((g) => (
          <button
            key={g.short}
            type="button"
            onClick={() => setSelected(g)}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: 8, textAlign: "center", cursor: "pointer",
              fontFamily: "inherit", color: "inherit",
            }}
          >
            <img
              src={COVER(g.short)}
              alt=""
              style={{ width: 56, height: 56, objectFit: "contain" }}
              loading="lazy"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.opacity = "0.3";
              }}
            />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginTop: 4, lineHeight: 1.2 }}>
              {g.name}
            </div>
            {g.floor > 0 && (
              <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                {g.floor.toFixed(2)} TON
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function GiftModelsView({ gift, onBack }: { gift: GiftRow; onBack: () => void }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setModels([]);
      try {
        // 1) Prefer config.json — has exact slug + webp_path + rarity
        const cfgRes = await fetch(MODEL_CONFIG(gift.short), { cache: "force-cache" });
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as {
            name?: string;
            webp_path?: string;
            rarity_percent?: number;
          }[];
          if (Array.isArray(cfg) && cfg.length > 0) {
            const rows: ModelRow[] = cfg
              .filter((m) => m?.name)
              .map((m) => {
                const slug = String(m.name);
                const img = m.webp_path
                  ? `https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main/${m.webp_path}`
                  : MODEL_WEBP(gift.short, slug);
                return {
                  name: prettyName(slug),
                  slug,
                  img,
                  rarity: m.rarity_percent,
                };
              })
              .sort((a, b) => a.name.localeCompare(b.name));
            if (!cancelled) setModels(rows);
            return;
          }
        }

        // 2) Fallback: prices.json models map
        const pricesRes = await fetch(MODEL_PRICES(gift.short), { cache: "force-cache" });
        if (!pricesRes.ok) throw new Error(`models HTTP ${pricesRes.status}`);
        const prices = (await pricesRes.json()) as { models?: Record<string, number> };
        const entries = Object.entries(prices.models ?? {});
        const rows: ModelRow[] = entries.map(([name, price]) => {
          const slug = toSlug(name);
          return {
            name,
            slug,
            img: MODEL_WEBP(gift.short, slug),
            price: typeof price === "number" ? price : undefined,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setModels(rows);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gift.short]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return models;
    return models.filter(
      (m) => m.name.toLowerCase().includes(s) || m.slug.includes(s),
    );
  }, [models, q]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginBottom: 12, padding: "8px 12px", borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
          color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        ← Назад к каталогу
      </button>

      <div style={{
        display: "flex", gap: 12, alignItems: "center", marginBottom: 14,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: 12,
      }}>
        <img
          src={COVER(gift.short)}
          alt=""
          style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 10, background: "rgba(0,0,0,0.25)" }}
        />
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#f1f5f9" }}>{gift.name}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{gift.short}</div>
          <div style={{ fontSize: 12, color: "#7dd3fc", marginTop: 4, fontWeight: 700 }}>
            {loading ? "Загрузка моделей…" : `${models.length} моделей`}
          </div>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск модели…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 12,
          background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", fontSize: 13,
          fontFamily: "inherit", outline: "none",
        }}
      />

      {err && (
        <div style={{
          background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 12, padding: 12, color: "#fca5a5", fontSize: 12, marginBottom: 12,
        }}>
          Не удалось загрузить модели: {err}
        </div>
      )}

      {loading && (
        <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 24 }}>
          Загрузка…
        </div>
      )}

      {!loading && !err && filtered.length === 0 && (
        <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 24 }}>
          Модели не найдены
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {filtered.map((m) => (
          <div
            key={m.slug}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: 8, textAlign: "center",
            }}
          >
            <img
              src={m.img}
              alt={m.name}
              style={{
                width: "100%", aspectRatio: "1", objectFit: "contain",
                borderRadius: 8, background: "rgba(0,0,0,0.25)",
              }}
              loading="lazy"
              onError={(e) => {
                const el = e.currentTarget;
                // try alternate slug from pretty name
                if (!el.dataset.tried) {
                  el.dataset.tried = "1";
                  el.src = MODEL_WEBP(gift.short, toSlug(m.name));
                } else {
                  el.style.opacity = "0.25";
                }
              }}
            />
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#e2e8f0", marginTop: 6,
              lineHeight: 1.25, wordBreak: "break-word",
            }}>
              {m.name}
            </div>
            {m.rarity != null && (
              <div style={{ fontSize: 9, color: "#a78bfa", marginTop: 2 }}>
                {m.rarity}%
              </div>
            )}
            {m.price != null && m.price > 0 && (
              <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                ~{m.price.toFixed(1)} TON
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
