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
  telegram_premium: "input_key", // keyboard key gift
  royal_dogg: "snoop_dogg", // closest official photo; display name stays Royal Dogg
};

function img(id: string) {
  const short = PHOTO_SHORT[id] ?? id;
  return `${TG_PHOTOS}${short}.webp`;
}

/**
 * Official Telegram Gift display names (verified vs TG_Photos / admin catalog).
 * Internal `id` kept stable for inventory progress.
 */
export const NFT_COLLECTIONS: NftCollection[] = [
  { id: "hypno_lollipop", nameRu: "Hypno Lollipop", nameEn: "Hypno Lollipop", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("hypno_lollipop") },
  { id: "liberty_figure", nameRu: "Liberty Figure", nameEn: "Liberty Figure", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("liberty_figure") },
  { id: "bday_candle", nameRu: "B-Day Candle", nameEn: "B-Day Candle", valueTon: 5, rarity: "common", piecesCount: 9, imageUrl: img("bday_candle") },
  { id: "moon_pendant", nameRu: "Moon Pendant", nameEn: "Moon Pendant", valueTon: 7, rarity: "common", piecesCount: 9, imageUrl: img("moon_pendant") },
  // keyboard button gift (was wrongly "Telegram Premium" / "Telegram Pin")
  { id: "telegram_premium", nameRu: "Input Key", nameEn: "Input Key", valueTon: 10, rarity: "rare", piecesCount: 9, imageUrl: img("telegram_premium") },
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
