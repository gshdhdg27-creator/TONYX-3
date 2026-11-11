import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  effectivePrice,
  isGiftVisible,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const MODELS_URL = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/models/${short}/prices.json`;
const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;

type GiftRow = {
  name: string;
  short: string;
  price: number;
  floor: number;
  getgems: number;
  tgmrkt: number;
  id: string;
};
type PriceSource = {
  full_name: string;
  short_name: string;
  regular_id?: string;
  floor_price_ton?: number;
  portal_price_ton?: number;
  getgems_price_ton?: number;
  tgmrkt_price_ton?: number;
};
type AttrMap = Record<string, number>;
Type ModelsPack = { models: AttrMap; backdrops: AttrMap; symbols: AttrMap };
