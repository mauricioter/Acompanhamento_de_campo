export {
    formatDate,
    formatDateTime,
    formatRemainingTime,
    formatReportDate,
    getTodayDate,
} from "./utils/date.js";
export {
    getLatestObservation,
    getReasonText,
    getStatusClassName,
    normalizeAttendanceItem,
    normalizeScheduleForStatus,
    splitObservationHistory,
    statusAllowsSchedule,
    statusNeedsReason,
} from "./utils/attendance.js";
export { matchesOperationalQuickView } from "./utils/filters.js";
export { buildTeamSubmissionPayload, parseTechnicianList } from "./utils/team.js";
export {
    buildEmptyAutomationState,
    buildGroupedStatusIneps,
    buildProblemLabel,
    buildReportDayOptions,
    getPriorityLabel,
    getReportSections,
    getReportTextByMode,
} from "./utils/report.js";

import { THEME_STORAGE_KEY } from "./constants.js";

export function getInitialTheme(storageKey = THEME_STORAGE_KEY) {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
