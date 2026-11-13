import { useEffect, useMemo, useState } from "react";
import { NftMarketAdminTab } from "@/components/NftMarketAdminTab";

/**
 * Catalog powered by @GiftChanges (api.changes.tg) — models / backdrops / symbols
 * with real PNG assets for models & symbols.
 */
const API = "https://api.changes.tg";
const COVER = (name: string) =>
  `${API}/original/${encodeURIComponent(name)}.png?size=256`;
const MODEL_PNG = (gift: string, model: string) =>
  `${API}/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=256`;
const SYMBOL_PNG = (gift: string, symbol: string) =>
  `${API}/symbol/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;

type GiftRow = { name: string; id?: string };
type AttrRow = {
  name: string;
  rarity?: number;
  img?: string;
  color?: string;
  edgeColor?: string;
  patternColor?: string;
};
type BuiltGift = {
  gift: GiftRow;
  model: AttrRow;
  backdrop: AttrRow;
  symbol: AttrRow;
};

export function NftGiftsTab() {
  const [mode, setMode] = useState<"market" | "catalog">("catalog");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ModeBtn active={mode === "market"} onClick={() => setMode("market")} label="💎 NFT Market" />
        <ModeBtn active={mode === "catalog"} onClick={() => setMode("catalog")} label="🎁 Каталог" />
      </div>
      {mode === "market" ? <NftMarketAdminTab /> : <NftGiftsCatalog />}
      <div style={{ marginTop: 16, fontSize: 10, color: "#475569", textAlign: "center" }}>
        thanks to @GiftChanges for this API (api.changes.tg)
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 13,
        fontFamily: "inherit",
        cursor: "pointer",
        border: active ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
        background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#7dd3fc" : "#94a3b8",
      }}
    >
      {label}
    </button>
  );
}

function NftGiftsCatalog() {
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<GiftRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/gifts`, { cache: "force-cache" });
        if (!res.ok) throw new Error(`gifts ${res.status}`);
        const data = await res.json();
        let rows: GiftRow[] = [];
        if (Array.isArray(data)) {
          rows = data.map((x: unknown) => {
            if (typeof x === "string") return { name: x };
            const o = x as { name?: string; gift?: string };
            return { name: o.name || o.gift || String(x) };
          });
        } else if (data && typeof data === "object") {
          const arr = (data as { gifts?: string[] }).gifts;
          if (Array.isArray(arr)) rows = arr.map((n) => ({ name: String(n) }));
        }
        rows = rows.filter((g) => g.name).sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setGifts(rows);
      } catch {
        try {
          const res2 = await fetch(
            "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json",
            { cache: "force-cache" },
          );
          const data2 = (await res2.json()) as {
            upgraded?: { full_name: string; short_name: string }[];
          };
          const rows = (data2.upgraded ?? []).map((g) => ({
            name: g.full_name || g.short_name,
          }));
          if (!cancelled) setGifts(rows.sort((a, b) => a.name.localeCompare(b.name)));
        } catch {
          if (!cancelled) setGifts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return gifts;
    return gifts.filter((g) => g.name.toLowerCase().includes(s));
  }, [gifts, q]);

  if (selected) {
    return <GiftBuilder gift={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6, color: "#e2e8f0" }}>
        Каталог NFT-подарков ({loading ? "…" : gifts.length})
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
        Подарок → модель → фон → символ → выдать в инвентарь / выставить со своего акка
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" style={inputStyle} />
      {loading && <CenterMsg>Загрузка…</CenterMsg>}
      {!loading && list.length === 0 && <CenterMsg>Ничего не найдено</CenterMsg>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {list.map((g) => (
          <button key={g.name} type="button" onClick={() => setSelected(g)} style={cardBtn}>
            <img
              src={COVER(g.name)}
              alt=""
              style={{ width: 56, height: 56, objectFit: "contain" }}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.opacity = "0.25";
              }}
            />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginTop: 4, lineHeight: 1.2 }}>
              {g.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type Step = "model" | "backdrop" | "symbol" | "done";

function GiftBuilder({ gift, onBack }: { gift: GiftRow; onBack: () => void }) {
  const [step, setStep] = useState<Step>("model");
  const [models, setModels] = useState<AttrRow[]>([]);
  const [backdrops, setBackdrops] = useState<AttrRow[]>([]);
  const [symbols, setSymbols] = useState<AttrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [model, setModel] = useState<AttrRow | null>(null);
  const [backdrop, setBackdrop] = useState<AttrRow | null>(null);
  const [symbol, setSymbol] = useState<AttrRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setModels([]);
      setBackdrops([]);
      setSymbols([]);
      try {
        const g = encodeURIComponent(gift.name);
        const [mRes, bRes, sRes] = await Promise.all([
          fetch(`${API}/models/${g}?sorted`, { cache: "force-cache" }),
          fetch(`${API}/backdrops/${g}?sorted`, { cache: "force-cache" }),
          fetch(`${API}/symbols/${g}?sorted`, { cache: "force-cache" }),
        ]);

        const parseArr = async (res: Response) => {
          if (!res.ok) return [];
          const j = await res.json();
          return Array.isArray(j) ? j : [];
        };

        const mRaw = await parseArr(mRes);
        const bRaw = await parseArr(bRes);
        const sRaw = await parseArr(sRes);

        const modelRows: AttrRow[] = mRaw
          .map((m: { name?: string; telegramName?: string; rarity?: number; rarityPermille?: number }) => {
            const name = m.telegramName || m.name;
            if (!name) return null;
            return {
              name,
              rarity: m.rarity ?? (m.rarityPermille != null ? m.rarityPermille / 10 : undefined),
              img: MODEL_PNG(gift.name, name),
            } as AttrRow;
          })
          .filter(Boolean) as AttrRow[];

        const bdRows: AttrRow[] = bRaw
          .map(
            (b: {
              name?: string;
              rarity?: number;
              rarityPermille?: number;
              hex?: { centerColor?: string; edgeColor?: string; patternColor?: string };
              centerColor?: number;
              edgeColor?: number;
            }) => {
              if (!b?.name) return null;
              const center =
                b.hex?.centerColor ||
                (typeof b.centerColor === "number" ? `#${b.centerColor.toString(16).padStart(6, "0")}` : "#334155");
              const edge =
                b.hex?.edgeColor ||
                (typeof b.edgeColor === "number" ? `#${b.edgeColor.toString(16).padStart(6, "0")}` : "#0f172a");
              return {
                name: b.name,
                rarity: b.rarity ?? (b.rarityPermille != null ? b.rarityPermille / 10 : undefined),
                color: center,
                edgeColor: edge,
                patternColor: b.hex?.patternColor,
              } as AttrRow;
            },
          )
          .filter(Boolean) as AttrRow[];

        const syRows: AttrRow[] = sRaw
          .map((s: { name?: string; rarity?: number; rarityPermille?: number }) => {
            if (!s?.name) return null;
            return {
              name: s.name,
              rarity: s.rarity ?? (s.rarityPermille != null ? s.rarityPermille / 10 : undefined),
              img: SYMBOL_PNG(gift.name, s.name),
            } as AttrRow;
          })
          .filter(Boolean) as AttrRow[];

        if (!cancelled) {
          setModels(modelRows);
          setBackdrops(bdRows);
          setSymbols(syRows);
          if (!modelRows.length) {
            setErr("У этого подарка пока нет моделей в Telegram / GiftChanges.");
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gift.name]);

  const filterList = (rows: AttrRow[]) => {
    const s = q.toLowerCase().trim();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s));
  };

  if (step === "done" && model && backdrop && symbol) {
    return (
      <AssembledPanel
        built={{ gift, model, backdrop, symbol }}
        onBack={() => {
          setStep("symbol");
          setSymbol(null);
        }}
        onReset={onBack}
      />
    );
  }

  const title =
    step === "model" ? "Выбери модель" : step === "backdrop" ? "Выбери фон" : "Выбери символ";
  const rows =
    step === "model" ? filterList(models) : step === "backdrop" ? filterList(backdrops) : filterList(symbols);

  return (
    <div style={{ paddingBottom: 24 }}>
      <button
        type="button"
        onClick={() => {
          if (step === "model") onBack();
          else if (step === "backdrop") {
            setStep("model");
            setModel(null);
            setQ("");
          } else {
            setStep("backdrop");
            setBackdrop(null);
            setQ("");
          }
        }}
        style={backBtn}
      >
        ← Назад
      </button>

      <Header gift={gift} model={model} backdrop={backdrop} symbol={symbol} />

      <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
        {title}{" "}
        <span style={{ color: "#64748b", fontWeight: 600 }}>({loading ? "…" : rows.length})</span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" style={inputStyle} />

      {err && step === "model" && <div style={errBox}>{err}</div>}
      {loading && <CenterMsg>Загрузка…</CenterMsg>}

      {!loading && step === "model" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((m) => (
            <button
              key={m.name}
              type="button"
              style={cardBtn}
              onClick={() => {
                setModel(m);
                setStep("backdrop");
                setQ("");
              }}
            >
              <img
                src={m.img}
                alt={m.name}
                style={imgSq}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.opacity = "0.2";
                }}
              />
              <div style={nameStyle}>{m.name}</div>
              {m.rarity != null && <div style={rarityStyle}>{m.rarity}%</div>}
            </button>
          ))}
          {!rows.length && <CenterMsg>Нет моделей</CenterMsg>}
        </div>
      )}

      {!loading && step === "backdrop" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((b) => (
            <button
              key={b.name}
              type="button"
              style={cardBtn}
              onClick={() => {
                setBackdrop(b);
                setStep("symbol");
                setQ("");
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 8,
                  background: `radial-gradient(circle at 50% 40%, ${b.color || "#64748b"}, ${b.edgeColor || "#0f172a"} 75%)`,
                  border: "1px solid rgba(255,255,255,0.12)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {b.patternColor && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `radial-gradient(${b.patternColor}33 1px, transparent 1px)`,
                      backgroundSize: "10px 10px",
                      opacity: 0.7,
                    }}
                  />
                )}
              </div>
              <div style={nameStyle}>{b.name}</div>
              {b.rarity != null && <div style={rarityStyle}>{b.rarity}%</div>}
            </button>
          ))}
          {!rows.length && <CenterMsg>Нет фонов</CenterMsg>}
        </div>
      )}

      {!loading && step === "symbol" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {rows.map((s) => (
            <button
              key={s.name}
              type="button"
              style={cardBtn}
              onClick={() => {
                setSymbol(s);
                setStep("done");
                setQ("");
              }}
            >
              <img
                src={s.img}
                alt={s.name}
                style={{
                  ...imgSq,
                  background: "rgba(0,0,0,0.35)",
                  padding: 6,
                  boxSizing: "border-box",
                }}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.opacity = "0.2";
                }}
              />
              <div style={nameStyle}>{s.name}</div>
              {s.rarity != null && <div style={rarityStyle}>{s.rarity}%</div>}
            </button>
          ))}
          {!rows.length && <CenterMsg>Нет символов</CenterMsg>}
        </div>
      )}
    </div>
  );
}

function Header({
  gift,
  model,
  backdrop,
  symbol,
}: {
  gift: GiftRow;
  model: AttrRow | null;
  backdrop: AttrRow | null;
  symbol?: AttrRow | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <img
        src={model?.img || COVER(gift.name)}
        alt=""
        style={{
          width: 56,
          height: 56,
          objectFit: "contain",
          borderRadius: 10,
          background: backdrop
            ? `radial-gradient(circle, ${backdrop.color}, ${backdrop.edgeColor || "#0f172a"})`
            : "rgba(0,0,0,0.25)",
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900 }}>{gift.name}</div>
        {(model || backdrop || symbol) && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.35 }}>
            {model ? model.name : "—"}
            {backdrop ? ` · ${backdrop.name}` : ""}
            {symbol ? ` · ${symbol.name}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function AssembledPanel({
  built,
  onBack,
  onReset,
}: {
  built: BuiltGift;
  onBack: () => void;
  onReset: () => void;
}) {
  const { gift, model, backdrop, symbol } = built;
  const [targetId, setTargetId] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);

  const adminId =
    typeof window !== "undefined"
      ? localStorage.getItem("adminId") ||
        new URLSearchParams(window.location.search).get("adminId") ||
        ""
      : "";

  const postGrant = async (opts: { toId: string; list: boolean; priceTon?: number }) => {
    const body: Record<string, unknown> = {
      adminId,
      short: gift.name.replace(/\s+/g, "_").toLowerCase(),
      giftName: gift.name,
      model: model.name,
      backdrop: backdrop.name,
      symbol: symbol.name,
      imageUrl: model.img || COVER(gift.name),
      list: opts.list,
    };
    if (opts.list && opts.priceTon != null) body.priceTon = opts.priceTon;

    const r = await fetch(`/api/mini/admin/users/${encodeURIComponent(opts.toId)}/grant-gift`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Id": adminId,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
    return d;
  };

  const onGrant = async () => {
    const id = targetId.trim();
    if (!id) {
      setMsgErr(true);
      setMsg("Укажи Telegram ID получателя");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await postGrant({ toId: id, list: false });
      setMsgErr(false);
      setMsg(`✅ Выдано в инвентарь ${id}`);
    } catch (e) {
      setMsgErr(true);
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onListMine = async () => {
    if (!adminId) {
      setMsgErr(true);
      setMsg("Нет adminId — войди в админку заново");
      return;
    }
    const p = Number(String(price).replace(",", "."));
    if (!Number.isFinite(p) || p <= 0) {
      setMsgErr(true);
      setMsg("Укажи цену TON > 0");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await postGrant({ toId: adminId, list: true, priceTon: p });
      setMsgErr(false);
      setMsg(`✅ На маркете с твоего акка за ${p} TON`);
    } catch (e) {
      setMsgErr(true);
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <button type="button" onClick={onBack} style={backBtn}>
        ← К символам
      </button>
      <button type="button" onClick={onReset} style={{ ...backBtn, marginLeft: 8 }}>
        ← В каталог
      </button>

      <div
        style={{
          marginTop: 12,
          borderRadius: 16,
          border: "1px solid rgba(56,189,248,0.25)",
          background: backdrop
            ? `radial-gradient(circle at 50% 30%, ${backdrop.color}, ${backdrop.edgeColor || "#020617"} 80%)`
            : "rgba(15,23,42,0.9)",
          padding: 16,
          textAlign: "center",
        }}
      >
        <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
          <img
            src={model.img}
            alt={model.name}
            style={{ width: 140, height: 140, objectFit: "contain", position: "relative", zIndex: 1 }}
          />
          {symbol.img && (
            <img
              src={symbol.img}
              alt={symbol.name}
              style={{
                position: "absolute",
                right: -4,
                bottom: -4,
                width: 40,
                height: 40,
                objectFit: "contain",
                opacity: 0.95,
                zIndex: 2,
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 10, color: "#f8fafc" }}>{gift.name}</div>
        <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
          {model.name} · {backdrop.name} · {symbol.name}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
          {[model.rarity, backdrop.rarity, symbol.rarity]
            .filter((x) => x != null)
            .map((x) => `${x}%`)
            .join(" · ")}
        </div>
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>📤 Выдать в инвентарь</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
          Появится у игрока в инвентаре (не на маркете)
        </div>
        <input
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder="Telegram ID получателя"
          style={inputStyle}
        />
        <button type="button" disabled={busy} onClick={onGrant} style={btnGreen}>
          {busy ? "…" : "Выдать на аккаунт"}
        </button>
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>🏪 Выставить на NFT Market</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
          Создаётся на <b style={{ color: "#94a3b8" }}>твоём</b> аккаунте (admin) и сразу идёт в маркет.
          Покупатели видят лот как у любого продавца.
        </div>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Цена TON"
          inputMode="decimal"
          style={inputStyle}
        />
        <button type="button" disabled={busy} onClick={onListMine} style={btnCyan}>
          {busy ? "…" : "Выставить со своего акка"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            background: msgErr ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            color: msgErr ? "#fca5a5" : "#86efac",
            border: `1px solid ${msgErr ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", color: "#64748b", padding: 20, fontSize: 13 }}>{children}</div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.35)",
  color: "#e2e8f0",
  fontSize: 13,
  marginBottom: 10,
  fontFamily: "inherit",
};
const cardBtn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: 8,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  cursor: "pointer",
  fontFamily: "inherit",
};
const imgSq: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  objectFit: "contain",
  borderRadius: 8,
};
const nameStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#cbd5e1",
  marginTop: 4,
  textAlign: "center",
  lineHeight: 1.2,
};
const rarityStyle: React.CSSProperties = { fontSize: 9, color: "#64748b", marginTop: 2 };
const backBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  marginBottom: 10,
};
const errBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "#fca5a5",
  fontSize: 12,
  marginBottom: 10,
};
const sectionBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#e2e8f0",
  marginBottom: 4,
};
const btnGreen: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg,#15803d,#22c55e)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const btnCyan: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg,#0e7490,#22d3ee)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
