const { getReportByDay } = require("./reportService");
const { queryAll, queryOne, runStatement } = require("./database");
const { openWhatsAppMessage, sanitizePhone } = require("./whatsappService");

const CONFIG_KEY = "whatsapp_automation";
const AUTOMATION_KEY = "whatsapp_daily_report";
const SCHEDULER_INTERVAL_MS = 60 * 1000;

const DEFAULT_CONFIG = {
    enabled: false,
    phone: "",
    scheduleMode: "interval",
    intervalHours: 3,
    fixedTimes: "09:00, 12:00, 15:00, 18:00",
    lastRunAt: null,
    lastAttemptAt: null,
    updatedAt: null,
};

let schedulerTimer = null;
let schedulerBusy = false;

function nowParts(date = new Date()) {
    const current = new Date(date);
    const safeDate = [
        current.getFullYear(),
        String(current.getMonth() + 1).padStart(2, "0"),
        String(current.getDate()).padStart(2, "0"),
    ].join("-");
    const safeTime = [
        String(current.getHours()).padStart(2, "0"),
        String(current.getMinutes()).padStart(2, "0"),
        String(current.getSeconds()).padStart(2, "0"),
    ].join(":");
    return {
        date: safeDate,
        time: safeTime,
        timestamp: `${safeDate} ${safeTime}`,
    };
}

function getTimeKey(date = new Date()) {
    return [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
    ].join(":");
}

function clampNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(numericValue)));
}

function parseFixedTimes(value) {
    const uniqueTimes = new Set(
        String(value || "")
            .split(",")
            .map((item) => item.trim())
            .filter((item) => /^\d{2}:\d{2}$/.test(item))
    );

    return [...uniqueTimes].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function formatFixedTimes(value) {
    const parsedTimes = parseFixedTimes(value);
    return parsedTimes.join(", ");
}

function parseConfigRow(row) {
    if (!row) {
        return {
            ...DEFAULT_CONFIG,
            nextRunAt: null,
            recentRuns: [],
        };
    }

    let parsedValue = {};
    try {
        parsedValue = JSON.parse(String(row.value || "{}"));
    } catch (_error) {
        parsedValue = {};
    }

    const config = sanitizeConfig({
        ...DEFAULT_CONFIG,
        ...parsedValue,
        updatedAt: String(row.updated_at || "") || null,
    });

    return {
        ...config,
        nextRunAt: calculateNextRunAt(config),
        recentRuns: [],
    };
}

function sanitizeConfig(payload = {}) {
    return {
        enabled: Boolean(payload.enabled),
        phone: sanitizePhone(payload.phone),
        scheduleMode: payload.scheduleMode === "fixed" ? "fixed" : "interval",
        intervalHours: clampNumber(payload.intervalHours, DEFAULT_CONFIG.intervalHours, 1, 24),
        fixedTimes: formatFixedTimes(payload.fixedTimes || DEFAULT_CONFIG.fixedTimes) || DEFAULT_CONFIG.fixedTimes,
        lastRunAt: String(payload.lastRunAt || "").trim() || null,
        lastAttemptAt: String(payload.lastAttemptAt || "").trim() || null,
        updatedAt: String(payload.updatedAt || "").trim() || null,
    };
}

function saveConfig(config) {
    const sanitized = sanitizeConfig(config);
    const timestamp = nowParts().timestamp;
    const payload = JSON.stringify({
        enabled: sanitized.enabled,
        phone: sanitized.phone,
        scheduleMode: sanitized.scheduleMode,
        intervalHours: sanitized.intervalHours,
        fixedTimes: sanitized.fixedTimes,
        lastRunAt: sanitized.lastRunAt,
        lastAttemptAt: sanitized.lastAttemptAt,
    });

    runStatement(
        `
        INSERT INTO configuracoes_app (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
        [CONFIG_KEY, payload, timestamp]
    );

    return {
        ...sanitized,
        updatedAt: timestamp,
    };
}

function listRecentRuns(limit = 10) {
    const rows = queryAll(
        `
        SELECT id, automation_key, trigger_mode, scheduled_key, report_day,
               target_phone, message_preview, status, error_message, created_at
        FROM automacao_execucoes
        WHERE automation_key = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        `,
        [AUTOMATION_KEY, clampNumber(limit, 10, 1, 20)]
    );

    return rows.map((row) => ({
        id: Number(row.id),
        automationKey: String(row.automation_key),
        triggerMode: String(row.trigger_mode),
        scheduledKey: String(row.scheduled_key || ""),
        reportDay: String(row.report_day || ""),
        targetPhone: String(row.target_phone || ""),
        messagePreview: String(row.message_preview || ""),
        status: String(row.status),
        errorMessage: String(row.error_message || ""),
        createdAt: String(row.created_at),
    }));
}

function getWhatsappAutomationConfig() {
    const row = queryOne(
        `
        SELECT key, value, updated_at
        FROM configuracoes_app
        WHERE key = ?
        `,
        [CONFIG_KEY]
    );

    const parsed = parseConfigRow(row);
    return {
        ...parsed,
        recentRuns: listRecentRuns(),
    };
}

function updateWhatsappAutomationConfig(payload = {}) {
    const currentConfig = getWhatsappAutomationConfig();
    const nextConfig = saveConfig({
        ...currentConfig,
        ...payload,
        recentRuns: undefined,
        nextRunAt: undefined,
    });

    return {
        ...nextConfig,
        nextRunAt: calculateNextRunAt(nextConfig),
        recentRuns: listRecentRuns(),
    };
}

function calculateNextRunAt(config, referenceDate = new Date()) {
    if (!config.enabled) {
        return null;
    }

    if (config.scheduleMode === "fixed") {
        const parsedTimes = parseFixedTimes(config.fixedTimes);
        if (!parsedTimes.length) {
            return null;
        }

        const candidates = [];
        for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
            const candidateDate = new Date(referenceDate);
            candidateDate.setDate(referenceDate.getDate() + dayOffset);
            for (const timeValue of parsedTimes) {
                const [hours, minutes] = timeValue.split(":").map(Number);
                const nextDate = new Date(candidateDate);
                nextDate.setHours(hours, minutes, 0, 0);
                if (nextDate.getTime() >= referenceDate.getTime()) {
                    candidates.push(nextDate);
                }
            }
        }

        const nextFixedRun = candidates.sort((left, right) => left.getTime() - right.getTime())[0];
        return nextFixedRun ? nextFixedRun.toISOString() : null;
    }

    const intervalMs = clampNumber(config.intervalHours, DEFAULT_CONFIG.intervalHours, 1, 24) * 60 * 60 * 1000;
    const anchor = config.lastAttemptAt || config.lastRunAt;
    if (!anchor) {
        return new Date(referenceDate.getTime() + intervalMs).toISOString();
    }
    return new Date(new Date(anchor).getTime() + intervalMs).toISOString();
}

function hasExecutionForScheduledKey(scheduledKey) {
    if (!String(scheduledKey || "").trim()) {
        return false;
    }

    const existing = queryOne(
        `
        SELECT id
        FROM automacao_execucoes
        WHERE automation_key = ?
          AND scheduled_key = ?
        LIMIT 1
        `,
        [AUTOMATION_KEY, scheduledKey]
    );

    return Boolean(existing);
}

function registerRun({
    triggerMode = "scheduled",
    scheduledKey = "",
    reportDay = "",
    targetPhone = "",
    messagePreview = "",
    status = "success",
    errorMessage = "",
}) {
    runStatement(
        `
        INSERT INTO automacao_execucoes (
            automation_key,
            trigger_mode,
            scheduled_key,
            report_day,
            target_phone,
            message_preview,
            status,
            error_message,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            AUTOMATION_KEY,
            triggerMode,
            String(scheduledKey || ""),
            String(reportDay || ""),
            String(targetPhone || ""),
            String(messagePreview || "").slice(0, 500),
            status,
            String(errorMessage || ""),
            nowParts().timestamp,
        ]
    );
}

function getDueScheduledExecution(config, currentDate = new Date()) {
    if (!config.enabled || !config.phone) {
        return null;
    }

    if (config.scheduleMode === "fixed") {
        const currentTimeKey = getTimeKey(currentDate);
        const fixedTimes = parseFixedTimes(config.fixedTimes);
        if (!fixedTimes.includes(currentTimeKey)) {
            return null;
        }

        const scheduledKey = `${nowParts(currentDate).date}-${currentTimeKey}`;
        if (hasExecutionForScheduledKey(scheduledKey)) {
            return null;
        }

        return {
            triggerMode: "scheduled",
            scheduledKey,
            reportDay: nowParts(currentDate).date,
            phone: config.phone,
        };
    }

    const intervalMs = clampNumber(config.intervalHours, DEFAULT_CONFIG.intervalHours, 1, 24) * 60 * 60 * 1000;
    const anchor = config.lastAttemptAt || config.lastRunAt;
    if (anchor) {
        const nextRunAt = new Date(anchor).getTime() + intervalMs;
        if (currentDate.getTime() < nextRunAt) {
            return null;
        }
    }

    return {
        triggerMode: "scheduled",
        scheduledKey: "",
        reportDay: nowParts(currentDate).date,
        phone: config.phone,
    };
}

async function executeWhatsappAutomation(options = {}) {
    const currentConfig = getWhatsappAutomationConfig();
    const triggerMode = options.triggerMode === "manual" ? "manual" : "scheduled";
    const scheduledKey = String(options.scheduledKey || "");
    const reportDay = String(options.reportDay || nowParts().date);
    const phone = sanitizePhone(options.phone || currentConfig.phone);
    const configPhone = phone || currentConfig.phone;

    if (!phone) {
        return {
            error: "Informe um numero de WhatsApp valido.",
            statusCode: 400,
        };
    }

    if (scheduledKey && hasExecutionForScheduledKey(scheduledKey)) {
        return {
            statusCode: 200,
            skipped: true,
            message: "Automacao ja executada para este horario.",
            automation: getWhatsappAutomationConfig(),
        };
    }

    const report = getReportByDay(reportDay);
    const messageText = String(report.whatsapp_text || "").trim();
    if (!messageText) {
        return {
            error: "Nao ha conteudo para enviar ao WhatsApp.",
            statusCode: 400,
        };
    }

    const attemptTimestamp = nowParts().timestamp;
    const attemptConfig = saveConfig({
        ...currentConfig,
        phone: configPhone,
        lastAttemptAt: attemptTimestamp,
    });

    const openResult = await openWhatsAppMessage(phone, messageText);
    if (openResult.error) {
        registerRun({
            triggerMode,
            scheduledKey,
            reportDay,
            targetPhone: phone,
            messagePreview: messageText,
            status: "error",
            errorMessage: openResult.error,
        });

        return {
            error: openResult.error,
            statusCode: openResult.statusCode,
            report,
            automation: {
                ...attemptConfig,
                nextRunAt: calculateNextRunAt(attemptConfig),
                recentRuns: listRecentRuns(),
            },
        };
    }

    const successTimestamp = nowParts().timestamp;
    const successConfig = saveConfig({
        ...attemptConfig,
        lastRunAt: successTimestamp,
        lastAttemptAt: successTimestamp,
    });

    registerRun({
        triggerMode,
        scheduledKey,
        reportDay,
        targetPhone: phone,
        messagePreview: messageText,
        status: "success",
    });

    return {
        statusCode: 200,
        message: openResult.message,
        url: openResult.url,
        report,
        automation: {
            ...successConfig,
            nextRunAt: calculateNextRunAt(successConfig),
            recentRuns: listRecentRuns(),
        },
    };
}

async function runPendingWhatsappAutomation() {
    if (schedulerBusy) {
        return;
    }

    schedulerBusy = true;
    try {
        const config = getWhatsappAutomationConfig();
        const dueExecution = getDueScheduledExecution(config);
        if (!dueExecution) {
            return;
        }

        const result = await executeWhatsappAutomation(dueExecution);
        if (result.error) {
            console.error("Falha na automacao de WhatsApp:", result.error);
        }
    } catch (error) {
        console.error("Falha ao verificar a automacao de WhatsApp:", error);
    } finally {
        schedulerBusy = false;
    }
}

function startWhatsappAutomationScheduler() {
    if (schedulerTimer) {
        return;
    }

    schedulerTimer = setInterval(() => {
        runPendingWhatsappAutomation();
    }, SCHEDULER_INTERVAL_MS);

    runPendingWhatsappAutomation();
}

function stopWhatsappAutomationScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

module.exports = {
    calculateNextRunAt,
    executeWhatsappAutomation,
    getWhatsappAutomationConfig,
    parseFixedTimes,
    runPendingWhatsappAutomation,
    startWhatsappAutomationScheduler,
    stopWhatsappAutomationScheduler,
    updateWhatsappAutomationConfig,
};
