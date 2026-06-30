import { useState, useEffect } from "react";

export interface FairData {
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  hash: string | null;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function truncate(s: string, n = 16) {
  return s.length <= n ? s : s.slice(0, n / 2) + "…" + s.slice(-n / 2);
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#4ade80" : "#475569", fontSize: 13, padding: "0 4px", fontFamily: "inherit" }}
    >{copied ? "✓" : "⎘"}</button>
  );
}

interface Props {
  fair: FairData;
  status: "waiting" | "starting" | "finished";
  gameType: "arena" | "spin";
  gameId: number;
  onClose: () => void;
  onClientSeedChanged?: (seed: string) => void;
}

export default function FairnessModal({ fair, status, gameType, gameId, onClose, onClientSeedChanged }: Props) {
  const [localSeed, setLocalSeed] = useState(fair.clientSeed);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; computed: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const canEdit = status === "waiting";
  const isFinished = status === "finished";

  async function saveSeed() {
    if (!canEdit || localSeed.trim() === fair.clientSeed) return;
    setSaving(true);
    try {
      const endpoint = gameType === "arena"
        ? "/api/mini/games/arena/client-seed"
        : "/api/mini/games/spin/client-seed";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSeed: localSeed.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setSaveMsg("✅ Сохранено");
        onClientSeedChanged?.(d.clientSeed);
      } else {
        setSaveMsg("❌ Ошибка");
      }
    } catch {
      setSaveMsg("❌ Ошибка сети");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  async function verify() {
    if (!fair.serverSeed) return;
    setVerifying(true);
    try {
      const computed = await sha256(`${fair.serverSeed}${fair.clientSeed}${fair.nonce}`);
      setVerifyResult({ ok: computed === fair.hash, computed });
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => { setLocalSeed(fair.clientSeed); }, [fair.clientSeed]);

  const rowStyle: React.CSSProperties = {
    background: "rgba(15,23,42,0.8)",
    border: "1px solid rgba(30,58,143,0.3)",
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 8,
  };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 };
  const valueStyle: React.CSSProperties = { fontSize: 12, color: "#94a3b8", fontFamily: "monospace", wordBreak: "break-all", display: "flex", alignItems: "center", gap: 4 };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 10000, display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d1117",
          border: "1px solid rgba(30,58,143,0.4)",
          borderRadius: "20px 20px 0 0",
          padding: "20px 16px 32px",
          width: "100%", maxWidth: 480,
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>🔐 Проверка честности</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              {gameType === "arena" ? "PvP Арена" : "PvP Барабан"} · Раунд #{gameId}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 20, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {!isFinished && (
          <div style={{ background: "rgba(30,58,143,0.1)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 11, color: "#60a5fa" }}>
            ℹ️ До окончания игры serverSeed скрыт. После — раскроется для проверки.
          </div>
        )}

        {/* Server Seed Hash */}
        <div style={rowStyle}>
          <div style={labelStyle}>SERVER SEED HASH (SHA-256 от serverSeed)</div>
          <div style={valueStyle}>
            <span style={{ flex: 1 }}>{fair.serverSeedHash ? truncate(fair.serverSeedHash, 32) : "—"}</span>
            {fair.serverSeedHash && <CopyBtn text={fair.serverSeedHash} />}
          </div>
        </div>

        {/* Server Seed (revealed) */}
        {isFinished && (
          <div style={{ ...rowStyle, borderColor: "rgba(74,222,128,0.3)" }}>
            <div style={{ ...labelStyle, color: "#4ade80" }}>SERVER SEED (раскрыт после игры)</div>
            <div style={valueStyle}>
              <span style={{ flex: 1 }}>{fair.serverSeed ? truncate(fair.serverSeed, 32) : "—"}</span>
              {fair.serverSeed && <CopyBtn text={fair.serverSeed} />}
            </div>
          </div>
        )}

        {/* Client Seed */}
        <div style={rowStyle}>
          <div style={labelStyle}>CLIENT SEED {canEdit ? "(можно изменить)" : ""}</div>
          {canEdit ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={localSeed}
                onChange={e => setLocalSeed(e.target.value.slice(0, 64))}
                style={{
                  flex: 1, background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.5)",
                  borderRadius: 8, padding: "7px 10px", color: "#f1f5f9", fontFamily: "monospace",
                  fontSize: 12, outline: "none",
                }}
              />
              <button
                onClick={saveSeed}
                disabled={saving || localSeed.trim() === fair.clientSeed}
                style={{
                  background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                  border: "none", borderRadius: 8, padding: "8px 12px",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  opacity: (saving || localSeed.trim() === fair.clientSeed) ? 0.5 : 1,
                }}
              >{saving ? "…" : "Сохранить"}</button>
            </div>
          ) : (
            <div style={valueStyle}>
              <span style={{ flex: 1 }}>{fair.clientSeed}</span>
              <CopyBtn text={fair.clientSeed} />
            </div>
          )}
          {saveMsg && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 6 }}>{saveMsg}</div>}
        </div>

        {/* Nonce */}
        <div style={rowStyle}>
          <div style={labelStyle}>NONCE</div>
          <div style={valueStyle}>{fair.nonce}</div>
        </div>

        {/* Fairness Hash */}
        {isFinished && (
          <div style={{ ...rowStyle, borderColor: "rgba(245,158,11,0.35)" }}>
            <div style={{ ...labelStyle, color: "#f59e0b" }}>ИТОГОВЫЙ HASH (SHA-256)</div>
            <div style={{ ...labelStyle, color: "#475569", fontWeight: 400, marginBottom: 6 }}>
              SHA-256(serverSeed + clientSeed + nonce)
            </div>
            <div style={valueStyle}>
              <span style={{ flex: 1 }}>{fair.hash ? truncate(fair.hash, 32) : "—"}</span>
              {fair.hash && <CopyBtn text={fair.hash} />}
            </div>
          </div>
        )}

        {/* Verify section */}
        {isFinished && fair.serverSeed && fair.hash && (
          <div style={{ marginTop: 4 }}>
            <button
              onClick={verify}
              disabled={verifying}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#064e3b,#065f46)",
                color: "#4ade80", fontSize: 14, fontWeight: 800, cursor: "pointer",
                fontFamily: "inherit", marginBottom: 8,
              }}
            >{verifying ? "Проверяем…" : "🔎 Проверить честность"}</button>

            {verifyResult && (
              <div style={{
                background: verifyResult.ok ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
                border: `1px solid ${verifyResult.ok ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: verifyResult.ok ? "#4ade80" : "#f87171", marginBottom: 6 }}>
                  {verifyResult.ok ? "✅ Проверка пройдена — всё честно!" : "❌ Хэши не совпадают!"}
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>Вычисленный hash:</div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", wordBreak: "break-all" }}>
                  {verifyResult.computed}
                </div>
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 11, color: "#334155", cursor: "pointer", userSelect: "none" }}>
            Как это работает?
          </summary>
          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6, marginTop: 8 }}>
            <p style={{ margin: "0 0 6px" }}>1. <b style={{ color: "#60a5fa" }}>До игры</b> сервер показывает только SHA-256 от своего seed (serverSeedHash). Это гарантирует, что результат предопределён.</p>
            <p style={{ margin: "0 0 6px" }}>2. <b style={{ color: "#60a5fa" }}>Ты можешь изменить</b> свой clientSeed до начала игры.</p>
            <p style={{ margin: "0 0 6px" }}>3. <b style={{ color: "#60a5fa" }}>Итоговый hash</b> = SHA-256(serverSeed + clientSeed + nonce). Он определяет победителя.</p>
            <p style={{ margin: 0 }}>4. <b style={{ color: "#60a5fa" }}>После игры</b> serverSeed раскрывается, и ты можешь сам проверить, что результат не был изменён.</p>
          </div>
        </details>
      </div>
    </div>
  );
}
