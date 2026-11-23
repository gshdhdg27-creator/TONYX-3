import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import {
  W, H, BALL_R, POINT_R, MARGIN, makeRng,
  planBouncePath, randomInStrip, randomStart, samplePath, pathDirection, pointInPoly,
} from "./arenaPhysics";
import WinnerModal from "./WinnerModal";

// TEMPORARY STUB - will replace with full file in next commit
export default function ArenaGame({ onClose }: { telegramId?: string; tonBalance?: number; onBalanceChange?: () => void; onClose: () => void }) {
  return (
    <div style={{ padding: 24, color: "#fff", background: "#0a0a12", minHeight: "100%" }}>
      <button type="button" onClick={onClose} style={{ marginBottom: 16 }}>← Назад</button>
      <p>Арена восстанавливается… обновите через минуту.</p>
    </div>
  );
}
