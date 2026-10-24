export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;

export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

/** Rewrite deprecated legacy paths to /api/mini (profile + referrals migration). */
function rewriteLegacyApiPath(url: string): string {
  if (url.startsWith("/api/users") || url.includes("/api/users/")) {
    return url.replace("/api/users", "/api/mini/users");
  }
  if (url.startsWith("/api/referrals") || url.includes("/api/referrals/")) {
    return url.replace("/api/referrals", "/api/mini/referrals");
  }
  return url;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  let url: string;
  if (typeof input === "string") url = input;
  else if (isUrl(input)) url = input.toString();
  else url = input.url;
  return rewriteLegacyApiPath(url);
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;
  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }
  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");
  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;
  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;

  constructor(response: Response, data: T | null) {
    super(buildErrorMessage(response, data));
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
  }
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = stripBom(await response.text());
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) return null;
  const mediaType = getMediaType(response.headers);
  if (isJsonMediaType(mediaType) || looksLikeJson(await response.clone().text().catch(() => ""))) {
    return parseJsonBody(response);
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function parseSuccessBody(
  response: Response,
  method: string,
  responseType: CustomFetchOptions["responseType"],
): Promise<unknown> {
  if (hasNoBody(response, method)) return null;
  if (responseType === "blob") return response.blob();
  if (responseType === "text") return response.text();
  const mediaType = getMediaType(response.headers);
  if (responseType === "json" || isJsonMediaType(mediaType)) {
    return parseJsonBody(response);
  }
  if (isTextMediaType(mediaType)) return response.text();
  if (responseType === "auto" || responseType === undefined) {
    const text = stripBom(await response.text());
    if (looksLikeJson(text)) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }
    return text;
  }
  return response.text();
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  const { responseType = "auto", headers: headersInit, ...rest } = options;
  input = applyBaseUrl(input);

  // Re-apply path rewrite after base URL (string absolute URLs)
  if (typeof input === "string") {
    try {
      const u = new URL(input, "http://local.invalid");
      const rewritten = rewriteLegacyApiPath(u.pathname) + u.search;
      if (input.startsWith("http://") || input.startsWith("https://")) {
        input = `${u.origin}${rewritten}`;
      } else if (input.startsWith("/")) {
        input = rewriteLegacyApiPath(input);
      }
    } catch {
      input = rewriteLegacyApiPath(input);
    }
  }

  const method = resolveMethod(input, rest.method);
  const headers = mergeHeaders(headersInit);
  if (!headers.has("Accept")) headers.set("Accept", DEFAULT_JSON_ACCEPT);

  if (_authTokenGetter) {
    const token = await _authTokenGetter();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  // Attach Telegram initData when available in browser WebApp context
  try {
    const tg = (globalThis as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData;
    if (tg && !headers.has("x-telegram-init-data")) {
      headers.set("x-telegram-init-data", tg);
    }
  } catch {
    /* ignore */
  }

  const response = await fetch(input, { ...rest, method, headers });
  if (!response.ok) {
    const data = await parseErrorBody(response, method);
    throw new ApiError(response, data);
  }
  return (await parseSuccessBody(response, method, responseType)) as T;
}
