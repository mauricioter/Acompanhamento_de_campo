const express = require("express");
const {
    changePasswordHandler,
    changeUsernameHandler,
    getSessionHandler,
    loginHandler,
    logoutHandler,
    setupHandler,
} = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");
const { createRateLimit } = require("../middleware/rateLimitMiddleware");

const router = express.Router();
const authAttemptRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    keySelector: (request) => {
        const username = String(request.body?.username || "").trim().toLowerCase();
        return `${request.ip}:${username || "anon"}`;
    },
    errorMessage: "Muitas tentativas de autenticacao. Aguarde alguns minutos e tente novamente.",
});

router.get("/session", getSessionHandler);
router.post("/setup", authAttemptRateLimit, setupHandler);
router.post("/login", authAttemptRateLimit, loginHandler);
router.post("/logout", logoutHandler);
router.post("/change-password", requireAuth, changePasswordHandler);
router.post("/change-username", requireAuth, changeUsernameHandler);

module.exports = router;
