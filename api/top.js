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
  const redis = getRedis(res);
  if (!redis) return;

  try {
    // get all user keys
    const keys = await redis.keys('user:*');
    const users = [];

    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (!data || !data.score) continue;

      users.push({
        name: data.name || 'guest',
        score: Number(data.score),
        addr: data.addr,
        fid: data.fid
      });
    }

    // sort high → low and keep top 20
    users.sort((a, b) => b.score - a.score);
    const top = users.slice(0, 20);

    res.json(top);
  } catch (err) {
    console.error('[api/top error]', err);
    res.status(500).json({ ok:false, err:'server' });
  }
};
