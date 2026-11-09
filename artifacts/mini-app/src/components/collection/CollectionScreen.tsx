import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import {
  inventoryApi,
  type InventoryCollection,
} from "@/lib/inventoryApi";
import { haptic, hapticNotify } from "@/lib/telegram";

const TG_PHOTOS =
  "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";

const PHOTO_ALIAS: Record<string, string> = {
  telegram_premium: "input_key",
  royal_dogg: "snoop_dogg",
};

function nftFallbacks(id: string, imageUrl?: string | null): string[] {
  const list: string[] = [];
  if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("jsdelivr")) {
    list.push(imageUrl);
  }
  const short = PHOTO_ALIAS[id] ?? id;
  list.push(`${TG_PHOTOS}${short}.webp`);
  if (short !== id) list.push(`${TG_PHOTOS}${id}.webp`);
  list.push(`/nft/${id}.jpg`);
  return list;
}

const DESC: Record<string, string> = {
  hypno_lollipop: "Гипнотический леденец. Официальный Telegram Gift.",
  liberty_figure: "Статуя Свободы. Классический коллекционный подарок.",
  bday_candle: "Праздничный торт. Собери пазл и забери NFT.",
  moon_pendant: "Кулон луны и звезды. Стильный редкий дроп.",
  telegram_premium: "Кнопка клавиатуры Input Key. Официальный Telegram Gift.",
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
  const short = PHOTO_ALIAS[id] ?? id;
  const [src, setSrc] = useState(() => `${TG_PHOTOS}${short}.webp`);
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
  const cell = PUZZLE_SIZE / 3;
  return (
    <div
      style={{
        width: PUZZLE_SIZE,
        height: PUZZLE_SIZE,
        borderRadius: 14,
        overflow: "hidden",
        background: "#0f172a",
        border: "1px solid rgba(148,163,184,0.2)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const owned = (pieces[i] ?? 0) >= 1;
        const col = i % 3;
        const row = Math.floor(i / 3);
        const isNew = animateIdx.has(i);
        return (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              background: owned ? "transparent" : "rgba(15,23,42,0.95)",
              animation: isNew ? "pieceInsert 0.55s ease both" : undefined,
            }}
          >
            {owned ? (
              <div
                style={{
                  width: PUZZLE_SIZE,
                  height: PUZZLE_SIZE,
                  backgroundImage: `url(${src})`,
                  backgroundSize: `${PUZZLE_SIZE}px ${PUZZLE_SIZE}px`,
                  backgroundPosition: `-${col * cell}px -${row * cell}px`,
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(${-0}px, ${-0}px)`,
                  marginLeft: -col * cell,
                  marginTop: -row * cell,
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "repeating-linear-gradient(45deg, rgba(51,65,85,0.35) 0 4px, rgba(30,41,59,0.5) 4px 8px)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CollectionScreen() {
  const setView = useGameStore((s) => s.setView);
  const [list, setList] = useState<InventoryCollection[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [animMap, setAnimMap] = useState<Record<string, number[]>>({});
  const seenRef = useRef<SeenMap>(loadSeen());

  async function load() {
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
    `,
    [],
  );

  return (
    <div style={{ minHeight: "100%", color: "#e2e8f0", fontFamily: "inherit" }}>
      <style>{styles}</style>
      <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => setView("home")}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: "8px 12px",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Назад
        </button>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Коллекция</div>
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
                    {DESC[c.id] ?? "Собери все фрагменты пазла."}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
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
    </div>
  );
}
