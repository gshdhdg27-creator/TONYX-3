import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast,
  type Currency, type Action, type UserInfo,
} from "./admin-shared";

const NFT_OPTIONS = [
  { id: "hypno_lollipop", name: "Hypno Lollipop" },
  { id: "liberty_figure", name: "Liberty Figure" },
  { id: "bday_candle", name: "B-Day Candle" },
  { id: "moon_pendant", name: "Moon Pendant" },
  { id: "telegram_premium", name: "Input Key" },
  { id: "snoop_cigar", name: "Snoop Cigar" },
  { id: "royal_dogg", name: "Royal Dogg" },
  { id: "electric_skull", name: "Electric Skull" },
  { id: "neko_helmet", name: "Neko Helmet" },
  { id: "heroic_helmet", name: "Heroic Helmet" },
];

export function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
  const { toast, flash } = useToast();
  const [currency, setCurrency] = useState<Currency>("ton");
  const [action, setAction] = useState<Action>("add");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const num = parseFloat(amount);
    if (action !== "set" && (!num || num <= 0)) { flash("Сумма > 0", "error"); return; }
    if (action === "set" && (!Number.isFinite(num) || num < 0)) { flash("Сумма >= 0", "error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/adjust-balance`, { adminId, method: "POST", body: JSON.stringify({ currency, amount: num, action }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(`✅ ${action === "set" ? "Set" : action === "add" ? "+" : "−"} ${num} ${currency}`, "success"); setAmount(""); onDone(); }
    } catch { flash("Ошибка сети", "error"); } finally { setLoading(false); }
  };
  return (
    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: 14, marginTop: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 10 }}>БАЛАНС</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {([{ k: "ton" as Currency, l: "TON", c: "#fbbf24" }, { k: "tonyx" as Currency, l: "TONYX", c: "#a78bfa" }, { k: "coins" as Currency, l: "Pts", c: "#34d399" }]).map(({ k, l, c }) => (
          <button key={k} type="button" onClick={() => setCurrency(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${currency === k ? c : c + "30"}`, background: currency === k ? c + "20" : "transparent", color: currency === k ? c : "#475569", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: 3 }}>
        {(["add", "deduct", "set"] as Action[]).map((a) => (
          <button key={a} type="button" onClick={() => setAction(a)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: action === a ? "rgba(255,255,255,0.1)" : "transparent",
            fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer",
            color: action === a ? (a === "add" ? "#4ade80" : a === "deduct" ? "#f87171" : "#60a5fa") : "#64748b",
          }}>{a === "add" ? "+" : a === "deduct" ? "−" : "Set"}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Сумма" style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
        <button type="button" onClick={() => void submit()} disabled={loading} style={{ padding: "10px 16px", borderRadius: 8, border: "none", fontFamily: "inherit", fontWeight: 800, cursor: "pointer", color: "#fff",
          background: action === "add" ? "linear-gradient(135deg,#15803d,#22c55e)" : action === "deduct" ? "linear-gradient(135deg,#b91c1c,#ef4444)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}>{loading ? "…" : "OK"}</button>
      </div>
    </div>
  );
}

type InvItem = { id: number; itemType: string; itemId: string; name: string; listed?: boolean; priceTon?: number | null };
type CollectionProg = { id: string; nameRu: string; pieces: number[]; owned: number; total: number; claimed: number };
type KeyRow = { bossLevel: number; keysCount: number };

function UserAssetsPanel({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
  const { toast, flash } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [collections, setCollections] = useState<CollectionProg[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [nftId, setNftId] = useState(NFT_OPTIONS[0].id);
  const [fragId, setFragId] = useState(NFT_OPTIONS[0].id);
  const [keyLevel, setKeyLevel] = useState(1);
  const [keyAmount, setKeyAmount] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/assets`, { adminId });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка загрузки", "error"); return; }
      setInventory(d.inventory ?? []);
      setCollections(d.collections ?? []);
      setKeys(d.keys ?? []);
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  }, [userId, adminId, flash]);

  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body: object) => {
    setBusy(true);
    try {
      const r = await apiCall(`users/${userId}/${path}`, { adminId, method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅", "success"); await load(); onDone(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  const box: React.CSSProperties = { background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: 14, marginTop: 10 };
  const label: React.CSSProperties = { fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 10 };
  const selectStyle: React.CSSProperties = { width: "100%", background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, marginBottom: 8 };
  const btn = (bg: string): React.CSSProperties => ({ width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", background: bg, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 });

  const col = collections.find((c) => c.id === fragId);
  const pieces = col?.pieces ?? Array(9).fill(0);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {loading && <div style={{ color: "#64748b", fontSize: 12, padding: 8 }}>Загрузка активов…</div>}

      <div style={box}>
        <div style={label}>ИНВЕНТАРЬ ({inventory.length})</div>
        {inventory.length === 0 && <div style={{ color: "#64748b", fontSize: 12 }}>Пусто</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {inventory.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>#{it.id} · {it.itemId}{it.listed ? ` · listed ${it.priceTon ?? ""} TON` : ""}</div>
              </div>
              <button type="button" disabled={busy} onClick={() => {
                  if (pendingDelete !== it.id) {
                    setPendingDelete(it.id);
                    setTimeout(() => setPendingDelete((cur) => (cur === it.id ? null : cur)), 3000);
                    flash("Нажми ещё раз чтобы удалить", "error");
                    return;
                  }
                  setPendingDelete(null);
                  void act("remove-item", { inventoryId: it.id });
                }}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${pendingDelete === it.id ? "rgba(239,68,68,0.8)" : "rgba(239,68,68,0.4)"}`, background: pendingDelete === it.id ? "rgba(220,38,38,0.35)" : "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {pendingDelete === it.id ? "Точно?" : "Удалить"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Добавить NFT из каталога</div>
          <select value={nftId} onChange={(e) => setNftId(e.target.value)} style={selectStyle}>
            {NFT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" disabled={busy} style={btn("linear-gradient(135deg,#15803d,#22c55e)")} onClick={() => void act("inventory/add", { itemId: nftId })}>+ Добавить NFT</button>
        </div>
      </div>

      <div style={box}>
        <div style={label}>ФРАГМЕНТЫ КОЛЛЕКЦИЙ</div>
        <select value={fragId} onChange={(e) => setFragId(e.target.value)} style={selectStyle}>
          {(collections.length ? collections : NFT_OPTIONS.map((o) => ({ id: o.id, nameRu: o.name, owned: 0 }))).map((c: { id: string; nameRu: string; owned?: number }) => (
            <option key={c.id} value={c.id}>{c.nameRu}{c.owned != null ? ` · ${c.owned}/9` : ""}</option>
          ))}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
          {pieces.map((p, i) => (
            <button key={i} type="button" disabled={busy} onClick={() => void act("fragments", { nftId: fragId, pieceIndex: i })}
              style={{ padding: "10px 0", borderRadius: 8, border: `1px solid ${p ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`, background: p ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)", color: p ? "#86efac" : "#64748b", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{i + 1}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={busy} style={{ ...btn("linear-gradient(135deg,#1d4ed8,#3b82f6)"), flex: 1 }} onClick={() => void act("fragments", { nftId: fragId, fill: true })}>Собрать все 9</button>
          <button type="button" disabled={busy} style={{ ...btn("linear-gradient(135deg,#b91c1c,#ef4444)"), flex: 1 }} onClick={() => void act("fragments", { nftId: fragId, clear: true })}>Очистить</button>
        </div>
      </div>

      <div style={box}>
        <div style={label}>КЛЮЧИ БОССОВ</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
          {(keys.length ? keys : [1,2,3,4,5].map((l) => ({ bossLevel: l, keysCount: 0 }))).map((k) => (
            <button key={k.bossLevel} type="button" onClick={() => setKeyLevel(k.bossLevel)}
              style={{ padding: "8px 0", borderRadius: 8, border: `1px solid ${keyLevel === k.bossLevel ? "rgba(251,191,36,0.6)" : "rgba(255,255,255,0.1)"}`, background: keyLevel === k.bossLevel ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", color: keyLevel === k.bossLevel ? "#fbbf24" : "#94a3b8", fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              L{k.bossLevel}<div style={{ fontSize: 10, opacity: 0.8 }}>{k.keysCount}</div>
            </button>
          ))}
        </div>
        <input value={keyAmount} onChange={(e) => setKeyAmount(e.target.value)} inputMode="numeric" placeholder="Кол-во" style={{ width: "100%", boxSizing: "border-box", background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={busy} style={{ ...btn("linear-gradient(135deg,#15803d,#22c55e)"), flex: 1 }} onClick={() => void act("keys", { bossLevel: keyLevel, action: "add", keysCount: Number(keyAmount) || 0 })}>+ Добавить</button>
          <button type="button" disabled={busy} style={{ ...btn("linear-gradient(135deg,#1d4ed8,#3b82f6)"), flex: 1 }} onClick={() => void act("keys", { bossLevel: keyLevel, action: "set", keysCount: Number(keyAmount) || 0 })}>Set</button>
          <button type="button" disabled={busy} style={{ ...btn("linear-gradient(135deg,#b91c1c,#ef4444)"), flex: 1 }} onClick={() => void act("keys", { bossLevel: keyLevel, action: "deduct", keysCount: Number(keyAmount) || 0 })}>−</button>
        </div>
      </div>
    </div>
  );
}

export function UserCard({ user, adminId, isSuperAdmin, onRefresh }: { user: UserInfo; adminId: string; isSuperAdmin?: boolean; onRefresh: () => void }) {
  const { toast, flash } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const isOwner = user.telegramId === OWNER_ID;
  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${user.telegramId}/${action}`, { adminId, method: "POST", body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅", "success"); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: isOwner ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff" }}>{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{name}{isOwner ? " 👑" : ""}{user.isAdmin ? " ⭐" : ""}{user.isBlocked ? " 🚫" : ""}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>ID {user.telegramId}</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>{Number(user.ton).toFixed(3)} TON</span>
            <span style={{ color: "#a78bfa", fontWeight: 700, marginLeft: 10 }}>{user.tonyxCoins} TONYX</span>
          </div>
        </div>
        <div style={{ color: "#64748b" }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />
          <UserAssetsPanel userId={user.telegramId} adminId={adminId} onDone={onRefresh} />
          {!isOwner && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {user.isBlocked || user.userStatus === "banned" ? (
                <button type="button" disabled={loading} onClick={() => post("unban")} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.1)", color: "#86efac", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Разбанить</button>
              ) : (
                <button type="button" disabled={loading} onClick={() => post("ban", { reason: "banned by admin" })} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Бан</button>
              )}
              {isSuperAdmin && (
                <button type="button" disabled={loading} onClick={() => { if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; } post("delete-data"); setConfirmDelete(false); }}
                  style={{ padding: 11, borderRadius: 10, border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.7)" : "rgba(239,68,68,0.25)"}`, background: confirmDelete ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.06)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {confirmDelete ? "⚠️ ЕЩЁ РАЗ" : "🗑️ Удалить данные"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
