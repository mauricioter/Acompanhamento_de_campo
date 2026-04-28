const {
    STATUS_OPTIONS,
    createAttendance,
    deleteAttendance,
    getDayCounts,
    getReturnAgenda,
    listTechnicians,
    listAttendances,
    listPowerBiDataset,
    nowParts,
    renameTechnician,
    updateAttendance,
} = require("../services/attendanceService");
const { getReportByDay } = require("../services/reportService");
const {
    deleteTeamLink,
    listTeams,
    saveTeamLink,
} = require("../services/teamService");
const { openWhatsAppMessage } = require("../services/whatsappService");

function listStatusOptions(_request, response) {
    response.json({ status_options: STATUS_OPTIONS });
}

function listDays(_request, response) {
    response.json({ days: getDayCounts() });
}

function listTechniciansHandler(_request, response) {
    response.json({ technicians: listTechnicians() });
}

function getReturnAgendaHandler(_request, response) {
    response.json(getReturnAgenda());
}

function listTeamsHandler(_request, response) {
    response.json(listTeams());
}

function listAttendancesHandler(request, response) {
    const result = listAttendances({
        quickView: request.query.quickView,
        status: request.query.status,
        tecnico: request.query.tecnico,
        inep: request.query.inep,
        day: request.query.day,
        sortBy: request.query.sortBy,
        sortDir: request.query.sortDir,
        page: request.query.page,
        pageSize: request.query.pageSize,
    });
    response.json(result);
}

function escapeXmlValue(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function buildXmlCell(value, styleId = "Cell") {
    return `
        <Cell ss:StyleID="${styleId}">
            <Data ss:Type="String">${escapeXmlValue(value)}</Data>
        </Cell>
    `;
}

function buildAttendancesExcelXml(items) {
    const columns = [
        { label: "ID", width: 60, value: (item) => item.id },
        { label: "INEP", width: 90, value: (item) => item.inep },
        { label: "Tecnico", width: 140, value: (item) => item.tecnico },
        { label: "Representante", width: 160, value: (item) => item.representante },
        { label: "Status", width: 150, value: (item) => item.status },
        { label: "Observacao atual", width: 260, value: (item) => item.observacao },
        { label: "Historico de observacoes", width: 340, value: (item) => item.historico_observacoes },
        { label: "Agendado para", width: 110, value: (item) => item.agendado_para },
        { label: "Data", width: 90, value: (item) => item.data },
        { label: "Hora da ultima atualizacao", width: 150, value: (item) => item.hora_atualizacao },
        { label: "Criado em", width: 150, value: (item) => item.created_at },
        { label: "Atualizado em", width: 150, value: (item) => item.updated_at },
        { label: "Prioridade", width: 90, value: (item) => item.prioridade },
    ];

    const columnNodes = columns.map((column) =>
        `<Column ss:AutoFitWidth="0" ss:Width="${column.width}"/>`
    ).join("");
    const headerCells = columns.map((column) => buildXmlCell(column.label, "Header")).join("");
    const bodyRows = items.map((item) => `
        <Row ss:AutoFitHeight="1">
            ${columns.map((column) => buildXmlCell(column.value(item))).join("")}
        </Row>
    `).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
    xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:html="http://www.w3.org/TR/REC-html40"
>
    <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
        <Author>Controle de Atendimentos EACE</Author>
        <Created>${escapeXmlValue(new Date().toISOString())}</Created>
    </DocumentProperties>
    <Styles>
        <Style ss:ID="Default" ss:Name="Normal">
            <Alignment ss:Vertical="Top" ss:WrapText="1"/>
            <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#101828"/>
        </Style>
        <Style ss:ID="Header">
            <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
            <Borders>
                <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/>
                <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/>
                <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/>
                <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/>
            </Borders>
            <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
            <Interior ss:Color="#175CD3" ss:Pattern="Solid"/>
        </Style>
        <Style ss:ID="Cell">
            <Alignment ss:Vertical="Top" ss:WrapText="1"/>
            <Borders>
                <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAECF0"/>
                <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAECF0"/>
                <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAECF0"/>
                <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAECF0"/>
            </Borders>
        </Style>
    </Styles>
    <Worksheet ss:Name="Chamados">
        <Table ss:ExpandedColumnCount="${columns.length}" ss:ExpandedRowCount="${items.length + 1}" x:FullColumns="1" x:FullRows="1">
            ${columnNodes}
            <Row ss:StyleID="Header" ss:AutoFitHeight="1">
                ${headerCells}
            </Row>
            ${bodyRows}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
            <FreezePanes/>
            <FrozenNoSplit/>
            <SplitHorizontal>1</SplitHorizontal>
            <TopRowBottomPane>1</TopRowBottomPane>
            <ActivePane>2</ActivePane>
            <ProtectObjects>False</ProtectObjects>
            <ProtectScenarios>False</ProtectScenarios>
        </WorksheetOptions>
    </Worksheet>
</Workbook>`;
}

function exportAttendancesExcelXmlHandler(request, response) {
    const result = listAttendances({
        status: request.query.status,
        tecnico: request.query.tecnico,
        inep: request.query.inep,
        day: request.query.day,
        sortBy: request.query.sortBy,
        sortDir: request.query.sortDir,
        exportAll: true,
    });
    const fileName = `chamados-${nowParts().date}.xml`;

    response.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.status(200).send(buildAttendancesExcelXml(result.items));
}

function exportPowerBiDatasetHandler(_request, response) {
    const fileName = `powerbi-chamados-${nowParts().date}.json`;

    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.status(200).send(JSON.stringify(listPowerBiDataset(), null, 2));
}

function createAttendanceHandler(request, response) {
    const result = createAttendance(request.body);
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(result.statusCode).json({ item: result.item });
}

function updateAttendanceHandler(request, response) {
    const result = updateAttendance(Number(request.params.id), request.body);
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(result.statusCode).json({ item: result.item });
}

function deleteAttendanceHandler(request, response) {
    const result = deleteAttendance(Number(request.params.id));
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(result.statusCode).json({ message: result.message });
}

function renameTechnicianHandler(request, response) {
    const result = renameTechnician(
        request.body?.currentName,
        request.body?.nextName
    );
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(200).json({
        message: result.message,
        updatedCount: result.updatedCount,
    });
}

function saveTeamHandler(request, response) {
    const result = saveTeamLink(request.body);
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(result.statusCode).json({
        message: result.message,
        item: result.item,
        items: result.items || [],
    });
}

function deleteTeamHandler(request, response) {
    const result = deleteTeamLink(Number(request.params.id));
    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }
    response.status(result.statusCode).json({ message: result.message });
}

function getDailyReportHandler(request, response) {
    const fallbackDay = nowParts().date;
    const day = String(request.query.day || fallbackDay).trim() || fallbackDay;
    const report = getReportByDay(day);
    response.json(report);
}

async function openWhatsAppReportHandler(request, response) {
    const phone = String(request.body.phone || "").trim();
    const text = String(request.body.text || "").trim();
    const result = await openWhatsAppMessage(phone, text);

    if (result.error) {
        response.status(result.statusCode).json({ error: result.error });
        return;
    }

    response.status(result.statusCode).json({
        message: result.message,
        url: result.url,
    });
}

module.exports = {
    createAttendanceHandler,
    deleteAttendanceHandler,
    exportAttendancesExcelXmlHandler,
    exportPowerBiDatasetHandler,
    getDailyReportHandler,
    listAttendancesHandler,
    listDays,
    listTeamsHandler,
    listStatusOptions,
    listTechniciansHandler,
    renameTechnicianHandler,
    getReturnAgendaHandler,
    saveTeamHandler,
    deleteTeamHandler,
    openWhatsAppReportHandler,
    updateAttendanceHandler,
};
