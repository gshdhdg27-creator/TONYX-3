import { useEffect, useState } from "react";
import { casesApi, type CaseListItem } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";

type Lang = "ru" | "en";

function costLabel(c: CaseListItem, lang: Lang): string {
  if (c.costType === "key") {
    return lang === "en"
      ? `Key Lv.${c.costValue} · have ${c.have}`
      : `Ключ ур.${c.costValue} · есть ${c.have}`;
  }
  if (c.costType === "ton") return `${c.costValue} TON`;
  return `${c.costValue} TONYX`;
}

export default function CasesGame({
  lang,
  onBalanceChange,
}: {
  lang: Lang;
  onBalanceChange: () => void;
}) {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [bossKeys, setBossKeys] = useState<Record<number, number>>({});
  const [balances, setBalances] = useState({ ton: 0, tonyx: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await casesApi.list();
      setCases(data.cases ?? []);
      setBossKeys(data.bossKeys ?? {});
      setBalances(data.balances ?? { ton: 0, tonyx: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCase = async (c: CaseListItem) => {
    if (busyId || !c.canOpen) return;
    haptic("medium");
    setBusyId(c.id);
    setLastReward(null);
    try {
      const res = await casesApi.open(c.id);
      const r = res.rewards?.[0];
      let text = lang === "en" ? "Opened!" : "Открыто!";
      if (r?.type === "ton") text = `+${r.amount} TON`;
      else if (r?.type === "tonyx") text = `+${r.amount} TONYX`;
      else if (r?.type === "nft_fragment") text = `Fragment: ${r.nftId}`;
      setLastReward(text);
      setBalances(res.balances);
      setBossKeys(res.bossKeys ?? {});
      hapticNotify("success");
      onBalanceChange();
      await load();
    } catch (e) {
      hapticNotify("error");
      setError(e instanceof Error ? e.message : "Open failed");
    } finally {
      setBusyId(null);
    }
  };

  const bossCases = cases.filter((c) => c.costType === "key");
  const paidCases = cases.filter((c) => c.costType !== "key");

  return (
    <div
      style={{
        minHeight: "70vh",
        background: "#0B0F14",
        padding: "8px 16px 40px",
        color: "#E5E7EB",
      }}
    >
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={chipStyle}>{balances.ton.toFixed(3)} TON</div>
        <div style={chipStyle}>{balances.tonyx} TONYX</div>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
        {lang === "en" ? "Boss keys: " : "Ключи боссов: "}
        {[1, 2, 3, 4, 5].map((lv) => (
          <span key={lv} style={{ marginRight: 10 }}>
            Lv{lv}:{bossKeys[lv] ?? 0}
          </span>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 32, color: "#64748B" }}>
          {lang === "en" ? "Loading cases..." : "Загрузка кейсов..."}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "rgba(220,38,38,0.15)",
            border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
            color: "#FCA5A5",
            fontSize: 13,
          }}
        >
          {lang === "en" ? "Error: " : "Ошибка: "}
          {error}
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            style={{
              display: "block",
              marginTop: 10,
              background: "#1E293B",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#E2E8F0",
              padding: "8px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {lang === "en" ? "Retry" : "Повторить"}
          </button>
        </div>
      )}

      {lastReward && (
        <div
          style={{
            textAlign: "center",
            background: "rgba(22,163,74,0.15)",
            border: "1px solid rgba(74,222,128,0.35)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
            color: "#4ADE80",
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          {lastReward}
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div style={{ textAlign: "center", padding: 24, color: "#64748B" }}>
          {lang === "en" ? "No cases available" : "Кейсы не найдены"}
        </div>
      )}

      {bossCases.length > 0 && (
        <>
          <div style={sectionTitle}>
            {lang === "en" ? "BOSS CASES" : "КЕЙСЫ БОССОВ"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            {bossCases.map((c) => (
              <CaseButton key={c.id} c={c} lang={lang} busy={busyId === c.id} onOpen={openCase} />
            ))}
          </div>
        </>
      )}

      {paidCases.length > 0 && (
        <>
          <div style={sectionTitle}>
            {lang === "en" ? "PAID CASES" : "ПЛАТНЫЕ КЕЙСЫ"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paidCases.map((c) => (
              <CaseButton key={c.id} c={c} lang={lang} busy={busyId === c.id} onOpen={openCase} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CaseButton({
  c,
  lang,
  busy,
  onOpen,
}: {
  c: CaseListItem;
  lang: Lang;
  busy: boolean;
  onOpen: (c: CaseListItem) => void;
}) {
  return (
    <button
      onClick={() => onOpen(c)}
      disabled={!c.canOpen || busy}
      style={{
        textAlign: "left",
        background: "rgba(15,23,42,0.95)",
        border: `1px solid ${c.canOpen ? "rgba(168,85,247,0.45)" : "rgba(30,58,143,0.35)"}`,
        borderRadius: 16,
        padding: "14px 16px",
        color: "#E2E8F0",
        fontFamily: "inherit",
        cursor: c.canOpen ? "pointer" : "not-allowed",
        opacity: c.canOpen ? 1 : 0.55,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
        {lang === "en" ? c.nameEn : c.nameRu}
      </div>
      <div style={{ fontSize: 12, color: "#64748B" }}>{costLabel(c, lang)}</div>
      <div style={{ fontSize: 12, color: c.canOpen ? "#C084FC" : "#475569", marginTop: 6 }}>
        {busy
          ? lang === "en"
            ? "Opening..."
            : "Открываем..."
          : c.canOpen
            ? lang === "en"
              ? "Tap to open"
              : "Нажми, чтобы открыть"
            : c.costType === "key"
              ? lang === "en"
                ? "Need a key — beat this boss"
                : "Нужен ключ — победи этого босса"
              : lang === "en"
                ? "Not enough balance"
                : "Недостаточно средств"}
      </div>
    </button>
  );
}

const chipStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(30,58,143,0.35)",
  borderRadius: 14,
  padding: "10px 14px",
  fontSize: 13,
  color: "#94A3B8",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: 10,
  letterSpacing: "0.06em",
};
