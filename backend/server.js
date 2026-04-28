const express = require("express");
const path = require("path");

const { attachCurrentUser, requireAuth } = require("./middleware/authMiddleware");
const { applySecurityHeaders } = require("./middleware/securityMiddleware");
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const automationRoutes = require("./routes/automationRoutes");
const { startWhatsappAutomationScheduler, stopWhatsappAutomationScheduler } = require("./services/automationService");
const { closeDatabase, initializeDatabase, ROOT_DIR } = require("./services/database");

const app = express();
const BASE_PORT = Number(process.env.PORT || 3001);
const MAX_PORT_ATTEMPTS = 10;
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
let activeServer = null;
let shuttingDown = false;
const VENDOR_FILES = {
    "react.js": path.join(ROOT_DIR, "node_modules", "react", "umd", "react.production.min.js"),
    "react-dom.js": path.join(ROOT_DIR, "node_modules", "react-dom", "umd", "react-dom.production.min.js"),
    "htm.js": path.join(ROOT_DIR, "node_modules", "htm", "dist", "htm.umd.js"),
};

app.disable("x-powered-by");
app.use(applySecurityHeaders);
app.use(express.json({ limit: "200kb" }));
app.use(attachCurrentUser);
app.use("/frontend", express.static(FRONTEND_DIR));

app.get("/vendor/:asset", (request, response) => {
    const vendorFile = VENDOR_FILES[request.params.asset];
    if (!vendorFile) {
        response.status(404).json({ error: "Arquivo de vendor nao encontrado." });
        return;
    }

    response.sendFile(vendorFile);
});

app.get("/", (_request, response) => {
    response.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/health", (_request, response) => {
    response.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", requireAuth, attendanceRoutes);
app.use("/api", requireAuth, automationRoutes);

function listenOnAvailablePort(startPort, attemptsLeft = MAX_PORT_ATTEMPTS) {
    return new Promise((resolve, reject) => {
        const server = app.listen(startPort, () => {
            console.log(`Servidor rodando em http://localhost:${startPort}`);
            resolve(server);
        });

        server.on("error", (error) => {
            server.close();

            if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
                const nextPort = startPort + 1;
                console.warn(
                    `Porta ${startPort} ocupada. Tentando iniciar automaticamente na porta ${nextPort}...`
                );
                resolve(listenOnAvailablePort(nextPort, attemptsLeft - 1));
                return;
            }

            if (error.code === "EADDRINUSE") {
                reject(
                    new Error(
                        `Nenhuma porta disponivel entre ${BASE_PORT} e ${startPort}. Encerre o processo em uso ou defina outra porta na variavel PORT.`
                    )
                );
                return;
            }

            reject(error);
        });
    });
}

async function startServer() {
    await initializeDatabase();
    startWhatsappAutomationScheduler();
    activeServer = await listenOnAvailablePort(BASE_PORT);
}

startServer().catch((error) => {
    console.error("Falha ao iniciar o servidor:", error);
    process.exit(1);
});

function shutdown() {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    stopWhatsappAutomationScheduler();
    const finishShutdown = () => {
        closeDatabase();
        process.exit(0);
    };

    if (activeServer) {
        activeServer.close(() => {
            activeServer = null;
            finishShutdown();
        });
        setTimeout(finishShutdown, 1000).unref();
        return;
    }

    finishShutdown();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
