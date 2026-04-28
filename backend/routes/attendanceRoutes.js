const express = require("express");
const {
    createAttendanceHandler,
    deleteAttendanceHandler,
    exportAttendancesExcelXmlHandler,
    exportPowerBiDatasetHandler,
    getDailyReportHandler,
    getReturnAgendaHandler,
    listAttendancesHandler,
    listDays,
    listTeamsHandler,
    listStatusOptions,
    listTechniciansHandler,
    openWhatsAppReportHandler,
    renameTechnicianHandler,
    saveTeamHandler,
    deleteTeamHandler,
    updateAttendanceHandler,
} = require("../controllers/attendanceController");

const router = express.Router();

router.get("/status-options", listStatusOptions);
router.get("/dias", listDays);
router.get("/tecnicos", listTechniciansHandler);
router.get("/equipes", listTeamsHandler);
router.get("/agenda-retornos", getReturnAgendaHandler);
router.get("/atendimentos", listAttendancesHandler);
router.get("/atendimentos/exportar", exportAttendancesExcelXmlHandler);
router.get("/atendimentos/exportar/power-bi", exportPowerBiDatasetHandler);
router.post("/atendimentos", createAttendanceHandler);
router.post("/equipes", saveTeamHandler);
router.post("/tecnicos/renomear", renameTechnicianHandler);
router.put("/atendimentos/:id", updateAttendanceHandler);
router.delete("/equipes/:id", deleteTeamHandler);
router.delete("/atendimentos/:id", deleteAttendanceHandler);
router.get("/relatorios/diario", getDailyReportHandler);
router.post("/whatsapp/open", openWhatsAppReportHandler);

module.exports = router;
