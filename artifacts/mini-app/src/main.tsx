import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const _origFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const isApi = url.startsWith("/api/") || url.startsWith("/mini/");
  if (isApi) {
    const initData = (window as any).Telegram?.WebApp?.initData ?? "";
    if (initData) {
      const headers = new Headers((init as RequestInit | undefined)?.headers ?? {});
      headers.set("x-telegram-init-data", initData);
      return _origFetch(input, { ...init, headers });
    }
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
