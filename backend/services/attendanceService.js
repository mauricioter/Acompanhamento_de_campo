const {
    SCHEDULE_ALLOWED_STATUSES,
    STATUS_OPTIONS,
    STATUS_SORT_ORDER,
} = require("./constants");
const {
    queryAll,
    queryOne,
    runInTransaction,
    runStatement,
} = require("./database");
const {
    getRepresentativeLookup,
    listTeamLinks,
    normalizeTeamKey,
} = require("./teamService");

function nowParts() {
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
    return {
        date,
        time,
        timestamp: `${date} ${time}`,
    };
}

function addDays(dateValue, daysToAdd) {
    const date = new Date(`${dateValue}T00:00:00`);
    date.setDate(date.getDate() + daysToAdd);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function validateStatus(status) {
    if (!STATUS_OPTIONS.includes(status)) {
        return `Status invalido. Use um destes: ${STATUS_OPTIONS.join(", ")}`;
    }
    return null;
}

function validateInep(inep) {
    if (!inep) {
        return "INEP e obrigatorio.";
    }
    if (!/^\d+$/.test(inep)) {
        return "INEP deve conter apenas numeros.";
    }
    return null;
}

function validateScheduleDate(dateValue) {
    const normalized = String(dateValue || "").trim();
    if (!normalized) {
        return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return "Data agendada invalida.";
    }
    return null;
}

function statusAllowsSchedule(status) {
    return SCHEDULE_ALLOWED_STATUSES.includes(status);
}

function normalizeScheduleDate(status, dateValue) {
    if (!statusAllowsSchedule(status)) {
        return "";
    }
    return String(dateValue || "").trim();
}

function validateStatusReason(status, reason) {
    if (statusAllowsSchedule(status) && !String(reason || "").trim()) {
        return "Para status Pendente ou Reagendar, informe o motivo na observacao.";
    }
    return null;
}

function getHistoryLabel(date, time) {
    const [, month, day] = String(date).split("-");
    return `[${day}/${month}/${date.slice(0, 4)} ${time}]`;
}

function buildObservationHistoryEntry(note, date, time) {
    const cleanNote = String(note || "").trim();
    if (!cleanNote) {
        return "";
    }
    return `${getHistoryLabel(date, time)} ${cleanNote}`;
}

function appendObservationHistory(existingHistory, newNote, date, time) {
    const entry = buildObservationHistoryEntry(newNote, date, time);
    if (!entry) {
        return String(existingHistory || "");
    }
    const history = String(existingHistory || "").trim();
    return history ? `${history}\n${entry}` : entry;
}

function getPriorityFromAttendance(attendance) {
    const latestNote = String(attendance.observacao || "").toLowerCase();
    if (latestNote.includes("falta") || latestNote.includes("fechada") || latestNote.includes("retorno")) {
        return "alta";
    }
    if (attendance.status !== "Finalizado") {
        return "media";
    }
    return "baixa";
}

function serializeAttendance(row, representativeLookup = null) {
    const representativeFromLookup = representativeLookup instanceof Map
        ? representativeLookup.get(normalizeTeamKey(row.tecnico)) || ""
        : "";
    const attendance = {
        id: Number(row.id),
        inep: String(row.inep),
        tecnico: String(row.tecnico),
        representante: representativeFromLookup || String(row.representante || ""),
        status: String(row.status),
        observacao: String(row.observacao || ""),
        historico_observacoes: String(row.historico_observacoes || ""),
        agendado_para: String(row.agendado_para || ""),
        data: String(row.data),
        hora_atualizacao: String(row.hora_atualizacao),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
    return {
        ...attendance,
        prioridade: getPriorityFromAttendance(attendance),
    };
}

function serializeEventAttendance(row) {
    return {
        inep: String(row.inep),
        tecnico: String(row.tecnico || ""),
        status: String(row.status),
        observacao: String(row.observacao || ""),
        historico_observacoes: String(row.historico_observacoes || ""),
        agendado_para: String(row.agendado_para || ""),
        data: String(row.event_date || row.data || ""),
        hora_atualizacao: String(row.event_time || row.hora_atualizacao || ""),
        updated_at: String(row.created_at || row.updated_at || ""),
        source_event: String(row.source_event || "updated"),
    };
}

function parseAttendancePayload(payload = {}) {
    const attendance = {
        inep: String(payload.inep || "").trim(),
        tecnico: String(payload.tecnico || "").trim(),
        status: String(payload.status || "").trim(),
        observacao: String(payload.observacao || "").trim(),
        agendado_para: String(payload.agendado_para || "").trim(),
    };

    const inepError = validateInep(attendance.inep);
    if (inepError) {
        return { attendance, error: inepError };
    }
    if (!attendance.tecnico) {
        return { attendance, error: "Tecnico e obrigatorio." };
    }
    const statusError = validateStatus(attendance.status);
    if (statusError) {
        return { attendance, error: statusError };
    }
    attendance.agendado_para = normalizeScheduleDate(attendance.status, attendance.agendado_para);
    const scheduleError = validateScheduleDate(attendance.agendado_para);
    if (scheduleError) {
        return { attendance, error: scheduleError };
    }
    const reasonError = validateStatusReason(attendance.status, attendance.observacao);
    if (reasonError) {
        return { attendance, error: reasonError };
    }

    return { attendance, error: null };
}

function parseAttendanceUpdatePayload(payload = {}) {
    const status = String(payload.status || "").trim();
    const novaObservacao = String(payload.nova_observacao || "").trim();
    const agendadoPara = normalizeScheduleDate(status, payload.agendado_para);
    const tecnico = String(payload.tecnico || "").trim();
    const statusError = validateStatus(status);
    if (statusError) {
        return { status, novaObservacao, agendadoPara, tecnico, error: statusError };
    }
    const scheduleError = validateScheduleDate(agendadoPara);
    if (scheduleError) {
        return { status, novaObservacao, agendadoPara, tecnico, error: scheduleError };
    }
    return { status, novaObservacao, agendadoPara, tecnico, error: null };
}

function getCounters() {
    const counters = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0]));
    const rows = queryAll(`
        SELECT status, COUNT(*) AS total
        FROM atendimentos
        GROUP BY status
    `);
    for (const row of rows) {
        counters[row.status] = Number(row.total);
    }
    return counters;
}

function getDayCounts() {
    const rows = queryAll(`
        SELECT event_date AS day, COUNT(DISTINCT inep) AS total
        FROM atendimento_eventos
        WHERE is_deleted = 0
        GROUP BY event_date
        ORDER BY event_date DESC
    `);
    return rows.map((row) => ({
        day: String(row.day),
        total: Number(row.total),
    }));
}

function listTechnicians() {
    const rows = queryAll(
        `
        SELECT tecnico, COUNT(*) AS total
        FROM atendimentos
        WHERE TRIM(COALESCE(tecnico, '')) <> ''
        GROUP BY tecnico
        ORDER BY tecnico COLLATE NOCASE ASC
        `
    );

    return rows.map((row) => ({
        tecnico: String(row.tecnico),
        total: Number(row.total),
    }));
}

function clampNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(numericValue)));
}

function sanitizeSortDirection(sortDir) {
    return String(sortDir || "").trim().toLowerCase() === "asc" ? "ASC" : "DESC";
}

function normalizeQuickView(value) {
    const quickView = String(value || "").trim().toLowerCase();
    return ["all", "today", "overdue", "active"].includes(quickView) ? quickView : "all";
}

function buildStatusOrderExpression() {
    const clauses = Object.entries(STATUS_SORT_ORDER)
        .map(([status, order]) => `WHEN '${String(status).replace(/'/g, "''")}' THEN ${order}`)
        .join("\n        ");

    return `CASE status
        ${clauses}
        ELSE 999
    END`;
}

function getSortClause(sortBy = "created_at", sortDir = "desc") {
    const direction = sanitizeSortDirection(sortDir);
    const sortMap = {
        status: `${buildStatusOrderExpression()} ${direction}, updated_at DESC, id ${direction}`,
        tecnico: `tecnico COLLATE NOCASE ${direction}, updated_at DESC, id ${direction}`,
        data: `data ${direction}, hora_atualizacao ${direction}, id ${direction}`,
        created_at: `created_at ${direction}, id ${direction}`,
        updated_at: `updated_at ${direction}, id ${direction}`,
        inep: `CAST(inep AS INTEGER) ${direction}, id ${direction}`,
        agendado_para: `CASE
            WHEN TRIM(COALESCE(agendado_para, '')) = '' THEN '9999-99-99'
            ELSE agendado_para
        END ${direction}, updated_at DESC, id ${direction}`,
    };

    return sortMap[sortBy] || sortMap.created_at;
}

function listAttendances(filters = {}) {
    const statusFilter = String(filters.status || "").trim();
    const technicianFilter = String(filters.tecnico || "").trim();
    const inepFilter = String(filters.inep || "").trim();
    const dayFilter = String(filters.day || "").trim();
    const quickView = normalizeQuickView(filters.quickView);
    const sortBy = String(filters.sortBy || "created_at").trim();
    const sortDir = String(filters.sortDir || "desc").trim().toLowerCase();
    const exportAll = filters.exportAll === true
        || String(filters.exportAll || "").trim().toLowerCase() === "true";
    const page = clampNumber(filters.page, 1, 1, 100000);
    const pageSize = clampNumber(filters.pageSize, 50, 10, 100);
    const offset = (page - 1) * pageSize;
    const today = nowParts().date;

    const where = ["1 = 1"];
    const params = [];

    if (quickView === "today") {
        where.push(`
            (
                data = ?
                OR agendado_para = ?
            )
        `);
        params.push(today, today);
    } else if (quickView === "overdue") {
        where.push(`
            status <> 'Finalizado'
            AND TRIM(COALESCE(agendado_para, '')) <> ''
            AND agendado_para < ?
        `);
        params.push(today);
    } else if (quickView === "active") {
        where.push("status IN ('Em atendimento', 'Deslocando', 'Em outro INEP')");
    }

    if (statusFilter) {
        where.push("status = ?");
        params.push(statusFilter);
    }
    if (technicianFilter) {
        where.push("tecnico LIKE ?");
        params.push(`%${technicianFilter}%`);
    }
    if (inepFilter) {
        where.push("inep LIKE ?");
        params.push(`%${inepFilter}%`);
    }
    if (dayFilter) {
        where.push(`
            inep IN (
                SELECT DISTINCT inep
                FROM atendimento_eventos
                WHERE event_date = ?
                  AND is_deleted = 0
            )
        `);
        params.push(dayFilter);
    }

    const whereSql = where.join(" AND ");
    const totalRow = queryOne(
        `
        SELECT COUNT(*) AS total
        FROM atendimentos
        WHERE ${whereSql}
        `,
        params
    );

    const representativeLookup = getRepresentativeLookup();
    const rows = exportAll
        ? queryAll(
            `
            SELECT id, inep, tecnico, status, observacao, historico_observacoes, data,
                   agendado_para, hora_atualizacao, created_at, updated_at
            FROM atendimentos
            WHERE ${whereSql}
            ORDER BY ${getSortClause(sortBy, sortDir)}
            `,
            params
        )
        : queryAll(
            `
            SELECT id, inep, tecnico, status, observacao, historico_observacoes, data,
                   agendado_para, hora_atualizacao, created_at, updated_at
            FROM atendimentos
            WHERE ${whereSql}
            ORDER BY ${getSortClause(sortBy, sortDir)}
            LIMIT ? OFFSET ?
            `,
            [...params, pageSize, offset]
        );

    const totalItems = Number(totalRow?.total || 0);
    const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;
    const serializedItems = rows.map((row) => serializeAttendance(row, representativeLookup));

    return {
        items: serializedItems,
        counters: getCounters(),
        availableDays: getDayCounts(),
        pagination: {
            page: exportAll ? 1 : page,
            pageSize: exportAll ? Math.max(serializedItems.length, 1) : pageSize,
            totalItems,
            totalPages: exportAll ? 1 : totalPages,
            hasPreviousPage: exportAll ? false : page > 1,
            hasNextPage: exportAll ? false : page < totalPages,
        },
    };
}

function buildIsoDateTime(dateValue, timeValue) {
    const safeDate = String(dateValue || "").trim();
    const safeTime = String(timeValue || "").trim();

    if (!safeDate) {
        return "";
    }

    return safeTime ? `${safeDate}T${safeTime}` : safeDate;
}

function listPowerBiDataset() {
    const representativeLookup = getRepresentativeLookup();
    const attendanceRows = queryAll(
        `
        SELECT id, inep, tecnico, status, observacao, historico_observacoes, agendado_para,
               data, hora_atualizacao, created_at, updated_at
        FROM atendimentos
        ORDER BY updated_at DESC, id DESC
        `
    );
    const eventRows = queryAll(
        `
        SELECT id, attendance_id, inep, tecnico, status, observacao, historico_observacoes,
               agendado_para, source_event, is_deleted, event_date, event_time, created_at
        FROM atendimento_eventos
        ORDER BY created_at DESC, id DESC
        `
    );
    const teamRows = listTeamLinks();
    const timestamp = nowParts().timestamp;

    return {
        generated_at: timestamp,
        atendimentos: attendanceRows.map((row) => {
            const attendance = serializeAttendance(row, representativeLookup);
            return {
                attendance_id: attendance.id,
                inep: attendance.inep,
                tecnico: attendance.tecnico,
                representante: attendance.representante,
                status: attendance.status,
                prioridade: attendance.prioridade,
                observacao_atual: attendance.observacao,
                historico_observacoes: attendance.historico_observacoes,
                agendado_para: attendance.agendado_para,
                data: attendance.data,
                hora_ultima_atualizacao: attendance.hora_atualizacao,
                data_hora_atualizacao: buildIsoDateTime(
                    attendance.data,
                    attendance.hora_atualizacao
                ),
                created_at: attendance.created_at,
                updated_at: attendance.updated_at,
            };
        }),
        eventos: eventRows.map((row) => ({
            event_id: Number(row.id),
            attendance_id: row.attendance_id === null ? null : Number(row.attendance_id),
            inep: String(row.inep || ""),
            tecnico: String(row.tecnico || ""),
            representante: representativeLookup.get(normalizeTeamKey(row.tecnico)) || "",
            status: String(row.status || ""),
            observacao: String(row.observacao || ""),
            historico_observacoes: String(row.historico_observacoes || ""),
            agendado_para: String(row.agendado_para || ""),
            source_event: String(row.source_event || ""),
            is_deleted: Number(row.is_deleted || 0),
            event_date: String(row.event_date || ""),
            event_time: String(row.event_time || ""),
            event_datetime: buildIsoDateTime(row.event_date, row.event_time),
            created_at: String(row.created_at || ""),
        })),
        equipes: teamRows.map((item) => ({
            team_link_id: item.id,
            representante: item.representante,
            tecnico: item.tecnico,
            created_at: item.created_at,
            updated_at: item.updated_at,
        })),
    };
}

function selectAttendanceById(attendanceId) {
    return queryOne(
        `
        SELECT id, inep, tecnico, status, observacao, historico_observacoes, agendado_para,
               data, hora_atualizacao, created_at, updated_at
        FROM atendimentos
        WHERE id = ?
        `,
        [attendanceId]
    );
}

function recordAttendanceEvent(attendance, options = {}) {
    const safeAttendance = attendance || {};
    const { sourceEvent = "updated", isDeleted = false, date, time, timestamp } = options;
    const eventDate = String(date || safeAttendance.data || nowParts().date);
    const eventTime = String(time || safeAttendance.hora_atualizacao || nowParts().time);
    const eventTimestamp = String(timestamp || safeAttendance.updated_at || `${eventDate} ${eventTime}`);

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
            safeAttendance.id || null,
            String(safeAttendance.inep || ""),
            String(safeAttendance.tecnico || ""),
            String(safeAttendance.status || ""),
            String(safeAttendance.observacao || ""),
            String(safeAttendance.historico_observacoes || ""),
            String(safeAttendance.agendado_para || ""),
            sourceEvent,
            isDeleted ? 1 : 0,
            eventDate,
            eventTime,
            eventTimestamp,
        ]
    );
}

function createAttendance(payload) {
    const { attendance, error } = parseAttendancePayload(payload);
    if (error) {
        return { error, statusCode: 400 };
    }

    const { date, time, timestamp } = nowParts();
    try {
        const item = runInTransaction(() => {
            const history = appendObservationHistory("", attendance.observacao, date, time);
            const result = runStatement(
                `
                INSERT INTO atendimentos (
                    inep, tecnico, status, observacao, historico_observacoes,
                    agendado_para, data, hora_atualizacao, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    attendance.inep,
                    attendance.tecnico,
                    attendance.status,
                    attendance.observacao,
                    history,
                    attendance.agendado_para,
                    date,
                    time,
                    timestamp,
                    timestamp,
                ]
            );

            const createdRow = selectAttendanceById(Number(result.lastInsertRowid));
            const createdItem = serializeAttendance(createdRow);
            recordAttendanceEvent(createdItem, {
                sourceEvent: "created",
                date,
                time,
                timestamp,
            });
            return createdItem;
        });

        return { item, statusCode: 201 };
    } catch (error) {
        console.error(`Falha ao salvar atendimento ${attendance.inep}.`, error);
        if (String(error.message || "").toUpperCase().includes("UNIQUE")) {
            return { error: "Ja existe um atendimento com esse INEP.", statusCode: 409 };
        }
        return { error: "Nao foi possivel salvar o atendimento.", statusCode: 500 };
    }
}

function updateAttendance(attendanceId, payload) {
    const { status, novaObservacao, agendadoPara, tecnico, error } = parseAttendanceUpdatePayload(payload);
    if (error) {
        return { error, statusCode: 400 };
    }

    const existing = queryOne(
        `
        SELECT id, tecnico, status, observacao, historico_observacoes, agendado_para
        FROM atendimentos
        WHERE id = ?
        `,
        [attendanceId]
    );
    if (!existing) {
        return { error: "Atendimento nao encontrado.", statusCode: 404 };
    }

    const { date, time, timestamp } = nowParts();
    const observacaoAtual = novaObservacao || String(existing.observacao || "");
    const reasonError = validateStatusReason(status, observacaoAtual);
    if (reasonError) {
        return { error: reasonError, statusCode: 400 };
    }
    const historicoObservacoes =
        novaObservacao && novaObservacao !== String(existing.observacao || "")
            ? appendObservationHistory(existing.historico_observacoes, novaObservacao, date, time)
            : String(existing.historico_observacoes || "");
    const novoTecnico = tecnico || String(existing.tecnico || "");

    try {
        const item = runInTransaction(() => {
            runStatement(
                `
                UPDATE atendimentos
                SET status = ?, observacao = ?, historico_observacoes = ?,
                    agendado_para = ?, tecnico = ?, data = ?, hora_atualizacao = ?, updated_at = ?
                WHERE id = ?
                `,
                [
                    status,
                    observacaoAtual,
                    historicoObservacoes,
                    agendadoPara,
                    novoTecnico,
                    date,
                    time,
                    timestamp,
                    attendanceId,
                ]
            );

            const updatedRow = selectAttendanceById(attendanceId);
            const updatedItem = serializeAttendance(updatedRow);
            recordAttendanceEvent(updatedItem, {
                sourceEvent: "updated",
                date,
                time,
                timestamp,
            });
            return updatedItem;
        });

        return { item, statusCode: 200 };
    } catch (error) {
        console.error(`Falha ao atualizar atendimento ${attendanceId}.`, error);
        return { error: "Nao foi possivel atualizar o atendimento.", statusCode: 500 };
    }
}

function deleteAttendance(attendanceId) {
    const existing = selectAttendanceById(attendanceId);
    if (!existing) {
        return { error: "Atendimento nao encontrado.", statusCode: 404 };
    }

    const attendance = serializeAttendance(existing);
    const { date, time, timestamp } = nowParts();

    try {
        runInTransaction(() => {
            recordAttendanceEvent(attendance, {
                sourceEvent: "deleted",
                isDeleted: true,
                date,
                time,
                timestamp,
            });
            runStatement("DELETE FROM atendimentos WHERE id = ?", [attendanceId]);
        });
    } catch (error) {
        console.error(`Falha ao remover atendimento ${attendanceId}.`, error);
        return { error: "Nao foi possivel remover o atendimento.", statusCode: 500 };
    }

    return { message: "Atendimento removido com sucesso.", statusCode: 200 };
}

function renameTechnician(currentName, nextName) {
    const fromName = String(currentName || "").trim();
    const toName = String(nextName || "").trim();

    if (!fromName) {
        return { error: "Selecione o tecnico atual.", statusCode: 400 };
    }
    if (!toName) {
        return { error: "Informe o novo nome do tecnico.", statusCode: 400 };
    }
    if (fromName.localeCompare(toName, "pt-BR", { sensitivity: "base" }) === 0) {
        return { error: "Informe um nome diferente para o tecnico.", statusCode: 400 };
    }

    const existing = queryOne(
        `
        SELECT COUNT(*) AS total
        FROM atendimentos
        WHERE tecnico = ?
        `,
        [fromName]
    );

    const total = Number(existing?.total || 0);
    if (!total) {
        return { error: "Tecnico nao encontrado nos atendimentos.", statusCode: 404 };
    }

    runStatement(
        `
        UPDATE atendimentos
        SET tecnico = ?, updated_at = ?
        WHERE tecnico = ?
        `,
        [toName, nowParts().timestamp, fromName]
    );

    return {
        statusCode: 200,
        message: "Nome do tecnico atualizado com sucesso.",
        updatedCount: total,
    };
}

function getAgendaGroupLabel(groupKey) {
    const labels = {
        atrasados: "Atrasados",
        hoje: "Hoje",
        amanha: "Amanha",
        proximos: "Proximos dias",
    };
    return labels[groupKey] || "Agenda";
}

function getAgendaBucket(item, today, tomorrow) {
    const hasSchedule = Boolean(String(item.agendado_para || "").trim());
    const isTodayActivity = item.data === today;
    const isOpenItem = item.status !== "Finalizado";

    if (hasSchedule && isOpenItem && item.agendado_para < today) {
        return "atrasados";
    }
    if (hasSchedule && isOpenItem && item.agendado_para === today) {
        return "hoje";
    }
    if (hasSchedule && isOpenItem && item.agendado_para === tomorrow) {
        return "amanha";
    }
    if (hasSchedule && isOpenItem && item.agendado_para > tomorrow) {
        return "proximos";
    }
    if (isTodayActivity) {
        return "hoje";
    }
    return null;
}

function getAgendaSummary(groups) {
    return {
        atrasados: groups.atrasados.length,
        hoje: groups.hoje.length,
        amanha: groups.amanha.length,
        proximos: groups.proximos.length,
    };
}

function buildAgendaTeamSummary(groups) {
    const summary = new Map();

    for (const [bucket, items] of Object.entries(groups)) {
        for (const item of items) {
            const representativeName = item.representante || "Sem equipe";
            const representativeKey = normalizeTeamKey(representativeName) || "__sem-equipe__";

            if (!summary.has(representativeKey)) {
                summary.set(representativeKey, {
                    representante: representativeName,
                    total: 0,
                    atrasados: 0,
                    hoje: 0,
                    amanha: 0,
                    proximos: 0,
                    technicians: new Set(),
                });
            }

            const current = summary.get(representativeKey);
            current.total += 1;
            current[bucket] += 1;
            current.technicians.add(item.tecnico);
        }
    }

    return [...summary.values()]
        .map((group) => ({
            representante: group.representante,
            total: group.total,
            atrasados: group.atrasados,
            hoje: group.hoje,
            amanha: group.amanha,
            proximos: group.proximos,
            total_tecnicos: group.technicians.size,
            technicians: [...group.technicians].sort((left, right) =>
                left.localeCompare(right, "pt-BR", { sensitivity: "base" })
            ),
        }))
        .sort((left, right) => {
            if (right.total !== left.total) {
                return right.total - left.total;
            }
            return left.representante.localeCompare(right.representante, "pt-BR", {
                sensitivity: "base",
            });
        });
}

function getReturnAgenda() {
    const today = nowParts().date;
    const tomorrow = addDays(today, 1);
    const representativeLookup = getRepresentativeLookup();
    const rows = queryAll(
        `
        SELECT id, inep, tecnico, status, observacao, historico_observacoes, agendado_para, data,
               hora_atualizacao, created_at, updated_at
        FROM atendimentos
        WHERE data = ?
           OR (
                TRIM(COALESCE(agendado_para, '')) <> ''
                AND status <> 'Finalizado'
           )
        ORDER BY updated_at DESC, agendado_para ASC, CAST(inep AS INTEGER) ASC
        `,
        [today]
    ).map((row) => {
        const attendance = serializeAttendance(row);
        return {
            ...attendance,
            representante: representativeLookup.get(normalizeTeamKey(attendance.tecnico)) || "",
        };
    });

    const groups = {
        atrasados: [],
        hoje: [],
        amanha: [],
        proximos: [],
    };

    for (const item of rows) {
        const bucket = getAgendaBucket(item, today, tomorrow);
        if (bucket) {
            groups[bucket].push(item);
        }
    }

    const orderedGroups = ["atrasados", "hoje", "amanha", "proximos"].map((key) => ({
        key,
        label: getAgendaGroupLabel(key),
        total: groups[key].length,
        items: groups[key],
    }));

    return {
        today,
        total: rows.length,
        schedule_summary: getAgendaSummary(groups),
        team_summary: buildAgendaTeamSummary(groups),
        groups: orderedGroups,
    };
}

function listDailyReportRows(day) {
    const safeDay = String(day || "").trim();
    if (!safeDay) {
        return [];
    }

    const rows = queryAll(
        `
        SELECT e.inep, e.tecnico, e.status, e.observacao, e.historico_observacoes,
               e.agendado_para, e.event_date, e.event_time, e.created_at, e.source_event
        FROM atendimento_eventos e
        INNER JOIN (
            SELECT inep, MAX(id) AS latest_id
            FROM atendimento_eventos
            WHERE event_date = ?
              AND is_deleted = 0
            GROUP BY inep
        ) latest ON latest.latest_id = e.id
        ORDER BY e.created_at DESC, CAST(e.inep AS INTEGER) ASC
        `,
        [safeDay]
    );

    return rows.map(serializeEventAttendance);
}

function listDailyTimelineRows(day) {
    const safeDay = String(day || "").trim();
    if (!safeDay) {
        return [];
    }

    const rows = queryAll(
        `
        SELECT inep, tecnico, status, observacao, historico_observacoes,
               agendado_para, event_date, event_time, created_at, source_event
        FROM atendimento_eventos
        WHERE event_date = ?
          AND is_deleted = 0
        ORDER BY created_at DESC, id DESC
        `,
        [safeDay]
    );

    return rows.map(serializeEventAttendance);
}

module.exports = {
    STATUS_OPTIONS,
    createAttendance,
    deleteAttendance,
    getCounters,
    getDayCounts,
    getPriorityFromAttendance,
    getReturnAgenda,
    listAttendances,
    listDailyReportRows,
    listDailyTimelineRows,
    listPowerBiDataset,
    listTechnicians,
    nowParts,
    renameTechnician,
    serializeAttendance,
    updateAttendance,
};
