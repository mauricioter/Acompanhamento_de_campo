const {
    CRITICAL_KEYWORDS,
    REPORT_DESCRIPTIONS,
    STATUS_OPTIONS,
} = require("./constants");
const {
    listDailyReportRows,
    listDailyTimelineRows,
} = require("./attendanceService");

function formatDayLabel(dateValue) {
    const [year, month, day] = String(dateValue).split("-");
    return `${day}/${month}/${year}`;
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

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isCriticalObservation(observation) {
    const normalizedObservation = normalizeText(observation);
    return CRITICAL_KEYWORDS.some((keyword) => normalizedObservation.includes(keyword));
}

function buildReportItem(row, referenceDay) {
    const observacao = String(row.observacao || "").trim();
    const description = REPORT_DESCRIPTIONS[row.status] || row.status;
    const line = observacao
        ? `${row.inep} - ${description} (${observacao})`
        : `${row.inep} - ${description}`;
    const agendadoPara = String(row.agendado_para || "");
    const isPending = row.status !== "Finalizado";

    return {
        inep: String(row.inep),
        tecnico: String(row.tecnico || ""),
        status: String(row.status),
        observacao,
        line,
        isPending,
        isCritical: isCriticalObservation(observacao),
        isOverdue: Boolean(agendadoPara) && isPending && agendadoPara < String(referenceDay || ""),
        agendado_para: agendadoPara,
        hora_atualizacao: String(row.hora_atualizacao || ""),
        updated_at: String(row.updated_at || ""),
    };
}

function buildCounters(items) {
    const counters = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0]));
    for (const item of items) {
        counters[item.status] += 1;
    }
    return counters;
}

function buildOverview(items, counters, pendingItems, criticalItems, postponedItems) {
    return {
        total: items.length,
        finalizados: counters.Finalizado || 0,
        ativos: (counters["Em atendimento"] || 0) + (counters.Deslocando || 0),
        pendencias: pendingItems.length,
        criticos: criticalItems.length,
        remanejados: postponedItems.length,
        agendados: counters.Agendado || 0,
        aguardando_retorno: counters["Aguardando retorno t\u00e9cnico"] || 0,
    };
}

function buildExecutiveSummary(date, items, pendingItems, criticalItems, counters, postponedItems) {
    const total = items.length;
    const finalizados = counters.Finalizado || 0;
    const ativos = (counters["Em atendimento"] || 0) + (counters.Deslocando || 0);
    const pendencias = pendingItems.length;
    const criticos = criticalItems.length;

    const parts = [
        `Fechamento operacional de ${formatDayLabel(date)} com ${total} atendimento(s) atualizado(s).`,
        `${finalizados} finalizado(s), ${ativos} em execucao e ${pendencias} pendencia(s) aberta(s).`,
    ];

    if (criticos > 0) {
        parts.push(`${criticos} item(ns) critico(s) exigem atencao imediata.`);
    } else {
        parts.push("Nao ha itens criticos identificados pelas palavras-chave monitoradas.");
    }

    if (postponedItems.length > 0) {
        parts.push(`${postponedItems.length} atendimento(s) foram remanejados para outra data.`);
    }

    return parts.join(" ");
}

function buildAttentionPoints(overview, criticalItems, pendingItems, postponedItems) {
    if (!overview.total) {
        return ["Nenhuma atividade registrada para o dia selecionado."];
    }

    const points = [];
    points.push(
        `${overview.finalizados} finalizado(s), ${overview.ativos} em execucao e ${overview.pendencias} pendencia(s) ativa(s).`
    );

    if (criticalItems.length) {
        points.push(
            `${criticalItems.length} item(ns) critico(s) precisam de acompanhamento imediato.`
        );
    }

    if (postponedItems.length) {
        points.push(
            `${postponedItems.length} atendimento(s) foram remanejados para outra data.`
        );
    }

    if (overview.agendados) {
        points.push(`${overview.agendados} atendimento(s) seguem agendado(s) para continuidade.`);
    }

    if (overview.aguardando_retorno) {
        points.push(
            `${overview.aguardando_retorno} atendimento(s) ainda dependem de retorno tecnico.`
        );
    }

    if (!criticalItems.length && !postponedItems.length) {
        points.push("Nao ha desvios graves nem remanejamentos relevantes no fechamento.");
    }

    return points;
}

function formatTextList(title, items, formatter, emptyMessage) {
    return [
        title,
        ...(items.length ? items.map(formatter) : [emptyMessage]),
    ];
}

function buildOperationalText(
    date,
    items,
    counters,
    overview,
    pendingItems,
    criticalItems,
    problemItems,
    groupedByStatus,
    postponedItems,
    tomorrowFollowups,
    attentionPoints,
    technicianBreakdown,
    timelineItems
) {
    return [
        `RELATORIO OPERACIONAL - ${formatDayLabel(date)}`,
        "",
        "RESUMO EXECUTIVO",
        `- Total atualizado: ${overview.total}`,
        `- Finalizados: ${overview.finalizados}`,
        `- Em execucao: ${overview.ativos}`,
        `- Pendencias ativas: ${overview.pendencias}`,
        `- Itens criticos: ${overview.criticos}`,
        `- Remanejados: ${overview.remanejados}`,
        `- Agendados: ${overview.agendados}`,
        `- Aguardando retorno tecnico: ${overview.aguardando_retorno}`,
        "",
        ...formatTextList(
            "LEITURA GERENCIAL",
            attentionPoints,
            (item) => `- ${item}`,
            "- Nenhum destaque adicional"
        ),
        "",
        ...formatTextList(
            "OPERACAO DO DIA",
            items,
            (item) => `- ${item.line}`,
            "- Sem atividades registradas no dia"
        ),
        "",
        ...formatTextList(
            "PROBLEMAS DESTACADOS",
            problemItems,
            (item) => `- [${item.problemLabel}] ${item.line}`,
            "- Nenhum problema destacado"
        ),
        "",
        ...formatTextList(
            "INEPS POR STATUS",
            groupedByStatus,
            (group) => `- ${group.status} (${group.total}): ${group.ineps.join(", ")}`,
            "- Nenhum agrupamento por status"
        ),
        "",
        ...formatTextList(
            "OPERACAO POR TECNICO",
            technicianBreakdown,
            (group) =>
                `- ${group.tecnico}: ${group.total} chamado(s), ${group.finalizados} finalizado(s), ${group.pendentes} em aberto, ${group.criticos} critico(s). INEPs: ${group.ineps.join(", ")}`,
            "- Nenhuma distribuicao por tecnico"
        ),
        "",
        ...formatTextList(
            "PENDENCIAS PRIORITARIAS",
            pendingItems,
            (item) => `- ${item.line}`,
            "- Nenhuma pendencia aberta"
        ),
        "",
        ...formatTextList(
            "ITENS CRITICOS",
            criticalItems,
            (item) => `- ${item.line}`,
            "- Nenhum item critico identificado"
        ),
        "",
        ...formatTextList(
            "ENCAMINHAMENTOS PARA O PROXIMO TURNO",
            tomorrowFollowups,
            (item) => `- ${item.inep}: ${item.next_action}`,
            "- Nenhum encaminhamento especifico para o proximo dia"
        ),
        "",
        ...formatTextList(
            "REMANEJADOS PARA OUTRA DATA",
            postponedItems,
            (item) => `- ${item.inep}: ${item.scheduled_label}`,
            "- Nenhum atendimento remanejado"
        ),
        "",
        ...formatTextList(
            "ULTIMAS ATUALIZACOES DO DIA",
            timelineItems.slice(0, 12),
            (item) =>
                `- ${item.hora_atualizacao} | ${item.inep} | ${item.status} | ${item.tecnico} | ${item.observacao}`,
            "- Nenhuma atualizacao registrada"
        ),
        "",
        "RESUMO POR STATUS",
        `${counters.Finalizado} finalizados`,
        `${counters["Em atendimento"]} em atendimento`,
        `${counters.Pendente} pendentes`,
        `${counters["Aguardando retorno t\u00e9cnico"]} aguardando retorno tecnico`,
        `${counters.Agendado} agendados`,
        `${counters["Em outro INEP"]} em outro INEP`,
        `${counters.Reagendar} reagendar`,
        `${counters.Deslocando} deslocando`,
        `${counters["Aguardando validacao"]} aguardando validacao`,
    ].join("\n").trim();
}

function buildWhatsappText(date, items, pendingItems, criticalItems, executiveSummary, overview, postponedItems) {
    const lines = [
        `*Fechamento operacional ${formatDayLabel(date)}*`,
        "",
        executiveSummary,
        "",
        "*Painel rapido:*",
        `- Total atualizado: ${overview.total}`,
        `- Finalizados: ${overview.finalizados}`,
        `- Pendencias: ${overview.pendencias}`,
        `- Criticos: ${overview.criticos}`,
        "",
        "*Atividades:*",
        ...(items.length ? items.map((item) => `- ${item.line}`) : ["- Sem atividades registradas no dia"]),
        "",
        "*Pendencias:*",
        ...(pendingItems.length ? pendingItems.map((item) => `- ${item.line}`) : ["- Nenhuma pendencia aberta"]),
        "",
        "*Itens criticos:*",
        ...(criticalItems.length ? criticalItems.map((item) => `- ${item.line}`) : ["- Nenhum item critico"]),
        "",
        "*Remanejados para outra data:*",
        ...(postponedItems.length
            ? postponedItems.map((item) => `- ${item.inep} -> ${item.scheduled_label}`)
            : ["- Nenhum atendimento remanejado"]),
    ];
    return lines.join("\n").trim();
}

function buildStatusGroups(items) {
    return STATUS_OPTIONS.map((status) => {
        const groupItems = items.filter((item) => item.status === status);
        return {
            status,
            total: groupItems.length,
            items: groupItems,
            ineps: [...new Set(groupItems.map((item) => item.inep))],
        };
    }).filter((group) => group.total > 0);
}

function getNextActionByStatus(status) {
    const map = {
        "Em atendimento": "Continuar atendimento e validar conclusao.",
        Agendado: "Confirmar agenda e preparar o proximo atendimento.",
        Pendente: "Retomar tratativa e remover impedimento.",
        "Aguardando retorno t\u00e9cnico": "Cobrar retorno do tecnico e atualizar a devolutiva.",
        "Em outro INEP": "Replanejar retorno apos concluir o INEP atual.",
        Reagendar: "Confirmar nova data e alinhar com a unidade.",
        Deslocando: "Acompanhar chegada e atualizar situacao na unidade.",
        "Aguardando validacao": "Cobrar validacao e registrar devolutiva final.",
    };

    return map[status] || "Acompanhar andamento e atualizar no proximo turno.";
}

function buildTomorrowFollowups(pendingItems, reportDay) {
    const tomorrow = addDays(reportDay, 1);
    return pendingItems
        .filter((item) => !item.agendado_para || item.agendado_para === tomorrow)
        .map((item) => ({
        ...item,
        next_action: getNextActionByStatus(item.status),
    }));
}

function buildPostponedItems(pendingItems, reportDay) {
    return pendingItems
        .filter((item) => item.agendado_para && item.agendado_para > reportDay)
        .map((item) => ({
            ...item,
            scheduled_label: formatDayLabel(item.agendado_para),
        }));
}

function buildProblemItems(items, postponedItems) {
    const directStatusProblems = new Set([
        "Pendente",
        "Reagendar",
        "Aguardando retorno t\u00e9cnico",
        "Aguardando validacao",
    ]);
    const problemMap = new Map();

    function registerProblem(item, problemLabel, rank) {
        const key = item.inep;
        const current = problemMap.get(key);
        if (current && current.rank <= rank) {
            return;
        }
        problemMap.set(key, {
            ...item,
            problemLabel,
            rank,
        });
    }

    for (const item of items) {
        if (item.isCritical) {
            registerProblem(item, "Critico", 1);
        }

        if (item.isOverdue) {
            registerProblem(item, "Atrasado", 2);
        }

        if (directStatusProblems.has(item.status)) {
            registerProblem(item, item.status, 3);
        }
    }

    for (const item of postponedItems) {
        registerProblem(item, "Remanejado", 4);
    }

    return [...problemMap.values()].sort((left, right) => {
        if (left.rank !== right.rank) {
            return left.rank - right.rank;
        }
        return left.inep.localeCompare(right.inep, "pt-BR", { sensitivity: "base" });
    });
}

function buildTechnicianBreakdown(items) {
    const technicians = new Map();

    for (const item of items) {
        const technicianName = String(item.tecnico || "").trim() || "Nao informado";
        if (!technicians.has(technicianName)) {
            technicians.set(technicianName, {
                tecnico: technicianName,
                total: 0,
                finalizados: 0,
                pendentes: 0,
                criticos: 0,
                ineps: [],
            });
        }

        const current = technicians.get(technicianName);
        current.total += 1;
        current.finalizados += item.status === "Finalizado" ? 1 : 0;
        current.pendentes += item.isPending ? 1 : 0;
        current.criticos += item.isCritical ? 1 : 0;
        current.ineps.push(item.inep);
    }

    return [...technicians.values()].sort((left, right) => {
        if (right.total !== left.total) {
            return right.total - left.total;
        }
        return left.tecnico.localeCompare(right.tecnico, "pt-BR", { sensitivity: "base" });
    });
}

function buildTimelineItems(items) {
    return items.map((item) => ({
        inep: item.inep,
        tecnico: item.tecnico || "Nao informado",
        status: item.status,
        observacao: item.observacao || "Sem observacao registrada.",
        hora_atualizacao: item.hora_atualizacao || "--:--:--",
        line: item.line,
    }));
}

function getReportByDay(day) {
    const items = listDailyReportRows(day).map((row) => buildReportItem(row, day));
    const activityItems = listDailyTimelineRows(day).map((row) => buildReportItem(row, day));
    const counters = buildCounters(items);
    const pendingItems = items.filter((item) => item.isPending);
    const criticalItems = items.filter((item) => item.isCritical);
    const groupedByStatus = buildStatusGroups(items);
    const tomorrowFollowups = buildTomorrowFollowups(pendingItems, day);
    const postponedItems = buildPostponedItems(pendingItems, day);
    const problemItems = buildProblemItems(items, postponedItems);
    const overview = buildOverview(items, counters, pendingItems, criticalItems, postponedItems);
    const attentionPoints = buildAttentionPoints(overview, criticalItems, pendingItems, postponedItems);
    const technicianBreakdown = buildTechnicianBreakdown(items);
    const timelineItems = buildTimelineItems(activityItems);
    const executiveSummary = buildExecutiveSummary(day, items, pendingItems, criticalItems, counters, postponedItems);
    const operationalText = buildOperationalText(
        day,
        items,
        counters,
        overview,
        pendingItems,
        criticalItems,
        problemItems,
        groupedByStatus,
        postponedItems,
        tomorrowFollowups,
        attentionPoints,
        technicianBreakdown,
        timelineItems
    );
    const whatsappText = buildWhatsappText(
        day,
        items,
        pendingItems,
        criticalItems,
        executiveSummary,
        overview,
        postponedItems
    );

    return {
        date: day,
        items,
        overview,
        attention_points: attentionPoints,
        technician_breakdown: technicianBreakdown,
        timeline_items: timelineItems,
        summary: counters,
        pending_items: pendingItems,
        critical_items: criticalItems,
        problem_items: problemItems,
        grouped_by_status: groupedByStatus,
        tomorrow_followups: tomorrowFollowups,
        postponed_items: postponedItems,
        executive_summary: executiveSummary,
        report_text: operationalText,
        whatsapp_text: whatsappText,
    };
}

module.exports = {
    formatDayLabel,
    getReportByDay,
};
