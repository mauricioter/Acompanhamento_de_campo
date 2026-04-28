export function getTodayDate() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");
}

export function formatDate(dateValue) {
    if (!dateValue) {
        return "--/--/----";
    }
    const [year, month, day] = String(dateValue).split("-");
    return `${day}/${month}/${year}`;
}

export function formatDateTime(dateValue) {
    if (!dateValue) {
        return "--";
    }
    const date = new Date(dateValue);
    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatRemainingTime(milliseconds) {
    const safeValue = Math.max(0, milliseconds);
    const hours = Math.floor(safeValue / (60 * 60 * 1000));
    const minutes = Math.floor((safeValue % (60 * 60 * 1000)) / (60 * 1000));
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
}

export function formatReportDate(dateValue) {
    return formatDate(dateValue);
}
