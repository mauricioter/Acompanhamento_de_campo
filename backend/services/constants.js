const STATUS_OPTIONS = [
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

const SCHEDULE_ALLOWED_STATUSES = ["Pendente", "Reagendar"];

const REPORT_DESCRIPTIONS = {
    Finalizado: "Atividade finalizada",
    "Em atendimento": "Tecnico em atendimento",
    Pendente: "Pendente",
    "Aguardando retorno t\u00e9cnico": "Aguardando retorno tecnico",
    Agendado: "Atendimento agendado",
    "Em outro INEP": "Tecnico em outro INEP",
    Reagendar: "Atendimento reagendado",
    Deslocando: "Tecnico em deslocamento",
    "Aguardando validacao": "Aguardando validacao",
};

const CRITICAL_KEYWORDS = ["falta", "fechada", "retorno"];

const STATUS_SORT_ORDER = {
    "Em atendimento": 1,
    Deslocando: 2,
    Agendado: 3,
    Pendente: 4,
    "Aguardando retorno t\u00e9cnico": 5,
    "Aguardando validacao": 6,
    Reagendar: 7,
    "Em outro INEP": 8,
    Finalizado: 9,
};

module.exports = {
    CRITICAL_KEYWORDS,
    REPORT_DESCRIPTIONS,
    SCHEDULE_ALLOWED_STATUSES,
    STATUS_OPTIONS,
    STATUS_SORT_ORDER,
};
