const {
    buildExpiredSessionCookie,
    getCurrentUserFromRequest,
    isSetupRequired,
} = require("../services/authService");

function attachCurrentUser(request, _response, next) {
    request.authUser = getCurrentUserFromRequest(request);
    next();
}

function requireAuth(request, response, next) {
    if (request.authUser) {
        next();
        return;
    }

    const setupRequired = isSetupRequired();

    if (!setupRequired) {
        response.setHeader("Set-Cookie", buildExpiredSessionCookie());
    }

    response.status(setupRequired ? 409 : 401).json({
        error: setupRequired
            ? "Configure o usuario administrador antes de acessar o sistema."
            : "Sessao expirada ou usuario nao autenticado.",
        authenticated: false,
        setupRequired,
    });
}

module.exports = {
    attachCurrentUser,
    requireAuth,
};
