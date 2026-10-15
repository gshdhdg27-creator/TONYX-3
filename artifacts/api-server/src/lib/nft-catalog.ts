export type NftRarity = "common" | "rare" | "epic" | "legendary";

/** Same CDN as admin panel CasesAdminTab */
const IMG_BASE =
  "https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/";

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

function img(id: string) {
  return `${IMG_BASE}${id}.webp`;
}

export const NFT_COLLECTIONS: NftCollection[] = [
  { id: "hypno_lollipop", nameRu: "Hypno Lollipop", nameEn: "Hypno Lollipop", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("hypno_lollipop") },
  { id: "liberty_figure", nameRu: "Liberty Figure", nameEn: "Liberty Figure", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("liberty_figure") },
  { id: "bday_candle", nameRu: "B-Day Candle", nameEn: "B-Day Candle", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("bday_candle") },
  { id: "moon_pendant", nameRu: "Moon Pendant", nameEn: "Moon Pendant", valueTon: 7, rarity: "common", piecesCount: 9, imageUrl: img("moon_pendant") },
  { id: "telegram_premium", nameRu: "Telegram Premium", nameEn: "Telegram Premium", valueTon: 10, rarity: "rare", piecesCount: 9, imageUrl: img("telegram_premium") },
  { id: "snoop_cigar", nameRu: "Snoop Cigar", nameEn: "Snoop Cigar", valueTon: 18, rarity: "rare", piecesCount: 9, imageUrl: img("snoop_cigar") },
  { id: "royal_dogg", nameRu: "Royal Dogg", nameEn: "Royal Dogg", valueTon: 25, rarity: "rare", piecesCount: 9, imageUrl: img("royal_dogg") },
  { id: "electric_skull", nameRu: "Electric Skull", nameEn: "Electric Skull", valueTon: 35, rarity: "epic", piecesCount: 9, imageUrl: img("electric_skull") },
  { id: "neko_helmet", nameRu: "Neko Helmet", nameEn: "Neko Helmet", valueTon: 40, rarity: "epic", piecesCount: 9, imageUrl: img("neko_helmet") },
  { id: "heroic_helmet", nameRu: "Heroic Helmet", nameEn: "Heroic Helmet", valueTon: 222, rarity: "legendary", piecesCount: 9, imageUrl: img("heroic_helmet") },
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
