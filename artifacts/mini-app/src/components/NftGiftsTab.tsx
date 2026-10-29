import { useState, useMemo } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;

/** Full TG gifts list (short names) for catalog browser */
const TG_SHORT: { name: string; short: string }[] = [
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
  { name: "Ion Gem", short: "ion_gem" },
  { name: "Jelly Bunny", short: "jelly_bunny" },
  { name: "Jester Hat", short: "jester_hat" },
  { name: "Jingle Bells", short: "jingle_bells" },
  { name: "Joyful Bundle", short: "joyful_bundle" },
  { name: "Kissed Frog", short: "kissed_frog" },
  { name: "Light Sword", short: "light_sword" },
  { name: "Lol Pop", short: "lol_pop" },
  { name: "Loot Bag", short: "loot_bag" },
  { name: "Love Candle", short: "love_candle" },
  { name: "Love Potion", short: "love_potion" },
  { name: "Lunar Snake", short: "lunar_snake" },
  { name: "Lush Bouquet", short: "lush_bouquet" },
  { name: "Magic Potion", short: "magic_potion" },
  { name: "Mini Oscar", short: "mini_oscar" },
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
  { name: "Rabbit", short: "rabbit" },
  { name: "Record Player", short: "record_player" },
  { name: "Restless Jar", short: "restless_jar" },
  { name: "Sakura Flower", short: "sakura_flower" },
  { name: "Santa Hat", short: "santa_hat" },
  { name: "Scared Cat", short: "scared_cat" },
  { name: "Sharp Tongue", short: "sharp_tongue" },
  { name: "Signet Ring", short: "signet_ring" },
  { name: "Skull Flower", short: "skull_flower" },
  { name: "Sleepy Cat", short: "sleepy_cat" },
  { name: "Snake Box", short: "snake_box" },
  { name: "Snoop Cigar", short: "snoop_cigar" },
  { name: "Snoop Dogg", short: "snoop_dogg" },
  { name: "Snow Globe", short: "snow_globe" },
  { name: "Snow Mittens", short: "snow_mittens" },
  { name: "Spiced Wine", short: "spiced_wine" },
  { name: "Spy Agaric", short: "spy_agaric" },
  { name: "Star Notepad", short: "star_notepad" },
  { name: "Stellar Rocket", short: "stellar_rocket" },
  { name: "Swag Bag", short: "swag_bag" },
  { name: "Tama Gadget", short: "tama_gadget" },
  { name: "Top Hat", short: "top_hat" },
  { name: "Toy Bear", short: "toy_bear" },
  { name: "Trapped Heart", short: "trapped_heart" },
  { name: "Valentine Box", short: "valentine_box" },
  { name: "Vintage Cigar", short: "vintage_cigar" },
  { name: "Voodoo Doll", short: "voodoo_doll" },
  { name: "Westside Sign", short: "westside_sign" },
  { name: "Whip Cupcake", short: "whip_cupcake" },
  { name: "Winter Wreath", short: "winter_wreath" },
  { name: "Witch Hat", short: "witch_hat" },
  { name: "Xmas Stocking", short: "xmas_stocking" },
];

export function NftGiftsTab() {
  const [mode, setMode] = useState<"market" | "catalog">("market");
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
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return TG_SHORT;
    return TG_SHORT.filter((g) => g.name.toLowerCase().includes(s) || g.short.includes(s));
  }, [q]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: "#e2e8f0" }}>
        Каталог подарков ({TG_SHORT.length})
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 12,
          background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", fontSize: 13,
          fontFamily: "inherit", outline: "none",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {list.map((g) => (
          <div
            key={g.short}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: 8, textAlign: "center",
            }}
          >
            <img src={IMG(g.short)} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} loading="lazy" />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginTop: 4, lineHeight: 1.2 }}>
              {g.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
