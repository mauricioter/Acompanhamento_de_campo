const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const { createTempWorkspace, resetBackendModules } = require("./helpers/backendTestUtils");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = async function runHistoryTest() {
    const tempDir = createTempWorkspace();
    const databasePath = path.join(tempDir, "history.db");
    const backupDir = path.join(tempDir, "backups");

    process.env.DATABASE_PATH = databasePath;
    process.env.DATABASE_BACKUP_DIR = backupDir;

    resetBackendModules(ROOT_DIR);

    const database = require("../backend/services/database");
    await database.initializeDatabase();

    const attendanceService = require("../backend/services/attendanceService");
    const reportService = require("../backend/services/reportService");

    try {
        const created = attendanceService.createAttendance({
            inep: "50035053",
            tecnico: "Ana",
            status: "Pendente",
            observacao: "Aguardando retorno da escola",
            agendado_para: "",
        });

        assert.equal(created.statusCode, 201);
        const itemId = created.item.id;
        const yesterday = "2026-04-23";
        const yesterdayTime = "09:30:00";
        const yesterdayTimestamp = `${yesterday} ${yesterdayTime}`;

        database.runStatement(
            `
            UPDATE atendimentos
            SET data = ?, hora_atualizacao = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            `,
            [yesterday, yesterdayTime, yesterdayTimestamp, yesterdayTimestamp, itemId]
        );
        database.runStatement(
            `
            UPDATE atendimento_eventos
            SET event_date = ?, event_time = ?, created_at = ?
            WHERE attendance_id = ?
            `,
            [yesterday, yesterdayTime, yesterdayTimestamp, itemId]
        );

        const updated = attendanceService.updateAttendance(itemId, {
            status: "Finalizado",
            tecnico: "Ana",
            nova_observacao: "Concluido no atendimento",
            agendado_para: "",
        });

        assert.equal(updated.statusCode, 200);

        const reportYesterday = reportService.getReportByDay(yesterday);
        const reportToday = reportService.getReportByDay(attendanceService.nowParts().date);
        const dayCounts = attendanceService.getDayCounts();

        assert.equal(reportYesterday.items.length, 1);
        assert.equal(reportYesterday.items[0].status, "Pendente");
        assert.match(reportYesterday.items[0].observacao, /Aguardando retorno/);

        assert.equal(reportToday.items.length, 1);
        assert.equal(reportToday.items[0].status, "Finalizado");
        assert.match(reportToday.items[0].observacao, /Concluido no atendimento/);
        assert.ok(dayCounts.some((entry) => entry.day === yesterday));
        assert.ok(dayCounts.some((entry) => entry.day === attendanceService.nowParts().date));
    } finally {
        database.closeDatabase();
        resetBackendModules(ROOT_DIR);
        delete process.env.DATABASE_PATH;
        delete process.env.DATABASE_BACKUP_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};
