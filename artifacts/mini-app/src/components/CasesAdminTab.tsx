import { useCallback, useEffect, useState } from "react";

type RewardType = "ton" | "tonyx" | "nft_fragment" | "nft_full";

type CaseReward = {
  id: string;
  type: RewardType;
  weight: number;
  minAmount?: number;
  maxAmount?: number;
  nftId?: string;
  pieceIndex?: number;
  labelRu?: string;
  imageUrl?: string | null;
};

type CaseRow = {
  id: string;
  nameRu: string;
  nameEn: string;
  costType: string;
  costValue: number;
  imageUrl: string | null;
  enabled: boolean;
  rewards: CaseReward[];
  sortOrder: number;
};

type NftOpt = {
  id: string;
  nameRu: string;
  valueTon: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function CasesAdminTab({ adminId }: { adminId: string }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [nftCatalog, setNftCatalog] = useState<NftOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/cases?adminId=${encodeURIComponent(adminId)}`, {
        headers: { "X-Admin-Id": adminId },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setCases(d.cases ?? []);
      setNftCatalog(d.nftCatalog ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    load();
  }, [load]);

  const editing = cases.find((c) => c.id === editId) ?? null;

  async function saveCase(row: CaseRow) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/mini/admin/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": adminId,
        },
        body: JSON.stringify({ adminId, ...row }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setMsg("Сохранено");
      setEditId(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  function updateEditing(patch: Partial<CaseRow>) {
    if (!editId) return;
    setCases((prev) => prev.map((c) => (c.id === editId ? { ...c, ...patch } : c)));
  }

  function updateReward(ri: number, patch: Partial<CaseReward>) {
    if (!editing) return;
    const rewards = editing.rewards.map((r, i) => (i === ri ? { ...r, ...patch } : r));
    updateEditing({ rewards });
  }

  function addReward() {
    if (!editing) return;
    updateEditing({
      rewards: [
        ...editing.rewards,
        { id: uid(), type: "ton", weight: 10, minAmount: 0.01, maxAmount: 0.05 },
      ],
    });
  }

  function removeReward(ri: number) {
    if (!editing) return;
    updateEditing({ rewards: editing.rewards.filter((_, i) => i !== ri) });
  }

  if (loading) {
    return <div style={{ color: "#64748b", padding: 16 }}>Загрузка кейсов…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {msg && (
        <div style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", padding: "8px 12px", borderRadius: 10, fontSize: 12 }}>
          {msg}
        </div>
      )}

      {!editing && (
        <>
          {cases.map((c) => (
            <div
              key={c.id}
              style={{
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(30,58,143,0.3)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 14 }}>{c.nameRu}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {c.id} · {c.costType}={c.costValue} · наград: {c.rewards?.length ?? 0} ·{" "}
                    {c.enabled ? "✅ вкл" : "⏸ выкл"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditId(c.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Изменить
                </button>
              </div>
            </div>
          ))}
          {cases.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13 }}>Кейсов нет. Открой админ API — сид создастся сам.</div>
          )}
        </>
      )}

      {editing && (
        <div
          style={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(168,85,247,0.35)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 800, color: "#c084fc", marginBottom: 12 }}>✏️ {editing.nameRu}</div>

          <label style={lab}>Название (RU)</label>
          <input
            value={editing.nameRu}
            onChange={(e) => updateEditing({ nameRu: e.target.value })}
            style={inp}
          />

          <label style={lab}>Название (EN)</label>
          <input
            value={editing.nameEn}
            onChange={(e) => updateEditing({ nameEn: e.target.value })}
            style={inp}
          />

          <label style={lab}>Картинка (URL)</label>
          <input
            value={editing.imageUrl ?? ""}
            onChange={(e) => updateEditing({ imageUrl: e.target.value || null })}
            placeholder="https://..."
            style={inp}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={lab}>Тип оплаты</label>
              <select
                value={editing.costType}
                onChange={(e) => updateEditing({ costType: e.target.value })}
                style={inp}
              >
                <option value="key">Ключ босса</option>
                <option value="ton">TON</option>
                <option value="tonyx">TONYX</option>
              </select>
            </div>
            <div>
              <label style={lab}>Цена / уровень ключа</label>
              <input
                type="number"
                value={editing.costValue}
                onChange={(e) => updateEditing({ costValue: Number(e.target.value) })}
                style={inp}
              />
            </div>
          </div>

          <label style={{ ...lab, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={editing.enabled}
              onChange={(e) => updateEditing({ enabled: e.target.checked })}
            />
            Включён
          </label>

          <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 800, color: "#94a3b8", fontSize: 12 }}>
            НАГРАДЫ (вес = шанс)
          </div>

          {editing.rewards.map((r, ri) => (
            <div
              key={r.id}
              style={{
                background: "rgba(30,45,69,0.5)",
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
                border: "1px solid rgba(30,58,143,0.3)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <label style={lab}>Тип</label>
                  <select
                    value={r.type}
                    onChange={(e) => updateReward(ri, { type: e.target.value as RewardType })}
                    style={inp}
                  >
                    <option value="ton">TON (диапазон)</option>
                    <option value="tonyx">TONYX (диапазон)</option>
                    <option value="nft_fragment">Кусок NFT</option>
                    <option value="nft_full">Целый NFT</option>
                  </select>
                </div>
                <div>
                  <label style={lab}>Вес %</label>
                  <input
                    type="number"
                    value={r.weight}
                    onChange={(e) => updateReward(ri, { weight: Number(e.target.value) })}
                    style={inp}
                  />
                </div>
              </div>

              {(r.type === "ton" || r.type === "tonyx") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                  <div>
                    <label style={lab}>Мин</label>
                    <input
                      type="number"
                      step="any"
                      value={r.minAmount ?? 0}
                      onChange={(e) => updateReward(ri, { minAmount: Number(e.target.value) })}
                      style={inp}
                    />
                  </div>
                  <div>
                    <label style={lab}>Макс</label>
                    <input
                      type="number"
                      step="any"
                      value={r.maxAmount ?? 0}
                      onChange={(e) => updateReward(ri, { maxAmount: Number(e.target.value) })}
                      style={inp}
                    />
                  </div>
                </div>
              )}

              {(r.type === "nft_fragment" || r.type === "nft_full") && (
                <div style={{ marginTop: 6 }}>
                  <label style={lab}>NFT из каталога</label>
                  <select
                    value={r.nftId ?? ""}
                    onChange={(e) => updateReward(ri, { nftId: e.target.value })}
                    style={inp}
                  >
                    <option value="">— выбери —</option>
                    {nftCatalog.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nameRu} (≈{n.valueTon} TON)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => removeReward(ri)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: "1px solid rgba(248,113,113,0.4)",
                  color: "#f87171",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Удалить награду
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addReward}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px dashed rgba(168,85,247,0.5)",
              background: "rgba(124,58,237,0.12)",
              color: "#c4b5fd",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Добавить награду
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveCase(editing)}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg,#16a34a,#22c55e)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {saving ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => setEditId(null)}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: "1px solid rgba(100,116,139,0.4)",
                background: "transparent",
                color: "#94a3b8",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const lab: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "#64748b",
  fontWeight: 700,
  marginBottom: 4,
  marginTop: 8,
};

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(30,45,69,0.7)",
  border: "1px solid rgba(30,58,143,0.4)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#f1f5f9",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};
