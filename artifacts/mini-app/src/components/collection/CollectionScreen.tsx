import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import {
  inventoryApi,
  type InventoryCollection,
} from "@/lib/inventoryApi";
import { haptic, hapticNotify } from "@/lib/telegram";

/** Same photos as admin panel (TG_Photos). jsDelivr is often 503 — use GitHub raw. */
const TG_PHOTOS =
  "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";

/** Prefer admin TG gift photos; local /nft as fallback */
function nftFallbacks(id: string, imageUrl?: string | null): string[] {
  const list: string[] = [];
  if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("jsdelivr")) {
    list.push(imageUrl);
  }
  list.push(`${TG_PHOTOS}${id}.webp`);
  list.push(`/nft/${id}.jpg`);
  return list;
}

const DESC: Record<string, string> = {
  hypno_lollipop: "Гипнотический леденец. Редкий Telegram Gift.",
  liberty_figure: "Факел свободы. Классический коллекционный подарок.",
  bday_candle: "Праздничный торт. Собери пазл и забери NFT.",
  moon_pendant: "Кулон луны и звезды. Стильный редкий дроп.",
  telegram_premium: "Символ Premium. Ценный коллекционный NFT.",
  snoop_cigar: "Легендарная сигара. Культовый Telegram Gift.",
  royal_dogg: "Королевский пёс TONYX. Эксклюзив проекта.",
  electric_skull: "Электрический череп. Эпический дроп.",
  neko_helmet: "Неко-шлем. Яркий и редкий коллекционный предмет.",
  heroic_helmet: "Героический шлем. Один из самых дорогих подарков.",
};

const PUZZLE_SIZE = 152;
const SEEN_KEY = "tonyx_collection_seen_v1";

type SeenMap = Record<string, number[]>;

function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

function saveSeen(map: SeenMap) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function useNftSrc(id: string, imageUrl?: string | null) {
  const [src, setSrc] = useState(() => `${TG_PHOTOS}${id}.webp`);
  useEffect(() => {
    const list = nftFallbacks(id, imageUrl);
    let cancelled = false;
    let i = 0;
    const tryNext = () => {
      if (cancelled || i >= list.length) return;
      const url = list[i++];
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setSrc(url);
      };
      img.onerror = () => tryNext();
      img.src = url;
    };
    tryNext();
    return () => {
      cancelled = true;
    };
  }, [id, imageUrl]);
  return src;
}

/** 3×3 puzzle — no numbers; locked cells are muted gray photo */
function PuzzleBoard({
  nftId,
  imageUrl,
  pieces,
  animateIdx,
}: {
  nftId: string;
  imageUrl?: string | null;
  pieces: number[];
  animateIdx: Set<number>;
}) {
  const src = useNftSrc(nftId, imageUrl);

  return (
    <div
      style={{
        width: PUZZLE_SIZE,
        height: PUZZLE_SIZE,
        minWidth: PUZZLE_SIZE,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: 2,
        borderRadius: 18,
        overflow: "hidden",
        background: "#0b1220",
        border: "1px solid rgba(148,163,184,0.22)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35), 0 10px 28px rgba(0,0,0,0.35)",
        position: "relative",
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const lit = (pieces[i] ?? 0) >= 1;
        const isNew = animateIdx.has(i);
        const posX = col * 50;
        const posY = row * 50;

        return (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 3,
              background: "#111827",
              animation: isNew
                ? `pieceInsert 0.65s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both`
                : undefined,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: src ? `url("${src}")` : "none",
                backgroundSize: "300% 300%",
                backgroundPosition: `${posX}% ${posY}%`,
                backgroundRepeat: "no-repeat",
                filter: lit
                  ? "none"
                  : "grayscale(0.9) brightness(0.5) saturate(0.35)",
                opacity: lit ? 1 : 0.75,
                transition: "filter 0.45s ease, opacity 0.45s ease",
              }}
            />
            {/* locked dim overlay — no numbers */}
            {!lit && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15,23,42,0.32)",
                  pointerEvents: "none",
                }}
              />
            )}
            {isNew && (
              <>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
                    animation: "pieceShine 0.9s ease-out both",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: -2,
                    borderRadius: 4,
                    boxShadow: "0 0 14px 3px rgba(168,85,247,0.65)",
                    animation: "pieceGlow 1.1s ease-out both",
                    pointerEvents: "none",
                  }}
                />
              </>
            )}
          </div>
        );
      })}
      {animateIdx.size > 0 && (
        <>
          <div className="puzzle-side-fx left" />
          <div className="puzzle-side-fx right" />
        </>
      )}
    </div>
  );
}

export default function CollectionScreen() {
  const setView = useGameStore((s) => s.setView);
  const [list, setList] = useState<InventoryCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [animMap, setAnimMap] = useState<Record<string, number[]>>({});
  const seenRef = useRef<SeenMap>(loadSeen());

  async function load() {
    setLoading(true);
    try {
      const d = await inventoryApi.get();
      const cols = d.collections ?? [];
      setList(cols);

      const nextSeen: SeenMap = { ...seenRef.current };
      const nextAnim: Record<string, number[]> = {};
      for (const c of cols) {
        const prev = seenRef.current[c.id] ?? Array(9).fill(0);
        const fresh: number[] = [];
        for (let i = 0; i < 9; i++) {
          const now = (c.pieces[i] ?? 0) >= 1 ? 1 : 0;
          const was = (prev[i] ?? 0) >= 1 ? 1 : 0;
          if (now && !was) fresh.push(i);
        }
        if (fresh.length) nextAnim[c.id] = fresh;
        nextSeen[c.id] = (c.pieces ?? []).map((p) => ((p ?? 0) >= 1 ? 1 : 0));
        while (nextSeen[c.id].length < 9) nextSeen[c.id].push(0);
      }
      seenRef.current = nextSeen;
      saveSeen(nextSeen);
      setAnimMap(nextAnim);

      if (Object.keys(nextAnim).length) {
        setTimeout(() => setAnimMap({}), 1600);
      }
    } catch {
      setMsg("Не удалось загрузить коллекцию");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onClaim(nftId: string) {
    if (claimingId) return;
    setClaimingId(nftId);
    setMsg(null);
    try {
      const r = await inventoryApi.claim(nftId);
      hapticNotify("success");
      setMsg(`✨ ${r.nameRu} добавлен в инвентарь`);
      await load();
    } catch (e) {
      hapticNotify("error");
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setClaimingId(null);
    }
  }

  const styles = useMemo(
    () => `
      @keyframes nftPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.35); }
        50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
      }
      @keyframes pieceInsert {
        0% { transform: scale(0.55) translateY(10px); opacity: 0; filter: brightness(2); }
        55% { transform: scale(1.06) translateY(-2px); opacity: 1; filter: brightness(1.25); }
        100% { transform: scale(1) translateY(0); opacity: 1; filter: brightness(1); }
      }
      @keyframes pieceShine {
        0% { transform: translateX(-120%); opacity: 0; }
        30% { opacity: 1; }
        100% { transform: translateX(120%); opacity: 0; }
      }
      @keyframes pieceGlow {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes sideSpark {
        0% { opacity: 0; transform: scaleY(0.3); }
        40% { opacity: 1; transform: scaleY(1); }
        100% { opacity: 0; transform: scaleY(0.6); }
      }
      .puzzle-side-fx {
        position: absolute; top: 8%; bottom: 8%; width: 3px; border-radius: 4px;
        pointer-events: none;
        background: linear-gradient(180deg, transparent, rgba(168,85,247,0.9), rgba(251,191,36,0.85), rgba(168,85,247,0.9), transparent);
        box-shadow: 0 0 12px rgba(168,85,247,0.7);
        animation: sideSpark 1s ease-out both;
      }
      .puzzle-side-fx.left { left: -6px; }
      .puzzle-side-fx.right { right: -6px; animation-delay: 0.08s; }
    `,
    [],
  );

  return (
    <div
      className="collection-screen"
      style={{
        height: "calc(100dvh - 74px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        paddingBottom: 24,
      }}
    >
      <style>{styles}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "rgba(11,15,20,0.92)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 17, color: "#f1f5f9" }}>
          🏆 NFT Collection
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("home")}>
          ← Назад
        </button>
      </div>

      {msg && (
        <div
          style={{
            margin: "0 16px 12px",
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(34,197,94,0.16)",
            color: "#4ade80",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: "#64748b", textAlign: "center" }}>Загрузка…</div>
      ) : (
        <div style={{ padding: "4px 14px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {list.map((c) => {
            const can = c.canClaim;
            const busy = claimingId === c.id;
            const progress = Math.round((c.owned / 9) * 100);
            const animIdx = new Set(animMap[c.id] ?? []);

            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  gap: 14,
                  background: "linear-gradient(145deg, rgba(17,24,39,0.98), rgba(15,23,42,0.95))",
                  border: can
                    ? "1px solid rgba(34,197,94,0.55)"
                    : "1px solid rgba(168,85,247,0.28)",
                  borderRadius: 22,
                  padding: 14,
                  minHeight: 172,
                  boxShadow: can
                    ? "0 0 24px rgba(34,197,94,0.12)"
                    : "0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                <PuzzleBoard
                  nftId={c.id}
                  imageUrl={c.imageUrl}
                  pieces={c.pieces ?? []}
                  animateIdx={animIdx}
                />

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", marginBottom: 4, lineHeight: 1.25 }}>
                      {c.nameRu}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4, marginBottom: 8 }}>
                      {DESC[c.id] ?? "Коллекционный NFT. Собери 9 частей."}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#fbbf24",
                          background: "rgba(251,191,36,0.12)",
                          border: "1px solid rgba(251,191,36,0.25)",
                          borderRadius: 8,
                          padding: "3px 8px",
                        }}
                      >
                        ≈ {c.valueTon} TON
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd" }}>
                        Собрано {c.owned}/9
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div style={{ height: 6, borderRadius: 99, background: "rgba(51,65,85,0.6)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${progress}%`,
                          height: "100%",
                          background: can
                            ? "linear-gradient(90deg,#16a34a,#22c55e)"
                            : "linear-gradient(90deg,#7c3aed,#a855f7)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!can || busy}
                    onClick={() => {
                      haptic("light");
                      onClaim(c.id);
                    }}
                    style={{
                      width: "100%",
                      padding: "11px 0",
                      borderRadius: 12,
                      border: "none",
                      fontFamily: "inherit",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: can ? "pointer" : "not-allowed",
                      color: can ? "#fff" : "#64748b",
                      background: can
                        ? "linear-gradient(135deg,#16a34a,#22c55e)"
                        : "rgba(51,65,85,0.55)",
                      animation: can ? "nftPulse 1.6s ease infinite" : "none",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "…" : can ? "Получить" : "Собери 9/9"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
