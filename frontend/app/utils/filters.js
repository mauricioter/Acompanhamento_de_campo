import { OPERATIONAL_ACTIVE_FILTER_STATUSES } from "../constants.js";
import { getTodayDate } from "./date.js";

export function matchesOperationalQuickView(item, quickView) {
    const today = getTodayDate();

    if (quickView === "today") {
        return item.data === today || item.agendado_para === today;
    }

    if (quickView === "overdue") {
        return item.status !== "Finalizado"
            && Boolean(item.agendado_para)
            && item.agendado_para < today;
    }

    if (quickView === "active") {
        return OPERATIONAL_ACTIVE_FILTER_STATUSES.includes(item.status);
    }

    return true;
}
