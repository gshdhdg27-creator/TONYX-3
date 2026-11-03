import { useEffect, useState } from "react";

export default function CrashAdminPanel({ adminId }: { adminId: string }) {
  const [info, setInfo] = useState<any>(null);
  const [mult, setMult] = useState("2.00");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!adminId) return;
    try {
      const r = await fetch(`/api/mini/admin/settings/crash?adminId=${encodeURIComponent(adminId)}`, {
        headers: { "X-Admin-Id": adminId },
      });
      const d = await r.json();
      if (r.ok) setInfo(d);
    } catch { /* */ }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [adminId]);

  const api = async (path: string, body?: object) => {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`/api/mini/admin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Id": adminId },
        body: JSON.stringify({ adminId, ...(body || {}) }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Ошибка");
      else {
        setMsg(d.message || "OK");
        void load();
      }
    } catch {
      setMsg("Сеть");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        background: "rgba(15,23,42,0.9)",
        border: "1px solid rgba(74,222,128,0.25)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 900, color: "#4ade80", marginBottom: 8 }}>🚀 Crash — раунды</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
        Порядковые раунды #1, #2… · один коэффициент у всех игроков
      </div>
      {info && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Сейчас</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>#{info.roundId}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{info.phase}</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>След. коэф.</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#4ade80" }}>
              {info.nextCrashPreview != null ? Number(info.nextCrashPreview).toFixed(2) + "x" : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>#{info.nextRoundId}</div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>Задать коэффициент</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          type="number"
          min={1}
          max={100}
          step={0.01}
          style={{
            flex: 1,
            background: "rgba(30,45,69,0.7)",
            border: "1px solid rgba(30,58,143,0.4)",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#f1f5f9",
            fontFamily: "inherit",
            fontWeight: 800,
          }}
        />
        <button
          type="button"
          disabled={loading || !adminId}
          onClick={() => void api("settings/crash/force-next", { mult: Number(mult) })}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#15803d,#22c55e)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Применить
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[1.01, 1.5, 2, 3, 5, 10].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMult(String(v))}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#cbd5e1",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {v}x
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={loading || !adminId}
        onClick={() => {
          if (confirm("Сбросить раунды? Снова с #1")) void api("settings/crash/reset");
        }}
        style={{
          width: "100%",
          padding: "11px 0",
          borderRadius: 10,
          border: "1px solid rgba(248,113,113,0.4)",
          background: "rgba(185,28,28,0.25)",
          color: "#fca5a5",
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Сбросить раунды → #1
      </button>
      {msg && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#cbd5e1", textAlign: "center" }}>{msg}</div>
      )}
    </div>
  );
}
