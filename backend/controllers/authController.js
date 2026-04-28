const {
    buildExpiredSessionCookie,
    buildSessionCookie,
    changePassword,
    createInitialUser,
    isSetupRequired,
    login,
    logout,
    updateUsername,
} = require("../services/authService");

function getSessionHandler(request, response) {
    response.json({
        authenticated: Boolean(request.authUser),
        setupRequired: isSetupRequired(),
        user: request.authUser || null,
    });
}

function setupHandler(request, response) {
    const result = createInitialUser(request.body || {});
    if (result.error) {
        response.status(result.statusCode).json({
            error: result.error,
            setupRequired: isSetupRequired(),
        });
        return;
    }

    const loginResult = login(request.body || {});
    if (loginResult.error) {
        response.status(loginResult.statusCode).json({
            error: loginResult.error,
            setupRequired: isSetupRequired(),
        });
        return;
    }

    response.setHeader("Set-Cookie", buildSessionCookie(loginResult.session.token));
    response.status(201).json({
        user: loginResult.user,
        setupRequired: false,
        authenticated: true,
    });
}

function loginHandler(request, response) {
    const result = login(request.body || {});
    if (result.error) {
        response.status(result.statusCode).json({
            error: result.error,
            setupRequired: Boolean(result.setupRequired),
        });
        return;
    }

    response.setHeader("Set-Cookie", buildSessionCookie(result.session.token));
    response.status(result.statusCode).json({
        user: result.user,
        authenticated: true,
        setupRequired: false,
    });
}

function logoutHandler(request, response) {
    logout(request);
    response.setHeader("Set-Cookie", buildExpiredSessionCookie());
    response.status(200).json({
        authenticated: false,
        setupRequired: isSetupRequired(),
    });
}

function changePasswordHandler(request, response) {
    const result = changePassword(
        request.authUser.id,
        request.body?.currentPassword,
        request.body?.nextPassword
    );

    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }

    response.status(200).json({ message: "Senha atualizada com sucesso." });
}

function changeUsernameHandler(request, response) {
    const result = updateUsername(
        request.authUser.id,
        request.body?.currentPassword,
        request.body?.nextUsername
    );

    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }

    response.status(200).json({
        message: "Nome de usuario atualizado com sucesso.",
        user: result.user,
    });
}

module.exports = {
    changePasswordHandler,
    changeUsernameHandler,
    getSessionHandler,
    loginHandler,
    logoutHandler,
    setupHandler,
};
