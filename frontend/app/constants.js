export const statusOptions = [
    "Em atendimento",
    "Finalizado",
    "Pendente",
    "Aguardando retorno t\u00e9cnico",
    "Agendado",
    "Em outro INEP",
    "Reagendar",
    "Deslocando",
    "Aguardando validacao",
];

export const scheduleAllowedStatuses = ["Pendente", "Reagendar"];

export const OPERATIONAL_ACTIVE_FILTER_STATUSES = [
    "Em atendimento",
    "Deslocando",
    "Em outro INEP",
];

export const operationalQuickFilters = [
    { id: "all", label: "Todos" },
    { id: "today", label: "Hoje" },
    { id: "overdue", label: "Atrasados" },
    { id: "active", label: "Em andamento" },
];

export const operationalQuickStatuses = [
    { status: "Finalizado", label: "Finalizar" },
    { status: "Reagendar", label: "Reagendar" },
    { status: "Em atendimento", label: "Em atendimento" },
    { status: "Deslocando", label: "Deslocando" },
];

export const quickObservationPresets = [
    {
        label: "Finalizado",
        text: "Atendimento finalizado sem pendencias.",
    },
    {
        label: "Deslocamento",
        text: "Em deslocamento para a unidade.",
    },
    {
        label: "Aguardando retorno",
        text: "Aguardando retorno da escola.",
    },
    {
        label: "Reagendar",
        text: "Necessario reagendar com a unidade.",
    },
    {
        label: "Validacao",
        text: "Validacao pendente com a unidade.",
    },
    {
        label: "Sem acesso",
        text: "Sem acesso no momento, retorno necessario.",
    },
];

export const QUICK_OBSERVATION_PRESETS_BY_LABEL = Object.freeze(
    Object.fromEntries(quickObservationPresets.map((preset) => [preset.label, preset]))
);

export const REPORT_MODES = {
    operational: "operational",
    executive: "executive",
    whatsapp: "whatsapp",
};

export const REPORT_MODE_LABELS = {
    [REPORT_MODES.operational]: "Texto operacional",
    [REPORT_MODES.executive]: "Resumo executivo",
    [REPORT_MODES.whatsapp]: "Mensagem para WhatsApp",
};

export const EMPTY_REPORT_OVERVIEW = Object.freeze({
    total: 0,
    finalizados: 0,
    ativos: 0,
    pendencias: 0,
    criticos: 0,
    remanejados: 0,
    agendados: 0,
    aguardando_retorno: 0,
});

export const emptyForm = {
    inep: "",
    tecnico: "",
    status: statusOptions[0],
    observacao: "",
    agendado_para: "",
};

export const emptyTeamForm = {
    representante: "",
    tecnico: "",
    tecnicos: "",
};

export const THEME_STORAGE_KEY = "controle-atendimentos-theme";

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [25, 50, 100];

export const AUTOMATION_SCHEDULE_MODE_OPTIONS = [
    { value: "interval", label: "Intervalo" },
    { value: "fixed", label: "Horarios fixos" },
];

export const AUTOMATION_INTERVAL_HOUR_OPTIONS = [
    { value: 1, label: "1 hora" },
    { value: 3, label: "3 horas" },
    { value: 6, label: "6 horas" },
    { value: 12, label: "12 horas" },
];

export const DEFAULT_AUTOMATION_STATE = {
    enabled: false,
    phone: "",
    scheduleMode: "interval",
    intervalHours: 3,
    fixedTimes: "09:00, 12:00, 15:00, 18:00",
    lastRunAt: null,
    lastAttemptAt: null,
    updatedAt: null,
    nextRunAt: null,
    recentRuns: [],
};
