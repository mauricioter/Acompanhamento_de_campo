const express = require("express");
const path = require("path");

const { attachCurrentUser, requireAuth } = require("./middleware/authMiddleware");
const { applySecurityHeaders } = require("./middleware/securityMiddleware");
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const automationRoutes = require("./routes/automationRoutes");
const { ROOT_DIR } = require("./services/database");

const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const VENDOR_FILES = {
    "react.js": path.join(ROOT_DIR, "node_modules", "react", "umd", "react.production.min.js"),
    "react-dom.js": path.join(ROOT_DIR, "node_modules", "react-dom", "umd", "react-dom.production.min.js"),
    "htm.js": path.join(ROOT_DIR, "node_modules", "htm", "dist", "htm.umd.js"),
};

const app = express();

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

app.use("/api", (_request, response) => {
    response.status(404).json({ error: "Recurso nao encontrado." });
});

app.use((_request, response) => {
    response.status(404).sendFile(path.join(FRONTEND_DIR, "404.html"));
});

app.use((error, request, response, _next) => {
    console.error("Erro ao processar a requisicao:", error);

    if (response.headersSent) {
        return;
    }

    if (request.path.startsWith("/api/")) {
        response.status(500).json({ error: "Falha interna do servidor." });
        return;
    }

    response
        .status(500)
        .type("text/plain; charset=utf-8")
        .send("Falha interna do servidor.");
});

module.exports = {
    app,
};
