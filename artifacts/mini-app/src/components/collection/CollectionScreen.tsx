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

/** Collection id → TG_Photos short name when they differ */
const PHOTO_ALIAS: Record<string, string> = {
  telegram_premium: "input_key", // keyboard key gift
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

type SeenMap = Record<string, number[]>;
const SEEN_KEY = "tonyx-collection-seen-v1";

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
  const urls = useMemo(() => nftFallbacks(nftId, imageUrl), [nftId, imageUrl]);
  const [urlIdx, setUrlIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const url = urls[Math.min(urlIdx, urls.length - 1)];

  useEffect(() => {
    setReady(false);
    setUrlIdx(0);
  }, [nftId]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      if (urlIdx + 1 < urls.length) setUrlIdx((i) => i + 1);
      else setReady(true);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, urlIdx, urls.length]);

  return (
    <div
      style={{
        width: 112,
        height: 112,
        borderRadius: 14,
        overflow: "hidden",
        background: "#0b1020",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: 2,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const owned = (pieces[i] ?? 0) >= 1;
        const anim = animateIdx.has(i);
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              background: owned ? "transparent" : "rgba(30,41,59,0.9)",
              animation: anim ? "pieceInsert 0.55s ease both" : undefined,
            }}
          >
            {owned && ready && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${url})`,
                  backgroundSize: "300% 300%",
                  backgroundPosition: `${col * 50}% ${row * 50}%`,
                }}
              />
            )}
            {!owned && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#475569",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                ?
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// In-memory cache so re-entering Collection never shows "Загрузка…"
let _collectionCache: InventoryCollection[] | null = null;

export default function CollectionScreen() {
  const setView = useGameStore((s) => s.setView);
  const [list, setList] = useState<InventoryCollection[]>(() => _collectionCache ?? []);
  // Only show loading spinner on the very first visit when cache is empty
  const [loading, setLoading] = useState(() => _collectionCache === null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [animMap, setAnimMap] = useState<Record<string, number[]>>({});
  const seenRef = useRef<SeenMap>(loadSeen());

  async function load(opts?: { silent?: boolean }) {
    const silent = opts?.silent || _collectionCache !== null;
    if (!silent) setLoading(true);
    try {
      const d = await inventoryApi.get();
      const cols = d.collections ?? [];
      _collectionCache = cols;
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
      if (!silent) setMsg("Не удалось загрузить коллекцию");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // If we already have cache — refresh in background without spinner
    void load({ silent: _collectionCache !== null });
  }, []);

  async function onClaim(nftId: string) {
    if (claimingId) return;
    setClaimingId(nftId);
    setMsg(null);
    try {
      const r = await inventoryApi.claim(nftId);
      hapticNotify("success");
      setMsg(`✨ ${r.nameRu} добавлен в инвентарь`);
      await load({ silent: true });
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
    <div style={{ minHeight: "100%", color: "#e2e8f0" }}>
      <style>{styles}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 8px",
        }}
      >
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setView("home");
          }}
          style={{
            background: "rgba(30,41,59,0.8)",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 12,
            color: "#94a3b8",
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Назад
        </button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Коллекция</div>
        <div style={{ width: 72 }} />
      </div>

      {msg && (
        <div
          style={{
            margin: "0 14px 8px",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.35)",
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
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{c.nameRu}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {c.owned}/9 фрагментов · {progress}%
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!can || busy}
                    onClick={() => onClaim(c.id)}
                    style={{
                      border: 0,
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: can && !busy ? "pointer" : "default",
                      background: can
                        ? "linear-gradient(135deg, #22c55e, #16a34a)"
                        : "rgba(51,65,85,0.6)",
                      color: can ? "#052e16" : "#64748b",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "…" : can ? "Собрать NFT" : "Соберите все фрагменты"}
                  </button>
                </div>
              </div>
            );
          })}

          {!list.length && (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 }}>
              Пока нет коллекций
            </div>
          )}
        </div>
      )}
    </div>
  );
}
