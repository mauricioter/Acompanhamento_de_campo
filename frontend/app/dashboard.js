import { isAuthError, requestJson } from "./api.js";
import {
    DEFAULT_PAGE_SIZE,
    PAGE_SIZE_OPTIONS,
    QUICK_OBSERVATION_PRESETS_BY_LABEL,
    REPORT_MODES,
    emptyForm,
    emptyTeamForm,
    operationalQuickFilters,
    statusOptions,
} from "./constants.js";
import {
    AttendanceRow,
    Feedback,
    Icon,
    ReportsWorkspace,
    ReturnAgendaSection,
    SettingsSection,
    SummaryCards,
    TeamManagementSection,
} from "./components.js";
import { html, useEffect, useMemo, useState } from "./shared.js";
import {
    buildTeamSubmissionPayload,
    buildEmptyAutomationState,
    formatReportDate,
    getReasonText,
    getReportTextByMode,
    getTodayDate,
    matchesOperationalQuickView,
    normalizeAttendanceItem,
    normalizeScheduleForStatus,
    statusAllowsSchedule,
    statusNeedsReason,
} from "./utils.js";

export function DashboardApp({ currentUser, onLogout, theme, onToggleTheme, onAuthFailure }) {
    const [form, setForm] = useState(emptyForm);
    const [activeTab, setActiveTab] = useState("operational");
    const [filters, setFilters] = useState({
        quickView: "all",
        status: "",
        tecnico: "",
        inep: "",
        day: "",
        sortBy: "created_at",
        sortDir: "desc",
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
    });
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    });
    const [items, setItems] = useState([]);
    const [originalItems, setOriginalItems] = useState({});
    const [expandedHistoryIds, setExpandedHistoryIds] = useState({});
    const [expandedAttendanceId, setExpandedAttendanceId] = useState(null);
    const [editingTechnicianId, setEditingTechnicianId] = useState(null);
    const [availableDays, setAvailableDays] = useState([]);
    const [counters, setCounters] = useState({});
    const [returnAgenda, setReturnAgenda] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [reportMode, setReportMode] = useState(REPORT_MODES.operational);
    const [reportDay, setReportDay] = useState(getTodayDate());
    const [reportGeneratedAt, setReportGeneratedAt] = useState("");
    const [feedback, setFeedback] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exportingAttendances, setExportingAttendances] = useState(false);
    const [exportingPowerBi, setExportingPowerBi] = useState(false);
    const [savingId, setSavingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [settingsBusy, setSettingsBusy] = useState(false);
    const [teamData, setTeamData] = useState({
        total_links: 0,
        total_representatives: 0,
        groups: [],
    });
    const [teamForm, setTeamForm] = useState(emptyTeamForm);
    const [teamBusy, setTeamBusy] = useState(false);
    const [deletingTeamId, setDeletingTeamId] = useState(null);
    const [showAdvancedOperationalFilters, setShowAdvancedOperationalFilters] = useState(false);
    const [whatsappAutomation, setWhatsappAutomation] = useState(buildEmptyAutomationState());
    const [automationBusy, setAutomationBusy] = useState(false);
    const [automationDirty, setAutomationDirty] = useState(false);
    const [automationTick, setAutomationTick] = useState(Date.now());

    const hasFilters = useMemo(
        () =>
            Boolean(
                filters.status ||
                    filters.quickView !== "all" ||
                    filters.tecnico.trim() ||
                    filters.inep.trim() ||
                    filters.day
            ),
        [filters.day, filters.inep, filters.quickView, filters.status, filters.tecnico]
    );

    const totalAttendances = useMemo(
        () => Object.values(counters).reduce((total, value) => total + (Number(value) || 0), 0),
        [counters]
    );
    const activeAttendances = (counters["Em atendimento"] || 0) + (counters.Deslocando || 0);
    const currentReportText = useMemo(
        () => getReportTextByMode(reportData, reportMode),
        [reportData, reportMode]
    );
    const reportTotal = useMemo(
        () => (reportData?.items || []).length,
        [reportData]
    );
    const heroView = useMemo(() => {
        if (activeTab === "managerial") {
            return {
                kicker: "Visao Gerencial",
                title: "Dashboard de Operacao",
                description: "Indicadores, agenda de retornos, equipes e configuracoes reunidos para acompanhamento da operacao.",
                metrics: [
                    { label: "Total do painel", value: totalAttendances },
                    { label: "Ativos agora", value: activeAttendances },
                    { label: "Finalizados", value: counters.Finalizado || 0 },
                ],
            };
        }

        if (activeTab === "reports") {
            return {
                kicker: "Visao de Relatorios",
                title: "Fechamento e Texto Final",
                description: "Estruture a leitura do dia por status, INEPs, problemas e repasses para a proxima janela operacional.",
                metrics: [
                    { label: "Itens no relatorio", value: reportTotal || 0 },
                    { label: "Pendencias", value: reportData?.overview?.pendencias || 0 },
                    { label: "Criticos", value: reportData?.overview?.criticos || 0 },
                ],
            };
        }

        return {
            kicker: "Visao Operacional",
            title: "Fila Rapida de Campo",
            description: "Atualize chamados sem perder o contexto da fila, com filtros rapidos, status de um toque e observacoes padronizadas.",
            metrics: [
                { label: "Na tela", value: items.length },
                { label: "Filtro ativo", value: operationalQuickFilters.find((option) => option.id === filters.quickView)?.label || "Todos" },
                { label: "Em andamento", value: activeAttendances },
            ],
        };
    }, [activeAttendances, activeTab, counters.Finalizado, filters.quickView, items.length, reportData, reportTotal, totalAttendances]);
    const nextAutomationAt = useMemo(
        () => (whatsappAutomation.nextRunAt ? new Date(whatsappAutomation.nextRunAt) : null),
        [whatsappAutomation.nextRunAt]
    );
    const remainingAutomationTime = useMemo(() => {
        if (!nextAutomationAt) {
            return null;
        }
        return Math.max(0, nextAutomationAt.getTime() - automationTick);
    }, [nextAutomationAt, automationTick]);

    useEffect(() => {
        const timerId = window.setInterval(() => {
            setAutomationTick(Date.now());
        }, 60000);
        return () => window.clearInterval(timerId);
    }, []);

    function showFeedback(message, type = "success") {
        setFeedback({ message, type });
    }

    function handleAppError(error) {
        if (isAuthError(error)) {
            showFeedback("Sua sessao expirou. Entre novamente para continuar.", "error");
            window.setTimeout(() => {
                onAuthFailure();
            }, 300);
            return;
        }
        showFeedback(error.message, "error");
    }

    function mapItems(nextItems) {
        return nextItems.reduce((accumulator, currentItem) => {
            accumulator[currentItem.id] = currentItem;
            return accumulator;
        }, {});
    }

    function applyServerItemToState(serverItem) {
        const normalizedItem = normalizeAttendanceItem(serverItem);

        setItems((current) =>
            current.map((item) => (item.id === normalizedItem.id ? normalizedItem : item))
        );
        setOriginalItems((current) => ({
            ...current,
            [normalizedItem.id]: normalizedItem,
        }));
    }

    function removeItemFromState(itemId) {
        setItems((current) => current.filter((item) => item.id !== itemId));
        setOriginalItems((current) => {
            const nextItems = { ...current };
            delete nextItems[itemId];
            return nextItems;
        });
        setExpandedAttendanceId((current) => (current === itemId ? null : current));
        setEditingTechnicianId((current) => (current === itemId ? null : current));
        setExpandedHistoryIds((current) => {
            if (!current[itemId]) {
                return current;
            }
            const nextHistory = { ...current };
            delete nextHistory[itemId];
            return nextHistory;
        });
    }

    function itemMatchesCurrentOperationalFilters(item) {
        const technicianFilter = String(filters.tecnico || "").trim().toLowerCase();
        const inepFilter = String(filters.inep || "").trim().toLowerCase();
        const statusFilter = String(filters.status || "").trim();

        if (statusFilter && item.status !== statusFilter) {
            return false;
        }

        if (technicianFilter && !String(item.tecnico || "").toLowerCase().includes(technicianFilter)) {
            return false;
        }

        if (inepFilter && !String(item.inep || "").toLowerCase().includes(inepFilter)) {
            return false;
        }

        return matchesOperationalQuickView(item, filters.quickView);
    }

    function updateCountersFromItemChange(previousItem, nextItem) {
        if (!previousItem || !nextItem || previousItem.status === nextItem.status) {
            return;
        }

        setCounters((current) => ({
            ...current,
            [previousItem.status]: Math.max(0, (current[previousItem.status] || 0) - 1),
            [nextItem.status]: (current[nextItem.status] || 0) + 1,
        }));
    }

    async function refreshOperationalSupportData() {
        const [agendaResult, teamsResult] = await Promise.allSettled([
            requestJson("/api/agenda-retornos"),
            requestJson("/api/equipes"),
        ]);

        if (agendaResult.status === "fulfilled") {
            setReturnAgenda(agendaResult.value);
        }

        if (teamsResult.status === "fulfilled") {
            setTeamData(teamsResult.value);
        }
    }

    function buildAttendanceParams(sourceFilters = filters, options = {}) {
        const { includePagination = true, exportAll = false } = options;
        const params = new URLSearchParams();
        if (sourceFilters.quickView && sourceFilters.quickView !== "all") {
            params.set("quickView", sourceFilters.quickView);
        }
        if (sourceFilters.status) params.set("status", sourceFilters.status);
        if (sourceFilters.tecnico.trim()) params.set("tecnico", sourceFilters.tecnico.trim());
        if (sourceFilters.inep.trim()) params.set("inep", sourceFilters.inep.trim());
        if (sourceFilters.day) params.set("day", sourceFilters.day);
        params.set("sortBy", sourceFilters.sortBy);
        params.set("sortDir", sourceFilters.sortDir);
        if (includePagination) {
            params.set("page", String(sourceFilters.page));
            params.set("pageSize", String(sourceFilters.pageSize));
        }
        if (exportAll) {
            params.set("exportAll", "true");
        }
        return params;
    }

    async function loadAttendances() {
        setLoading(true);
        try {
            const params = buildAttendanceParams();
            const [attendanceResult, agendaResult, teamsResult] = await Promise.allSettled([
                requestJson(`/api/atendimentos?${params.toString()}`),
                requestJson("/api/agenda-retornos"),
                requestJson("/api/equipes"),
            ]);
            if (attendanceResult.status === "rejected") {
                throw attendanceResult.reason;
            }
            const data = attendanceResult.value;

            if (data.pagination?.totalPages && filters.page > data.pagination.totalPages) {
                setFilters((current) => ({
                    ...current,
                    page: data.pagination.totalPages,
                }));
                return;
            }

            const normalizedItems = data.items.map(normalizeAttendanceItem);
            setItems(normalizedItems);
            setOriginalItems(mapItems(normalizedItems));
            setExpandedAttendanceId((current) =>
                normalizedItems.some((item) => item.id === current) ? current : null
            );
            setEditingTechnicianId((current) =>
                normalizedItems.some((item) => item.id === current) ? current : null
            );
            setCounters(data.counters);
            setAvailableDays(data.availableDays || []);
            setPagination(data.pagination || {
                page: 1,
                pageSize: filters.pageSize,
                totalItems: normalizedItems.length,
                totalPages: 1,
                hasPreviousPage: false,
                hasNextPage: false,
            });
            if (!reportDay && data.availableDays?.length) {
                setReportDay(data.availableDays[0].day);
            }
            if (agendaResult.status === "fulfilled") {
                setReturnAgenda(agendaResult.value);
            }
            if (teamsResult.status === "fulfilled") {
                setTeamData(teamsResult.value);
            }
        } catch (error) {
            handleAppError(error);
        } finally {
            setLoading(false);
        }
    }

    async function loadAutomationStatus({ quiet = false } = {}) {
        try {
            const data = await requestJson("/api/automation/whatsapp");
            if (!automationDirty) {
                setWhatsappAutomation(buildEmptyAutomationState(data));
                setAutomationDirty(false);
            }
        } catch (error) {
            if (!quiet) {
                handleAppError(error);
            }
        }
    }

    useEffect(() => {
        loadAttendances();
    }, [
        filters.day,
        filters.inep,
        filters.page,
        filters.pageSize,
        filters.quickView,
        filters.sortBy,
        filters.sortDir,
        filters.status,
        filters.tecnico,
    ]);

    useEffect(() => {
        if (activeTab !== "reports") {
            return;
        }

        let cancelled = false;

        async function syncReportTab() {
            setReportLoading(true);
            try {
                const data = await requestJson(`/api/relatorios/diario?day=${reportDay}`);
                if (cancelled) {
                    return;
                }
                setReportData(data);
                setReportGeneratedAt(
                    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                );
            } catch (error) {
                if (!cancelled) {
                    handleAppError(error);
                }
            } finally {
                if (!cancelled) {
                    setReportLoading(false);
                }
            }
        }

        syncReportTab();

        return () => {
            cancelled = true;
        };
    }, [activeTab, reportDay]);

    useEffect(() => {
        if (activeTab !== "reports") {
            return;
        }

        loadAutomationStatus({ quiet: false });
        const intervalId = window.setInterval(() => {
            if (!automationDirty) {
                loadAutomationStatus({ quiet: true });
            }
        }, 60000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [activeTab, automationDirty]);

    function handleFormChange(field, value) {
        setForm((current) => {
            if (field === "status") {
                return {
                    ...current,
                    status: value,
                    agendado_para: normalizeScheduleForStatus(value, current.agendado_para),
                };
            }

            if (field === "agendado_para") {
                return {
                    ...current,
                    agendado_para: normalizeScheduleForStatus(current.status, value),
                };
            }

            return { ...current, [field]: value };
        });
    }

    function handleFilterChange(field, value) {
        setFilters((current) => ({
            ...current,
            [field]: value,
            page: 1,
        }));
    }

    function handleQuickFilterChange(nextQuickView) {
        setFilters((current) => ({
            ...current,
            quickView: nextQuickView,
            page: 1,
        }));
    }

    async function handleCreate(event) {
        event.preventDefault();
        const payload = {
            ...form,
            agendado_para: normalizeScheduleForStatus(form.status, form.agendado_para),
        };

        if (statusNeedsReason(payload.status) && !getReasonText(payload)) {
            showFeedback("Para status Pendente ou Reagendar, informe o motivo na observacao.", "error");
            return;
        }

        setSubmitting(true);
        try {
            await requestJson("/api/atendimentos", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            setForm(emptyForm);
            showFeedback("Atendimento cadastrado com sucesso.");
            await loadAttendances();
        } catch (error) {
            handleAppError(error);
        } finally {
            setSubmitting(false);
        }
    }

    function buildNextItemState(item, updates = {}) {
        const nextItem = { ...item, ...updates };
        nextItem.agendado_para = normalizeScheduleForStatus(nextItem.status, nextItem.agendado_para);
        return nextItem;
    }

    function updateItemFields(id, updates) {
        setItems((current) =>
            current.map((item) => (item.id === id ? buildNextItemState(item, updates) : item))
        );
    }

    function handleFieldChange(id, field, value) {
        updateItemFields(id, { [field]: value });
    }

    function handleToggleHistory(id) {
        setExpandedHistoryIds((current) => ({
            ...current,
            [id]: !current[id],
        }));
    }

    function handleToggleEditTechnician(id) {
        setEditingTechnicianId(id);
    }

    function handleToggleAttendanceDetails(id) {
        setExpandedAttendanceId((current) => (current === id ? null : id));
        setExpandedHistoryIds((current) => ({
            ...current,
            [id]: false,
        }));
        setEditingTechnicianId((current) => (current === id ? null : current));
    }

    function handleToggleInepSort() {
        setFilters((current) => ({
            ...current,
            sortBy: "inep",
            sortDir: current.sortBy === "inep" && current.sortDir === "asc" ? "desc" : "asc",
            page: 1,
        }));
    }

    function handleStatusChange(id, nextStatus) {
        const currentItem = items.find((item) => item.id === id);
        if (!currentItem) {
            return;
        }

        const nextItem = buildNextItemState(currentItem, { status: nextStatus });

        if (statusNeedsReason(nextStatus) && !getReasonText(nextItem)) {
            showFeedback("Informe o motivo na observacao para salvar Pendente ou Reagendar.", "error");
            return;
        }

        handleSave(id, {
            status: nextStatus,
            agendado_para: nextItem.agendado_para,
        });
    }

    function handleScheduleChange(id, nextDate) {
        const currentItem = items.find((item) => item.id === id);
        if (!currentItem) {
            return;
        }

        if (!statusAllowsSchedule(currentItem.status)) {
            showFeedback("A data so pode ser alterada quando o status for Pendente ou Reagendar.", "error");
            return;
        }

        const nextItem = buildNextItemState(currentItem, { agendado_para: nextDate });

        if (statusNeedsReason(currentItem.status) && !getReasonText(nextItem)) {
            showFeedback("Informe o motivo na observacao para salvar Pendente ou Reagendar.", "error");
            return;
        }

        handleSave(id, { agendado_para: nextItem.agendado_para });
    }

    function handleClearSchedule(id) {
        handleScheduleChange(id, "");
    }

    function handleQuickStatus(id, nextStatus) {
        const currentItem = items.find((item) => item.id === id);
        if (!currentItem) {
            return;
        }

        const nextItem = buildNextItemState(currentItem, { status: nextStatus });
        const defaultQuickObservation =
            statusNeedsReason(nextStatus) && !getReasonText(nextItem)
                ? QUICK_OBSERVATION_PRESETS_BY_LABEL.Reagendar?.text || "Necessario reagendar com a unidade."
                : "";
        handleSave(id, {
            status: nextStatus,
            agendado_para: nextItem.agendado_para,
            nova_observacao: defaultQuickObservation,
        });
    }

    function handleQuickObservation(id, note) {
        handleSave(id, {
            nova_observacao: String(note || "").trim(),
        });
    }

    async function handleSave(id, overrideFields = null) {
        const currentItem = items.find((item) => item.id === id);
        const originalItem = originalItems[id];
        if (!currentItem || !originalItem) {
            return;
        }

        const payload = buildNextItemState(currentItem, overrideFields || {});
        const hasNewObservation = Boolean(String(payload.nova_observacao || "").trim());
        const statusChanged = payload.status !== originalItem.status;
        const scheduleChanged = String(payload.agendado_para || "") !== String(originalItem.agendado_para || "");
        const technicianChanged =
            String(payload.tecnico || "").trim() !== String(originalItem.tecnico || "").trim();

        if (statusNeedsReason(payload.status) && !getReasonText(payload)) {
            showFeedback("Para status Pendente ou Reagendar, informe o motivo na observacao.", "error");
            return;
        }

        if (!hasNewObservation && !statusChanged && !scheduleChanged && !technicianChanged) {
            return;
        }

        setSavingId(id);
        try {
            const data = await requestJson(`/api/atendimentos/${id}`, {
                method: "PUT",
                body: JSON.stringify({
                    status: payload.status,
                    tecnico: String(payload.tecnico || "").trim(),
                    nova_observacao: String(payload.nova_observacao || "").trim(),
                    agendado_para: String(payload.agendado_para || "").trim(),
                }),
            });

            const savedItem = normalizeAttendanceItem(data.item || payload);
            const shouldReloadByDayFilter =
                Boolean(filters.day) && filters.day !== getTodayDate();

            updateCountersFromItemChange(originalItem, savedItem);

            if (shouldReloadByDayFilter) {
                await loadAttendances();
            } else if (itemMatchesCurrentOperationalFilters(savedItem)) {
                applyServerItemToState(savedItem);
            } else {
                removeItemFromState(id);
                setPagination((current) => ({
                    ...current,
                    totalItems: Math.max(0, (current.totalItems || 0) - 1),
                }));
            }

            refreshOperationalSupportData().catch(() => {});
            showFeedback("Atendimento atualizado.");
        } catch (error) {
            handleAppError(error);
            await loadAttendances();
        } finally {
            setSavingId(null);
        }
    }

    async function handleDelete(id) {
        const confirmed = window.confirm("Deseja excluir este atendimento?");
        if (!confirmed) {
            return;
        }

        setDeletingId(id);
        try {
            await requestJson(`/api/atendimentos/${id}`, { method: "DELETE" });
            showFeedback("Atendimento excluido.");
            setExpandedAttendanceId((current) => (current === id ? null : current));
            await loadAttendances();
        } catch (error) {
            handleAppError(error);
        } finally {
            setDeletingId(null);
        }
    }

    async function handleReport(showSuccessFeedback = true) {
        setReportLoading(true);
        try {
            const data = await requestJson(`/api/relatorios/diario?day=${reportDay}`);
            setReportData(data);
            setReportGeneratedAt(
                new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            );
            if (showSuccessFeedback) {
                showFeedback("Relatorio gerado.");
            }
        } catch (error) {
            handleAppError(error);
        } finally {
            setReportLoading(false);
        }
    }

    async function handleChangeUsername(payload) {
        setSettingsBusy(true);
        try {
            const data = await requestJson("/api/auth/change-username", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            showFeedback(data.message || "Nome de usuario atualizado.");
            await onAuthFailure();
            return true;
        } catch (error) {
            handleAppError(error);
            return false;
        } finally {
            setSettingsBusy(false);
        }
    }

    function handleTeamFormChange(field, value) {
        setTeamForm((current) => ({
            ...current,
            [field]: value,
        }));
    }

    async function handleSaveTeam(event) {
        event.preventDefault();
        const payload = buildTeamSubmissionPayload(teamForm);

        if (!payload.representante) {
            showFeedback("Informe o nome do representante antes de salvar.", "error");
            return;
        }

        if (!payload.tecnicos.length) {
            showFeedback("Informe ao menos um tecnico valido. Use um nome por linha ou separado por virgula.", "error");
            return;
        }

        setTeamBusy(true);
        try {
            const data = await requestJson("/api/equipes", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            showFeedback(data.message || "Equipe atualizada.");
            setTeamForm((current) => ({
                ...emptyTeamForm,
                representante: payload.representante,
            }));
            await loadAttendances();
        } catch (error) {
            handleAppError(error);
        } finally {
            setTeamBusy(false);
        }
    }

    function handleUseRepresentative(representante) {
        setTeamForm((current) => ({
            ...current,
            representante,
        }));
    }

    async function handleDeleteTeam(id) {
        const confirmed = window.confirm("Deseja remover este vinculo de equipe?");
        if (!confirmed) {
            return;
        }

        setDeletingTeamId(id);
        try {
            const data = await requestJson(`/api/equipes/${id}`, {
                method: "DELETE",
            });
            showFeedback(data.message || "Vinculo removido.");
            await loadAttendances();
        } catch (error) {
            handleAppError(error);
        } finally {
            setDeletingTeamId(null);
        }
    }

    async function handleCopyReport() {
        if (!currentReportText.trim()) {
            showFeedback("Gere o relatorio antes de copiar.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(currentReportText);
            showFeedback("Relatorio copiado.");
        } catch (_error) {
            showFeedback("Nao foi possivel copiar o relatorio.", "error");
        }
    }

    async function handleCopyWhatsapp() {
        if (!reportData?.whatsapp_text?.trim()) {
            showFeedback("Gere o relatorio antes de copiar para WhatsApp.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(reportData.whatsapp_text);
            showFeedback("Texto do WhatsApp copiado.");
        } catch (_error) {
            showFeedback("Nao foi possivel copiar o texto do WhatsApp.", "error");
        }
    }

    async function downloadFileFromUrl(url, fallbackFileName, notFoundMessage, defaultErrorMessage) {
        const response = await fetch(url, {
            credentials: "same-origin",
        });

        if (!response.ok) {
            let data = {};
            try {
                data = await response.json();
            } catch (_error) {
                data = {};
            }
            const error = new Error(
                response.status === 404
                    ? notFoundMessage
                    : (data.error || defaultErrorMessage)
            );
            error.status = response.status;
            throw error;
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        const contentDisposition = response.headers.get("content-disposition") || "";
        const fileNameMatch = contentDisposition.match(/filename=\"?([^\"]+)\"?/i);

        downloadLink.href = downloadUrl;
        downloadLink.download = fileNameMatch?.[1] || fallbackFileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.URL.revokeObjectURL(downloadUrl);
    }

    async function handleExportAttendances() {
        const exportFilters = {
            status: "",
            tecnico: "",
            inep: "",
            day: "",
            sortBy: filters.sortBy,
            sortDir: filters.sortDir,
            page: 1,
            pageSize: filters.pageSize,
        };
        const params = buildAttendanceParams(exportFilters, {
            includePagination: false,
            exportAll: true,
        });

        setExportingAttendances(true);
        try {
            await downloadFileFromUrl(
                `/api/atendimentos/exportar?${params.toString()}`,
                `chamados-${getTodayDate()}.xml`,
                "A rota de exportacao XML nao foi encontrada. Reinicie o servidor para carregar a versao mais recente do backend.",
                "Nao foi possivel exportar a planilha XML."
            );
            showFeedback("Planilha XML com todos os chamados exportada.");
        } catch (error) {
            handleAppError(error);
        } finally {
            setExportingAttendances(false);
        }
    }

    async function handleExportPowerBi() {
        setExportingPowerBi(true);
        try {
            await downloadFileFromUrl(
                "/api/atendimentos/exportar/power-bi",
                `powerbi-chamados-${getTodayDate()}.json`,
                "A rota de exportacao para Power BI nao foi encontrada. Reinicie o servidor para carregar a versao mais recente do backend.",
                "Nao foi possivel exportar o arquivo para Power BI."
            );
            showFeedback("Arquivo estruturado para Power BI exportado.");
        } catch (error) {
            handleAppError(error);
        } finally {
            setExportingPowerBi(false);
        }
    }

    function handleAutomationFieldChange(field, value) {
        setAutomationDirty(true);
        setWhatsappAutomation((current) => ({
            ...current,
            [field]: value,
        }));
    }

    async function handleSaveAutomationSettings() {
        setAutomationBusy(true);
        try {
            const data = await requestJson("/api/automation/whatsapp", {
                method: "PUT",
                body: JSON.stringify({
                    enabled: whatsappAutomation.enabled,
                    phone: whatsappAutomation.phone,
                    scheduleMode: whatsappAutomation.scheduleMode,
                    intervalHours: whatsappAutomation.intervalHours,
                    fixedTimes: whatsappAutomation.fixedTimes,
                }),
            });
            setWhatsappAutomation(buildEmptyAutomationState(data));
            setAutomationDirty(false);
            showFeedback("Automacao atualizada.");
        } catch (error) {
            handleAppError(error);
        } finally {
            setAutomationBusy(false);
        }
    }

    async function handleSendWhatsappNow() {
        const phone = String(whatsappAutomation.phone || "").trim();
        if (!phone) {
            showFeedback("Informe o numero do seu WhatsApp para disparar o relatorio.", "error");
            return;
        }

        try {
            const data = await requestJson("/api/automation/whatsapp/run", {
                method: "POST",
                body: JSON.stringify({
                    reportDay,
                    phone,
                }),
            });
            if (data.report) {
                setReportData(data.report);
                setReportGeneratedAt(
                    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                );
            }
            if (data.automation) {
                setWhatsappAutomation(buildEmptyAutomationState(data.automation));
                setAutomationDirty(false);
            }
            showFeedback(data.message || "WhatsApp aberto com o relatorio pronto para envio.");
        } catch (error) {
            handleAppError(error);
        }
    }

    function handleExportPdf() {
        if (!currentReportText.trim()) {
            showFeedback("Gere o relatorio antes de exportar.", "error");
            return;
        }

        const reportWindow = window.open("", "_blank", "width=900,height=700");
        if (!reportWindow) {
            showFeedback("Nao foi possivel abrir a janela de exportacao.", "error");
            return;
        }

        reportWindow.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8" />
                <title>Relatorio do Dia</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
                    h1 { margin: 0 0 12px; font-size: 24px; }
                    p { margin: 0 0 20px; color: #475467; }
                    pre {
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-family: Arial, sans-serif;
                        background: #f8fafc;
                        border: 1px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 20px;
                        line-height: 1.6;
                    }
                </style>
            </head>
            <body>
                <h1>Relatorio do Dia</h1>
                <p>Exportacao pronta para PDF</p>
                <pre>${currentReportText
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")}</pre>
            </body>
            </html>
        `);
        reportWindow.document.close();
        reportWindow.focus();
        reportWindow.print();
    }

    function handleChangePage(nextPage) {
        if (nextPage < 1 || nextPage > pagination.totalPages || nextPage === filters.page) {
            return;
        }
        setFilters((current) => ({
            ...current,
            page: nextPage,
        }));
    }

    function handleChangePageSize(nextPageSize) {
        setFilters((current) => ({
            ...current,
            page: 1,
            pageSize: Number(nextPageSize),
        }));
    }

    return html`
        <main className="container">
            <section className="hero-panel">
                <div className="hero-copy">
                    <span className="hero-kicker">${heroView.kicker}</span>
                    <div className="hero-title-row">
                        <span className="hero-icon"><${Icon} name="dashboard" /></span>
                        <div><h1>${heroView.title}</h1></div>
                    </div>
                    <p>${heroView.description}</p>
                    <div className="hero-metrics">
                        ${heroView.metrics.map((metric) => html`
                            <article className="hero-metric" key=${metric.label}>
                                <span>${metric.label}</span>
                                <strong>${metric.value}</strong>
                            </article>
                        `)}
                    </div>
                </div>
                <div className="hero-actions">
                    <button
                        className="secondary-button theme-toggle"
                        type="button"
                        onClick=${onToggleTheme}
                    >
                        <${Icon} name=${theme === "dark" ? "sun" : "moon"} />
                        <span>${theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
                    </button>
                    <div className="user-badge">
                        <span>Usuario ativo</span>
                        <strong>${currentUser?.username || "--"}</strong>
                    </div>
                    <button className="secondary-button" type="button" onClick=${onLogout}>
                        Sair
                    </button>
                </div>
            </section>

            <${Feedback} feedback=${feedback} onDismiss=${() => setFeedback(null)} />

            <div className="tabs-navigation">
                <button
                    className=${`tab-button ${activeTab === "operational" ? "active" : ""}`}
                    type="button"
                    onClick=${() => setActiveTab("operational")}
                >
                    <${Icon} name="dashboard" />
                    Operacional
                </button>
                <button
                    className=${`tab-button ${activeTab === "managerial" ? "active" : ""}`}
                    type="button"
                    onClick=${() => setActiveTab("managerial")}
                >
                    <${Icon} name="target" />
                    Gerencial
                </button>
                <button
                    className=${`tab-button ${activeTab === "reports" ? "active" : ""}`}
                    type="button"
                    onClick=${() => setActiveTab("reports")}
                >
                    <${Icon} name="report" />
                    Relatorios
                </button>
            </div>

            ${activeTab === "operational" ? html`
                <section className="panel panel-form">
                    <div className="panel-header">
                        <div>
                            <span className="section-kicker"><${Icon} name="plus" />Entrada Rapida</span>
                            <h2>Novo Atendimento</h2>
                            <p className="panel-tip">Cadastro rapido para alimentar a fila operacional sem sair da rotina de campo.</p>
                        </div>
                    </div>
                    <form className="inline-form" onSubmit=${handleCreate}>
                        <label>
                            <span>INEP</span>
                            <input type="text" inputMode="numeric" pattern="[0-9]+" placeholder="Ex: 50035053" value=${form.inep} onChange=${(event) => handleFormChange("inep", event.target.value)} required />
                        </label>
                        <label>
                            <span>Tecnico</span>
                            <input type="text" placeholder="Nome do tecnico" value=${form.tecnico} onChange=${(event) => handleFormChange("tecnico", event.target.value)} required />
                        </label>
                        <label>
                            <span>Status</span>
                            <select value=${form.status} onChange=${(event) => handleFormChange("status", event.target.value)}>
                                ${statusOptions.map((status) => html`<option value=${status} key=${status}>${status}</option>`)}
                            </select>
                        </label>
                        ${statusAllowsSchedule(form.status)
                            ? html`
                                  <label>
                                      <span>Nova data (opcional)</span>
                                      <input
                                          type="date"
                                          value=${form.agendado_para}
                                          onChange=${(event) => handleFormChange("agendado_para", event.target.value)}
                                      />
                                      <small className="form-helper">
                                          Disponivel para Pendente ou Reagendar. Pode salvar sem data.
                                      </small>
                                  </label>
                              `
                            : null}
                        <label className="wide">
                            <span>${statusNeedsReason(form.status) ? "Motivo" : "Observacao inicial"}</span>
                            <input
                                type="text"
                                placeholder=${statusNeedsReason(form.status)
                                    ? "Informe o motivo da pendencia ou reagendamento"
                                    : "Detalhe inicial do atendimento"}
                                value=${form.observacao}
                                onChange=${(event) => handleFormChange("observacao", event.target.value)}
                            />
                        </label>
                    <button className="primary-button form-submit" type="submit" disabled=${submitting}>
                        ${submitting ? "Salvando..." : "Salvar atendimento"}
                    </button>
                </form>
                </section>

                <section className="panel panel-table">
                <div className="panel-header panel-header-filters">
                    <div>
                        <span className="section-kicker"><${Icon} name="filter" />Fila Operacional</span>
                        <h2>Atendimentos em Campo</h2>
                        <p className="panel-tip">Leitura rapida, status de um toque e preservacao da ordem da fila durante as atualizacoes.</p>
                    </div>
                    <div className="report-action-buttons">
                        <button
                            className="secondary-button"
                            type="button"
                            onClick=${() => loadAttendances()}
                            disabled=${loading}
                        >
                            ${loading ? "Atualizando..." : "Atualizar tabela"}
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick=${handleExportAttendances}
                            disabled=${exportingAttendances}
                        >
                            <${Icon} name="file" />
                            <span>${exportingAttendances ? "Exportando..." : "Exportar Excel XML"}</span>
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick=${handleExportPowerBi}
                            disabled=${exportingPowerBi}
                        >
                            <${Icon} name="report" />
                            <span>${exportingPowerBi ? "Exportando..." : "Exportar Power BI"}</span>
                        </button>
                    </div>
                </div>

                <div className="operational-filter-bar">
                    <div className="quick-filter-group">
                        ${operationalQuickFilters.map((option) => html`
                            <button
                                className=${`quick-filter-button ${filters.quickView === option.id ? "active" : ""}`}
                                type="button"
                                onClick=${() => handleQuickFilterChange(option.id)}
                                key=${option.id}
                            >
                                ${option.label}
                            </button>
                        `)}
                    </div>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick=${() => setShowAdvancedOperationalFilters((current) => !current)}
                    >
                        <${Icon} name="filter" />
                        ${showAdvancedOperationalFilters ? "Ocultar filtros avancados" : "Mostrar filtros avancados"}
                    </button>
                </div>

                ${showAdvancedOperationalFilters
                    ? html`
                          <div className="filters filters-extended">
                              <label>
                                  <span>Status</span>
                                  <select value=${filters.status} onChange=${(event) => handleFilterChange("status", event.target.value)}>
                                      <option value="">Todos</option>
                                      ${statusOptions.map((status) => html`<option value=${status} key=${status}>${status}</option>`)}
                                  </select>
                              </label>
                              <label>
                                  <span>Tecnico</span>
                                  <input type="text" placeholder="Filtrar por tecnico" value=${filters.tecnico} onChange=${(event) => handleFilterChange("tecnico", event.target.value)} />
                              </label>
                              <label>
                                  <span><${Icon} name="search" /> INEP</span>
                                  <input type="text" placeholder="Buscar por INEP" value=${filters.inep} onChange=${(event) => handleFilterChange("inep", event.target.value)} />
                              </label>
                              <label>
                                  <span><${Icon} name="calendar" /> Dia</span>
                                  <select value=${filters.day} onChange=${(event) => handleFilterChange("day", event.target.value)}>
                                      <option value="">Todos os dias</option>
                                      ${availableDays.map((dayItem) => html`
                                          <option value=${dayItem.day} key=${dayItem.day}>
                                              ${formatReportDate(dayItem.day)} (${dayItem.total})
                                          </option>
                                      `)}
                                  </select>
                              </label>
                          </div>
                      `
                    : null}

                <div className="table-meta">
                    <span>${items.length} atendimento(s) exibido(s) nesta pagina</span>
                    <span>${hasFilters ? "Filtros ativos" : "Sem filtros aplicados"}</span>
                </div>

                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>
                                    <button
                                        className="column-sort-button"
                                        type="button"
                                        onClick=${handleToggleInepSort}
                                    >
                                        <span>Atendimento</span>
                                        <span className="column-sort-indicator">
                                            ${filters.sortBy === "inep"
                                                ? (filters.sortDir === "asc" ? "A-Z" : "Z-A")
                                                : "Ordenar"}
                                        </span>
                                    </button>
                                </th>
                                <th>Tecnico</th>
                                <th>Status</th>
                                <th>Ultima atualizacao</th>
                                <th>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loading
                                ? html`<tr><td colSpan="5" className="empty-state">Carregando atendimentos...</td></tr>`
                                : items.length
                                  ? items.map((item) => html`
                                        <${AttendanceRow}
                                            key=${item.id}
                                            item=${item}
                                            isDetailOpen=${expandedAttendanceId === item.id}
                                            expandedHistoryIds=${expandedHistoryIds}
                                            editingTechnicianId=${editingTechnicianId}
                                            onFieldChange=${handleFieldChange}
                                            onQuickObservation=${handleQuickObservation}
                                            onQuickStatus=${handleQuickStatus}
                                            onStatusChange=${handleStatusChange}
                                            onScheduleChange=${handleScheduleChange}
                                            onClearSchedule=${handleClearSchedule}
                                            onSave=${handleSave}
                                            onDelete=${handleDelete}
                                            onToggleDetails=${handleToggleAttendanceDetails}
                                            onToggleHistory=${handleToggleHistory}
                                            onToggleEditTechnician=${handleToggleEditTechnician}
                                            savingId=${savingId}
                                            deletingId=${deletingId}
                                        />
                                    `)
                                  : html`
                                        <tr>
                                            <td colSpan="5" className="empty-state">
                                                ${hasFilters
                                                    ? "Nenhum atendimento encontrado para os filtros aplicados."
                                                    : "Nenhum atendimento cadastrado ainda."}
                                            </td>
                                        </tr>
                                    `}
                        </tbody>
                    </table>
                </div>

                <div className="pagination-bar">
                    <div className="pagination-info">
                        <strong>${pagination.totalItems || 0}</strong>
                        <span>Total de registros</span>
                    </div>
                    <div className="pagination-controls">
                        <label className="pagination-page-size">
                            <span>Itens por pagina</span>
                            <select value=${String(filters.pageSize)} onChange=${(event) => handleChangePageSize(event.target.value)}>
                                ${PAGE_SIZE_OPTIONS.map((option) => html`
                                    <option value=${String(option)} key=${option}>${option}</option>
                                `)}
                            </select>
                        </label>
                        <span className="pagination-summary">
                            Pagina ${pagination.page || 1} de ${pagination.totalPages || 1}
                        </span>
                        <button className="secondary-button" type="button" onClick=${() => handleChangePage((pagination.page || 1) - 1)} disabled=${!pagination.hasPreviousPage}>
                            Anterior
                        </button>
                        <button className="secondary-button" type="button" onClick=${() => handleChangePage((pagination.page || 1) + 1)} disabled=${!pagination.hasNextPage}>
                            Proxima
                        </button>
                    </div>
                </div>
                </section>
            ` : activeTab === "managerial" ? html`
            <${SummaryCards} counters=${counters} />

            <${ReturnAgendaSection} agendaData=${returnAgenda} />

            <${SettingsSection}
                currentUser=${currentUser}
                onChangeUsername=${handleChangeUsername}
                settingsBusy=${settingsBusy}
            />

            <${TeamManagementSection}
                teamData=${teamData}
                teamForm=${teamForm}
                onTeamFormChange=${handleTeamFormChange}
                onSaveTeam=${handleSaveTeam}
                onDeleteTeam=${handleDeleteTeam}
                onUseRepresentative=${handleUseRepresentative}
                teamBusy=${teamBusy}
                deletingTeamId=${deletingTeamId}
            />
            ` : html`
            <${ReportsWorkspace}
                availableDays=${availableDays}
                reportDay=${reportDay}
                onReportDayChange=${setReportDay}
                reportData=${reportData}
                reportMode=${reportMode}
                onReportModeChange=${setReportMode}
                reportGeneratedAt=${reportGeneratedAt}
                reportLoading=${reportLoading}
                onGenerateReport=${() => handleReport(true)}
                onCopyReport=${handleCopyReport}
                onCopyWhatsapp=${handleCopyWhatsapp}
                onExportPdf=${handleExportPdf}
                currentReportText=${currentReportText}
                reportTotal=${reportTotal}
                whatsappAutomation=${whatsappAutomation}
                automationBusy=${automationBusy}
                automationDirty=${automationDirty}
                onAutomationFieldChange=${handleAutomationFieldChange}
                onSaveAutomationSettings=${handleSaveAutomationSettings}
                nextAutomationAt=${nextAutomationAt}
                remainingAutomationTime=${remainingAutomationTime}
                onSendWhatsappNow=${handleSendWhatsappNow}
            />
            `}
        </main>
    `;
}
