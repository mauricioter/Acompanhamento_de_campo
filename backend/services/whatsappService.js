const { spawn } = require("child_process");
const { isServerlessRuntime } = require("../environment");

const IS_SERVERLESS_RUNTIME = isServerlessRuntime();

function sanitizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
}

function shouldReturnUrlOnly() {
    return process.env.WHATSAPP_OPEN_MODE === "manual" || IS_SERVERLESS_RUNTIME;
}

function shouldSkipExternalOpen() {
    return process.env.WHATSAPP_OPEN_MODE === "mock"
        || process.env.NODE_ENV === "test"
        || shouldReturnUrlOnly();
}

function buildWhatsAppUrl(phone, text) {
    const normalizedPhone = sanitizePhone(phone);
    const encodedText = encodeURIComponent(String(text || "").trim());
    return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
}

function openExternalUrl(url) {
    return new Promise((resolve, reject) => {
        if (shouldSkipExternalOpen()) {
            resolve();
            return;
        }

        let command;
        let args;

        if (process.platform === "win32") {
            command = process.env.comspec || "cmd.exe";
            args = ["/c", "start", "", url];
        } else if (process.platform === "darwin") {
            command = "open";
            args = [url];
        } else {
            command = "xdg-open";
            args = [url];
        }

        const child = spawn(command, args, {
            detached: process.platform !== "win32",
            stdio: "ignore",
            windowsHide: true,
        });

        child.on("error", reject);
        child.on("spawn", () => {
            child.unref();
            resolve();
        });
    });
}

async function openWhatsAppMessage(phone, text) {
    const normalizedPhone = sanitizePhone(phone);
    if (!normalizedPhone) {
        return { error: "Informe um numero de WhatsApp valido.", statusCode: 400 };
    }

    const message = String(text || "").trim();
    if (!message) {
        return { error: "Nao ha conteudo para enviar ao WhatsApp.", statusCode: 400 };
    }

    const url = buildWhatsAppUrl(normalizedPhone, message);

    if (shouldReturnUrlOnly()) {
        return {
            statusCode: 200,
            message: "Link do WhatsApp gerado para abertura manual.",
            url,
        };
    }

    try {
        await openExternalUrl(url);
        return {
            statusCode: 200,
            message: "WhatsApp aberto com o relatorio pronto para envio.",
            url,
        };
    } catch (_error) {
        return {
            error: "Nao foi possivel abrir o WhatsApp automaticamente no sistema.",
            statusCode: 500,
        };
    }
}

module.exports = {
    buildWhatsAppUrl,
    openWhatsAppMessage,
    sanitizePhone,
};
