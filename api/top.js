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
    let rows;

    try {
      rows = await redis.zrange(key, -10, -1, { withScores: true });
    } catch {
      rows = await redis.zrange(key, -10, -1);
    }

    if (!rows || !rows.length) return res.json([]);

    // normalize each row safely
    const mapped = rows.map((r) => {
      let member, score;
      if (Array.isArray(r)) {
        member = r[0];
        score = Number(r[1] || 0);
      } else if (r.member !== undefined) {
        member = r.member;
        score = Number(r.score || 0);
      } else {
        member = r;
        score = 0;
      }

      let data;
      try {
        // sometimes redis returns an object already, sometimes a string
        data = typeof member === 'string' ? JSON.parse(member) : member;
      } catch {
        data = { name: 'unknown', addr: '', score };
      }

      return {
        name: data.name || 'guest',
        score: data.score || score,
        addr: data.addr || '',
      };
    });

    mapped.sort((a, b) => b.score - a.score);

    const out = mapped.map((row, i) => ({
      rank: i + 1,
      name: row.name,
      score: row.score,
      addr: row.addr,
    }));

    res.json(out);
  } catch (e) {
    console.error('TOP ERROR:', e);
    res.status(500).json({ ok:false, err:e.message || 'server' });
  }
};
