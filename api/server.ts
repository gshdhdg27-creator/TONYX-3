export default async function handler(req: any, res: any) {
  try {
    const mod = await import("./_bundled.mjs");
    const app = mod.default;

    if (typeof app !== "function" && typeof app?.handle !== "function") {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Bundled module loaded, but default export is not an Express app",
          type: typeof app,
          keys: app && typeof app === "object" ? Object.keys(app) : [],
        }),
      );
      return;
    }

    // Express app is a request listener
    return app(req, res);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: String(e?.message || e),
        code: e?.code ?? null,
        stack: String(e?.stack || "")
          .split("\n")
          .slice(0, 8),
      }),
    );
  }
}
