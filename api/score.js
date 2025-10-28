// POST /api/score body: { addr, name, score, ts, sig }
import { Redis } from "@upstash/redis";
import { verifyMessage } from "ethers";

const redis = Redis.fromEnv(); // set UPSTASH_REDIS_REST_URL / _TOKEN in Vercel

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { addr, name, score, ts, sig } = req.body || {};
    if (!addr || !score || !ts || !sig) return res.status(400).json({ ok:false, err:"bad body" });

    const now = Date.now();
    if (Math.abs(now - Number(ts)) > 120000) return res.status(400).json({ ok:false, err:"stale" });

    const message = `cc-score:${score}|ts:${ts}`;
    const recovered = await verifyMessage(message, sig);
    if (recovered.toLowerCase() !== String(addr).toLowerCase())
      return res.status(401).json({ ok:false, err:"bad signature" });

    const safeScore = Math.max(0, Math.min(999999, Number(score|0)));
    const safeName = String(name || "guest").slice(0, 16);

    const key = "cc:global:scores";
    await redis.zadd(key, { score: safeScore, member: JSON.stringify({ addr, name: safeName, score: safeScore, ts: now }) });

    const total = await redis.zcard(key);
    if (total > 100) await redis.zremrangebyrank(key, 0, total - 101);

    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, err:"server" });
  }
}
