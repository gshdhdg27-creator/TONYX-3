export type NftRarity = "common" | "rare" | "epic" | "legendary";

export interface NftCollection {
  id: string;
  nameRu: string;
  nameEn: string;
  valueTon: number;
  rarity: NftRarity;
  piecesCount: number;
  imageUrl?: string | null;
  pieceImages?: (string | null)[];
}

/** Admin TG_Photos (raw GitHub — jsDelivr often 503) */
const TG_PHOTOS =
  "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";

/** Collection id → TG_Photos short name (when they differ) */
const PHOTO_SHORT: Record<string, string> = {
  telegram_premium: "input_key",
  royal_dogg: "snoop_dogg",
};

function img(id: string) {
  const short = PHOTO_SHORT[id] ?? id;
  return `${TG_PHOTOS}${short}.webp`;
}

/**
 * Full NFT / Telegram gift catalog for upgrade targets & collections.
 */
export const NFT_COLLECTIONS: NftCollection[] = [
  { id: "hypno_lollipop", nameRu: "Hypno Lollipop", nameEn: "Hypno Lollipop", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("hypno_lollipop") },
  { id: "liberty_figure", nameRu: "Liberty Figure", nameEn: "Liberty Figure", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("liberty_figure") },
  { id: "bday_candle", nameRu: "B-Day Candle", nameEn: "B-Day Candle", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("bday_candle") },
  { id: "desk_calendar", nameRu: "Desk Calendar", nameEn: "Desk Calendar", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("desk_calendar") },
  { id: "jingle_bells", nameRu: "Jingle Bells", nameEn: "Jingle Bells", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("jingle_bells") },
  { id: "snow_mitten", nameRu: "Snow Mitten", nameEn: "Snow Mitten", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("snow_mitten") },
  { id: "spiced_wine", nameRu: "Spiced Wine", nameEn: "Spiced Wine", valueTon: 6, rarity: "common", piecesCount: 9, imageUrl: img("spiced_wine") },
  { id: "winter_wreath", nameRu: "Winter Wreath", nameEn: "Winter Wreath", valueTon: 6, rarity: "common", piecesCount: 9, imageUrl: img("winter_wreath") },
  { id: "moon_pendant", nameRu: "Moon Pendant", nameEn: "Moon Pendant", valueTon: 7, rarity: "common", piecesCount: 9, imageUrl: img("moon_pendant") },
  { id: "cookie_heart", nameRu: "Cookie Heart", nameEn: "Cookie Heart", valueTon: 7, rarity: "common", piecesCount: 9, imageUrl: img("cookie_heart") },
  { id: "lol_pop", nameRu: "Lol Pop", nameEn: "Lol Pop", valueTon: 8, rarity: "common", piecesCount: 9, imageUrl: img("lol_pop") },
  { id: "xmas_stocking", nameRu: "Xmas Stocking", nameEn: "Xmas Stocking", valueTon: 8, rarity: "common", piecesCount: 9, imageUrl: img("xmas_stocking") },
  { id: "ginger_cookie", nameRu: "Ginger Cookie", nameEn: "Ginger Cookie", valueTon: 9, rarity: "common", piecesCount: 9, imageUrl: img("ginger_cookie") },
  { id: "telegram_premium", nameRu: "Input Key", nameEn: "Input Key", valueTon: 10, rarity: "rare", piecesCount: 9, imageUrl: img("telegram_premium") },
  { id: "party_sparkler", nameRu: "Party Sparkler", nameEn: "Party Sparkler", valueTon: 12, rarity: "rare", piecesCount: 9, imageUrl: img("party_sparkler") },
  { id: "jelly_bunny", nameRu: "Jelly Bunny", nameEn: "Jelly Bunny", valueTon: 14, rarity: "rare", piecesCount: 9, imageUrl: img("jelly_bunny") },
  { id: "snoop_cigar", nameRu: "Snoop Cigar", nameEn: "Snoop Cigar", valueTon: 18, rarity: "rare", piecesCount: 9, imageUrl: img("snoop_cigar") },
  { id: "love_potion", nameRu: "Love Potion", nameEn: "Love Potion", valueTon: 20, rarity: "rare", piecesCount: 9, imageUrl: img("love_potion") },
  { id: "toy_bear", nameRu: "Toy Bear", nameEn: "Toy Bear", valueTon: 22, rarity: "rare", piecesCount: 9, imageUrl: img("toy_bear") },
  { id: "royal_dogg", nameRu: "Royal Dogg", nameEn: "Royal Dogg", valueTon: 25, rarity: "rare", piecesCount: 9, imageUrl: img("royal_dogg") },
  { id: "diamond_ring", nameRu: "Diamond Ring", nameEn: "Diamond Ring", valueTon: 28, rarity: "rare", piecesCount: 9, imageUrl: img("diamond_ring") },
  { id: "vintage_cigar", nameRu: "Vintage Cigar", nameEn: "Vintage Cigar", valueTon: 30, rarity: "rare", piecesCount: 9, imageUrl: img("vintage_cigar") },
  { id: "electric_skull", nameRu: "Electric Skull", nameEn: "Electric Skull", valueTon: 35, rarity: "epic", piecesCount: 9, imageUrl: img("electric_skull") },
  { id: "neko_helmet", nameRu: "Neko Helmet", nameEn: "Neko Helmet", valueTon: 40, rarity: "epic", piecesCount: 9, imageUrl: img("neko_helmet") },
  { id: "sakura_flower", nameRu: "Sakura Flower", nameEn: "Sakura Flower", valueTon: 45, rarity: "epic", piecesCount: 9, imageUrl: img("sakura_flower") },
  { id: "crystal_ball", nameRu: "Crystal Ball", nameEn: "Crystal Ball", valueTon: 55, rarity: "epic", piecesCount: 9, imageUrl: img("crystal_ball") },
  { id: "magic_potion", nameRu: "Magic Potion", nameEn: "Magic Potion", valueTon: 65, rarity: "epic", piecesCount: 9, imageUrl: img("magic_potion") },
  { id: "golden_star", nameRu: "Golden Star", nameEn: "Golden Star", valueTon: 80, rarity: "epic", piecesCount: 9, imageUrl: img("golden_star") },
  { id: "luxury_watch", nameRu: "Luxury Watch", nameEn: "Luxury Watch", valueTon: 100, rarity: "epic", piecesCount: 9, imageUrl: img("luxury_watch") },
  { id: "heroic_helmet", nameRu: "Heroic Helmet", nameEn: "Heroic Helmet", valueTon: 222, rarity: "legendary", piecesCount: 9, imageUrl: img("heroic_helmet") },
  { id: "plush_pepe", nameRu: "Plush Pepe", nameEn: "Plush Pepe", valueTon: 350, rarity: "legendary", piecesCount: 9, imageUrl: img("plush_pepe") },
  { id: "durov_cap", nameRu: "Durov's Cap", nameEn: "Durov's Cap", valueTon: 500, rarity: "legendary", piecesCount: 9, imageUrl: img("durov_cap") },
];

export const NFT_COLLECTION_IDS = NFT_COLLECTIONS.map((c) => c.id);

export function getNftCollection(id: string): NftCollection | undefined {
  return NFT_COLLECTIONS.find((c) => c.id === id);
}

export function emptyPieces(count = 9): number[] {
  return Array.from({ length: count }, () => 0);
}

export function isCollectionComplete(pieces: number[]): boolean {
  return pieces.length >= 9 && pieces.every((p) => p >= 1);
}
