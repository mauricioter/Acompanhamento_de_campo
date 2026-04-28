const { app } = require("../backend/app");
const { ensureRuntimeReady } = require("../backend/runtime");

module.exports = async (request, response) => {
    try {
        await ensureRuntimeReady();
        return app(request, response);
    } catch (error) {
        console.error("Falha ao inicializar a aplicacao:", error);

        if (response.headersSent) {
            return;
        }

        if (String(request.headers.accept || "").includes("text/html")) {
            response
                .status(500)
                .type("text/plain; charset=utf-8")
                .send("Falha interna do servidor.");
            return;
        }

        response.status(500).json({ error: "Falha interna do servidor." });
    }
};
