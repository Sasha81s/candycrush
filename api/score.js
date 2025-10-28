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
    const { name, score, addr, fid } = req.body || {};
    if (typeof score !== 'number') return res.status(400).json({ ok:false, err:'bad body' });

    const safeScore = Math.max(0, Math.min(999999, score | 0));
    const safeName = String(name || 'guest').slice(0, 32);
    const safeAddr = String(addr || '').toLowerCase();
    const safeFid = fid ? String(fid) : null;
    const key = 'cc:global:scores';

    // use fid or addr as unique ID
    const uniqueId = safeFid ? `fid:${safeFid}` : (safeAddr || `anon:${safeName}`);

    // get all existing scores
    let existing = [];
    try {
      existing = await redis.zrange(key, 0, -1);
    } catch {}
    let old = null;
    for (const r of existing) {
      const data = JSON.parse(r);
      if (data.uid === uniqueId) {
        old = data;
        break;
      }
    }

    // update only if higher or new
    if (!old || safeScore > (old.score || 0)) {
      const entry = {
        uid: uniqueId,
        fid: safeFid,
        addr: safeAddr,
        name: safeName,
        score: safeScore,
        ts: Date.now()
      };
      await redis.zadd(key, { score: safeScore, member: JSON.stringify(entry) });
    }

    // trim to top 100
    const total = await redis.zcard(key);
    if (total > 100) await redis.zremrangebyrank(key, 0, total - 101);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, err:'server' });
  }
};
