function createRateLimit({
    windowMs = 15 * 60 * 1000,
    max = 8,
    keySelector = (request) => request.ip,
    errorMessage = "Muitas tentativas. Aguarde antes de tentar novamente.",
} = {}) {
    const requests = new Map();

    return function rateLimitMiddleware(request, response, next) {
        const now = Date.now();
        const key = String(keySelector(request) || request.ip || "global");
        const current = requests.get(key);

        if (!current || now >= current.resetAt) {
            requests.set(key, {
                count: 1,
                resetAt: now + windowMs,
            });
            next();
            return;
        }

        if (current.count >= max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
            response.setHeader("Retry-After", String(retryAfterSeconds));
            response.status(429).json({
                error: errorMessage,
                retryAfterSeconds,
            });
            return;
        }

        current.count += 1;
        requests.set(key, current);
        next();
    };
}

module.exports = {
    createRateLimit,
};
