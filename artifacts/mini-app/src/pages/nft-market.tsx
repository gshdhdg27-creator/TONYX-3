import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import {
  inventoryApi,
  notifyInventoryUpdated,
  type MarketListing,
} from "@/lib/inventoryApi";
import { getInventoryCache, setInventoryCache, subscribeDataCache } from "@/lib/dataCache";

function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

type Sort = "price_asc" | "price_desc" | "new";
type ViewTab = "all" | "collections";

export default function NftMarketPage() {
  const { telegramId } = useTelegram();

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("price_asc");
  const [viewTab, setViewTab] = useState<ViewTab>("all");
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [balanceTon, setBalanceTon] = useState<number>(() => getInventoryCache()?.balances?.ton ?? 0);

  // FULL FILE CONTINUES IN LOCAL tonyx-fixes - see note
  return null;
}
