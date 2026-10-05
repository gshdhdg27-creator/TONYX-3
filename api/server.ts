export default function handler(
  request: { method?: string; url?: string },
  response: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (b: string) => void;
  },
) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify({
      status: "ok",
      mode: "minimal-handler",
      method: request.method ?? null,
      url: request.url ?? null,
    }),
  );
}
