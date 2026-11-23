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
import ArenaHistoryModal, { type ArenaHistoryItem } from "./ArenaHistoryModal";

// NOTE: truncated in this attempt - will fix
export default function ArenaGame({ telegramId, tonBalance, onBalanceChange, onClose }: any) {
  return null;
}
