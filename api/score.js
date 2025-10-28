const { Redis } = require('@upstash/redis');

function getRedis(res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    res.status(500).json({ ok: false, err: 'missing Upstash env' });
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
    if (typeof score !== 'number') return res.status(400).json({ ok: false, err: 'bad body' });

    // Validate incoming data
    if (!name || (!addr && !fid)) {
      return res.status(400).json({ ok: false, err: 'missing name or identity (addr/fid)' });
    }

    const safeScore = Math.max(0, Math.min(999999, score | 0));
    const safeName = String(name || 'guest').slice(0, 32);
    const safeAddr = String(addr || '').toLowerCase();
    const safeFid = fid ? String(fid) : null;

    // Use fid or addr as unique ID
    const uniqueId = safeFid ? `fid:${safeFid}` : (safeAddr || `anon:${safeName}`);
    const userKey = `user:${uniqueId}`;

    // Log for debugging
    console.log('[debug] uniqueId:', uniqueId, 'score:', safeScore);

    // Check the existing score for this user (if any)
    const existingScore = await redis.hget(userKey, 'score');
    const existingName = await redis.hget(userKey, 'name');

    // If there's no existing score or the new score is higher, update
    if (!existingScore || safeScore > Number(existingScore)) {
      // Update the Redis hash with the new score and name
      await redis.hmset(userKey, {
        score: safeScore,
        name: safeName,
        addr: safeAddr,
        fid: safeFid,
      });
      console.log('[debug] Updated score for:', uniqueId);
    }

    // Trim to top 100 (optional: if needed to limit)
    const total = await redis.hlen('leaderboard');
    if (total > 100) await redis.hdel('leaderboard', userKey);  // Optional trim

    res.json({ ok: true });
  } catch (e) {
    console.error('[ERROR] Failed to submit score:', e);
    res.status(500).json({ ok: false, err: 'server error' });
  }
};
