import { requestJson } from "./api.js";
import {
    AUTOMATION_INTERVAL_HOUR_OPTIONS,
    AUTOMATION_SCHEDULE_MODE_OPTIONS,
    EMPTY_REPORT_OVERVIEW,
    REPORT_MODES,
    REPORT_MODE_LABELS,
    operationalQuickStatuses,
    quickObservationPresets,
    statusOptions,
} from "./constants.js";
import { Icon } from "./components/icon.js";
import { html, useEffect, useState } from "./shared.js";
import {
    buildGroupedStatusIneps,
    buildProblemLabel,
    buildReportDayOptions,
    formatDate,
    formatDateTime,
    formatRemainingTime,
    formatReportDate,
    getLatestObservation,
    getReportSections,
    getPriorityLabel,
    getStatusClassName,
    getTodayDate,
    parseTechnicianList,
    splitObservationHistory,
    statusAllowsSchedule,
    statusNeedsReason,
} from "./utils.js";
export { Icon };

export function Feedback({ feedback, onDismiss }) {
    if (!feedback) {
        return null;
    }

    const iconName = feedback.type === "error" ? "warning" : "target";

    return html`
        <div className=${`feedback ${feedback.type}`}>
            <div className="feedback-copy">
                <span className="feedback-icon"><${Icon} name=${iconName} /></span>
                <span>${feedback.message}</span>
            </div>
            <button className="icon-button" type="button" onClick=${onDismiss}>Fechar</button>
        </div>
    `;
}

export function AuthScreen({ theme, onToggleTheme, setupRequired, onAuthenticated }) {
    const [mode, setMode] = useState(setupRequired ? "setup" : "login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        setMode(setupRequired ? "setup" : "login");
        setFeedback(null);
    }, [setupRequired]);

    async function handleSubmit(event) {
        event.preventDefault();

        if (mode === "setup" && password !== confirmPassword) {
            setFeedback({
                type: "error",
                message: "A confirmacao da senha precisa ser igual a senha informada.",
            });
            return;
        }

        setSubmitting(true);
        try {
            await requestJson(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            setFeedback(null);
            await onAuthenticated();
        } catch (error) {
            if (error.setupRequired) {
                setMode("setup");
            }
            setFeedback({
                type: "error",
                message: error.message,
            });
        } finally {
            setSubmitting(false);
        }
    }

    return html`
        <main className="auth-shell">
            <section className="auth-hero">
                <div className="auth-hero-copy">
                    <span className="hero-kicker">Acesso Protegido</span>
                    <h1>Controle de Atendimentos</h1>
                    <p>
                        ${mode === "setup"
                            ? "Configure o usuario administrador para proteger o sistema antes da publicacao."
                            : "Entre com seu usuario para acessar o painel operacional e os relatorios do dia."}
                    </p>
                </div>
                <button className="secondary-button theme-toggle" type="button" onClick=${onToggleTheme}>
                    <${Icon} name=${theme === "dark" ? "sun" : "moon"} />
                    <span>${theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
                </button>
            </section>

            <section className="auth-card">
                <div className="auth-card-header">
                    <span className="section-kicker">
                        <${Icon} name="target" />
                        ${mode === "setup" ? "Primeiro Acesso" : "Login"}
                    </span>
                    <h2>${mode === "setup" ? "Criar usuario administrador" : "Entrar no sistema"}</h2>
                    <p>
                        ${mode === "setup"
                            ? "Esse usuario sera usado para acessar o painel e proteger a API."
                            : "Use seu usuario administrador para continuar."}
                    </p>
                </div>

                <${Feedback} feedback=${feedback} onDismiss=${() => setFeedback(null)} />

                <form className="auth-form" onSubmit=${handleSubmit}>
                    <label>
                        <span>Usuario</span>
                        <input
                            type="text"
                            autoComplete="username"
                            value=${username}
                            onChange=${(event) => setUsername(event.target.value)}
                            required
                        />
                    </label>
                    <label>
                        <span>Senha</span>
                        <input
                            type="password"
                            autoComplete=${mode === "setup" ? "new-password" : "current-password"}
                            value=${password}
                            onChange=${(event) => setPassword(event.target.value)}
                            required
                        />
                    </label>
                    ${mode === "setup"
                        ? html`
                              <label>
                                  <span>Confirmar senha</span>
                                  <input
                                      type="password"
                                      autoComplete="new-password"
                                      value=${confirmPassword}
                                      onChange=${(event) => setConfirmPassword(event.target.value)}
                                      required
                                  />
                              </label>
                          `
                        : null}
                    <button className="primary-button auth-submit" type="submit" disabled=${submitting}>
                        ${submitting
                            ? (mode === "setup" ? "Configurando..." : "Entrando...")
                            : (mode === "setup" ? "Criar acesso" : "Entrar")}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>
                        ${mode === "setup"
                            ? "Senha minima recomendada: 8 caracteres."
                            : "Se este for o primeiro uso, crie o usuario administrador."}
                    </span>
                    <button
                        className="icon-button auth-switch"
                        type="button"
                        onClick=${() => {
                            setMode((current) => (current === "setup" ? "login" : "setup"));
                            setFeedback(null);
                        }}
                    >
                        ${mode === "setup" ? "Ja tenho usuario" : "Primeiro acesso"}
                    </button>
                </div>
            </section>
        </main>
    `;
}

export function SummaryCards({ counters }) {
    return html`
        <section className="summary-grid">
            ${statusOptions.map(
                (status) => html`
                    <article className=${`summary-card ${getStatusClassName(status)}`} key=${status}>
                        <span className="summary-accent"></span>
                        <span className="summary-label">${status}</span>
                        <strong className="summary-value">${counters[status] || 0}</strong>
                    </article>
                `
            )}
        </section>
    `;
}

export function SettingsSection({ currentUser, onChangeUsername, settingsBusy }) {
    const [usernameForm, setUsernameForm] = useState({
        nextUsername: currentUser?.username || "",
        currentPassword: "",
    });

    useEffect(() => {
        setUsernameForm((current) => ({
            ...current,
            nextUsername: currentUser?.username || "",
            currentPassword: "",
        }));
    }, [currentUser?.username]);

    async function handleUsernameSubmit(event) {
        event.preventDefault();
        const completed = await onChangeUsername(usernameForm);
        if (completed) {
            setUsernameForm((current) => ({
                ...current,
                currentPassword: "",
            }));
        }
    }

    return html`
        <section className="panel settings-panel">
            <div className="panel-header">
                <div>
                    <span className="section-kicker"><${Icon} name="target" />Ajustes</span>
                    <h2>Usuario</h2>
                    <p className="panel-tip">Use esta area para atualizar o nome do usuario de acesso.</p>
                </div>
            </div>

            <div className="settings-grid">
                <form className="settings-card" onSubmit=${handleUsernameSubmit}>
                    <div className="settings-card-header">
                        <strong>Alterar nome do usuario</strong>
                        <span>Usuario atual: ${currentUser?.username || "--"}</span>
                    </div>
                    <label>
                        <span>Novo nome de usuario</span>
                        <input
                            type="text"
                            value=${usernameForm.nextUsername}
                            onChange=${(event) =>
                                setUsernameForm((current) => ({
                                    ...current,
                                    nextUsername: event.target.value,
                                }))}
                            required
                        />
                    </label>
                    <label>
                        <span>Senha atual</span>
                        <input
                            type="password"
                            value=${usernameForm.currentPassword}
                            onChange=${(event) =>
                                setUsernameForm((current) => ({
                                    ...current,
                                    currentPassword: event.target.value,
                                }))}
                            required
                        />
                    </label>
                    <button className="primary-button" type="submit" disabled=${settingsBusy}>
                        ${settingsBusy ? "Salvando..." : "Atualizar usuario"}
                    </button>
                </form>
            </div>
        </section>
    `;
}

export function TeamManagementSection({
    teamData,
    teamForm,
    onTeamFormChange,
    onSaveTeam,
    onDeleteTeam,
    onUseRepresentative,
    teamBusy,
    deletingTeamId,
}) {
    const groups = teamData?.groups || [];
    const representativeOptions = groups.map((group) => group.representante);
    const parsedTechnicians = parseTechnicianList(teamForm.tecnicos || teamForm.tecnico);
    const previewTechnicians = parsedTechnicians.slice(0, 4);
    const hasRepresentativeName = Boolean(String(teamForm.representante || "").trim());

    return html`
        <section className="panel team-panel">
            <div className="panel-header">
                <div>
                    <span className="section-kicker"><${Icon} name="target" />Equipes</span>
                    <h2>Representantes e Tecnicos</h2>
                    <p className="panel-tip">Cadastre quem responde por cada tecnico para acompanhar a operacao por equipe no kanban.</p>
                </div>
                <div className="agenda-total">
                    <span>Representantes</span>
                    <strong>${teamData?.total_representatives || 0}</strong>
                </div>
            </div>

            <div className="team-management-grid">
                <form className="settings-card team-form-card" onSubmit=${onSaveTeam}>
                    <div className="settings-card-header">
                        <strong>Representante e tecnicos</strong>
                        <span>${teamData?.total_links || 0} tecnico(s) vinculados</span>
                    </div>
                    <div className="team-form-insight">
                        <div className="team-form-count">
                            <span>Tecnicos prontos para salvar</span>
                            <strong>${parsedTechnicians.length}</strong>
                        </div>
                        <div className="team-form-guides">
                            <span>${hasRepresentativeName ? `Representante em foco: ${teamForm.representante}` : "Informe o representante antes de salvar."}</span>
                            <span>${parsedTechnicians.length ? "Nomes duplicados sao ignorados automaticamente." : "Voce pode colar uma lista inteira com um nome por linha."}</span>
                        </div>
                    </div>
                    <label>
                        <span>Representante</span>
                        <input
                            type="text"
                            list="team-representatives"
                            value=${teamForm.representante}
                            onChange=${(event) => onTeamFormChange("representante", event.target.value)}
                            placeholder="Nome do representante"
                            required
                        />
                        <datalist id="team-representatives">
                            ${representativeOptions.map((representative) => html`
                                <option value=${representative} key=${representative}></option>
                            `)}
                        </datalist>
                    </label>
                    <label>
                        <span>Tecnicos</span>
                        <textarea
                            className="team-batch-input"
                            rows="6"
                            value=${teamForm.tecnicos}
                            onChange=${(event) => onTeamFormChange("tecnicos", event.target.value)}
                            placeholder="Ex.: Ana Silva&#10;Carlos Souza&#10;Marina Oliveira"
                            required
                        ></textarea>
                    </label>
                    ${previewTechnicians.length
                        ? html`
                              <div className="team-preview-chips">
                                  ${previewTechnicians.map((technician) => html`
                                      <span className="team-preview-chip" key=${technician}>${technician}</span>
                                  `)}
                                  ${parsedTechnicians.length > previewTechnicians.length
                                      ? html`<span className="team-preview-chip more">+${parsedTechnicians.length - previewTechnicians.length}</span>`
                                      : null}
                              </div>
                          `
                        : null}
                    <small className="form-helper">
                        Use um nome por linha ou separe por virgula, ponto e virgula ou tabulacao. Se o tecnico ja estiver vinculado, o sistema move esse tecnico para a nova equipe.
                    </small>
                    <button className="primary-button" type="submit" disabled=${teamBusy}>
                        ${teamBusy ? "Salvando..." : "Salvar tecnicos"}
                    </button>
                </form>

                <div className="team-directory">
                    <div className="team-directory-header">
                        <strong>Mapa atual</strong>
                        <span>${groups.length ? `${groups.length} equipe(s)` : "Sem equipes cadastradas"}</span>
                    </div>
                    <div className="team-directory-grid">
                        ${groups.length
                            ? groups.map((group) => html`
                                  <article className="team-group-card" key=${group.representante}>
                                      <div className="team-group-header">
                                          <div>
                                              <strong>${group.representante}</strong>
                                              <span>${group.total} tecnico(s)</span>
                                          </div>
                                          <button
                                              className="secondary-button team-select-button"
                                              type="button"
                                              onClick=${() => onUseRepresentative(group.representante)}
                                          >
                                              Adicionar tecnicos
                                          </button>
                                      </div>
                                      <div className="team-member-list">
                                          ${group.technicians.map((member) => html`
                                              <div className="team-member-item" key=${member.id}>
                                                  <span>${member.tecnico}</span>
                                                  <button
                                                      className="secondary-button team-remove-button"
                                                      type="button"
                                                      onClick=${() => onDeleteTeam(member.id)}
                                                      disabled=${deletingTeamId === member.id}
                                                  >
                                                      ${deletingTeamId === member.id ? "..." : "Remover"}
                                                  </button>
                                              </div>
                                          `)}
                                      </div>
                                  </article>
                              `)
                            : html`
                                  <div className="report-highlight-empty">
                                      Cadastre representantes e tecnicos para enxergar o kanban por equipe.
                                  </div>
                              `}
                    </div>
                </div>
            </div>
        </section>
    `;
}

export function ReturnAgendaSection({ agendaData }) {
    const groups = agendaData?.groups || [];
    const scheduleSummary = agendaData?.schedule_summary || {
        atrasados: 0,
        hoje: 0,
        amanha: 0,
        proximos: 0,
    };
    const teamSummary = agendaData?.team_summary || [];

    return html`
        <section className="panel agenda-panel">
            <div className="panel-header">
                <div>
                    <span className="section-kicker"><${Icon} name="calendar" />Kanban de Retornos</span>
                    <h2>Programacao Visual</h2>
                    <p className="panel-tip">A coluna Hoje mostra tudo que foi movimentado no dia, enquanto as demais acompanham o que esta agendado para retorno.</p>
                </div>
                <div className="agenda-total">
                    <span>Total no kanban</span>
                    <strong>${agendaData?.total || 0}</strong>
                </div>
            </div>

            <div className="agenda-summary-grid">
                <article className="agenda-summary-card">
                    <span>Atrasados</span>
                    <strong>${scheduleSummary.atrasados}</strong>
                </article>
                <article className="agenda-summary-card">
                    <span>Hoje</span>
                    <strong>${scheduleSummary.hoje}</strong>
                </article>
                <article className="agenda-summary-card">
                    <span>Amanha</span>
                    <strong>${scheduleSummary.amanha}</strong>
                </article>
                <article className="agenda-summary-card">
                    <span>Proximos dias</span>
                    <strong>${scheduleSummary.proximos}</strong>
                </article>
            </div>

            <div className="agenda-team-section">
                <div className="report-highlights-header">
                    <strong>Leitura por equipe</strong>
                    <span>${teamSummary.length} equipe(s)</span>
                </div>
                <div className="agenda-team-grid">
                    ${teamSummary.length
                        ? teamSummary.map((group) => html`
                              <article className="agenda-team-card" key=${group.representante}>
                                  <div className="agenda-team-card-header">
                                      <div>
                                          <strong>${group.representante}</strong>
                                          <span>${group.total_tecnicos} tecnico(s)</span>
                                      </div>
                                      <span className="time-chip">${group.total} agenda(s)</span>
                                  </div>
                                  <div className="agenda-team-metrics">
                                      <span>Atrasados: ${group.atrasados}</span>
                                      <span>Hoje: ${group.hoje}</span>
                                      <span>Amanha: ${group.amanha}</span>
                                      <span>Proximos: ${group.proximos}</span>
                                  </div>
                                  <div className="agenda-team-techs">
                                      ${group.technicians.map((technician) => html`
                                          <span key=${`${group.representante}-${technician}`}>${technician}</span>
                                      `)}
                                  </div>
                              </article>
                          `)
                        : html`
                              <div className="report-highlight-empty">
                                  Cadastre representantes e tecnicos para habilitar a leitura por equipe.
                              </div>
                          `}
                </div>
            </div>

            <div className="agenda-grid">
                ${groups.map((group) => html`
                    <article className=${`agenda-group agenda-${group.key}`} key=${group.key}>
                        <div className="agenda-group-header">
                            <div>
                                <strong>${group.label}</strong>
                                <span>${group.total} atendimento(s)</span>
                            </div>
                        </div>
                        <div className="agenda-group-items">
                            ${group.items.length
                                ? group.items.map((item) => html`
                                      <div className="agenda-item" key=${`agenda-${group.key}-${item.id}`}>
                                          <div className="agenda-item-top">
                                              <strong>${item.inep}</strong>
                                              <span className=${`status-chip ${getStatusClassName(item.status)}`}>${item.status}</span>
                                          </div>
                                          <div className="agenda-item-meta">
                                              <span>Tecnico: ${item.tecnico}</span>
                                              <span>${item.representante ? `Equipe: ${item.representante}` : "Equipe: nao vinculada"}</span>
                                              <span>Retorno: ${formatReportDate(item.agendado_para)}</span>
                                          </div>
                                          <div className="agenda-item-note">${getLatestObservation(item.historico_observacoes, item.observacao)}</div>
                                      </div>
                                  `)
                                : html`<div className="agenda-empty">Nenhum atendimento nesta faixa.</div>`}
                        </div>
                    </article>
                `)}
            </div>
        </section>
    `;
}

export function AttendanceRow({
    item,
    isDetailOpen,
    expandedHistoryIds,
    editingTechnicianId,
    onFieldChange,
    onQuickObservation,
    onQuickStatus,
    onStatusChange,
    onScheduleChange,
    onClearSchedule,
    onSave,
    onDelete,
    onToggleDetails,
    onToggleHistory,
    onToggleEditTechnician,
    savingId,
    deletingId,
}) {
    const [quickActionValue, setQuickActionValue] = useState("");
    const isSaving = savingId === item.id;
    const isDeleting = deletingId === item.id;
    const historyEntries = splitObservationHistory(item.historico_observacoes);
    const isExpanded = Boolean(expandedHistoryIds[item.id]);
    const isEditingTechnician = editingTechnicianId === item.id;
    const latestObservation = getLatestObservation(item.historico_observacoes, item.observacao);
    const scheduleEnabled = statusAllowsSchedule(item.status);
    const reasonRequired = statusNeedsReason(item.status);
    const fallbackUpdatedAt = item.data
        ? `${formatDate(item.data)} ${item.hora_atualizacao || ""}`.trim()
        : "--";
    const lastUpdatedLabel = item.updated_at
        ? formatDateTime(item.updated_at)
        : fallbackUpdatedAt || "--";
    const representativeLabel = item.representante || "Nao vinculado";

    function handleQuickActionChange(event) {
        const selectedAction = event.target.value;
        setQuickActionValue("");

        if (!selectedAction) {
            return;
        }

        if (selectedAction.startsWith("status:")) {
            onQuickStatus(item.id, selectedAction.slice("status:".length));
            return;
        }

        if (selectedAction.startsWith("note:")) {
            const presetIndex = Number(selectedAction.slice("note:".length));
            const preset = quickObservationPresets[presetIndex];
            if (preset?.text) {
                onQuickObservation(item.id, preset.text);
            }
        }
    }

    return [
        html`
        <tr
            key=${`summary-${item.id}`}
            className=${`attendance-row attendance-row-compact row-priority-${item.prioridade} ${isDetailOpen ? "attendance-row-open" : ""}`}
            tabIndex="0"
            onClick=${() => onToggleDetails(item.id)}
            onKeyDown=${(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggleDetails(item.id);
                }
            }}
        >
            <td>
                <div className="attendance-summary-cell">
                    <strong>${item.inep}</strong>
                </div>
            </td>
            <td>
                <div className="attendance-summary-cell attendance-summary-tech">
                    <strong>${item.tecnico || "Nao informado"}</strong>
                </div>
            </td>
            <td>
                <span className=${`status-chip ${getStatusClassName(item.status)}`}>${item.status}</span>
            </td>
            <td>
                <div className="attendance-summary-cell attendance-summary-updated">
                    <strong>${lastUpdatedLabel}</strong>
                </div>
            </td>
            <td>
                <div className="attendance-summary-action">
                    <button
                        className="secondary-button attendance-expand-button"
                        type="button"
                        onClick=${(event) => {
                            event.stopPropagation();
                            onToggleDetails(item.id);
                        }}
                    >
                        <${Icon} name=${isDetailOpen ? "collapse" : "expand"} />
                        <span>${isDetailOpen ? "Recolher" : "Abrir"}</span>
                    </button>
                </div>
            </td>
        </tr>
    `,
        isDetailOpen
            ? html`
                  <tr key=${`detail-${item.id}`} className="attendance-detail-row">
                      <td colSpan="5">
                          <div className="attendance-detail-panel">
                              <div className="attendance-detail-top">
                                  <div className="attendance-detail-topline">
                                      <strong>INEP ${item.inep}</strong>
                                      <div className="attendance-detail-meta">
                                          <span className="attendance-meta-chip">Equipe: ${representativeLabel}</span>
                                          <span className="attendance-meta-chip">Prioridade: ${getPriorityLabel(item.prioridade)}</span>
                                          <span className="attendance-meta-chip">
                                              ${item.agendado_para ? `Retorno: ${formatDate(item.agendado_para)}` : "Sem retorno agendado"}
                                          </span>
                                      </div>
                                  </div>

                                  <label className="attendance-action-select">
                                      <span>Acoes rapidas</span>
                                      <select
                                          value=${quickActionValue}
                                          onChange=${handleQuickActionChange}
                                          disabled=${isSaving || isDeleting}
                                      >
                                          <option value="">Selecionar</option>
                                          <optgroup label="Status">
                                              ${operationalQuickStatuses.map((action) => html`
                                                  <option value=${`status:${action.status}`} key=${`${item.id}-status-${action.status}`}>
                                                      ${action.label}
                                                  </option>
                                              `)}
                                          </optgroup>
                                          <optgroup label="Observacoes rapidas">
                                              ${quickObservationPresets.map((preset, index) => html`
                                                  <option value=${`note:${index}`} key=${`${item.id}-note-${preset.label}`}>
                                                      ${preset.label}
                                                  </option>
                                              `)}
                                          </optgroup>
                                      </select>
                                  </label>
                              </div>

                              <div className="attendance-detail-grid">
                                  <section className="attendance-detail-section">
                                      <div className="attendance-detail-section-header">
                                          <strong>Atualizacao operacional</strong>
                                          <span>${lastUpdatedLabel}</span>
                                      </div>

                                      <div className="attendance-detail-field">
                                          <span className="detail-label">Tecnico</span>
                                          ${isEditingTechnician
                                              ? html`
                                                    <div className="tech-edit-cell">
                                                        <input
                                                            type="text"
                                                            value=${item.tecnico}
                                                            onChange=${(event) => onFieldChange(item.id, "tecnico", event.target.value)}
                                                            onBlur=${() => {
                                                                onSave(item.id, { tecnico: item.tecnico });
                                                                onToggleEditTechnician(null);
                                                            }}
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            className="secondary-button"
                                                            onClick=${() => {
                                                                onSave(item.id, { tecnico: item.tecnico });
                                                                onToggleEditTechnician(null);
                                                            }}
                                                            disabled=${isSaving}
                                                        >
                                                            Salvar
                                                        </button>
                                                    </div>
                                                `
                                              : html`
                                                    <div className="tech-card">
                                                        <strong>${item.tecnico || "Nao informado"}</strong>
                                                        <button
                                                            type="button"
                                                            className="icon-button tech-edit-btn visible"
                                                            onClick=${() => onToggleEditTechnician(item.id)}
                                                            disabled=${isSaving || isDeleting}
                                                            title="Editar tecnico"
                                                        >
                                                            Editar
                                                        </button>
                                                    </div>
                                                `}
                                      </div>

                                      <label className="attendance-detail-field">
                                          <span className="detail-label">Status</span>
                                          <select
                                              className="table-select"
                                              value=${item.status}
                                              onChange=${(event) => onStatusChange(item.id, event.target.value)}
                                              disabled=${isSaving || isDeleting}
                                          >
                                              ${statusOptions.map(
                                                  (status) => html`<option value=${status} key=${status}>${status}</option>`
                                              )}
                                          </select>
                                      </label>

                                      ${scheduleEnabled
                                          ? html`
                                                <label className="attendance-detail-field schedule-field schedule-field-inline">
                                                    <span className="detail-label">Nova data (opcional)</span>
                                                    <input
                                                        type="date"
                                                        value=${item.agendado_para || ""}
                                                        onChange=${(event) => onScheduleChange(item.id, event.target.value)}
                                                        disabled=${isSaving || isDeleting}
                                                    />
                                                    ${item.agendado_para
                                                        ? html`
                                                              <button
                                                                  className="icon-button schedule-clear"
                                                                  type="button"
                                                                  onClick=${() => onClearSchedule(item.id)}
                                                                  disabled=${isSaving || isDeleting}
                                                              >
                                                                  Sem data
                                                              </button>
                                                          `
                                                        : null}
                                                </label>
                                            `
                                          : null}
                                  </section>

                                  <section className="attendance-detail-section">
                                      <div className="attendance-detail-section-header">
                                          <strong>Observacoes</strong>
                                          <span>${reasonRequired ? "Motivo obrigatorio para pendencia ou reagendamento" : "Campo livre para atualizacao"}</span>
                                      </div>

                                      <div className="history-entry latest attendance-latest-note">
                                          ${latestObservation}
                                      </div>

                                      <textarea
                                          className="history-input"
                                          rows="4"
                                          value=${item.nova_observacao || ""}
                                          placeholder=${reasonRequired
                                              ? "Informe o motivo da pendencia ou reagendamento"
                                              : "Adicionar nova observacao"}
                                          onChange=${(event) => onFieldChange(item.id, "nova_observacao", event.target.value)}
                                          onBlur=${() => onSave(item.id)}
                                          disabled=${isSaving || isDeleting}
                                      ></textarea>

                                      <div className="history-actions">
                                          <button
                                              className="icon-button history-toggle"
                                              type="button"
                                              onClick=${() => onToggleHistory(item.id)}
                                          >
                                              <${Icon} name=${isExpanded ? "collapse" : "expand"} />
                                              <span>${isExpanded ? "Ocultar historico" : `Ver historico (${historyEntries.length})`}</span>
                                          </button>
                                      </div>

                                      ${isExpanded
                                          ? html`
                                                <div className="history-list">
                                                    ${historyEntries.length > 1
                                                        ? historyEntries
                                                              .slice(0, -1)
                                                              .reverse()
                                                              .map(
                                                                  (entry, index) => html`
                                                                      <div className="history-entry" key=${`${item.id}-history-${index}`}>
                                                                          ${entry}
                                                                      </div>
                                                                  `
                                                              )
                                                        : html`<div className="history-empty">Nenhum historico adicional.</div>`}
                                                </div>
                                            `
                                          : null}
                                  </section>
                              </div>

                              <div className="attendance-detail-actions">
                                  <button
                                      className="secondary-button operational-save-button"
                                      type="button"
                                      onClick=${() => onSave(item.id)}
                                      disabled=${isSaving || isDeleting}
                                  >
                                      ${isSaving ? "Salvando..." : "Salvar linha"}
                                  </button>
                                  <button
                                      className="danger-button"
                                      type="button"
                                      onClick=${() => onDelete(item.id)}
                                      disabled=${isSaving || isDeleting}
                                  >
                                      ${isDeleting ? "Removendo..." : "Excluir"}
                                  </button>
                              </div>
                          </div>
                      </td>
                  </tr>
              `
            : null,
    ];
}

/* export function ReportsWorkspace({
    availableDays,
    reportDay,
    onReportDayChange,
    reportData,
    reportMode,
    onReportModeChange,
    reportGeneratedAt,
    reportLoading,
    onGenerateReport,
    onCopyReport,
    onCopyWhatsapp,
    onExportPdf,
    currentReportText,
    reportTotal,
    whatsappAutomation,
    automationBusy,
    automationDirty,
    onAutomationFieldChange,
    onSaveAutomationSettings,
    nextAutomationAt,
    remainingAutomationTime,
    onSendWhatsappNow,
}) {
    const reportDayOptions = [
        ...new Map([{ day: getTodayDate(), total: 0 }, ...availableDays].map((item) => [item.day, item])).values(),
    ];
    const overview = reportData?.overview || {
        total: 0,
        finalizados: 0,
        ativos: 0,
        pendencias: 0,
        criticos: 0,
        remanejados: 0,
        agendados: 0,
        aguardando_retorno: 0,
    };
    const attentionPoints = reportData?.attention_points || [];
    const technicianBreakdown = reportData?.technician_breakdown || [];
    const timelineItems = reportData?.timeline_items || [];
    const groupedStatus = reportData?.grouped_by_status || [];
    const problemItems = reportData?.problem_items || [];
    const pendingItems = reportData?.pending_items || [];
    const tomorrowFollowups = reportData?.tomorrow_followups || [];
    const postponedItems = reportData?.postponed_items || [];
    const recentRuns = whatsappAutomation?.recentRuns || [];
    const reportModeLabels = {
        [REPORT_MODES.operational]: "Texto operacional",
        [REPORT_MODES.executive]: "Resumo executivo",
        [REPORT_MODES.whatsapp]: "Mensagem para WhatsApp",
    };
    const groupedStatus = reportData?.grouped_by_status || [];
    const problemItems = reportData?.problem_items || [];

    return html`
        <section className="panel report-panel reports-shell">
            <div className="panel-header reports-header">
                <div>
                    <span className="section-kicker"><${Icon} name="report" />Relatorios</span>
                    <h2>Central de Fechamento</h2>
                    <p className="panel-tip">Resumo do dia, leitura executiva, problemas destacados, agrupamento por status e textos prontos para compartilhamento.</p>
                </div>
                <div className="reports-header-actions">
                    <label className="report-day-select">
                        <span><${Icon} name="calendar" /> Dia do relatorio</span>
                        <select value=${reportDay} onChange=${(event) => onReportDayChange(event.target.value)}>
                            ${reportDayOptions.map((dayItem) => html`
                                <option value=${dayItem.day} key=${dayItem.day}>
                                    ${formatReportDate(dayItem.day)}
                                </option>
                            `)}
                        </select>
                    </label>
                    <button className="primary-button" type="button" onClick=${onGenerateReport} disabled=${reportLoading}>
                        <${Icon} name="report" />
                        ${reportLoading ? "Atualizando..." : "Gerar relatorio"}
                    </button>
                </div>
            </div>

            <div className="report-status report-status-inline">
                <span>${reportData ? "Pronto para leitura" : "Aguardando geracao"}</span>
                <strong>${reportGeneratedAt ? `Ultima geracao: ${reportGeneratedAt}` : "Sem geracao recente"}</strong>
                <small>${formatReportDate(reportData?.date || reportDay)}</small>
            </div>

            <div className="report-summary-grid report-summary-grid-extended report-summary-grid-expanded">
                <article className="report-summary-card">
                    <span>Total atualizado</span>
                    <strong>${overview.total}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Finalizados</span>
                    <strong>${overview.finalizados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Ativos</span>
                    <strong>${overview.ativos}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Pendencias</span>
                    <strong>${overview.pendencias}</strong>
                </article>
                <article className="report-summary-card critical">
                    <span>Criticos</span>
                    <strong>${overview.criticos}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Remanejados</span>
                    <strong>${overview.remanejados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Agendados</span>
                    <strong>${overview.agendados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Aguardando retorno</span>
                    <strong>${overview.aguardando_retorno}</strong>
                </article>
            </div>

            <div className="report-columns report-columns-wide">
                <div className="report-highlights report-story-card">
                    <div className="report-highlights-header">
                        <strong>Leitura executiva</strong>
                        <span>${reportData ? formatReportDate(reportData.date) : "--/--"}</span>
                    </div>
                    <div className="executive-summary-box">
                        ${reportData?.executive_summary || "Gere o relatorio para montar a leitura executiva do dia."}
                    </div>
                    <div className="attention-points">
                        ${attentionPoints.length
                            ? attentionPoints.map((point, index) => html`
                                  <div className="attention-point" key=${`attention-${index}`}>
                                      <${Icon} name="target" />
                                      <span>${point}</span>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Sem pontos de atencao para exibir.</div>`}
                    </div>
                </div>

                <div className="report-highlights report-preview-panel">
                    <div className="report-toolbar report-toolbar-stacked">
                        <div className="report-mode-toggle">
                            <button className=${reportMode === REPORT_MODES.operational ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.operational)}>
                                Texto operacional
                            </button>
                            <button className=${reportMode === REPORT_MODES.executive ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.executive)}>
                                Resumo executivo
                            </button>
                            <button className=${reportMode === REPORT_MODES.whatsapp ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.whatsapp)}>
                                <${Icon} name="whatsapp" />
                                WhatsApp
                            </button>
                        </div>
                        <div className="report-action-buttons">
                            <button className="secondary-button" type="button" onClick=${onCopyReport}>
                                <${Icon} name="copy" />
                                Copiar preview
                            </button>
                            <button className="secondary-button whatsapp-button" type="button" onClick=${onCopyWhatsapp}>
                                <${Icon} name="whatsapp" />
                                Copiar WhatsApp
                            </button>
                            <button className="secondary-button" type="button" onClick=${onExportPdf}>
                                <${Icon} name="pdf" />
                                Exportar PDF
                            </button>
                        </div>
                    </div>
                    <div className="report-preview-meta">
                        <span>Preview atual</span>
                        <strong>${REPORT_MODE_LABELS[reportMode]}</strong>
                    </div>
                    <textarea rows="16" readOnly value=${currentReportText} placeholder="Gere o relatorio para visualizar o texto final."></textarea>
                    <div className="report-preview-footer">
                        <span>${reportData ? `${reportTotal} item(ns) incluidos no fechamento.` : "Nenhum fechamento gerado ainda."}</span>
                        <span>${formatReportDate(reportData?.date || reportDay)}</span>
                    </div>
                </div>
            </div>

            <div className="report-columns">
                <div className="report-highlights">
                    <div className="report-highlights-header">
                        <strong>Problemas destacados</strong>
                        <span>${problemItems.length}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${problemItems.length
                            ? problemItems.map((item) => html`
                                  <div className="report-highlight-item critical" key=${`problem-${item.inep}-${item.status}`}>
                                      <${Icon} name="warning" />
                                      <div>
                                          <strong>${item.inep} · ${buildProblemLabel(item)}</strong>
                                          <span>${item.line}</span>
                                      </div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Sem problemas destacados para o dia selecionado.</div>`}
                    </div>
                </div>
                <div className="report-highlights">
                    <div className="report-highlights-header">
                        <strong>Pendencias prioritarias</strong>
                        <span>${reportData?.pending_items?.length || 0}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${reportData?.pending_items?.length
                            ? reportData.pending_items.map((item) => html`
                                  <div className="report-highlight-item pending" key=${`pending-${item.inep}-${item.status}`}>
                                      <div className="followup-line">
                                          <strong>${item.inep}</strong>
                                          <span>${item.status}</span>
                                      </div>
                                      <div>${item.line}</div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Nenhuma pendencia aberta no dia selecionado.</div>`}
                    </div>
                </div>
            </div>

            <div className="report-highlights">
                <div className="report-highlights-header">
                    <strong>Status e INEPs por categoria</strong>
                    <span>${groupedStatus.length}</span>
                </div>
                <div className="status-group-grid status-group-grid-detailed">
                    ${groupedStatus.length
                        ? groupedStatus.map((group) => html`
                              <div className=${`status-group-card ${getStatusClassName(group.status)}`} key=${group.status}>
                                  <div className="status-group-header">
                                      <span className=${`status-chip ${getStatusClassName(group.status)}`}>${group.status}</span>
                                      <strong>${group.total}</strong>
                                  </div>
                                  <div className="status-group-ineps-text">${buildGroupedStatusIneps(group)}</div>
                                  <div className="status-group-items">
                                      ${group.items.map((item) => html`
                                          <div className="status-group-item status-group-item-detailed" key=${`${group.status}-${item.inep}`}>
                                              <strong>${item.inep}</strong>
                                              <span>${item.observacao || item.status}</span>
                                          </div>
                                      `)}
                                  </div>
                              </div>
                          `)
                        : html`<div className="report-highlight-empty">Gere o relatorio para ver o agrupamento por status.</div>`}
                </div>
            </div>
            </td>
        </tr>
    `;
}
*/

export function ReportsWorkspace({
    availableDays,
    reportDay,
    onReportDayChange,
    reportData,
    reportMode,
    onReportModeChange,
    reportGeneratedAt,
    reportLoading,
    onGenerateReport,
    onCopyReport,
    onCopyWhatsapp,
    onExportPdf,
    currentReportText,
    reportTotal,
    whatsappAutomation,
    automationBusy,
    automationDirty,
    onAutomationFieldChange,
    onSaveAutomationSettings,
    nextAutomationAt,
    remainingAutomationTime,
    onSendWhatsappNow,
}) {
    const reportDayOptions = buildReportDayOptions(availableDays, reportDay || getTodayDate());
    const {
        overview = EMPTY_REPORT_OVERVIEW,
        attentionPoints,
        technicianBreakdown,
        timelineItems,
        groupedStatus,
        problemItems,
        pendingItems,
        tomorrowFollowups,
        postponedItems,
    } = getReportSections(reportData);
    const recentRuns = whatsappAutomation?.recentRuns || [];

    return html`
        <section className="panel report-panel reports-shell">
            <div className="panel-header reports-header">
                <div>
                    <span className="section-kicker"><${Icon} name="report" />Relatorios</span>
                    <h2>Central de Fechamento</h2>
                    <p className="panel-tip">Resumo do dia, leitura executiva, filas de atencao, distribuicao por tecnico e textos prontos para compartilhamento.</p>
                </div>
                <div className="reports-header-actions">
                    <label className="report-day-select">
                        <span><${Icon} name="calendar" /> Dia do relatorio</span>
                        <select value=${reportDay} onChange=${(event) => onReportDayChange(event.target.value)}>
                            ${reportDayOptions.map((dayItem) => html`
                                <option value=${dayItem.day} key=${dayItem.day}>
                                    ${formatReportDate(dayItem.day)}
                                </option>
                            `)}
                        </select>
                    </label>
                    <button className="primary-button" type="button" onClick=${onGenerateReport} disabled=${reportLoading}>
                        <${Icon} name="report" />
                        ${reportLoading ? "Atualizando..." : "Gerar relatorio"}
                    </button>
                </div>
            </div>

            <div className="report-status report-status-inline">
                <span>${reportData ? "Pronto para leitura" : "Aguardando geracao"}</span>
                <strong>${reportGeneratedAt ? `Ultima geracao: ${reportGeneratedAt}` : "Sem geracao recente"}</strong>
                <small>${formatReportDate(reportData?.date || reportDay)}</small>
            </div>

            <div className="report-summary-grid report-summary-grid-extended report-summary-grid-expanded">
                <article className="report-summary-card">
                    <span>Total atualizado</span>
                    <strong>${overview.total}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Finalizados</span>
                    <strong>${overview.finalizados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Ativos</span>
                    <strong>${overview.ativos}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Pendencias</span>
                    <strong>${overview.pendencias}</strong>
                </article>
                <article className="report-summary-card critical">
                    <span>Criticos</span>
                    <strong>${overview.criticos}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Remanejados</span>
                    <strong>${overview.remanejados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Agendados</span>
                    <strong>${overview.agendados}</strong>
                </article>
                <article className="report-summary-card">
                    <span>Aguardando retorno</span>
                    <strong>${overview.aguardando_retorno}</strong>
                </article>
            </div>

            <div className="report-columns report-columns-wide">
                <div className="report-highlights report-story-card">
                    <div className="report-highlights-header">
                        <strong>Leitura executiva</strong>
                        <span>${reportData ? formatReportDate(reportData.date) : "--/--"}</span>
                    </div>
                    <div className="executive-summary-box">
                        ${reportData?.executive_summary || "Gere o relatorio para montar a leitura executiva do dia."}
                    </div>
                    <div className="attention-points">
                        ${attentionPoints.length
                            ? attentionPoints.map((point, index) => html`
                                  <div className="attention-point" key=${`attention-${index}`}>
                                      <${Icon} name="target" />
                                      <span>${point}</span>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Sem pontos de atencao para exibir.</div>`}
                    </div>
                </div>

                <div className="report-highlights report-preview-panel">
                    <div className="report-toolbar report-toolbar-stacked">
                        <div className="report-mode-toggle">
                            <button className=${reportMode === REPORT_MODES.operational ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.operational)}>
                                Texto operacional
                            </button>
                            <button className=${reportMode === REPORT_MODES.executive ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.executive)}>
                                Resumo executivo
                            </button>
                            <button className=${reportMode === REPORT_MODES.whatsapp ? "secondary-button active" : "secondary-button"} type="button" onClick=${() => onReportModeChange(REPORT_MODES.whatsapp)}>
                                <${Icon} name="whatsapp" />
                                WhatsApp
                            </button>
                        </div>
                        <div className="report-action-buttons">
                            <button className="secondary-button" type="button" onClick=${onCopyReport}>
                                <${Icon} name="copy" />
                                Copiar preview
                            </button>
                            <button className="secondary-button whatsapp-button" type="button" onClick=${onCopyWhatsapp}>
                                <${Icon} name="whatsapp" />
                                Copiar WhatsApp
                            </button>
                            <button className="secondary-button" type="button" onClick=${onExportPdf}>
                                <${Icon} name="pdf" />
                                Exportar PDF
                            </button>
                        </div>
                    </div>
                    <div className="report-preview-meta">
                        <span>Preview atual</span>
                        <strong>${reportModeLabels[reportMode]}</strong>
                    </div>
                    <textarea rows="16" readOnly value=${currentReportText} placeholder="Gere o relatorio para visualizar o texto final."></textarea>
                    <div className="report-preview-footer">
                        <span>${reportData ? `${reportTotal} item(ns) incluidos no fechamento.` : "Nenhum fechamento gerado ainda."}</span>
                        <span>${formatReportDate(reportData?.date || reportDay)}</span>
                    </div>
                </div>
            </div>

            <div className="report-columns">
                <div className="report-highlights report-problems-panel">
                    <div className="report-highlights-header">
                        <strong>Problemas destacados</strong>
                        <span>${problemItems.length}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${problemItems.length
                            ? problemItems.map((item, index) => html`
                                  <div className="report-highlight-item critical" key=${`problem-${item.inep}-${item.status}-${index}`}>
                                      <${Icon} name="warning" />
                                      <div className="report-problem-copy">
                                          <strong>${item.inep} - ${buildProblemLabel(item)}</strong>
                                          <span>${item.line}</span>
                                      </div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Sem problemas destacados para o dia selecionado.</div>`}
                    </div>
                </div>
                <div className="report-highlights">
                    <div className="report-highlights-header">
                        <strong>Pendencias prioritarias</strong>
                        <span>${pendingItems.length}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${pendingItems.length
                            ? pendingItems.map((item, index) => html`
                                  <div className="report-highlight-item pending" key=${`pending-${item.inep}-${item.status}-${index}`}>
                                      <div className="followup-line">
                                          <strong>${item.inep}</strong>
                                          <span>${item.status}</span>
                                      </div>
                                      <div>${item.line}</div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Nenhuma pendencia aberta no dia selecionado.</div>`}
                    </div>
                </div>
            </div>

            <div className="report-highlights">
                <div className="report-highlights-header">
                    <strong>Status e INEPs por categoria</strong>
                    <span>${groupedStatus.length}</span>
                </div>
                <div className="status-group-grid status-group-grid-detailed">
                    ${groupedStatus.length
                        ? groupedStatus.map((group) => html`
                              <div className=${`status-group-card ${getStatusClassName(group.status)}`} key=${group.status}>
                                  <div className="status-group-header">
                                      <span className=${`status-chip ${getStatusClassName(group.status)}`}>${group.status}</span>
                                      <strong>${group.total}</strong>
                                  </div>
                                  <div className="status-group-ineps-text">${buildGroupedStatusIneps(group)}</div>
                                  <div className="status-group-items">
                                      ${group.items.map((item, index) => html`
                                          <div className="status-group-item status-group-item-detailed" key=${`${group.status}-${item.inep}-${index}`}>
                                              <strong>${item.inep}</strong>
                                              <span>${item.observacao || item.status}</span>
                                          </div>
                                      `)}
                                  </div>
                              </div>
                          `)
                        : html`<div className="report-highlight-empty">Gere o relatorio para ver o agrupamento por status.</div>`}
                </div>
            </div>

            <div className="report-columns">
                <div className="report-highlights">
                    <div className="report-highlights-header">
                        <strong>Passagem para o proximo turno</strong>
                        <span>${tomorrowFollowups.length}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${tomorrowFollowups.length
                            ? tomorrowFollowups.map((item, index) => html`
                                  <div className="report-highlight-item followup" key=${`followup-${item.inep}-${item.status}-${index}`}>
                                      <div className="followup-line">
                                          <strong>${item.inep}</strong>
                                          <span>${item.status}</span>
                                      </div>
                                      <div>${item.next_action}</div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Nenhuma passagem pendente para o proximo dia.</div>`}
                    </div>
                </div>
                <div className="report-highlights">
                    <div className="report-highlights-header">
                        <strong>Remanejados para outra data</strong>
                        <span>${postponedItems.length}</span>
                    </div>
                    <div className="report-highlights-list">
                        ${postponedItems.length
                            ? postponedItems.map((item, index) => html`
                                  <div className="report-highlight-item followup" key=${`postponed-${item.inep}-${item.agendado_para}-${index}`}>
                                      <div className="followup-line">
                                          <strong>${item.inep}</strong>
                                          <span>${item.scheduled_label}</span>
                                      </div>
                                      <div>${item.line}</div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Nenhum atendimento remanejado para outra data.</div>`}
                    </div>
                </div>
            </div>

            <div className="report-highlights">
                <div className="report-highlights-header">
                    <strong>Operacao por tecnico</strong>
                    <span>${technicianBreakdown.length}</span>
                </div>
                <div className="report-tech-grid">
                    ${technicianBreakdown.length
                        ? technicianBreakdown.map((group) => html`
                              <article className="report-tech-card" key=${group.tecnico}>
                                  <div className="report-tech-header">
                                      <strong>${group.tecnico}</strong>
                                      <span>${group.total} chamado(s)</span>
                                  </div>
                                  <div className="report-tech-metrics">
                                      <span>Finalizados: ${group.finalizados}</span>
                                      <span>Abertos: ${group.pendentes}</span>
                                      <span>Criticos: ${group.criticos}</span>
                                  </div>
                                  <div className="report-tech-ineps">
                                      ${group.ineps.map((inep) => html`<span key=${`${group.tecnico}-${inep}`}>${inep}</span>`)}
                                  </div>
                              </article>
                          `)
                        : html`<div className="report-highlight-empty">Sem distribuicao por tecnico para o dia selecionado.</div>`}
                </div>
            </div>

            <div className="report-highlights">
                <div className="report-highlights-header">
                    <strong>Linha do dia</strong>
                    <span>${timelineItems.length}</span>
                </div>
                <div className="report-timeline">
                    ${timelineItems.length
                        ? timelineItems.map((item, index) => html`
                              <div className="report-timeline-item" key=${`timeline-${item.inep}-${item.hora_atualizacao}-${index}`}>
                                  <div className="report-timeline-time">${item.hora_atualizacao}</div>
                                  <div className="report-timeline-content">
                                      <div className="followup-line">
                                          <strong>${item.inep}</strong>
                                          <span>${item.tecnico}</span>
                                      </div>
                                      <div className="report-timeline-status">
                                          <span className=${`status-chip ${getStatusClassName(item.status)}`}>${item.status}</span>
                                      </div>
                                      <div>${item.observacao}</div>
                                  </div>
                              </div>
                          `)
                        : html`<div className="report-highlight-empty">Nenhuma atualizacao registrada para o dia selecionado.</div>`}
                </div>
            </div>

            <div className="report-automation-card">
                <div className="report-highlights-header">
                    <strong>Automacao de WhatsApp</strong>
                    <span>Agendada no servidor</span>
                </div>
                <div className="automation-grid">
                    <label className="report-day-select">
                        <span><${Icon} name="whatsapp" /> Numero do seu WhatsApp</span>
                        <input
                            type="text"
                            placeholder="Ex: 5511999999999"
                            value=${whatsappAutomation.phone}
                            onChange=${(event) => onAutomationFieldChange("phone", event.target.value)}
                        />
                    </label>
                    <label className="report-day-select">
                        <span>Modo de disparo</span>
                        <select
                            value=${whatsappAutomation.scheduleMode}
                            onChange=${(event) => onAutomationFieldChange("scheduleMode", event.target.value)}
                        >
                            ${AUTOMATION_SCHEDULE_MODE_OPTIONS.map((option) => html`
                                <option value=${option.value} key=${option.value}>${option.label}</option>
                            `)}
                        </select>
                    </label>
                    ${whatsappAutomation.scheduleMode === "interval"
                        ? html`
                              <label className="report-day-select">
                                  <span>Intervalo em horas</span>
                                  <select
                                      value=${String(whatsappAutomation.intervalHours)}
                                      onChange=${(event) => onAutomationFieldChange("intervalHours", Number(event.target.value))}
                                  >
                                      ${AUTOMATION_INTERVAL_HOUR_OPTIONS.map((option) => html`
                                          <option value=${String(option.value)} key=${option.value}>${option.label}</option>
                                      `)}
                                  </select>
                              </label>
                          `
                        : html`
                              <label className="report-day-select automation-times">
                                  <span>Horarios fixos</span>
                                  <input
                                      type="text"
                                      placeholder="Ex: 09:00, 12:00, 15:00"
                                      value=${whatsappAutomation.fixedTimes}
                                      onChange=${(event) => onAutomationFieldChange("fixedTimes", event.target.value)}
                                  />
                              </label>
                          `}
                    <div className="automation-info">
                        <span>Status</span>
                        <strong>${whatsappAutomation.enabled ? "Ativo" : "Desativado"}</strong>
                        <small>
                            ${whatsappAutomation.lastRunAt
                                ? `Ultimo disparo: ${formatDateTime(whatsappAutomation.lastRunAt)}`
                                : "Ainda nao houve disparo automatico"}
                        </small>
                    </div>
                    <div className="automation-info">
                        <span>Proxima execucao</span>
                        <strong>${whatsappAutomation.enabled && nextAutomationAt ? formatDateTime(nextAutomationAt) : "--"}</strong>
                        <small>
                            ${whatsappAutomation.enabled && remainingAutomationTime !== null
                                ? `Em ${formatRemainingTime(remainingAutomationTime)}`
                                : "Ative a automacao para montar o proximo horario"}
                        </small>
                    </div>
                </div>
                <div className="report-action-buttons automation-actions">
                    <button
                        className=${whatsappAutomation.enabled ? "secondary-button active" : "secondary-button"}
                        type="button"
                        onClick=${() => onAutomationFieldChange("enabled", !whatsappAutomation.enabled)}
                    >
                        <${Icon} name="target" />
                        ${whatsappAutomation.enabled ? "Desativar automacao" : "Ativar automacao"}
                    </button>
                    <button
                        className="primary-button"
                        type="button"
                        onClick=${onSaveAutomationSettings}
                        disabled=${automationBusy || !automationDirty}
                    >
                        ${automationBusy ? "Salvando..." : (automationDirty ? "Salvar automacao" : "Automacao salva")}
                    </button>
                    <button className="secondary-button whatsapp-button" type="button" onClick=${onSendWhatsappNow}>
                        <${Icon} name="whatsapp" />
                        Disparar agora
                    </button>
                </div>
                <p className="automation-note">
                    O agendamento agora roda no servidor. Nao e necessario manter o painel aberto para os disparos programados.
                </p>
                <div className="report-highlights automation-history">
                    <div className="report-highlights-header">
                        <strong>Ultimas execucoes</strong>
                        <span>${recentRuns.length}</span>
                    </div>
                    <div className="automation-run-list">
                        ${recentRuns.length
                            ? recentRuns.map((run) => html`
                                  <div className=${`automation-run-item ${run.status === "error" ? "error" : "success"}`} key=${run.id}>
                                      <div className="automation-run-top">
                                          <strong>${run.triggerMode === "manual" ? "Manual" : "Agendada"}</strong>
                                          <span>${formatDateTime(run.createdAt)}</span>
                                      </div>
                                      <div className="automation-run-meta">
                                          <span>Relatorio: ${formatReportDate(run.reportDay)}</span>
                                          <span>Destino: ${run.targetPhone || "--"}</span>
                                      </div>
                                      <div className="automation-run-message">
                                          ${run.status === "error" ? run.errorMessage : "WhatsApp aberto com o texto pronto."}
                                      </div>
                                  </div>
                              `)
                            : html`<div className="report-highlight-empty">Nenhuma execucao registrada ainda.</div>`}
                    </div>
                </div>
            </div>
        </section>
    `;
}
