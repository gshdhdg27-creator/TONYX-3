import { Router, type IRouter } from "express";

const router: IRouter = Router();

let tonCache = { price: 3.0, updatedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

router.get("/ton", async (_req, res) => {
  const now = Date.now();
  if (now - tonCache.updatedAt > CACHE_TTL_MS) {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (response.ok) {
        const data = (await response.json()) as Record<string, Record<string, number>>;
        const price = data?.["the-open-network"]?.usd;
        if (typeof price === "number" && price > 0) {
          tonCache = { price, updatedAt: now };
          console.log(`[Prices] TON/USD updated: $${price}`);
        }
      }
    } catch (err) {
      console.warn("[Prices] CoinGecko fetch failed, using cached price:", tonCache.price, err);
    }
  }
  res.json({ price: tonCache.price, cachedAt: new Date(tonCache.updatedAt).toISOString() });
});

export default router;
