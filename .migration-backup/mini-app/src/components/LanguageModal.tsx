import { useLang } from "@/lib/LanguageContext";
import type { Lang } from "@/lib/i18n";
import { haptic } from "@/lib/telegram";

export default function LanguageModal() {
  const { t, setLang, isChosen } = useLang();

  if (isChosen) return null;

  const choose = (l: Lang) => {
    haptic("medium");
    setLang(l);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(5,8,20,0.97)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 0,
      padding: "0 28px",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{
        fontSize: 52, marginBottom: 20,
        filter: "drop-shadow(0 0 24px rgba(96,165,250,0.5))",
      }}>🌐</div>

      <div style={{
        fontSize: 24, fontWeight: 800, color: "#f1f5f9",
        marginBottom: 8, textAlign: "center",
      }}>
        {t.langModal.title}
      </div>
      <div style={{
        fontSize: 13, color: "#64748b", marginBottom: 36,
        textAlign: "center", lineHeight: 1.5,
      }}>
        {t.langModal.subtitle}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
        <button
          onClick={() => choose("ru")}
          style={{
            padding: "18px 24px", borderRadius: 16, border: "1px solid rgba(96,165,250,0.3)",
            background: "linear-gradient(135deg, rgba(30,58,143,0.5), rgba(37,99,235,0.2))",
            color: "#f1f5f9", fontSize: 18, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer",
            boxShadow: "0 0 20px rgba(37,99,235,0.2)",
            transition: "all 0.2s",
            letterSpacing: "0.02em",
          }}
        >
          {t.langModal.ru}
        </button>

        <button
          onClick={() => choose("en")}
          style={{
            padding: "18px 24px", borderRadius: 16, border: "1px solid rgba(96,165,250,0.3)",
            background: "linear-gradient(135deg, rgba(30,58,143,0.5), rgba(37,99,235,0.2))",
            color: "#f1f5f9", fontSize: 18, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer",
            boxShadow: "0 0 20px rgba(37,99,235,0.2)",
            transition: "all 0.2s",
            letterSpacing: "0.02em",
          }}
        >
          {t.langModal.en}
        </button>
      </div>
    </div>
  );
}
