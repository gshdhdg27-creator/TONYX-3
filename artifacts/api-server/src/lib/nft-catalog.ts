export type NftRarity = "common" | "rare" | "epic" | "legendary";
export interface NftCollection {
  id: string; nameRu: string; nameEn: string; valueTon: number;
  rarity: NftRarity; piecesCount: number; imageUrl?: string | null; pieceImages?: (string | null)[];
}
const TG = "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";
const PHOTO_SHORT: Record<string, string> = {
  telegram_premium: "input_key",
  royal_dogg: "snoop_dogg",
  durov_cap: "durovs_cap",
  snow_mitten: "snow_mittens",
  golden_star: "hanging_star",
  luxury_watch: "swiss_watch",
  snoopy_dogg: "snoop_dogg",
  durovs_cap: "durovs_cap",
};
function img(id: string) { return `${TG}${PHOTO_SHORT[id] ?? id}.webp`; }
/** [id, name, valueTon, rarity] — full Telegram gifts floor catalog */
