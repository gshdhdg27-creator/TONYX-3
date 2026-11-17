import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
const tonyxLogoSrc = "/tonyx-logo.jpg";
import {
  useGetUserProfile, getGetUserProfileQueryKey, useGetReferrals, useGetMiniHistory,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";
import { useLang } from "@/lib/LanguageContext";
import type { Lang } from "@/lib/i18n";
import { inventoryApi, type InventoryItem, type InventoryCollection } from "@/lib/inventoryApi";

/** Minimal unique-gift thumb for profile inventory row */
const TG_API = "https://api.changes.tg";
function isTgGiftItem(it: InventoryItem): boolean {
  return it.kind === "tg_gift" || Boolean(it.model && it.symbol && it.backdrop);
}
function tgGiftBase(it: InventoryItem): string {
  return it.collectionName || it.nameEn || (it.nameRu || "").replace(/\s*#\d+\s*$/, "").trim() || String(it.itemId || "").split("#")[0];
}
function TgGiftMini({ item, size = 44 }: { item: InventoryItem; size?: number }) {
  const base = tgGiftBase(item);
  const center = item.backdropCenter || "#4b5563";
  const edge = item.backdropEdge || "#111827";
  const modelUrl = item.modelImageUrl || (item.model ? `${TG_API}/model/${encodeURIComponent(base)}/${encodeURIComponent(item.model)}.png?size=128` : item.imageUrl) || `${TG_API}/original/${encodeURIComponent(base)}.png?size=128`;
  const symbolUrl = item.symbolImageUrl || (item.symbol ? `${TG_API}/symbol/${encodeURIComponent(base)}/${encodeURIComponent(item.symbol)}.png?size=64` : null);
  return (
    <div style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", position: "relative", flexShrink: 0, background: `radial-gradient(circle at 50% 36%, ${center} 0%, ${edge} 72%, #0a0f1a 100%)` }}>
      <img src={modelUrl || undefined} alt="" style={{ position: "relative", zIndex: 2, width: "78%", height: "78%", objectFit: "contain", display: "block", margin: "10% auto 0" }} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = `${TG_API}/original/${encodeURIComponent(base)}.png?size=128`; } }} />
      {symbolUrl && <img src={symbolUrl} alt="" style={{ position: "absolute", right: 2, bottom: 2, width: Math.round(size * 0.28), height: Math.round(size * 0.28), objectFit: "contain", zIndex: 3 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
    </div>
  );
}

const TOPUP_WALLET = "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.97)" : "rgba(220,38,38,0.97)",
      color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 9999,
      maxWidth: "calc(100% - 32px)", boxShadow: "0 8px 28px rgba(0,0,0,0.4)" }}>{msg}</div>
  );
}

function TonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r="28" fill="#0098EA"/>
      <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
    </svg>
  );
}

function TonyxIcon({ size = 28 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border: "2px solid rgba(0,162,255,0.5)",
      overflow: "hidden", flexShrink: 0, position: "relative" }}>
      <img src={tonyxLogoSrc} alt="TONYX" style={{ width: "140%", height: "140%", objectFit: "cover",
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
    </div>
  );
}

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const { t, lang, setLang } = useLang();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [invCollections, setInvCollections] = useState<InventoryCollection[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [sellingId, setSellingId] = useState<number | null>(null);

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } as any });

  useEffect(() => {
    if (!telegramId) return;
    setInvLoading(true);
    inventoryApi.get()
      .then((d) => { setInvItems(d.inventory ?? []); setInvCollections(d.collections ?? []); })
      .catch(() => {})
      .finally(() => setInvLoading(false));
  }, [telegramId]);

  async function sellItem(id: number) {
    if (sellingId) return;
    setSellingId(id);
    try {
      const r = await inventoryApi.sell(id);
      hapticNotify("success");
      setToast({ msg: `Продано +${r.receivedTon} TON`, type: "success" });
      setInvItems((prev) => prev.filter((x) => x.id !== id));
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    } catch (e) {
      hapticNotify("error");
      setToast({ msg: e instanceof Error ? e.message : "Ошибка", type: "error" });
    } finally { setSellingId(null); }
  }

  if (!telegramId) {
    return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;
  }

  const userTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);

  return (
    <div style={{ padding: "72px 16px 100px", color: "#f1f5f9" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "success" ? "rgba(22,163,74,0.97)" : "rgba(220,38,38,0.97)",
          color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 9999 }}>{toast.msg}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a8a,#60a5fa)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, overflow: "hidden", flexShrink: 0 }}>
          {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (firstName ?? username ?? "U")[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{firstName ?? username ?? `User ${telegramId.slice(-4)}`}</div>
          {username && <div style={{ fontSize: 12, color: "#60a5fa" }}>@{username}</div>}
          <div style={{ fontSize: 10, color: "#475569" }}>ID {telegramId}</div>
        </div>
      </div>

      <div style={{ background: "linear-gradient(145deg, rgba(10,20,55,0.98), rgba(15,30,75,0.95))", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.18em", marginBottom: 16 }}>ВАШ БАЛАНС</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "rgba(0,152,234,0.12)", border: "1px solid rgba(0,152,234,0.3)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TonIcon size={24} /><span style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>TON</span></div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{userTon.toFixed(4)}</div>
          </div>
          <div style={{ background: "rgba(0,162,255,0.08)", border: "1px solid rgba(0,162,255,0.25)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TonyxIcon size={24} /><span style={{ fontSize: 13, fontWeight: 700, color: "#67e8f9" }}>TONYX</span></div>
            <div style={{ fontSize: 26, fontWeight: 900 }}><CountUp value={userTonyx} /></div>
          </div>
        </div>
      </div>

      <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#c084fc", marginBottom: 10 }}>🎒 Инвентарь NFT</div>
        {invLoading ? <div style={{ color: "#64748b", fontSize: 12 }}>Загрузка…</div>
          : invItems.length === 0 ? <div style={{ color: "#64748b", fontSize: 12 }}>Пока пусто. Собери пазл или выиграй NFT из кейса.</div>
          : invItems.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(30,45,69,0.55)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, border: "1px solid rgba(168,85,247,0.2)" }}>
              {isTgGiftItem(it) ? (
                <TgGiftMini item={it} size={44} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#7c3aed55,#a855f755)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎁"}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{it.nameRu}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {isTgGiftItem(it)
                    ? [it.model, it.backdrop, it.symbol].filter(Boolean).join(" · ")
                    : `≈ ${it.valueTon} TON`}
                </div>
              </div>
              <button type="button" disabled={sellingId === it.id} onClick={() => { haptic("light"); void sellItem(it.id); }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: sellingId === it.id ? 0.6 : 1 }}>
                {sellingId === it.id ? "…" : "Продать"}
              </button>
            </div>
          ))}
        {invCollections.some((c) => c.owned > 0) && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {invCollections.filter((c) => c.owned > 0).map((c) => (
              <div key={c.id} style={{ fontSize: 11, color: c.canClaim ? "#4ade80" : "#c4b5fd", background: "rgba(124,58,237,0.15)", borderRadius: 8, padding: "4px 8px" }}>
                {c.nameRu} {c.owned}/9
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginTop: 8 }}>
        Полный профиль (кошелёк, вывод, история) — открой вкладку после деплоя полного файла.
      </div>
    </div>
  );
}
