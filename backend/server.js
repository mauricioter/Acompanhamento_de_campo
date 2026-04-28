const { app } = require("./app");
const { ensureRuntimeReady, stopRuntime } = require("./runtime");

const BASE_PORT = Number(process.env.PORT || 3001);
const MAX_PORT_ATTEMPTS = 10;
let activeServer = null;
let shuttingDown = false;

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
    await ensureRuntimeReady({ startScheduler: true });
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

    const finishShutdown = () => {
        stopRuntime();
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
