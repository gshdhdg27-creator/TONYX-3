import { useCallback, useEffect, useState, type CSSProperties } from "react";

type MarketCfg = {
  enabled: boolean;
  buyEnabled: boolean;
  feePercent: number;
};

type Listing = {
  id: number;
  sellerId: string;
  nftId: string;
  giftName?: string;
  model?: string | null;
  backdrop?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  priceTon: number;
  listedAt?: string;
};

function getAdminId(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("adminId") ||
    new URLSearchParams(window.location.search).get("adminId") ||
    ""
  );
}

function adminHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const adminId = getAdminId();
  if (adminId) h["X-Admin-Id"] = adminId;
  try {
    const initData = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData;
    if (initData) h["x-telegram-init-data"] = initData;
  } catch { /* */ }
  return h;
}

function adminQs(): string {
  const adminId = getAdminId();
  return adminId ? `?adminId=${encodeURIComponent(adminId)}` : "";
}

export function NftMarketAdminTab() {
  const [cfg, setCfg] = useState<MarketCfg>({ enabled: true, buyEnabled: false, feePercent: 1 });
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);

  const flash = (text: string, err = false) => {
    setMsg(text);
    setMsgErr(err);
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, listRes] = await Promise.all([
        fetch(`/api/mini/admin/settings/nft-market${adminQs()}`, { headers: adminHeaders() }),
        fetch(`/api/mini/admin/nft-market/listings${adminQs()}`, { headers: adminHeaders() }),
      ]);

      if (cfgRes.ok) {
        const d = await cfgRes.json();
        setCfg({
          enabled: d.enabled !== false,
          buyEnabled: Boolean(d.buyEnabled),
          feePercent: Number(d.feePercent) || 1,
        });
      } else {
        const err = await cfgRes.json().catch(() => ({}));
        flash((err as { error?: string }).error || `\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438: HTTP ${cfgRes.status}`, true);
      }

      if (listRes.ok) {
        const d = await listRes.json();
        setListings(Array.isArray(d.listings) ? d.listings : []);
      } else if (listRes.status === 401) {
        flash("\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u043b\u043e\u0442\u0430\u043c (401). \u041e\u0442\u043a\u0440\u043e\u0439 \u0430\u0434\u043c\u0438\u043d\u043a\u0443 \u0438\u0437 Telegram.", true);
      } else {
        const err = await listRes.json().catch(() => ({}));
        flash((err as { error?: string }).error || `\u041b\u043e\u0442\u044b: HTTP ${listRes.status}`, true);
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCfg = async (patch: Partial<MarketCfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setBusy(true);
    try {
      const r = await fetch(`/api/mini/admin/settings/nft-market${adminQs()}`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(next),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
      setCfg({
        enabled: (d as MarketCfg).enabled !== false,
        buyEnabled: Boolean((d as MarketCfg).buyEnabled),
        feePercent: Number((d as MarketCfg).feePercent) || next.feePercent,
      });
      flash("\u2705 \u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435");
      // notify market page listeners
      try {
        window.dispatchEvent(new Event("tonyx-nft-cfg"));
      } catch { /* */ }
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const unlistOne = async (id: number) => {
    if (!confirm(`\u0421\u043d\u044f\u0442\u044c \u043b\u043e\u0442 #${id} \u0441 \u043f\u0440\u043e\u0434\u0430\u0436\u0438?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mini/admin/nft-market/unlist${adminQs()}`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ inventoryId: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
      flash("\u0421\u043d\u044f\u0442\u043e \u0441 \u043f\u0440\u043e\u0434\u0430\u0436\u0438");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = async (id: number) => {
    if (!confirm(`\u0423\u0414\u0410\u041b\u0418\u0422\u042c \u043b\u043e\u0442 #${id} \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mini/admin/nft-market/listing/${id}${adminQs()}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
      flash("\u0423\u0434\u0430\u043b\u0435\u043d\u043e");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const hideAll = async () => {
    if (!confirm(`\u0421\u043d\u044f\u0442\u044c \u0412\u0421\u0415 \u043b\u043e\u0442\u044b \u0441 \u043f\u0440\u043e\u0434\u0430\u0436\u0438 (${listings.length})?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mini/admin/nft-market/unlist-all${adminQs()}`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
      flash((d as { message?: string }).message || "\u0412\u0441\u0435 \u0441\u043d\u044f\u0442\u044b");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ paddingBottom: 40, color: "#e2e8f0" }}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>NFT Market \u00b7 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
          \u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0412\u043a\u043b\u044e\u0447\u0438 \u00ab\u041f\u043e\u043a\u0443\u043f\u043a\u0430\u00bb \u2014 \u0438\u043d\u0430\u0447\u0435 \u0438\u0433\u0440\u043e\u043a\u0438 \u043d\u0435 \u0441\u043c\u043e\u0433\u0443\u0442 \u043a\u0443\u043f\u0438\u0442\u044c.
        </div>

        <Toggle
          label="\u041c\u0430\u0440\u043a\u0435\u0442 \u0432\u043a\u043b\u044e\u0447\u0451\u043d"
          hint={cfg.enabled ? "\u0412\u0438\u0442\u0440\u0438\u043d\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0430" : "\u0418\u0433\u0440\u043e\u043a\u0438 \u0432\u0438\u0434\u044f\u0442 \u043f\u0443\u0441\u0442\u043e\u0439 \u043c\u0430\u0440\u043a\u0435\u0442"}
          on={cfg.enabled}
          disabled={busy}
          onChange={(v) => void saveCfg({ enabled: v, ...(v ? { buyEnabled: true } : {}) })}
        />
        <Toggle
          label="\u041f\u043e\u043a\u0443\u043f\u043a\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430"
          hint={cfg.buyEnabled ? "\u041a\u043d\u043e\u043f\u043a\u0430 \u00ab\u041a\u0443\u043f\u0438\u0442\u044c\u00bb \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442" : "\u0422\u043e\u043b\u044c\u043a\u043e \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u2014 \u043f\u043e\u043a\u0443\u043f\u043a\u0430 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u0430"}
          on={cfg.buyEnabled}
          disabled={busy}
          onChange={(v) => void saveCfg({ buyEnabled: v })}
        />

        <div style={{ marginTop: 12 }}>
          <label style={label}>\u041a\u043e\u043c\u0438\u0441\u0441\u0438\u044f %</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={cfg.feePercent}
              onChange={(e) => setCfg({ ...cfg, feePercent: Number(e.target.value) || 0 })}
              style={input}
            />
            <button type="button" disabled={busy} onClick={() => void saveCfg({ feePercent: cfg.feePercent })} style={btnPrimary}>
              OK
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => void load()} style={btnGhost}>
            \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c
          </button>
          <button type="button" disabled={busy || !listings.length} onClick={() => void hideAll()} style={btnDanger}>
            \u0421\u043a\u0440\u044b\u0442\u044c \u0432\u0441\u0435 \u043b\u043e\u0442\u044b
          </button>
        </div>
      </div>

      {msg && (
        <div
          style={{
            margin: "10px 0",
            padding: 10,
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            background: msgErr ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            color: msgErr ? "#fca5a5" : "#86efac",
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
          \u041b\u043e\u0442\u044b \u043d\u0430 \u043f\u0440\u043e\u0434\u0430\u0436\u0435 ({loading ? "\u2026" : listings.length})
        </div>
        {loading && <div style={{ color: "#64748b", fontSize: 13 }}>\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</div>}
        {!loading && !listings.length && (
          <div style={{ color: "#64748b", fontSize: 13, padding: 12 }}>
            \u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043b\u043e\u0442\u043e\u0432 (listed \u0432 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u0435)
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {listings.map((L) => (
            <div key={L.id} style={lotRow}>
              {L.imageUrl ? (
                <img src={L.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(255,255,255,0.06)" }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{L.giftName || L.nftId}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {[L.model, L.backdrop, L.symbol].filter(Boolean).join(" \u00b7 ") || L.nftId}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  #{L.id} \u00b7 seller {L.sellerId} \u00b7{" "}
                  <b style={{ color: "#7dd3fc" }}>{L.priceTon} TON</b>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" disabled={busy} onClick={() => void unlistOne(L.id)} style={btnSmall}>
                  \u0421\u043a\u0440\u044b\u0442\u044c
                </button>
                <button type="button" disabled={busy} onClick={() => void deleteOne(L.id)} style={{ ...btnSmall, color: "#fca5a5" }}>
                  \u0423\u0434\u0430\u043b\u0438\u0442\u044c
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label, hint, on, onChange, disabled,
}: {
  label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", border: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "transparent",
        cursor: disabled ? "wait" : "pointer",
        textAlign: "left", fontFamily: "inherit", color: "inherit",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{hint}</div>
      </div>
      <div style={{
        width: 46, height: 26, borderRadius: 13,
        background: on ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.1)",
        border: on ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(255,255,255,0.12)",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 2, left: on ? 22 : 2,
          width: 20, height: 20, borderRadius: 10,
          background: on ? "#22c55e" : "#94a3b8",
          transition: "left 0.15s",
        }} />
      </div>
    </button>
  );
}

const card: CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 14,
};
const label: CSSProperties = { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 6 };
const input: CSSProperties = {
  flex: 1, padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)",
  color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
};
const btnPrimary: CSSProperties = {
  padding: "10px 14px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#0369a1,#38bdf8)", color: "#fff",
  fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const btnGhost: CSSProperties = {
  padding: "10px 14px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const btnDanger: CSSProperties = {
  ...btnGhost, border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5",
};
const btnSmall: CSSProperties = {
  padding: "6px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)",
  color: "#e2e8f0", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const lotRow: CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", padding: 10, borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)",
};
