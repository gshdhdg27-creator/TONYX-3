import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

if (apiBase) {
  setBaseUrl(apiBase);
}

const _origFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const isApi = url.startsWith("/api/") || url.startsWith("/mini/");
  if (isApi) {
    const initData = (window as any).Telegram?.WebApp?.initData ?? "";
    const headers = new Headers((init as RequestInit | undefined)?.headers ?? {});
    if (initData) {
      headers.set("x-telegram-init-data", initData);
    }
    const resolved = apiBase ? `${apiBase}${url}` : url;
    return _origFetch(resolved, { ...init, headers });
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
