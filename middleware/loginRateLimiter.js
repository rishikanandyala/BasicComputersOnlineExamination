function createLoginRateLimiter({
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  now = Date.now
} = {}) {
  const attempts = new Map();

  function middleware(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const currentTime = now();
    let record = attempts.get(key);

    if (!record || record.resetAt <= currentTime) {
      record = { count: 0, resetAt: currentTime + windowMs };
      attempts.set(key, record);
    }

    if (record.count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - currentTime) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many login attempts. Please wait before trying again.'
      });
    }

    record.count += 1;
    return next();
  }

  middleware.reset = (key) => attempts.delete(key);
  return middleware;
}

module.exports = createLoginRateLimiter;
