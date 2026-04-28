const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");
const { getWritableDataRoot, isServerlessRuntime } = require("../environment");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const IS_SERVERLESS_RUNTIME = isServerlessRuntime();
const DATA_ROOT_DIR = getWritableDataRoot(ROOT_DIR);
const BUNDLED_DATABASE_PATH = path.join(ROOT_DIR, "atendimentos.db");
const DEFAULT_DATABASE_PATH = path.join(DATA_ROOT_DIR, "atendimentos.db");
const DEFAULT_BACKUP_DIR = path.join(DATA_ROOT_DIR, "backups");
const DATABASE_PATH = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : DEFAULT_DATABASE_PATH;
const BACKUP_DIR = process.env.DATABASE_BACKUP_DIR
    ? path.resolve(process.env.DATABASE_BACKUP_DIR)
    : DEFAULT_BACKUP_DIR;
const MAX_BACKUPS = Number(process.env.DATABASE_MAX_BACKUPS || 10);
const SHOULD_CREATE_STARTUP_BACKUP = process.env.DATABASE_STARTUP_BACKUP === "true"
    ? true
    : process.env.DATABASE_STARTUP_BACKUP === "false"
        ? false
        : !IS_SERVERLESS_RUNTIME;
const REPAIRABLE_INDEX_INTEGRITY_ISSUE_PATTERNS = [
    /\bmissing from index\b/i,
    /\bwrong # of entries in index\b/i,
];

let db;
let serverlessStorageWarningShown = false;

function ensureDatabase() {
    if (!db) {
        throw new Error("Banco de dados ainda nao foi inicializado.");
    }
    return db;
}

function logServerlessStorageWarning() {
    if (
        serverlessStorageWarningShown
        || !IS_SERVERLESS_RUNTIME
        || process.env.DATABASE_PATH
    ) {
        return;
    }

    serverlessStorageWarningShown = true;
    console.warn(
        "Runtime serverless detectado. O SQLite sera executado em armazenamento temporario (/tmp), sem persistencia garantida entre novas instancias ou deploys."
    );
}

function normalizeParams(params = []) {
    return Array.isArray(params) ? params : [params];
}

function normalizeIntegrityCheckMessages(rows = []) {
    return rows
        .map((row) => String(row?.integrity_check || "").trim())
        .filter(Boolean);
}

function isIntegrityCheckOk(messages = []) {
    return messages.length === 1 && messages[0].toLowerCase() === "ok";
}

function canRepairIntegrityIssuesWithReindex(messages = []) {
    return messages.length > 0
        && !isIntegrityCheckOk(messages)
        && messages.every((message) =>
            REPAIRABLE_INDEX_INTEGRITY_ISSUE_PATTERNS.some((pattern) => pattern.test(message))
        );
}

function queryAll(sql, params = []) {
    const statement = ensureDatabase().prepare(sql);
    return statement.all(...normalizeParams(params));
}

function queryOne(sql, params = []) {
    const statement = ensureDatabase().prepare(sql);
    return statement.get(...normalizeParams(params)) || null;
}

function runStatement(sql, params = []) {
    const statement = ensureDatabase().prepare(sql);
    return statement.run(...normalizeParams(params));
}

function runInTransaction(callback) {
    const database = ensureDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
        const result = callback();
        database.exec("COMMIT");
        return result;
    } catch (error) {
        try {
            database.exec("ROLLBACK");
        } catch (_rollbackError) {
        }
        throw error;
    }
}

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

function backfillTimestampExpression() {
    return `
        CASE
            WHEN TRIM(COALESCE(data, '')) <> '' AND TRIM(COALESCE(hora_atualizacao, '')) <> ''
                THEN data || ' ' || hora_atualizacao
            WHEN TRIM(COALESCE(data, '')) <> ''
                THEN data || ' 00:00:00'
            ELSE STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
        END
    `;
}

function getTableColumns(tableName) {
    return queryAll(`PRAGMA table_info(${tableName})`).map((row) => String(row.name));
}

function ensureBaseTables() {
    ensureDatabase().exec(`
        CREATE TABLE IF NOT EXISTS atendimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inep TEXT NOT NULL UNIQUE,
            tecnico TEXT NOT NULL,
            status TEXT NOT NULL,
            observacao TEXT NOT NULL DEFAULT '',
            historico_observacoes TEXT NOT NULL DEFAULT '',
            agendado_para TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL,
            hora_atualizacao TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS sessoes (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS equipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            representante TEXT NOT NULL,
            tecnico TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS atendimento_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attendance_id INTEGER,
            inep TEXT NOT NULL,
            tecnico TEXT NOT NULL,
            status TEXT NOT NULL,
            observacao TEXT NOT NULL DEFAULT '',
            historico_observacoes TEXT NOT NULL DEFAULT '',
            agendado_para TEXT NOT NULL DEFAULT '',
            source_event TEXT NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            event_date TEXT NOT NULL,
            event_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (attendance_id) REFERENCES atendimentos(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS configuracoes_app (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS automacao_execucoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            automation_key TEXT NOT NULL,
            trigger_mode TEXT NOT NULL DEFAULT 'scheduled',
            scheduled_key TEXT NOT NULL DEFAULT '',
            report_day TEXT NOT NULL DEFAULT '',
            target_phone TEXT NOT NULL DEFAULT '',
            message_preview TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            error_message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON atendimentos(status);
        CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON atendimentos(data);
        CREATE INDEX IF NOT EXISTS idx_atendimentos_updated_at ON atendimentos(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_atendimentos_tecnico ON atendimentos(tecnico COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_eventos_attendance_id ON atendimento_eventos(attendance_id);
        CREATE INDEX IF NOT EXISTS idx_eventos_event_date ON atendimento_eventos(event_date, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_eventos_inep ON atendimento_eventos(inep, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_lookup
            ON automacao_execucoes(automation_key, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_automacao_execucoes_scheduled_key
            ON automacao_execucoes(automation_key, scheduled_key)
            WHERE TRIM(COALESCE(scheduled_key, '')) <> '';
    `);
}

function migrateLegacyColumns() {
    const attendanceColumns = getTableColumns("atendimentos");

    if (attendanceColumns.includes("hora_ultima_atualizacao") && !attendanceColumns.includes("hora_atualizacao")) {
        ensureDatabase().exec(`
            ALTER TABLE atendimentos
            ADD COLUMN hora_atualizacao TEXT NOT NULL DEFAULT ''
        `);
        ensureDatabase().exec(`
            UPDATE atendimentos
            SET hora_atualizacao = hora_ultima_atualizacao
            WHERE TRIM(COALESCE(hora_atualizacao, '')) = ''
        `);
    }

    if (!attendanceColumns.includes("historico_observacoes")) {
        ensureDatabase().exec(`
            ALTER TABLE atendimentos
            ADD COLUMN historico_observacoes TEXT NOT NULL DEFAULT ''
        `);
        ensureDatabase().exec(`
            UPDATE atendimentos
            SET historico_observacoes = observacao
            WHERE TRIM(COALESCE(observacao, '')) <> ''
              AND TRIM(COALESCE(historico_observacoes, '')) = ''
        `);
    }

    if (!attendanceColumns.includes("agendado_para")) {
        ensureDatabase().exec(`
            ALTER TABLE atendimentos
            ADD COLUMN agendado_para TEXT NOT NULL DEFAULT ''
        `);
    }

    if (!attendanceColumns.includes("created_at")) {
        ensureDatabase().exec(`
            ALTER TABLE atendimentos
            ADD COLUMN created_at TEXT NOT NULL DEFAULT ''
        `);
        ensureDatabase().exec(`
            UPDATE atendimentos
            SET created_at = ${backfillTimestampExpression()}
            WHERE TRIM(COALESCE(created_at, '')) = ''
        `);
    }

    if (!attendanceColumns.includes("updated_at")) {
        ensureDatabase().exec(`
            ALTER TABLE atendimentos
            ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''
        `);
        ensureDatabase().exec(`
            UPDATE atendimentos
            SET updated_at = ${backfillTimestampExpression()}
            WHERE TRIM(COALESCE(updated_at, '')) = ''
        `);
    }

    ensureDatabase().exec(`
        UPDATE atendimentos
        SET created_at = ${backfillTimestampExpression()}
        WHERE TRIM(COALESCE(created_at, '')) = ''
    `);
    ensureDatabase().exec(`
        UPDATE atendimentos
        SET updated_at = ${backfillTimestampExpression()}
        WHERE TRIM(COALESCE(updated_at, '')) = ''
    `);
}

function normalizeTimestampParts(timestampValue, fallbackDate, fallbackTime) {
    const timestamp = String(timestampValue || "").trim();
    const safeDate = String(fallbackDate || "").trim() || nowTimestamp().slice(0, 10);
    const safeTime = String(fallbackTime || "").trim() || "00:00:00";

    if (!timestamp) {
        return {
            createdAt: `${safeDate} ${safeTime}`,
            date: safeDate,
            time: safeTime,
        };
    }

    const [datePart, timePart = safeTime] = timestamp.split(" ");
    return {
        createdAt: `${datePart} ${timePart}`,
        date: datePart,
        time: timePart,
    };
}

function backfillAttendanceEvents() {
    const rows = queryAll(`
        SELECT id, inep, tecnico, status, observacao, historico_observacoes, agendado_para,
               data, hora_atualizacao, created_at, updated_at
        FROM atendimentos
        ORDER BY id ASC
    `);

    if (!rows.length) {
        return;
    }

    runInTransaction(() => {
        for (const row of rows) {
            const existing = queryOne(
                `
                SELECT id
                FROM atendimento_eventos
                WHERE attendance_id = ?
                LIMIT 1
                `,
                [row.id]
            );

            if (existing) {
                continue;
            }

            const eventParts = normalizeTimestampParts(
                row.updated_at || row.created_at,
                row.data,
                row.hora_atualizacao
            );

            runStatement(
                `
                INSERT INTO atendimento_eventos (
                    attendance_id,
                    inep,
                    tecnico,
                    status,
                    observacao,
                    historico_observacoes,
                    agendado_para,
                    source_event,
                    is_deleted,
                    event_date,
                    event_time,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    row.id,
                    String(row.inep),
                    String(row.tecnico),
                    String(row.status),
                    String(row.observacao || ""),
                    String(row.historico_observacoes || ""),
                    String(row.agendado_para || ""),
                    "backfill",
                    0,
                    eventParts.date,
                    eventParts.time,
                    eventParts.createdAt,
                ]
            );
        }
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

function getIntegrityCheckMessages() {
    return normalizeIntegrityCheckMessages(queryAll("PRAGMA integrity_check"));
}

function repairIndexesIfNeeded() {
    const integrityIssues = getIntegrityCheckMessages();
    if (isIntegrityCheckOk(integrityIssues)) {
        return;
    }

    const summarizedIssues = integrityIssues.slice(0, 5).join(" | ");
    if (!canRepairIntegrityIssuesWithReindex(integrityIssues)) {
        console.error(
            `Falha de integridade no banco detectada. Reparacao automatica indisponivel: ${summarizedIssues}`
        );
        return;
    }

    console.warn(
        `Falha de integridade em indices detectada (${integrityIssues.length} item(ns)). Executando REINDEX...`
    );

    try {
        ensureDatabase().exec("REINDEX");
    } catch (error) {
        console.error("Nao foi possivel reconstruir os indices do banco.", error);
        return;
    }

    const issuesAfterRepair = getIntegrityCheckMessages();
    if (!isIntegrityCheckOk(issuesAfterRepair)) {
        console.error(
            `REINDEX concluido, mas a integridade do banco ainda falhou: ${issuesAfterRepair.slice(0, 5).join(" | ")}`
        );
        return;
    }

    console.warn("Indices do banco reparados com sucesso.");
}

function pruneBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
        return;
    }

    const backups = fs
        .readdirSync(BACKUP_DIR)
        .map((fileName) => ({
            fileName,
            fullPath: path.join(BACKUP_DIR, fileName),
            stat: fs.statSync(path.join(BACKUP_DIR, fileName)),
        }))
        .filter((item) => item.stat.isFile())
        .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

    for (const backupFile of backups.slice(MAX_BACKUPS)) {
        fs.unlinkSync(backupFile.fullPath);
    }
}

function copyOptionalDatabaseSibling(sourcePath, targetPath) {
    if (!fs.existsSync(sourcePath)) {
        return;
    }

    fs.copyFileSync(sourcePath, targetPath);
}

function hydrateWritableDatabaseFromBundle() {
    if (!IS_SERVERLESS_RUNTIME || process.env.DATABASE_PATH) {
        return;
    }

    if (path.resolve(DATABASE_PATH) === path.resolve(BUNDLED_DATABASE_PATH)) {
        return;
    }

    if (fs.existsSync(DATABASE_PATH) || !fs.existsSync(BUNDLED_DATABASE_PATH)) {
        return;
    }

    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
    fs.copyFileSync(BUNDLED_DATABASE_PATH, DATABASE_PATH);
    copyOptionalDatabaseSibling(`${BUNDLED_DATABASE_PATH}-wal`, `${DATABASE_PATH}-wal`);
    copyOptionalDatabaseSibling(`${BUNDLED_DATABASE_PATH}-shm`, `${DATABASE_PATH}-shm`);
}

async function createStartupBackup() {
    if (!fs.existsSync(DATABASE_PATH)) {
        return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const timestamp = nowTimestamp().replace(/[: ]/g, "-");
    const databaseFileName = path.basename(DATABASE_PATH, path.extname(DATABASE_PATH));
    const backupPath = path.join(BACKUP_DIR, `${databaseFileName}-${timestamp}.db`);

    await backup(ensureDatabase(), backupPath);
    pruneBackups();
}

function configureDatabase() {
    ensureDatabase().exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
    `);
}

function initDb() {
    ensureBaseTables();
    migrateLegacyColumns();
    repairIndexesIfNeeded();
    backfillAttendanceEvents();
    clearExpiredSessions();
}

async function initializeDatabase() {
    if (db) {
        return db;
    }

    logServerlessStorageWarning();
    hydrateWritableDatabaseFromBundle();
    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
    db = new DatabaseSync(DATABASE_PATH);
    configureDatabase();
    initDb();
    if (SHOULD_CREATE_STARTUP_BACKUP) {
        await createStartupBackup();
    }
    return db;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    BACKUP_DIR,
    DATABASE_PATH,
    ROOT_DIR,
    canRepairIntegrityIssuesWithReindex,
    closeDatabase,
    initializeDatabase,
    isIntegrityCheckOk,
    normalizeIntegrityCheckMessages,
    queryAll,
    queryOne,
    runInTransaction,
    runStatement,
};
