import { useEffect, useMemo, useState } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

/**
 * Catalog powered by @GiftChanges (api.changes.tg) — models / backdrops / symbols
 * with real PNG assets for models & symbols.
 * SEE ARTIFACTS LOCAL FILE - partial restore pending full push
 */
const API = "https://api.changes.tg";
export function NftGiftsTab() {
  return (
    <div style={{ padding: 16, color: "#e2e8f0" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>NFT Gifts</div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>
        Full NftGiftsTab is in local artifacts — re-push full file.
        thanks to @GiftChanges for this API (api.changes.tg)
      </div>
      <NftMarketAdminTab />
    </div>
  );
}
