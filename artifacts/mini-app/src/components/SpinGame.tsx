import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify, useTelegram } from "@/lib/telegram";

// TEMP: full file is in project artifacts/SpinGame.tsx — this restore is incomplete if you see this comment
// Please pull from local artifacts if game is broken
export { default } from "./SpinGame";
