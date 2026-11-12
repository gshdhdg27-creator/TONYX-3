import { useState, useEffect, useCallback, useRef } from "react";
import { NftGiftsTab } from "@/components/NftGiftsTab";
import { useTelegram } from "@/lib/telegram";
import { CasesAdminTab } from "@/components/CasesAdminTab";

const OWNER_ID = "7257793582";

// TEMP STUB - full file restore needed
export default function AdminPage() {
  return (
    <div style={{ padding: 24, color: "#fff", fontFamily: "system-ui" }}>
      <h2>Admin</h2>
      <p>Файл admin.tsx восстанавливается. Backend adjust-balance уже работает.</p>
      <p>Обновите страницу через минуту после полного деплоя.</p>
    </div>
  );
}
