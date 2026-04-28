const express = require("express");
const {
    getWhatsappAutomationHandler,
    runWhatsappAutomationHandler,
    updateWhatsappAutomationHandler,
} = require("../controllers/automationController");

const router = express.Router();

router.get("/automation/whatsapp", getWhatsappAutomationHandler);
router.put("/automation/whatsapp", updateWhatsappAutomationHandler);
router.post("/automation/whatsapp/run", runWhatsappAutomationHandler);

module.exports = router;
