import { requestJson } from "./app/api.js";
import { THEME_STORAGE_KEY } from "./app/constants.js";
import { AuthScreen, Icon } from "./app/components.js";
import { DashboardApp } from "./app/dashboard.js";
import { createRoot, html, useEffect, useState } from "./app/shared.js";
import { getInitialTheme } from "./app/utils.js";

function App() {
    const [theme, setTheme] = useState(() => getInitialTheme(THEME_STORAGE_KEY));
    const [authState, setAuthState] = useState({
        loading: true,
        authenticated: false,
        setupRequired: false,
        user: null,
    });

    useEffect(() => {
        document.body.classList.toggle("theme-dark", theme === "dark");
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    async function refreshSession() {
        setAuthState((current) => ({ ...current, loading: true }));
        try {
            const data = await requestJson("/api/auth/session");
            setAuthState({
                loading: false,
                authenticated: Boolean(data.authenticated),
                setupRequired: Boolean(data.setupRequired),
                user: data.user || null,
            });
        } catch (_error) {
            setAuthState({
                loading: false,
                authenticated: false,
                setupRequired: false,
                user: null,
            });
        }
    }

    async function handleLogout() {
        try {
            await requestJson("/api/auth/logout", { method: "POST" });
        } catch (_error) {
        }
        setAuthState({
            loading: false,
            authenticated: false,
            setupRequired: false,
            user: null,
        });
        await refreshSession();
    }

    useEffect(() => {
        refreshSession();
    }, []);

    if (authState.loading) {
        return html`
            <main className="auth-shell auth-shell-loading">
                <section className="auth-card auth-card-loading">
                    <span className="section-kicker"><${Icon} name="target" />Verificando acesso</span>
                    <h2>Preparando ambiente seguro</h2>
                    <p>Aguarde enquanto a sessao do sistema e validada.</p>
                </section>
            </main>
        `;
    }

    if (!authState.authenticated) {
        return html`
            <${AuthScreen}
                theme=${theme}
                onToggleTheme=${() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                setupRequired=${authState.setupRequired}
                onAuthenticated=${refreshSession}
            />
        `;
    }

    return html`
        <${DashboardApp}
            currentUser=${authState.user}
            onLogout=${handleLogout}
            theme=${theme}
            onToggleTheme=${() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            onAuthFailure=${refreshSession}
        />
    `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
