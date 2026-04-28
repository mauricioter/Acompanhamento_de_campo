const {
    executeWhatsappAutomation,
    getWhatsappAutomationConfig,
    updateWhatsappAutomationConfig,
} = require("../services/automationService");

function getWhatsappAutomationHandler(_request, response) {
    response.json(getWhatsappAutomationConfig());
}

function updateWhatsappAutomationHandler(request, response) {
    const automation = updateWhatsappAutomationConfig(request.body || {});
    response.status(200).json(automation);
}

async function runWhatsappAutomationHandler(request, response) {
    const result = await executeWhatsappAutomation({
        triggerMode: "manual",
        reportDay: request.body?.reportDay,
        phone: request.body?.phone,
    });

    if (result.error) {
        response.status(result.statusCode).json({
            error: result.error,
            automation: result.automation || getWhatsappAutomationConfig(),
        });
        return;
    }

    response.status(result.statusCode).json({
        message: result.message,
        url: result.url,
        report: result.report,
        automation: result.automation,
        skipped: Boolean(result.skipped),
    });
}

module.exports = {
    getWhatsappAutomationHandler,
    runWhatsappAutomationHandler,
    updateWhatsappAutomationHandler,
};
