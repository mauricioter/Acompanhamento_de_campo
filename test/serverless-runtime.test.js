const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");

const { resetBackendModules } = require("./helpers/backendTestUtils");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = async function runServerlessRuntimeTest() {
    const previousEnv = {
        VERCEL: process.env.VERCEL,
        DATABASE_PATH: process.env.DATABASE_PATH,
        DATABASE_BACKUP_DIR: process.env.DATABASE_BACKUP_DIR,
    };
    const expectedTmpRoot = path.join(os.tmpdir(), "controle-atendimentos-eace");

    delete process.env.DATABASE_PATH;
    delete process.env.DATABASE_BACKUP_DIR;
    process.env.VERCEL = "1";

    resetBackendModules(ROOT_DIR);

    try {
        const database = require("../backend/services/database");
        const whatsappService = require("../backend/services/whatsappService");

        assert.equal(
            path.normalize(database.DATABASE_PATH).startsWith(path.normalize(expectedTmpRoot)),
            true
        );
        assert.equal(
            path.normalize(database.BACKUP_DIR).startsWith(path.normalize(expectedTmpRoot)),
            true
        );

        const result = await whatsappService.openWhatsAppMessage("5511999999999", "Teste");
        assert.equal(result.statusCode, 200);
        assert.match(result.message, /Link do WhatsApp gerado/i);
        assert.match(result.url, /^https:\/\/wa\.me\//);
    } finally {
        if (previousEnv.VERCEL === undefined) {
            delete process.env.VERCEL;
        } else {
            process.env.VERCEL = previousEnv.VERCEL;
        }

        if (previousEnv.DATABASE_PATH === undefined) {
            delete process.env.DATABASE_PATH;
        } else {
            process.env.DATABASE_PATH = previousEnv.DATABASE_PATH;
        }

        if (previousEnv.DATABASE_BACKUP_DIR === undefined) {
            delete process.env.DATABASE_BACKUP_DIR;
        } else {
            process.env.DATABASE_BACKUP_DIR = previousEnv.DATABASE_BACKUP_DIR;
        }

        resetBackendModules(ROOT_DIR);
    }
};
