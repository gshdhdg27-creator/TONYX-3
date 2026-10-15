import { useState, useMemo } from "react";

const TG_GIFTS = [
  {
    "name": "Artisan Brick",
    "short": "artisan_brick",
    "id": "6005797617768858105"
  },
  {
    "name": "Astral Shard",
    "short": "astral_shard",
    "id": "5933629604416717361"
  },
  {
    "name": "B-Day Candle",
    "short": "bday_candle",
    "id": "5782984811920491178"
  },
  {
    "name": "Berry Box",
    "short": "berry_box",
    "id": "5882252952218894938"
  },
  {
    "name": "Big Year",
    "short": "big_year",
    "id": "6028283532500009446"
  },
  {
    "name": "Bling Binky",
    "short": "bling_binky",
    "id": "5902339509239940491"
  },
  {
    "name": "Bonded Ring",
    "short": "bonded_ring",
    "id": "5870661333703197240"
  },
  {
    "name": "Bow Tie",
    "short": "bow_tie",
    "id": "5895544372761461960"
  },
  {
    "name": "Bunny Muffin",
    "short": "bunny_muffin",
    "id": "5935936766358847989"
  },
  {
    "name": "Candy Cane",
    "short": "candy_cane",
    "id": "6003373314888696650"
  },
  {
    "name": "Clover Pin",
    "short": "clover_pin",
    "id": "5960747083030856414"
  },
  {
    "name": "Cookie Heart",
    "short": "cookie_heart",
    "id": "6001538689543439169"
  },
  {
    "name": "Crystal Ball",
    "short": "crystal_ball",
    "id": "5841336413697606412"
  },
  {
    "name": "Cupid Charm",
    "short": "cupid_charm",
    "id": "5868561433997870501"
  },
  {
    "name": "Desk Calendar",
    "short": "desk_calendar",
    "id": "5782988952268964995"
  },
  {
    "name": "Diamond Ring",
    "short": "diamond_ring",
    "id": "5868503709637411929"
  },
  {
    "name": "Durov’s Cap",
    "short": "durovs_cap",
    "id": "5915521180483191380"
  },
  {
    "name": "Easter Egg",
    "short": "easter_egg",
    "id": "5773668482394620318"
  },
  {
    "name": "Electric Skull",
    "short": "electric_skull",
    "id": "5846192273657692751"
  },
  {
    "name": "Eternal Candle",
    "short": "eternal_candle",
    "id": "5821205665758053411"
  },
  {
    "name": "Eternal Rose",
    "short": "eternal_rose",
    "id": "5882125812596999035"
  },
  {
    "name": "Evil Eye",
    "short": "evil_eye",
    "id": "5825480571261813595"
  },
  {
    "name": "Faith Amulet",
    "short": "faith_amulet",
    "id": "6003456431095808759"
  },
  {
    "name": "Flying Broom",
    "short": "flying_broom",
    "id": "5837063436634161765"
  },
  {
    "name": "Fresh Socks",
    "short": "fresh_socks",
    "id": "5895603153683874485"
  },
  {
    "name": "Gem Signet",
    "short": "gem_signet",
    "id": "5859442703032386168"
  },
  {
    "name": "Genie Lamp",
    "short": "genie_lamp",
    "id": "5933531623327795414"
  },
  {
    "name": "Ginger Cookie",
    "short": "ginger_cookie",
    "id": "5983484377902875708"
  },
  {
    "name": "Hanging Star",
    "short": "hanging_star",
    "id": "5915733223018594841"
  },
  {
    "name": "Happy Brownie",
    "short": "happy_brownie",
    "id": "6006064678835323371"
  },
  {
    "name": "Heart Locket",
    "short": "heart_locket",
    "id": "5868455043362980631"
  },
  {
    "name": "Heroic Helmet",
    "short": "heroic_helmet",
    "id": "5895328365971244193"
  },
  {
    "name": "Hex Pot",
    "short": "hex_pot",
    "id": "5825801628657124140"
  },
  {
    "name": "Holiday Drink",
    "short": "holiday_drink",
    "id": "6003735372041814769"
  },
  {
    "name": "Homemade Cake",
    "short": "homemade_cake",
    "id": "5783075783622787539"
  },
  {
    "name": "Hypno Lollipop",
    "short": "hypno_lollipop",
    "id": "5825895989088617224"
  },
  {
    "name": "Ice Cream",
    "short": "ice_cream",
    "id": "5900177027566142759"
  },
  {
    "name": "Input Key",
    "short": "input_key",
    "id": "5870972044522291836"
  },
  {
    "name": "Instant Ramen",
    "short": "instant_ramen",
    "id": "6005564615793050414"
  },
  {
    "name": "Ion Gem",
    "short": "ion_gem",
    "id": "5843762284240831056"
  },
  {
    "name": "Ionic Dryer",
    "short": "ionic_dryer",
    "id": "5933937398953018107"
  },
  {
    "name": "Jack-in-the-Box",
    "short": "jackinthebox",
    "id": "6005659564635063386"
  },
  {
    "name": "Jelly Bunny",
    "short": "jelly_bunny",
    "id": "5915502858152706668"
  },
  {
    "name": "Jester Hat",
    "short": "jester_hat",
    "id": "5933590374185435592"
  },
  {
    "name": "Jingle Bells",
    "short": "jingle_bells",
    "id": "6001473264306619020"
  },
  {
    "name": "Jolly Chimp",
    "short": "jolly_chimp",
    "id": "6005880141270483700"
  },
  {
    "name": "Joyful Bundle",
    "short": "joyful_bundle",
    "id": "5870862540036113469"
  },
  {
    "name": "Khabib’s Papakha",
    "short": "khabibs_papakha",
    "id": "5839094187366024301"
  },
  {
    "name": "Kissed Frog",
    "short": "kissed_frog",
    "id": "5845776576658015084"
  },
  {
    "name": "Light Sword",
    "short": "light_sword",
    "id": "5897581235231785485"
  },
  {
    "name": "Lol Pop",
    "short": "lol_pop",
    "id": "5170594532177215681"
  },
  {
    "name": "Loot Bag",
    "short": "loot_bag",
    "id": "5868659926187901653"
  },
  {
    "name": "Love Candle",
    "short": "love_candle",
    "id": "5915550639663874519"
  },
  {
    "name": "Love Potion",
    "short": "love_potion",
    "id": "5868348541058942091"
  },
  {
    "name": "Low Rider",
    "short": "low_rider",
    "id": "6014675319464657779"
  },
  {
    "name": "Lunar Snake",
    "short": "lunar_snake",
    "id": "6028426950047957932"
  },
  {
    "name": "Lush Bouquet",
    "short": "lush_bouquet",
    "id": "5871002671934079382"
  },
  {
    "name": "Mad Pumpkin",
    "short": "mad_pumpkin",
    "id": "5841632504448025405"
  },
  {
    "name": "Magic Potion",
    "short": "magic_potion",
    "id": "5846226946928673709"
  },
  {
    "name": "Mighty Arm",
    "short": "mighty_arm",
    "id": "5895518353849582541"
  },
  {
    "name": "Mini Oscar",
    "short": "mini_oscar",
    "id": "5879737836550226478"
  },
  {
    "name": "Money Pot",
    "short": "money_pot",
    "id": "5963238670868677492"
  },
  {
    "name": "Moon Pendant",
    "short": "moon_pendant",
    "id": "5998981470310368313"
  },
  {
    "name": "Mousse Cake",
    "short": "mousse_cake",
    "id": "5935877878062253519"
  },
  {
    "name": "Nail Bracelet",
    "short": "nail_bracelet",
    "id": "5870720080265871962"
  },
  {
    "name": "Neko Helmet",
    "short": "neko_helmet",
    "id": "5933793770951673155"
  },
  {
    "name": "Party Sparkler",
    "short": "party_sparkler",
    "id": "6003643167683903930"
  },
  {
    "name": "Perfume Bottle",
    "short": "perfume_bottle",
    "id": "5913517067138499193"
  },
  {
    "name": "Pet Snake",
    "short": "pet_snake",
    "id": "6023917088358269866"
  },
  {
    "name": "Plush Pepe",
    "short": "plush_pepe",
    "id": "5936013938331222567"
  },
  {
    "name": "Precious Peach",
    "short": "precious_peach",
    "id": "5933671725160989227"
  },
  {
    "name": "Pretty Posy",
    "short": "pretty_posy",
    "id": "5933737850477478635"
  },
  {
    "name": "Record Player",
    "short": "record_player",
    "id": "5856973938650776169"
  },
  {
    "name": "Restless Jar",
    "short": "restless_jar",
    "id": "5870784783948186838"
  },
  {
    "name": "Sakura Flower",
    "short": "sakura_flower",
    "id": "5167939598143193218"
  },
  {
    "name": "Santa Hat",
    "short": "santa_hat",
    "id": "5983471780763796287"
  },
  {
    "name": "Scared Cat",
    "short": "scared_cat",
    "id": "5837059369300132790"
  },
  {
    "name": "Sharp Tongue",
    "short": "sharp_tongue",
    "id": "5841689550203650524"
  },
  {
    "name": "Signet Ring",
    "short": "signet_ring",
    "id": "5936085638515261992"
  },
  {
    "name": "Skull Flower",
    "short": "skull_flower",
    "id": "5839038009193792264"
  },
  {
    "name": "Sky Stilettos",
    "short": "sky_stilettos",
    "id": "5870947077877400011"
  },
  {
    "name": "Sleigh Bell",
    "short": "sleigh_bell",
    "id": "5981026247860290310"
  },
  {
    "name": "Snake Box",
    "short": "snake_box",
    "id": "6023679164349940429"
  },
  {
    "name": "Snoop Cigar",
    "short": "snoop_cigar",
    "id": "6012435906336654262"
  },
  {
    "name": "Snoop Dogg",
    "short": "snoop_dogg",
    "id": "6014591077976114307"
  },
  {
    "name": "Snow Globe",
    "short": "snow_globe",
    "id": "5981132629905245483"
  },
  {
    "name": "Snow Mittens",
    "short": "snow_mittens",
    "id": "5980789805615678057"
  },
  {
    "name": "Spiced Wine",
    "short": "spiced_wine",
    "id": "5913442287462908725"
  },
  {
    "name": "Spring Basket",
    "short": "spring_basket",
    "id": "5773725897517433693"
  },
  {
    "name": "Spy Agaric",
    "short": "spy_agaric",
    "id": "5821261908354794038"
  },
  {
    "name": "Star Notepad",
    "short": "star_notepad",
    "id": "5936017773737018241"
  },
  {
    "name": "Stellar Rocket",
    "short": "stellar_rocket",
    "id": "6042113507581755979"
  },
  {
    "name": "Swag Bag",
    "short": "swag_bag",
    "id": "6012607142387778152"
  },
  {
    "name": "Swiss Watch",
    "short": "swiss_watch",
    "id": "5936043693864651359"
  },
  {
    "name": "Tama Gadget",
    "short": "tama_gadget",
    "id": "6023752243218481939"
  },
  {
    "name": "Top Hat",
    "short": "top_hat",
    "id": "5897593557492957738"
  },
  {
    "name": "Toy Bear",
    "short": "toy_bear",
    "id": "5868220813026526561"
  },
  {
    "name": "Trapped Heart",
    "short": "trapped_heart",
    "id": "5841391256135008713"
  },
  {
    "name": "UFC Strike",
    "short": "ufc_strike",
    "id": "5882260270843168924"
  },
  {
    "name": "Valentine Box",
    "short": "valentine_box",
    "id": "5868595669182186720"
  },
  {
    "name": "Vintage Cigar",
    "short": "vintage_cigar",
    "id": "5857140566201991735"
  },
  {
    "name": "Voodoo Doll",
    "short": "voodoo_doll",
    "id": "5836780359634649414"
  },
  {
    "name": "Westside Sign",
    "short": "westside_sign",
    "id": "6014697240977737490"
  },
  {
    "name": "Whip Cupcake",
    "short": "whip_cupcake",
    "id": "5933543975653737112"
  },
  {
    "name": "Winter Wreath",
    "short": "winter_wreath",
    "id": "5983259145522906006"
  },
  {
    "name": "Witch Hat",
    "short": "witch_hat",
    "id": "5821384757304362229"
  },
  {
    "name": "Xmas Stocking",
    "short": "xmas_stocking",
    "id": "6003767644426076664"
  },
  {
    "name": "Timeless Book",
    "short": "timeless_book",
    "id": "5886387158889005864"
  },
  {
    "name": "Vice Cream",
    "short": "vice_cream",
    "id": "5898012527257715797"
  },
  {
    "name": "Victory Medal",
    "short": "victory_medal",
    "id": "5830340739074097859"
  },
  {
    "name": "Pool Float",
    "short": "pool_float",
    "id": "5832644211639321671"
  },
  {
    "name": "Surge Board",
    "short": "surge_board",
    "id": "5832497899283415733"
  },
  {
    "name": "Chill Flame",
    "short": "chill_flame",
    "id": "5999277561060787166"
  },
  {
    "name": "Mood Pack",
    "short": "mood_pack",
    "id": "5886756255493523118"
  },
  {
    "name": "Rare Bird",
    "short": "rare_bird",
    "id": "5999116401002939514"
  },
  {
    "name": "Durov’s Glasses",
    "short": "durovs_glasses",
    "id": "5834651202612102354"
  },
  {
    "name": "Liberty Figure",
    "short": "liberty_figure",
    "id": "5999298447486747746"
  },
  {
    "name": "Triple Meow",
    "short": "triple_meow",
    "id": "5882129648002794519"
  },
  {
    "name": "Algorithm Cup",
    "short": "algorithm_cup",
    "id": "6050827940390765935"
  },
  {
    "name": "Intelligence Cup",
    "short": "intelligence_cup",
    "id": "6046499901846586791"
  },
  {
    "name": "White Gilded",
    "short": "white_gilded",
    "id": "5913351908466098791"
  },
  {
    "name": "The Creation",
    "short": "the_creation",
    "id": "5872744075014177223"
  },
  {
    "name": "Digital Rain",
    "short": "digital_rain",
    "id": "5832279504491381684"
  }
] as const;

const IMG_BASE = "https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/";

export function NftGiftsTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<typeof TG_GIFTS[number] | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return TG_GIFTS;
    return TG_GIFTS.filter(g => g.name.toLowerCase().includes(q) || g.short.includes(q));
  }, [search]);

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск NFT..."
          style={{
            flex:1, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)",
            borderRadius:10, padding:"10px 14px", color:"#f1f5f9", fontFamily:"inherit",
            fontSize:13, outline:"none",
          }}
        />
        <span style={{ fontSize:12, color:"#64748B", fontWeight:700 }}>{filtered.length} / {TG_GIFTS.length}</span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10 }}>
        {filtered.map(g => (
          <button
            key={g.short}
            type="button"
            onClick={() => setSelected(g)}
            style={{
              background:"rgba(15,23,42,0.9)", border:"1px solid rgba(51,65,85,0.5)",
              borderRadius:14, padding:8, cursor:"pointer", fontFamily:"inherit",
              textAlign:"center", transition:"transform 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = "rgba(51,65,85,0.5)"; }}
          >
            <img
              src={`${IMG_BASE}${g.short}.webp`}
              alt={g.name}
              style={{ width:"100%", aspectRatio:"1", objectFit:"contain", borderRadius:10 }}
              loading="lazy"
            />
            <div style={{ fontSize:11, fontWeight:700, color:"#E2E8F0", marginTop:6, lineHeight:1.2 }}>{g.name}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:9999,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:"#0f172a", borderRadius:20, padding:20, maxWidth:320, width:"100%",
              textAlign:"center", border:"1px solid rgba(99,102,241,0.3)",
            }}
          >
            <img
              src={`${IMG_BASE}${selected.short}.webp`}
              alt={selected.name}
              style={{ width:180, height:180, objectFit:"contain", margin:"0 auto" }}
            />
            <div style={{ fontSize:18, fontWeight:900, color:"#F8FAFC", marginTop:12 }}>{selected.name}</div>
            <div style={{ fontSize:12, color:"#64748B", marginTop:4 }}>{selected.short}</div>
            <button
              onClick={() => setSelected(null)}
              style={{
                marginTop:16, padding:"10px 24px", borderRadius:10, border:"none",
                background:"linear-gradient(135deg,#1d4ed8,#3b82f6)", color:"#fff",
                fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
