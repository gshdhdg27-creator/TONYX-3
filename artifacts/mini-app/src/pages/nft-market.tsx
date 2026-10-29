import { useMemo, useState, type CSSProperties } from "react";
import { useGetUserProfile } from "@workspace/api-client-react";
import { useTelegram, haptic } from "@/lib/telegram";

/* ── Telegram gift catalog (same as admin NftGiftsTab) ── */
const TG_GIFTS = [
  { name: "Artisan Brick", short: "artisan_brick" },
  { name: "Astral Shard", short: "astral_shard" },
  { name: "B-Day Candle", short: "bday_candle" },
  { name: "Berry Box", short: "berry_box" },
  { name: "Big Year", short: "big_year" },
  { name: "Bling Binky", short: "bling_binky" },
  { name: "Bonded Ring", short: "bonded_ring" },
  { name: "Bow Tie", short: "bow_tie" },
  { name: "Bunny Muffin", short: "bunny_muffin" },
  { name: "Candy Cane", short: "candy_cane" },
  { name: "Clover Pin", short: "clover_pin" },
  { name: "Cookie Heart", short: "cookie_heart" },
  { name: "Crystal Ball", short: "crystal_ball" },
  { name: "Cupid Charm", short: "cupid_charm" },
  { name: "Desk Calendar", short: "desk_calendar" },
  { name: "Diamond Ring", short: "diamond_ring" },
  { name: "Durov's Cap", short: "durovs_cap" },
  { name: "Easter Egg", short: "easter_egg" },
  { name: "Electric Skull", short: "electric_skull" },
  { name: "Eternal Candle", short: "eternal_candle" },
  { name: "Eternal Rose", short: "eternal_rose" },
  { name: "Evil Eye", short: "evil_eye" },
  { name: "Faith Amulet", short: "faith_amulet" },
  { name: "Flying Broom", short: "flying_broom" },
  { name: "Fresh Socks", short: "fresh_socks" },
  { name: "Gem Signet", short: "gem_signet" },
  { name: "Genie Lamp", short: "genie_lamp" },
  { name: "Ginger Cookie", short: "ginger_cookie" },
  { name: "Hanging Star", short: "hanging_star" },
  { name: "Happy Brownie", short: "happy_brownie" },
  { name: "Heart Locket", short: "heart_locket" },
  { name: "Heroic Helmet", short: "heroic_helmet" },
  { name: "Hex Pot", short: "hex_pot" },
  { name: "Holiday Drink", short: "holiday_drink" },
  { name: "Homemade Cake", short: "homemade_cake" },
  { name: "Hypno Lollipop", short: "hypno_lollipop" },
  { name: "Ice Cream", short: "ice_cream" },
  { name: "Input Key", short: "input_key" },
  { name: "Instant Ramen", short: "instant_ramen" },
  { name: "Ion Gem", short: "ion_gem" },
  { name: "Ionic Dryer", short: "ionic_dryer" },
  { name: "Jack-in-the-Box", short: "jackinthebox" },
  { name: "Jelly Bunny", short: "jelly_bunny" },
  { name: "Jester Hat", short: "jester_hat" },
  { name: "Jingle Bells", short: "jingle_bells" },
  { name: "Jolly Chimp", short: "jolly_chimp" },
  { name: "Joyful Bundle", short: "joyful_bundle" },
  { name: "Khabib's Papakha", short: "khabibs_papakha" },
  { name: "Kissed Frog", short: "kissed_frog" },
  { name: "Light Sword", short: "light_sword" },
  { name: "Lol Pop", short: "lol_pop" },
  { name: "Loot Bag", short: "loot_bag" },
  { name: "Love Candle", short: "love_candle" },
  { name: "Love Potion", short: "love_potion" },
  { name: "Low Rider", short: "low_rider" },
  { name: "Lunar Snake", short: "lunar_snake" },
  { name: "Lush Bouquet", short: "lush_bouquet" },
  { name: "Mad Pumpkin", short: "mad_pumpkin" },
  { name: "Magic Potion", short: "magic_potion" },
  { name: "Mighty Arm", short: "mighty_arm" },
  { name: "Mini Oscar", short: "mini_oscar" },
  { name: "Money Pot", short: "money_pot" },
  { name: "Moon Pendant", short: "moon_pendant" },
  { name: "Mousse Cake", short: "mousse_cake" },
  { name: "Nail Bracelet", short: "nail_bracelet" },
  { name: "Neko Helmet", short: "neko_helmet" },
  { name: "Party Sparkler", short: "party_sparkler" },
  { name: "Perfume Bottle", short: "perfume_bottle" },
  { name: "Pet Snake", short: "pet_snake" },
  { name: "Plush Pepe", short: "plush_pepe" },
  { name: "Precious Peach", short: "precious_peach" },
  { name: "Pretty Posy", short: "pretty_posy" },
  { name: "Record Player", short: "record_player" },
  { name: "Restless Jar", short: "restless_jar" },
  { name: "Sakura Flower", short: "sakura_flower" },
  { name: "Santa Hat", short: "santa_hat" },
  { name: "Scared Cat", short: "scared_cat" },
  { name: "Sharp Tongue", short: "sharp_tongue" },
  { name: "Signet Ring", short: "signet_ring" },
  { name: "Skull Flower", short: "skull_flower" },
  { name: "Sky Stilettos", short: "sky_stilettos" },
  { name: "Sleigh Bell", short: "sleigh_bell" },
  { name: "Snake Box", short: "snake_box" },
  { name: "Snoop Cigar", short: "snoop_cigar" },
  { name: "Snoop Dogg", short: "snoop_dogg" },
  { name: "Snow Globe", short: "snow_globe" },
  { name: "Snow Mittens", short: "snow_mittens" },
  { name: "Spiced Wine", short: "spiced_wine" },
  { name: "Spring Basket", short: "spring_basket" },
  { name: "Spy Agaric", short: "spy_agaric" },
  { name: "Star Notepad", short: "star_notepad" },
  { name: "Stellar Rocket", short: "stellar_rocket" },
  { name: "Swag Bag", short: "swag_bag" },
  { name: "Swiss Watch", short: "swiss_watch" },
  { name: "Tama Gadget", short: "tama_gadget" },
  { name: "Top Hat", short: "top_hat" },
  { name: "Toy Bear", short: "toy_bear" },
  { name: "Trapped Heart", short: "trapped_heart" },
  { name: "UFC Strike", short: "ufc_strike" },
  { name: "Valentine Box", short: "valentine_box" },
  { name: "Vintage Cigar", short: "vintage_cigar" },
  { name: "Voodoo Doll", short: "voodoo_doll" },
  { name: "Westside Sign", short: "westside_sign" },
  { name: "Whip Cupcake", short: "whip_cupcake" },
  { name: "Winter Wreath", short: "winter_wreath" },
  { name: "Witch Hat", short: "witch_hat" },
  { name: "Xmas Stocking", short: "xmas_stocking" },
  { name: "Timeless Book", short: "timeless_book" },
  { name: "Vice Cream", short: "vice_cream" },
  { name: "Victory Medal", short: "victory_medal" },
  { name: "Pool Float", short: "pool_float" },
  { name: "Surge Board", short: "surge_board" },
  { name: "Chill Flame", short: "chill_flame" },
  { name: "Mood Pack", short: "mood_pack" },
  { name: "Rare Bird", short: "rare_bird" },
  { name: "Durov's Glasses", short: "durovs_glasses" },
  { name: "Liberty Figure", short: "liberty_figure" },
  { name: "Triple Meow", short: "triple_meow" },
  { name: "Algorithm Cup", short: "algorithm_cup" },
  { name: "Intelligence Cup", short: "intelligence_cup" },
  { name: "White Gilded", short: "white_gilded" },
  { name: "The Creation", short: "the_creation" },
  { name: "Digital Rain", short: "digital_rain" },
] as const;

const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;

/** Deterministic fake floor price for demo UI (Portals-like) */
function floorPrice(short: string): number {
  let h = 0;
  for (let i = 0; i < short.length; i++) h = (h * 31 + short.charCodeAt(i)) >>> 0;
  const base = 0.8 + (h % 900) / 100;
  return Math.round(base * 100) / 100;
}

function listingId(short: string, idx: number): number {
  let h = idx * 7919;
  for (let i = 0; i < short.length; i++) h = (h * 31 + short.charCodeAt(i)) >>> 0;
  return 10000 + (h % 900000);
}

const CARD_BG = [
  "linear-gradient(160deg,#1a1030 0%,#0d1528 100%)",
  "linear-gradient(160deg,#0f1a2e 0%,#12203a 100%)",
  "linear-gradient(160deg,#1a1520 0%,#0e1628 100%)",
  "linear-gradient(160deg,#121a28 0%,#0a1220 100%)",
  "linear-gradient(160deg,#1c1430 0%,#101828 100%)",
  "linear-gradient(160deg,#0e1c24 0%,#0a141c 100%)",
];

type Tab = "items" | "collections";
type Sort = "price_asc" | "price_desc" | "name";

export default function NftMarketPage() {
  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 15000 },
  } as Parameters<typeof useGetUserProfile>[1]);

  const tonBalance = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);

  const [tab, setTab] = useState<Tab>("items");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("price_asc");
  const [selected, setSelected] = useState<{
    name: string;
    short: string;
    price: number;
    id: number;
  } | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const listings = useMemo(() => {
    let list = TG_GIFTS.map((g, i) => ({
      ...g,
      price: floorPrice(g.short),
      id: listingId(g.short, i),
    }));
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.short.includes(q) ||
          String(g.id).includes(q),
      );
    }
    if (sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [search, sort]);

  const collections = useMemo(() => {
    return TG_GIFTS.map((g, i) => ({
      ...g,
      floor: floorPrice(g.short),
      volume: Math.round(floorPrice(g.short) * (20 + (i % 40))),
      change: ((i * 7) % 21) - 10,
    }));
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleBuy = async () => {
    if (!selected) return;
    haptic("medium");
    setBuying(true);
    await new Promise((r) => setTimeout(r, 800));
    setBuying(false);
    setSelected(null);
    flash("Скоро: покупка NFT будет доступна");
  };

  return (
    <div style={page}>
      <style>{`
        @keyframes nftPulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .nft-card:active { transform: scale(0.97); }
      `}</style>

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}

      {/* Header balance + title */}
      <div style={header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>NFT Market</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Telegram Gifts · как Portals
          </div>
        </div>
        <div style={balancePill}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 8px #38bdf8" }} />
          <span style={{ fontWeight: 800, color: "#e2e8f0" }}>{tonBalance.toFixed(2)}</span>
          <span style={{ color: "#64748b", fontWeight: 700 }}>TON</span>
        </div>
      </div>

      {/* Promo banner */}
      <div style={banner}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>
          🎁 {TG_GIFTS.length} коллекций
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
          Floor · фильтры · покупка в один тап
        </div>
      </div>

      {/* Tabs */}
      <div style={tabsRow}>
        <button type="button" onClick={() => setTab("items")} style={tabBtn(tab === "items")}>
          All items
        </button>
        <button type="button" onClick={() => setTab("collections")} style={tabBtn(tab === "collections")}>
          Collections
        </button>
      </div>

      {/* Filters + search */}
      <div style={{ padding: "0 14px 10px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
          {(
            [
              ["price_asc", "Цена ↑"],
              ["price_desc", "Цена ↓"],
              ["name", "Имя"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              style={{
                ...chip,
                borderColor: sort === k ? "rgba(56,189,248,0.5)" : "rgba(255,255,255,0.08)",
                background: sort === k ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.05)",
                color: sort === k ? "#7dd3fc" : "#94a3b8",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID"
          style={searchInput}
        />
      </div>

      {/* Content */}
      {tab === "items" ? (
        <div style={grid}>
          {listings.map((g, i) => (
            <button
              key={g.short + g.id}
              type="button"
              className="nft-card"
              onClick={() => {
                haptic("light");
                setSelected(g);
              }}
              style={{
                ...card,
                background: CARD_BG[i % CARD_BG.length],
              }}
            >
              <div style={imgWrap}>
                <img
                  src={IMG(g.short)}
                  alt={g.name}
                  loading="lazy"
                  style={img}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
              </div>
              <div style={cardBody}>
                <div style={cardName}>{g.name}</div>
                <div style={cardId}>#{g.id}</div>
                <div style={priceBtn}>
                  <TonIcon />
                  <span>{g.price.toFixed(2)}</span>
                </div>
              </div>
            </button>
          ))}
          {listings.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#64748b", padding: 40 }}>
              Ничего не найдено
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "0 14px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {collections
            .filter((c) => {
              const q = search.toLowerCase().trim();
              if (!q) return true;
              return c.name.toLowerCase().includes(q) || c.short.includes(q);
            })
            .map((c) => (
              <button
                key={c.short}
                type="button"
                onClick={() => {
                  setSearch(c.name);
                  setTab("items");
                }}
                style={collectionRow}
              >
                <img src={IMG(c.short)} alt="" style={collectionImg} loading="lazy" />
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    Vol {c.volume.toFixed(0)} TON
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    <TonIcon size={12} />
                    {c.floor.toFixed(2)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 2,
                      color: c.change >= 0 ? "#4ade80" : "#f87171",
                    }}
                  >
                    {c.change >= 0 ? "+" : ""}
                    {c.change}%
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}

      {/* Buy modal — Portals style */}
      {selected && (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Купить подарок</div>
              <button type="button" onClick={() => setSelected(null)} style={closeBtn}>
                ×
              </button>
            </div>

            <div style={modalHero}>
              <img src={IMG(selected.short)} alt={selected.name} style={{ width: 140, height: 140, objectFit: "contain" }} />
            </div>

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>#{selected.id}</div>
            </div>

            <div style={modalStats}>
              <div style={statCell}>
                <div style={statLabel}>Floor</div>
                <div style={statValue}>
                  <TonIcon /> {selected.price.toFixed(2)}
                </div>
              </div>
              <div style={statCell}>
                <div style={statLabel}>Ваш баланс</div>
                <div style={statValue}>
                  <TonIcon /> {tonBalance.toFixed(2)}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={buying}
              onClick={handleBuy}
              style={{
                ...buyBtn,
                opacity: buying ? 0.6 : 1,
              }}
            >
              {buying ? "Обработка…" : `Купить · ${selected.price.toFixed(2)} TON`}
            </button>
            <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 10 }}>
              Комиссия маркета · демо-режим
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden>
      <path
        d="M28 8L10 18.5v9.5c0 11.2 7.8 21.6 18 24.5 10.2-2.9 18-13.3 18-24.5v-9.5L28 8z"
        fill="#0098EA"
      />
      <path d="M28.5 20v16.2l10.8-6.1V22.8L28.5 20z" fill="#fff" fillOpacity={0.9} />
      <path d="M28.5 20L17.7 22.8v7.3l10.8 6.1V20z" fill="#fff" />
    </svg>
  );
}

/* ── styles ── */
const page: CSSProperties = {
  minHeight: "100%",
  paddingBottom: 20,
  color: "#e8e8ed",
  background: "transparent",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px 8px",
};

const balancePill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
};

const banner: CSSProperties = {
  margin: "0 14px 12px",
  padding: "12px 14px",
  borderRadius: 16,
  background: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(99,102,241,0.12))",
  border: "1px solid rgba(56,189,248,0.25)",
};

const tabsRow: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "0 14px 10px",
};

function tabBtn(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "10px 0",
    borderRadius: 12,
    border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.04)",
    color: active ? "#7dd3fc" : "#94a3b8",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const chip: CSSProperties = {
  flexShrink: 0,
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const searchInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: "11px 14px",
  color: "#e2e8f0",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: "0 14px 24px",
};

const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 0,
  overflow: "hidden",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  transition: "transform 0.15s ease",
};

const imgWrap: CSSProperties = {
  aspectRatio: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), transparent 70%)",
};

const img: CSSProperties = {
  width: "88%",
  height: "88%",
  objectFit: "contain",
};

const cardBody: CSSProperties = {
  padding: "0 10px 12px",
};

const cardName: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#f1f5f9",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const cardId: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 2,
  marginBottom: 8,
};

const priceBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(0,152,234,0.18)",
  border: "1px solid rgba(0,152,234,0.35)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 800,
  color: "#e2e8f0",
};

const collectionRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  cursor: "pointer",
  fontFamily: "inherit",
  width: "100%",
};

const collectionImg: CSSProperties = {
  width: 48,
  height: 48,
  objectFit: "contain",
  borderRadius: 12,
  background: "rgba(0,0,0,0.25)",
};

const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: 200,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const modalSheet: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  background: "linear-gradient(180deg,#12141c 0%,#0a0c12 100%)",
  borderRadius: "22px 22px 0 0",
  padding: "18px 16px 28px",
  border: "1px solid rgba(255,255,255,0.08)",
  borderBottom: "none",
};

const closeBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#94a3b8",
  fontSize: 20,
  cursor: "pointer",
  fontFamily: "inherit",
};

const modalHero: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  padding: "8px 0 12px",
  background: "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.12), transparent 65%)",
  borderRadius: 16,
  marginBottom: 8,
};

const modalStats: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 14,
};

const statCell: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "10px 12px",
};

const statLabel: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 700,
  letterSpacing: "0.06em",
  marginBottom: 4,
};

const statValue: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#e2e8f0",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const buyBtn: CSSProperties = {
  width: "100%",
  padding: "14px 0",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg,#0098EA,#38bdf8)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(0,152,234,0.35)",
};

const toastStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 300,
  background: "rgba(30,64,175,0.95)",
  color: "#fff",
  padding: "10px 18px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};
