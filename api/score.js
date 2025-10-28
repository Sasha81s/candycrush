// simplified test mode: accepts name + score directly
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
  if (req.method !== 'POST') return res.status(405).end();
  const redis = getRedis(res);
  if (!redis) return;

  try {
    const { name, score } = req.body || {};
    if (typeof score !== 'number') {
      return res.status(400).json({ ok:false, err:'bad body' });
    }

    const safeScore = Math.max(0, Math.min(999999, score|0));
    const safeName = String(name || 'guest').slice(0, 16);
    const safeAddr = '0xtest'; // fake addr placeholder for testing

    const key = 'cc:global:scores';
    await redis.zadd(key, { score: safeScore, member: JSON.stringify({ addr:safeAddr, name:safeName, score:safeScore, ts:Date.now() }) });

    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, err:'server' });
  }
};
