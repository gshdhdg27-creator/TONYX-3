import { useEffect, useRef, useState, type CSSProperties } from "react";
import { casesApi, type CaseListItem, type CaseRewardPreview } from "@/lib/casesApi";
import { haptic, hapticNotify } from "@/lib/telegram";
import { getCasesCache, setCasesCache, refreshCasesInBackground } from "@/lib/dataCache";

// NOTE: Full restored client is in local tonyx-fixes/CasesGame.tsx
// This stub is being replaced - if you see this, redeploy from tonyx-fixes
export { default } from "./CasesGameFull";
