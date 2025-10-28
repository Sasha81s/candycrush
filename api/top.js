// super safe version: works even if Redis returns weird data
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
    const key = 'cc:global:scores';

    // try both formats (depends on Redis version)
    let rows = [];
    try {
      rows = await redis.zrange(key, -10, -1, { withScores: true });
    } catch {
      rows = await redis.zrange(key, -10, -1);
    }

    if (!rows || !rows.length) {
      return res.json([]);
    }

    // handle both object and array formats
    const mapped = Array.isArray(rows[0])
      ? rows.map(([member, score]) => ({ ...JSON.parse(member), score }))
      : rows.map(r => ({ ...JSON.parse(r.member || r), score: r.score || 0 }));

    mapped.sort((a, b) => b.score - a.score);

    const out = mapped.map((row, i) => ({
      rank: i + 1,
      name: row.name,
      score: row.score,
      addr: row.addr || ''
    }));

    res.json(out);
  } catch (e) {
    console.error('TOP ERROR:', e);
    res.status(500).json({ ok:false, err:e.message || 'server' });
  }
};
