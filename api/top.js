// GET /api/top?n=10 -> [{rank,name,score,addr}]
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const n = Math.max(1, Math.min(50, Number(req.query.n || 10)));
  const key = "cc:global:scores";

  const rows = await redis.zrange(key, -n, -1, { withScores: true }); // tail = highest
  const mapped = rows.map(r => ({ ...JSON.parse(r.member), score: r.score }));
  mapped.sort((a,b) => b.score - a.score);
  const out = mapped.map((row, i) => ({ rank: i+1, name: row.name, score: row.score, addr: row.addr }));

  res.json(out);
}
