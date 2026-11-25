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
};
function img(id: string) { return `${TG}${PHOTO_SHORT[id] ?? id}.webp`; }
/** [id, name, valueTon, rarity] — full Telegram gifts floor catalog */
const RAW: [string, string, number, NftRarity][] = [["telegram_premium","Input Key",10.0,"rare"],["royal_dogg","Royal Dogg",25.0,"rare"],["durov_cap","Durov's Cap",500.0,"legendary"],["chill_flame","Chill Flame",4.5,"common"],["bday_candle","B-Day Candle",4.53,"common"],["instant_ramen","Instant Ramen",4.66,"common"],["vice_cream","Vice Cream",4.69,"common"],["whip_cupcake","Whip Cupcake",4.69,"common"],["candy_cane","Candy Cane",4.7,"common"],["lunar_snake","Lunar Snake",4.7,"common"],["xmas_stocking","Xmas Stocking",4.7,"common"],["jackinthebox","Jack-in-the-Box",4.71,"common"],["ice_cream","Ice Cream",4.72,"common"],["lol_pop","Lol Pop",4.75,"common"],["snake_box","Snake Box",4.75,"common"],["homemade_cake","Homemade Cake",4.8,"common"],["hypno_lollipop","Hypno Lollipop",4.85,"common"],["jingle_bells","Jingle Bells",4.9,"common"],["party_sparkler","Party Sparkler",4.95,"common"],["cookie_heart","Cookie Heart",5.0,"common"],["desk_calendar","Desk Calendar",5.0,"common"],["easter_egg","Easter Egg",5.0,"common"],["ginger_cookie","Ginger Cookie",5.0,"common"],["snow_mitten","Snow Mitten",5.0,"common"],["spiced_wine","Spiced Wine",5.2,"common"],["winter_wreath","Winter Wreath",5.5,"common"],["berry_box","Berry Box",5.8,"common"],["bunny_muffin","Bunny Muffin",6.0,"common"],["clover_pin","Clover Pin",6.0,"common"],["coconut_drink","Coconut Drink",6.5,"common"],["easter_cake","Easter Cake",6.5,"common"],["fresh_socks","Fresh Socks",7.0,"common"],["moon_pendant","Moon Pendant",7.0,"common"],["input_key","Input Key",8.0,"common"],["liberty_figure","Liberty Figure",8.0,"common"],["star_notepad","Star Notepad",8.5,"common"],["tama_gadget","Tama Gadget",9.0,"common"],["top_hat","Top Hat",9.5,"common"],["bow_tie","Bow Tie",10.0,"common"],["cupid_charm","Cupid Charm",11.0,"common"],["love_candle","Love Candle",11.0,"common"],["valentine_box","Valentine Box",12.0,"rare"],["big_year","Big Year",13.0,"rare"],["holiday_drink","Holiday Drink",5.5,"common"],["sakura_flower","Sakura Flower",12.99,"rare"],["sky_stilettos","Sky Stilettos",23.8,"rare"],["sleigh_bell","Sleigh Bell",10.14,"common"],["snow_globe","Snow Globe",7.88,"common"],["snow_mittens","Snow Mittens",8.9,"common"],["spring_basket","Spring Basket",6.29,"common"],["spy_agaric","Spy Agaric",7.07,"common"],["stellar_rocket","Stellar Rocket",5.5,"common"],["swiss_watch","Swiss Watch",64.95,"epic"],["trapped_heart","Trapped Heart",19.49,"rare"],["ufc_strike","UFC Strike",18.0,"rare"],["voodoo_doll","Voodoo Doll",43.0,"epic"],["westside_sign","Westside Sign",125.0,"epic"],["witch_hat","Witch Hat",6.54,"common"],["timeless_book","Timeless Book",5.2,"common"],["victory_medal","Victory Medal",5.15,"common"],["pool_float","Pool Float",4.78,"common"],["surge_board","Surge Board",7.5,"common"],["mood_pack","Mood Pack",5.0,"common"],["triple_meow","Triple Meow",10.0,"common"],["intelligence_cup","Intelligence Cup",1024.0,"legendary"],["white_gilded","White Gilded",10.0,"common"],["the_creation","The Creation",10.0,"common"],["case","Case",43.0,"epic"],["gravestone","Gravestone",98.7,"epic"],["red_star","Red Star",53.27,"epic"],["sand_castle","Sand Castle",15.0,"rare"],["trojan_horse","Trojan Horse",210.0,"legendary"],["golden_star","Golden Star",20.0,"rare"],["luxury_watch","Luxury Watch",65.0,"epic"]];
export const NFT_COLLECTIONS: NftCollection[] = RAW.map(([id, name, valueTon, rarity]) => ({
  id, nameRu: name, nameEn: name, valueTon, rarity, piecesCount: 9, imageUrl: img(id),
}));
export const NFT_COLLECTION_IDS = NFT_COLLECTIONS.map(c => c.id);
export function getNftCollection(id: string) { return NFT_COLLECTIONS.find(c => c.id === id); }
export function emptyPieces(count = 9) { return Array.from({ length: count }, () => 0); }
export function isCollectionComplete(pieces: number[]) { return pieces.length >= 9 && pieces.every(p => p >= 1); }
