export async function requestJson(url, options = {}) {
    const config = {
        ...options,
        credentials: "same-origin",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {}),
        },
    };
    const response = await fetch(url, config);
    let data = {};

    try {
        data = await response.json();
    } catch (_error) {
        data = {};
    }

    if (!response.ok) {
        const error = new Error(data.error || "Nao foi possivel concluir a operacao.");
        error.status = response.status;
        error.setupRequired = Boolean(data.setupRequired);
        error.authenticated = Boolean(data.authenticated);
        error.retryAfterSeconds = Number(data.retryAfterSeconds || 0);
        throw error;
    }

    return data;
}

export function isAuthError(error) {
    return error?.status === 401 || error?.status === 409;
}
