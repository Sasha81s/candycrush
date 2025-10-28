// CommonJS version
const { Redis } = require('@upstash/redis');

function getRedis(res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    res.status(500).json({ ok:false, err:'missing Upstash env' });
    return null;
  }
  return new Redis({ url, token });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const redis = getRedis(res);
  if (!redis) return;

  try {
    const n = Math.max(1, Math.min(50, Number(req.query.n || 10)));
    const key = 'cc:global:scores';

    const rows = await redis.zrange(key, -n, -1, { withScores: true }); // [{member, score}]
    const mapped = rows.map(r => ({ ...JSON.parse(r.member), score: r.score }));
    mapped.sort((a,b) => b.score - a.score);
    const out = mapped.map((row, i) => ({ rank:i+1, name:row.name, score:row.score, addr:row.addr }));

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, err:'server' });
  }
};
