import { Router, type IRouter } from "express";

const router: IRouter = Router();

// TEMP stub — full multi-NFT file is ready locally; needs Contents:Write token to push
router.get("/state", async (_req, res) => {
  res.status(503).json({ error: "games-spin restore in progress" });
});
router.post("/join", async (_req, res) => {
  res.status(503).json({ error: "games-spin restore in progress" });
});
router.post("/increase", async (_req, res) => {
  res.status(503).json({ error: "games-spin restore in progress" });
});
router.get("/history", async (_req, res) => { res.json({ rooms: [], history: [] }); });
router.get("/last-winner", async (_req, res) => { res.json({ winner: null }); });
router.get("/biggest-winner", async (_req, res) => { res.json({ winner: null }); });
router.get("/lucky-players", async (_req, res) => { res.json({ players: [] }); });

export default router;
