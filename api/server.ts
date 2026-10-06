// @ts-nocheck
export default async function handler(req, res) {
  try {
    const mod = await import("./_bundled.mjs");
    const app = mod.default;
    return app(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: String(e && e.message ? e.message : e),
        code: e && e.code ? e.code : null,
        stack: String(e && e.stack ? e.stack : "")
          .split("\n")
          .slice(0, 10),
      }),
    );
  }
}
