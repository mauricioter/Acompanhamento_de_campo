import { scheduleAllowedStatuses } from "../constants.js";

export function statusAllowsSchedule(status) {
    return scheduleAllowedStatuses.includes(status);
}

export function normalizeScheduleForStatus(status, dateValue) {
    if (!statusAllowsSchedule(status)) {
        return "";
    }
    return String(dateValue || "").trim();
}

export function statusNeedsReason(status) {
    return statusAllowsSchedule(status);
}

export function getReasonText(source = {}) {
    return String(source.nova_observacao || source.observacao || "").trim();
}

export function getStatusClassName(status) {
    return `status-${String(status)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")}`;
}

export function splitObservationHistory(history) {
    return String(history || "")
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function getLatestObservation(history, fallback) {
    const entries = splitObservationHistory(history);
    return entries.at(-1) || String(fallback || "").trim() || "Sem observacoes registradas.";
}

export function normalizeAttendanceItem(item = {}) {
    return {
        ...item,
        nova_observacao: "",
    };
}
