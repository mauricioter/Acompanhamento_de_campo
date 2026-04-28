const crypto = require("crypto");

const {
    queryAll,
    queryOne,
    runStatement,
} = require("./database");

const SESSION_COOKIE_NAME = "controle_session";
const SESSION_TTL_DAYS = 14;

function nowTimestamp() {
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const time = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join(":");
    return `${date} ${time}`;
}

function addDaysToTimestamp(daysToAdd) {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-") + ` ${[
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
    ].join(":")}`;
}

function sanitizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

function validateCredentials(username, password) {
    if (!sanitizeUsername(username)) {
        return "Informe o usuario.";
    }
    if (!String(password || "").trim()) {
        return "Informe a senha.";
    }
    return null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const iterations = 120000;
    const hashed = crypto.pbkdf2Sync(String(password), salt, iterations, 64, "sha512").toString("hex");
    return `pbkdf2$${iterations}$${salt}$${hashed}`;
}

function verifyPassword(password, storedHash) {
    const [algorithm, rawIterations, salt, storedValue] = String(storedHash || "").split("$");
    if (algorithm !== "pbkdf2" || !rawIterations || !salt || !storedValue) {
        return false;
    }

    const computedValue = crypto
        .pbkdf2Sync(String(password), salt, Number(rawIterations), 64, "sha512")
        .toString("hex");

    const storedBuffer = Buffer.from(storedValue, "hex");
    const computedBuffer = Buffer.from(computedValue, "hex");

    if (storedBuffer.length !== computedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(storedBuffer, computedBuffer);
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function parseCookies(cookieHeader) {
    return String(cookieHeader || "")
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .reduce((accumulator, entry) => {
            const separatorIndex = entry.indexOf("=");
            if (separatorIndex === -1) {
                return accumulator;
            }
            const key = entry.slice(0, separatorIndex).trim();
            const value = entry.slice(separatorIndex + 1).trim();
            accumulator[key] = decodeURIComponent(value);
            return accumulator;
        }, {});
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(String(value || ""))}`];

    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${options.maxAge}`);
    }
    if (options.httpOnly !== false) {
        parts.push("HttpOnly");
    }
    if (options.sameSite) {
        parts.push(`SameSite=${options.sameSite}`);
    }
    if (options.path) {
        parts.push(`Path=${options.path}`);
    }
    if (options.secure) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

function buildSessionCookie(token) {
    return serializeCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
}

function buildExpiredSessionCookie() {
    return serializeCookie(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
    });
}

function clearExpiredSessions() {
    runStatement(
        `
        DELETE FROM sessoes
        WHERE DATETIME(expires_at) <= DATETIME('now', 'localtime')
        `
    );
}

function isSetupRequired() {
    const row = queryOne("SELECT COUNT(*) AS total FROM usuarios");
    return Number(row?.total || 0) === 0;
}

function getCurrentUserFromRequest(request) {
    const cookies = parseCookies(request.headers.cookie);
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) {
        return null;
    }

    const tokenHash = hashSessionToken(sessionToken);
    const row = queryOne(
        `
        SELECT u.id, u.username, s.expires_at
        FROM sessoes s
        JOIN usuarios u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND DATETIME(s.expires_at) > DATETIME('now', 'localtime')
        `,
        [tokenHash]
    );

    if (!row) {
        return null;
    }

    return {
        id: Number(row.id),
        username: row.username,
        expires_at: row.expires_at,
    };
}

function createInitialUser({ username, password }) {
    if (!isSetupRequired()) {
        return {
            error: "O sistema ja possui um usuario configurado.",
            statusCode: 409,
        };
    }

    const validationError = validateCredentials(username, password);
    if (validationError) {
        return { error: validationError, statusCode: 400 };
    }

    if (String(password || "").trim().length < 8) {
        return {
            error: "A senha inicial deve ter pelo menos 8 caracteres.",
            statusCode: 400,
        };
    }

    const normalizedUsername = sanitizeUsername(username);
    const now = nowTimestamp();
    runStatement(
        `
        INSERT INTO usuarios (username, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        `,
        [normalizedUsername, hashPassword(password), now, now]
    );

    return {
        statusCode: 201,
        user: {
            username: normalizedUsername,
        },
    };
}

function createSessionForUser(userId) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = addDaysToTimestamp(SESSION_TTL_DAYS);
    runStatement(
        `
        INSERT INTO sessoes (token_hash, user_id, expires_at)
        VALUES (?, ?, ?)
        `,
        [hashSessionToken(rawToken), userId, expiresAt]
    );
    return {
        token: rawToken,
        expiresAt,
    };
}

function login({ username, password }) {
    clearExpiredSessions();

    if (isSetupRequired()) {
        return {
            error: "Configure o usuario administrador antes de entrar.",
            statusCode: 409,
            setupRequired: true,
        };
    }

    const validationError = validateCredentials(username, password);
    if (validationError) {
        return { error: validationError, statusCode: 400 };
    }

    const normalizedUsername = sanitizeUsername(username);
    const user = queryOne(
        `
        SELECT id, username, password_hash
        FROM usuarios
        WHERE username = ?
        `,
        [normalizedUsername]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
        return {
            error: "Usuario ou senha invalidos.",
            statusCode: 401,
        };
    }

    const session = createSessionForUser(Number(user.id));
    return {
        statusCode: 200,
        user: {
            id: Number(user.id),
            username: user.username,
        },
        session,
    };
}

function logout(request) {
    const cookies = parseCookies(request.headers.cookie);
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) {
        return { statusCode: 200 };
    }

    runStatement("DELETE FROM sessoes WHERE token_hash = ?", [hashSessionToken(sessionToken)]);
    return { statusCode: 200 };
}

function changePassword(userId, currentPassword, nextPassword) {
    if (!String(nextPassword || "").trim() || String(nextPassword).trim().length < 8) {
        return {
            error: "A nova senha deve ter pelo menos 8 caracteres.",
            statusCode: 400,
        };
    }

    const user = queryOne(
        `
        SELECT id, password_hash
        FROM usuarios
        WHERE id = ?
        `,
        [userId]
    );

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        return {
            error: "A senha atual esta incorreta.",
            statusCode: 401,
        };
    }

    runStatement(
        `
        UPDATE usuarios
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
        `,
        [hashPassword(nextPassword), nowTimestamp(), userId]
    );

    return { statusCode: 200 };
}

function updateUsername(userId, currentPassword, nextUsername) {
    const normalizedUsername = sanitizeUsername(nextUsername);
    if (!normalizedUsername) {
        return {
            error: "Informe o novo nome de usuario.",
            statusCode: 400,
        };
    }

    const user = queryOne(
        `
        SELECT id, username, password_hash
        FROM usuarios
        WHERE id = ?
        `,
        [userId]
    );

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        return {
            error: "A senha atual esta incorreta.",
            statusCode: 401,
        };
    }

    if (normalizedUsername === String(user.username || "").trim().toLowerCase()) {
        return {
            error: "Informe um nome de usuario diferente do atual.",
            statusCode: 400,
        };
    }

    const existingUser = queryOne(
        `
        SELECT id
        FROM usuarios
        WHERE username = ?
          AND id <> ?
        `,
        [normalizedUsername, userId]
    );

    if (existingUser) {
        return {
            error: "Esse nome de usuario ja esta em uso.",
            statusCode: 409,
        };
    }

    runStatement(
        `
        UPDATE usuarios
        SET username = ?, updated_at = ?
        WHERE id = ?
        `,
        [normalizedUsername, nowTimestamp(), userId]
    );

    return {
        statusCode: 200,
        user: {
            id: Number(userId),
            username: normalizedUsername,
        },
    };
}

module.exports = {
    SESSION_COOKIE_NAME,
    buildExpiredSessionCookie,
    buildSessionCookie,
    changePassword,
    createInitialUser,
    getCurrentUserFromRequest,
    isSetupRequired,
    login,
    logout,
    updateUsername,
};
