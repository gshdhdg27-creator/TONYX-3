// Vercel serverless entry — imports prebuilt bundle and exports the Express app
// The bundling step produces api/_bundled.mjs which should export the Express `app`.
// @ts-ignore
import app from "./_bundled.mjs";

export default app;
