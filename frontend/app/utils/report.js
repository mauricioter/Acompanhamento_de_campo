import {
    DEFAULT_AUTOMATION_STATE,
    EMPTY_REPORT_OVERVIEW,
    REPORT_MODES,
} from "../constants.js";
import { formatReportDate, getTodayDate } from "./date.js";

export function getPriorityLabel(priority) {
    return {
        alta: "Critico",
        media: "Atencao",
        baixa: "Normal",
    }[priority] || "Normal";
}

export function buildProblemLabel(item) {
    if (item?.problemLabel) {
        return item.problemLabel;
    }
    if (item?.isCritical) {
        return "Critico";
    }
    if (item?.isOverdue) {
        return "Atrasado";
    }
    return item?.status || "Atencao";
}

export function buildGroupedStatusIneps(group = {}) {
    const ineps = Array.isArray(group.ineps) ? group.ineps : [];
    return ineps.length ? ineps.join(", ") : "Sem INEPs agrupados.";
}

export function buildReportDayOptions(availableDays = [], defaultDay = getTodayDate()) {
    return [
        ...new Map([{ day: defaultDay, total: 0 }, ...availableDays].map((item) => [item.day, item])).values(),
    ];
}

export function getReportSections(reportData) {
    return {
        overview: reportData?.overview || EMPTY_REPORT_OVERVIEW,
        attentionPoints: reportData?.attention_points || [],
        technicianBreakdown: reportData?.technician_breakdown || [],
        timelineItems: reportData?.timeline_items || [],
        groupedStatus: reportData?.grouped_by_status || [],
        problemItems: reportData?.problem_items || [],
        pendingItems: reportData?.pending_items || [],
        tomorrowFollowups: reportData?.tomorrow_followups || [],
        postponedItems: reportData?.postponed_items || [],
    };
}

export function getReportTextByMode(reportData, reportMode) {
    if (!reportData) {
        return "";
    }
    if (reportMode === REPORT_MODES.executive) {
        return [
            `Resumo executivo ${formatReportDate(reportData.date)}`,
            "",
            reportData.executive_summary,
            "",
            "Pontos de atencao:",
            ...(reportData.attention_points?.length
                ? reportData.attention_points.map((item) => `- ${item}`)
                : ["- Nenhum ponto de atencao adicional"]),
            "",
            "Indicadores do dia:",
            `- Total atualizado: ${reportData.overview?.total || 0}`,
            `- Finalizados: ${reportData.overview?.finalizados || 0}`,
            `- Ativos: ${reportData.overview?.ativos || 0}`,
            `- Pendencias: ${reportData.overview?.pendencias || 0}`,
            `- Agendados: ${reportData.overview?.agendados || 0}`,
            `- Aguardando retorno tecnico: ${reportData.overview?.aguardando_retorno || 0}`,
            "",
            "Pendencias automaticas:",
            ...(reportData.pending_items?.length
                ? reportData.pending_items.map((item) => `- ${item.line}`)
                : ["- Nenhuma pendencia aberta"]),
            "",
            "Itens criticos:",
            ...(reportData.critical_items?.length
                ? reportData.critical_items.map((item) => `- ${item.line}`)
                : ["- Nenhum item critico identificado"]),
            "",
            "Remanejados para outra data:",
            ...(reportData.postponed_items?.length
                ? reportData.postponed_items.map((item) => `- ${item.inep} -> ${item.scheduled_label}`)
                : ["- Nenhum atendimento remanejado"]),
        ].join("\n").trim();
    }
    if (reportMode === REPORT_MODES.whatsapp) {
        return reportData.whatsapp_text;
    }
    return reportData.report_text;
}

export function buildEmptyAutomationState(overrides = {}) {
    return {
        ...DEFAULT_AUTOMATION_STATE,
        ...overrides,
        recentRuns: Array.isArray(overrides.recentRuns) ? overrides.recentRuns : [],
    };
}
