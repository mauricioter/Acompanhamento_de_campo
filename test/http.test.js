const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const assert = require("node:assert/strict");

const { createTempWorkspace } = require("./helpers/backendTestUtils");

const ROOT_DIR = path.resolve(__dirname, "..");

function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/health`);
            if (response.ok) {
                return;
            }
        } catch (_error) {
        }
        await delay(250);
    }
    throw new Error(`Servidor nao respondeu em ${timeoutMs}ms`);
}

function createCookieJar() {
    const cookies = new Map();
    return {
        apply(headers = {}) {
            if (!cookies.size) {
                return headers;
            }

            return {
                ...headers,
                cookie: [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; "),
            };
        },
        capture(response) {
            const setCookies = typeof response.headers.getSetCookie === "function"
                ? response.headers.getSetCookie()
                : [];

            for (const cookie of setCookies) {
                const [cookiePair] = cookie.split(";");
                const separatorIndex = cookiePair.indexOf("=");
                if (separatorIndex === -1) {
                    continue;
                }
                const name = cookiePair.slice(0, separatorIndex).trim();
                const value = cookiePair.slice(separatorIndex + 1).trim();
                cookies.set(name, value);
            }
        },
    };
}

async function requestJsonWithJar(baseUrl, jar, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: jar.apply(options.headers),
    });
    jar.capture(response);

    let data = {};
    try {
        data = await response.json();
    } catch (_error) {
        data = {};
    }

    return {
        status: response.status,
        data,
    };
}

async function requestTextWithJar(baseUrl, jar, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: jar.apply(options.headers),
    });
    jar.capture(response);

    return {
        status: response.status,
        text: await response.text(),
        headers: response.headers,
    };
}

module.exports = async function runHttpTest() {
    const tempDir = createTempWorkspace();
    const databasePath = path.join(tempDir, "http.db");
    const backupDir = path.join(tempDir, "backups");
    const port = 43127;
    const baseUrl = `http://127.0.0.1:${port}`;

    const server = spawn(process.execPath, [path.join(ROOT_DIR, "backend", "server.js")], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(port),
            DATABASE_PATH: databasePath,
            DATABASE_BACKUP_DIR: backupDir,
            NODE_ENV: "test",
            WHATSAPP_OPEN_MODE: "mock",
        },
        stdio: "ignore",
    });

    try {
        await waitForHealth(baseUrl);
        const jar = createCookieJar();

        const unauthorized = await requestJsonWithJar(baseUrl, jar, "/api/atendimentos");
        assert.equal(unauthorized.status, 409);
        assert.equal(unauthorized.data.setupRequired, true);

        const setup = await requestJsonWithJar(baseUrl, jar, "/api/auth/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "admin",
                password: "senha-forte-123",
            }),
        });
        assert.equal(setup.status, 201);
        assert.equal(setup.data.authenticated, true);

        const session = await requestJsonWithJar(baseUrl, jar, "/api/auth/session");
        assert.equal(session.status, 200);
        assert.equal(session.data.user.username, "admin");

        const automationUpdate = await requestJsonWithJar(baseUrl, jar, "/api/automation/whatsapp", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                enabled: true,
                phone: "5511999999999",
                scheduleMode: "interval",
                intervalHours: 3,
                fixedTimes: "09:00, 12:00, 15:00",
            }),
        });
        assert.equal(automationUpdate.status, 200);
        assert.equal(automationUpdate.data.enabled, true);
        assert.equal(automationUpdate.data.phone, "5511999999999");

        const createdItems = [];
        for (let index = 0; index < 12; index += 1) {
            const created = await requestJsonWithJar(baseUrl, jar, "/api/atendimentos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    inep: String(50035050 + index),
                    tecnico: `Tecnico ${index}`,
                    status: "Em atendimento",
                    observacao: `Registro ${index}`,
                    agendado_para: "",
                }),
            });
            assert.equal(created.status, 201);
            createdItems.push(created.data.item);
        }

        const firstTeamBatch = await requestJsonWithJar(baseUrl, jar, "/api/equipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                representante: "Representante A",
                tecnicos: "Tecnico 0\nTecnico 1\nTecnico 2",
            }),
        });
        assert.equal(firstTeamBatch.status, 201);
        assert.equal(firstTeamBatch.data.items.length, 3);

        const secondTeamBatch = await requestJsonWithJar(baseUrl, jar, "/api/equipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                representante: "Representante A",
                tecnicos: "Tecnico 3; Tecnico 4",
            }),
        });
        assert.equal(secondTeamBatch.status, 200);
        assert.equal(secondTeamBatch.data.items.length, 2);

        const compatibilityTeamBatch = await requestJsonWithJar(baseUrl, jar, "/api/equipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                representante: "Representante B",
                technicians: ["Tecnico 5", "Tecnico 6"],
            }),
        });
        assert.equal(compatibilityTeamBatch.status, 201);
        assert.equal(compatibilityTeamBatch.data.items.length, 2);

        const teams = await requestJsonWithJar(baseUrl, jar, "/api/equipes");
        assert.equal(teams.status, 200);
        assert.equal(teams.data.total_representatives, 2);
        assert.equal(teams.data.groups[0].representante, "Representante A");
        assert.equal(teams.data.groups[0].total, 5);

        const tomorrow = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
        const updatedForReport = await requestJsonWithJar(
            baseUrl,
            jar,
            `/api/atendimentos/${createdItems[0].id}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "Reagendar",
                    tecnico: "Tecnico 0",
                    nova_observacao: "Necessario reagendar com a unidade.",
                    agendado_para: tomorrow,
                }),
            }
        );
        assert.equal(updatedForReport.status, 200);

        const quickViewToday = await requestJsonWithJar(baseUrl, jar, "/api/atendimentos?quickView=today");
        assert.equal(quickViewToday.status, 200);
        assert.equal(quickViewToday.data.pagination.totalItems, 12);

        const quickViewActive = await requestJsonWithJar(baseUrl, jar, "/api/atendimentos?quickView=active");
        assert.equal(quickViewActive.status, 200);
        assert.equal(quickViewActive.data.pagination.totalItems, 11);

        const paginated = await requestJsonWithJar(baseUrl, jar, "/api/atendimentos?page=1&pageSize=10&sortBy=inep&sortDir=asc");
        assert.equal(paginated.status, 200);
        assert.equal(paginated.data.items.length, 10);
        assert.equal(paginated.data.pagination.totalItems, 12);
        assert.equal(paginated.data.pagination.totalPages, 2);
        assert.equal(paginated.data.items[0].representante, "Representante A");

        const dailyReport = await requestJsonWithJar(
            baseUrl,
            jar,
            `/api/relatorios/diario?day=${new Date().toISOString().slice(0, 10)}`
        );
        assert.equal(dailyReport.status, 200);
        assert.equal(Array.isArray(dailyReport.data.problem_items), true);
        assert.equal(
            dailyReport.data.problem_items.some((item) => item.problemLabel === "Reagendar"),
            true
        );
        assert.equal(Array.isArray(dailyReport.data.grouped_by_status), true);
        assert.equal(
            dailyReport.data.grouped_by_status.find((group) => group.status === "Reagendar")?.ineps.includes("50035050"),
            true
        );

        const exported = await requestTextWithJar(baseUrl, jar, "/api/atendimentos/exportar?sortBy=inep&sortDir=asc");
        assert.equal(exported.status, 200);
        assert.match(exported.headers.get("content-type") || "", /(xml|excel)/i);
        assert.match(exported.text, /<Workbook[\s>]/);
        assert.match(exported.text, /<Table[\s>]/);
        assert.match(exported.text, /Representante A/);
        assert.match(exported.text, /50035050/);
        assert.match(exported.text, /50035061/);

        const powerBiExport = await requestTextWithJar(baseUrl, jar, "/api/atendimentos/exportar/power-bi");
        assert.equal(powerBiExport.status, 200);
        assert.match(powerBiExport.headers.get("content-type") || "", /application\/json/i);
        const powerBiData = JSON.parse(powerBiExport.text);
        assert.equal(Array.isArray(powerBiData.atendimentos), true);
        assert.equal(Array.isArray(powerBiData.eventos), true);
        assert.equal(Array.isArray(powerBiData.equipes), true);
        assert.equal(powerBiData.equipes.length, 7);
        assert.equal(
            powerBiData.atendimentos.find((item) => item.tecnico === "Tecnico 0")?.representante,
            "Representante A"
        );
        assert.equal(
            powerBiData.atendimentos.find((item) => item.tecnico === "Tecnico 6")?.representante,
            "Representante B"
        );

        const manualRun = await requestJsonWithJar(baseUrl, jar, "/api/automation/whatsapp/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reportDay: new Date().toISOString().slice(0, 10),
                phone: "5511999999999",
            }),
        });
        assert.equal(manualRun.status, 200);
        assert.equal(manualRun.data.automation.recentRuns.length >= 1, true);

        const automationReadback = await requestJsonWithJar(baseUrl, jar, "/api/automation/whatsapp");
        assert.equal(automationReadback.status, 200);
        assert.equal(automationReadback.data.recentRuns.length >= 1, true);
        assert.equal(automationReadback.data.phone, "5511999999999");
    } finally {
        server.kill("SIGTERM");
        await delay(500);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};
