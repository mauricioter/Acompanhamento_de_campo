const { isServerlessRuntime } = require("./environment");
const { stopWhatsappAutomationScheduler, startWhatsappAutomationScheduler } = require("./services/automationService");
const { closeDatabase, initializeDatabase } = require("./services/database");

const IS_SERVERLESS_RUNTIME = isServerlessRuntime();

let runtimeReadyPromise = null;
let schedulerStarted = false;

async function ensureRuntimeReady(options = {}) {
    const { startScheduler = !IS_SERVERLESS_RUNTIME } = options;

    if (!runtimeReadyPromise) {
        runtimeReadyPromise = initializeDatabase().catch((error) => {
            runtimeReadyPromise = null;
            throw error;
        });
    }

    await runtimeReadyPromise;

    if (startScheduler && !schedulerStarted) {
        startWhatsappAutomationScheduler();
        schedulerStarted = true;
    }
}

function stopRuntime() {
    if (schedulerStarted) {
        stopWhatsappAutomationScheduler();
        schedulerStarted = false;
    }

    closeDatabase();
    runtimeReadyPromise = null;
}

module.exports = {
    IS_SERVERLESS_RUNTIME,
    ensureRuntimeReady,
    stopRuntime,
};
