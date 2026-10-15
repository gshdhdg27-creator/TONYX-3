import { useCallback, useEffect, useState, useMemo } from "react";

type RewardType = "ton" | "tonyx" | "nft_fragment" | "nft_full";

type CaseReward = {
  id: string;
  type: RewardType;
  weight: number;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
  nftId?: string;
  nftName?: string;
  pieceIndex?: number;
  labelRu?: string;
  imageUrl?: string | null;
};

type CaseRow = {
  id: string;
  nameRu: string;
  nameEn: string;
  costType: string;
  costValue: number;
  imageUrl: string | null;
  enabled: boolean;
  rewards: CaseReward[];
  sortOrder: number;
};

type NftOpt = {
  id: string;
  nameRu: string;
  valueTon: number;
};

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
  { name: "Lunar Snake", short: "lunar_snake" },
  { name: "Lush Bouquet", short: "lush_bouquet" },
  { name: "Mad Pumpkin", short: "mad_pumpkin" },
  { name: "Magic Potion", short: "magic_potion" },
  { name: "Mini Oscar", short: "mini_oscar" },
  { name: "Mood Pack", short: "mood_pack" },
  { name: "Moon Pendant", short: "moon_pendant" },
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
  { name: "Santa Hat", short: "santa_hat" },
  { name: "Scared Cat", short: "scared_cat" },
  { name: "Sharp Tongue", short: "sharp_tongue" },
  { name: "Signet Ring", short: "signet_ring" },
  { name: "Skull Flower", short: "skull_flower" },
  { name: "Snake Box", short: "snake_box" },
  { name: "Snoop Cigar", short: "snoop_cigar" },
  { name: "Snoop Dogg", short: "snoop_dogg" },
  { name: "Spiced Wine", short: "spiced_wine" },
  { name: "Star Notepad", short: "star_notepad" },
  { name: "Swiss Watch", short: "swiss_watch" },
  { name: "Tama Gadget", short: "tama_gadget" },
  { name: "Timeless Book", short: "timeless_book" },
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

const IMG_BASE = "https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(51,65,85,0.6)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#f1f5f9",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const lab: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#94a3b8",
  marginBottom: 4,
};

export function CasesAdminTab({ adminId }: { adminId: string }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [nftCatalog, setNftCatalog] = useState<NftOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nftPickerOpen, setNftPickerOpen] = useState<number | null>(null);
  const [nftSearch, setNftSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/cases?adminId=${encodeURIComponent(adminId)}`, {
        headers: { "X-Admin-Id": adminId },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setCases(d.cases ?? []);
      setNftCatalog(d.nftCatalog ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    load();
  }, [load]);

  const editing = cases.find((c) => c.id === editId) ?? null;

  async function saveCase(row: CaseRow) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/mini/admin/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": adminId,
        },
        body: JSON.stringify({ adminId, ...row }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setMsg("Сохранено");
      setEditId(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  function updateEditing(patch: Partial<CaseRow>) {
    if (!editId) return;
    setCases((prev) => prev.map((c) => (c.id === editId ? { ...c, ...patch } : c)));
  }

  function updateReward(ri: number, patch: Partial<CaseReward>) {
    if (!editing) return;
    const rewards = editing.rewards.map((r, i) => (i === ri ? { ...r, ...patch } : r));
    updateEditing({ rewards });
  }

  function addReward() {
    if (!editing) return;
    updateEditing({
      rewards: [
        ...editing.rewards,
        { id: uid(), type: "ton", weight: 10, amount: 1 },
      ],
    });
  }

  function removeReward(ri: number) {
    if (!editing) return;
    updateEditing({ rewards: editing.rewards.filter((_, i) => i !== ri) });
  }

  function selectNft(ri: number, gift: { name: string; short: string }) {
    updateReward(ri, {
      nftId: gift.short,
      nftName: gift.name,
      imageUrl: `${IMG_BASE}${gift.short}.webp`,
    });
    setNftPickerOpen(null);
    setNftSearch("");
  }

  const filteredGifts = useMemo(() => {

    const q = nftSearch.toLowerCase().trim();

    if (!q) return TG_GIFTS;

    return TG_GIFTS.filter((g) => g.name.toLowerCase().includes(q) || g.short.includes(q));

  }, [nftSearch]);

  const totalWeight = useMemo(() => {
    if (!editing) return 0;
    return editing.rewards.reduce((sum, r) => sum + (r.weight || 0), 0);
  }, [editing]);



  if (loading) {
    return <div style={{ color: "#94a3b8", padding: 20 }}>Загрузка...</div>;
  }

  return (
    <div>
      {msg && (
        <div
          style={{
            background: msg.includes("Сохран") ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)",
            color: msg.includes("Сохран") ? "#4ade80" : "#f87171",
            padding: "8px 12px",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      {!editing && (
        <div>
          {cases.map((c) => (
            <div
              key={c.id}
              onClick={() => setEditId(c.id)}
              style={{
                background: "rgba(30,45,69,0.6)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 8,
                cursor: "pointer",
                border: "1px solid rgba(51,65,85,0.4)",
              }}
            >
              <div style={{ fontWeight: 700, color: "#f1f5f9" }}>{c.nameRu}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {c.id} · {c.costType}={c.costValue} · наград: {c.rewards?.length ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div>
          <button
            type="button"
            onClick={() => setEditId(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              marginBottom: 12,
              fontFamily: "inherit",
            }}
          >
            ← Назад
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lab}>Название RU</label>
              <input
                value={editing.nameRu}
                onChange={(e) => updateEditing({ nameRu: e.target.value })}
                style={inp}
              />
            </div>
            <div>
              <label style={lab}>Название EN</label>
              <input
                value={editing.nameEn}
                onChange={(e) => updateEditing({ nameEn: e.target.value })}
                style={inp}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lab}>Тип стоимости</label>
              <select
                value={editing.costType}
                onChange={(e) => updateEditing({ costType: e.target.value })}
                style={inp}
              >
                <option value="key">Ключ</option>
                <option value="ton">TON</option>
                <option value="tonyx">TONYX</option>
              </select>
            </div>
            <div>
              <label style={lab}>Стоимость</label>
              <input
                type="number"
                step="any"
                value={editing.costValue}
                onChange={(e) => updateEditing({ costValue: Number(e.target.value) })}
                style={inp}
              />
            </div>
          </div>

          <label style={{ ...lab, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={editing.enabled}
              onChange={(e) => updateEditing({ enabled: e.target.checked })}
            />
            Включён
          </label>

          <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 800, color: "#94a3b8", fontSize: 12 }}>
            НАГРАДЫ (вес = шанс)
          </div>

          {editing.rewards.map((r, ri) => (
            <div
              key={r.id}
              style={{
                background: "rgba(30,45,69,0.5)",
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
                border: "1px solid rgba(30,58,143,0.3)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <label style={lab}>Тип</label>
                  <select
                    value={r.type}
                    onChange={(e) => updateReward(ri, { type: e.target.value as RewardType })}
                    style={inp}
                  >
                    <option value="ton">TON</option>
                    <option value="tonyx">TONYX</option>
                    <option value="nft_fragment">Кусок NFT</option>
                    <option value="nft_full">Целый NFT</option>
                  </select>
                </div>
                <div>
                  <label style={lab}>Шанс (вес)</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="number"
                      value={r.weight}
                      onChange={(e) => updateReward(ri, { weight: Number(e.target.value) })}
                      style={{ ...inp, flex: 1 }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", minWidth: 48, textAlign: "right" }}>
                      {totalWeight > 0 ? Math.round((r.weight / totalWeight) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {(r.type === "ton" || r.type === "tonyx") && (
                <div style={{ marginTop: 6 }}>
                  <label style={lab}>Сумма</label>
                  <input
                    type="number"
                    step="any"
                    value={r.amount ?? r.minAmount ?? 0}
                    onChange={(e) => updateReward(ri, { amount: Number(e.target.value), minAmount: undefined, maxAmount: undefined })}
                    style={inp}
                    placeholder={r.type === "ton" ? "1.0" : "100"}
                  />
                </div>
              )}

              {(r.type === "nft_fragment" || r.type === "nft_full") && (
                <div style={{ marginTop: 6 }}>
                  <label style={lab}>NFT подарок</label>
                  {r.nftId ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "rgba(15,23,42,0.6)",
                        borderRadius: 10,
                        padding: 8,
                      }}
                    >
                      <img
                        src={r.imageUrl || `${IMG_BASE}${r.nftId}.webp`}
                        alt={r.nftName || r.nftId}
                        style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>
                          {r.nftName || r.nftId}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{r.nftId}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNftPickerOpen(ri)}
                        style={{
                          background: "rgba(99,102,241,0.2)",
                          border: "1px solid rgba(99,102,241,0.4)",
                          color: "#a5b4fc",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Изменить
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNftPickerOpen(ri)}
                      style={{
                        width: "100%",
                        padding: "12px 0",
                        borderRadius: 10,
                        border: "1px dashed rgba(99,102,241,0.5)",
                        background: "rgba(99,102,241,0.1)",
                        color: "#a5b4fc",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      🎁 Выбрать NFT подарок
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => removeReward(ri)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: "1px solid rgba(248,113,113,0.4)",
                  color: "#f87171",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Удалить награду
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addReward}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px dashed rgba(168,85,247,0.5)",
              background: "rgba(124,58,237,0.12)",
              color: "#c4b5fd",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Добавить награду
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveCase(editing)}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg,#16a34a,#22c55e)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {nftPickerOpen !== null && (
        <div
          onClick={() => { setNftPickerOpen(null); setNftSearch(""); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              maxWidth: 480,
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={nftSearch}
                onChange={(e) => setNftSearch(e.target.value)}
                placeholder="Поиск NFT..."
                style={{ ...inp, flex: 1 }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => { setNftPickerOpen(null); setNftSearch(""); }}
                style={{
                  background: "rgba(248,113,113,0.2)",
                  border: "1px solid rgba(248,113,113,0.4)",
                  color: "#f87171",
                  borderRadius: 8,
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                paddingBottom: 20,
              }}
            >
              {filteredGifts.map((g) => (
                <button
                  key={g.short}
                  type="button"
                  onClick={() => selectNft(nftPickerOpen, g)}
                  style={{
                    background: "rgba(15,23,42,0.9)",
                    border: "1px solid rgba(51,65,85,0.5)",
                    borderRadius: 12,
                    padding: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "center",
                  }}
                >
                  <img
                    src={`${IMG_BASE}${g.short}.webp`}
                    alt={g.name}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8 }}
                    loading="lazy"
                  />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#E2E8F0", marginTop: 4, lineHeight: 1.2 }}>
                    {g.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
