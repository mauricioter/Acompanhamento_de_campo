const {
    queryAll,
    queryOne,
    runInTransaction,
    runStatement,
} = require("./database");

function nowTimestamp() {
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const time = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join(":");
    return `${date} ${time}`;
}

function normalizeTeamText(value) {
    return String(value || "").trim();
}

function normalizeTeamKey(value) {
    return normalizeTeamText(value).toLowerCase();
}

function serializeTeamLink(row) {
    return {
        id: Number(row.id),
        representante: String(row.representante || ""),
        tecnico: String(row.tecnico || ""),
        created_at: String(row.created_at || ""),
        updated_at: String(row.updated_at || ""),
    };
}

function listTeamLinks() {
    return queryAll(
        `
        SELECT id, representante, tecnico, created_at, updated_at
        FROM equipes
        ORDER BY representante COLLATE NOCASE ASC, tecnico COLLATE NOCASE ASC
        `
    ).map(serializeTeamLink);
}

function buildTeamGroups(items) {
    const groupsByRepresentative = new Map();

    for (const item of items) {
        const representativeKey = normalizeTeamKey(item.representante);
        if (!groupsByRepresentative.has(representativeKey)) {
            groupsByRepresentative.set(representativeKey, {
                representante: item.representante,
                total: 0,
                technicians: [],
            });
        }

        const current = groupsByRepresentative.get(representativeKey);
        current.total += 1;
        current.technicians.push({
            id: item.id,
            tecnico: item.tecnico,
        });
    }

    return [...groupsByRepresentative.values()].sort((left, right) => {
        if (right.total !== left.total) {
            return right.total - left.total;
        }
        return left.representante.localeCompare(right.representante, "pt-BR", {
            sensitivity: "base",
        });
    });
}

function listTeams() {
    const items = listTeamLinks();
    const groups = buildTeamGroups(items);

    return {
        total_links: items.length,
        total_representatives: groups.length,
        groups,
    };
}

function parseTechnicianNames(payload = {}) {
    const rawValues = [];

    const candidateFields = [
        payload.tecnicos,
        payload.technicians,
        payload.membros,
        payload.tecnico,
        payload.technician,
        payload.nomeTecnico,
        payload.nome_tecnico,
    ];

    for (const fieldValue of candidateFields) {
        if (Array.isArray(fieldValue)) {
            rawValues.push(...fieldValue);
        } else if (fieldValue !== undefined && fieldValue !== null) {
            rawValues.push(fieldValue);
        }
    }

    if (!rawValues.length && Array.isArray(payload.items)) {
        rawValues.push(...payload.items);
    }

    const seen = new Set();
    const technicians = [];

    for (const rawValue of rawValues) {
        const normalizedRawValue = typeof rawValue === "object" && rawValue !== null
            ? (rawValue.tecnico ?? rawValue.technician ?? rawValue.nome ?? rawValue.name ?? "")
            : rawValue;
        const entries = String(normalizedRawValue || "").split(/[\r\n,;\t]+/);
        for (const entry of entries) {
            const technician = normalizeTeamText(entry);
            const technicianKey = normalizeTeamKey(technician);
            if (!technicianKey || seen.has(technicianKey)) {
                continue;
            }
            seen.add(technicianKey);
            technicians.push(technician);
        }
    }

    return technicians;
}

function validateTeamPayload(representante, technicians) {
    if (!representante) {
        return "Informe o nome do representante.";
    }
    if (!technicians.length) {
        return "Informe ao menos um tecnico valido para o representante.";
    }
    return null;
}

function saveSingleTeamLink(representante, tecnico, timestamp) {
    const existing = queryOne(
        `
        SELECT id, representante, tecnico, created_at, updated_at
        FROM equipes
        WHERE LOWER(tecnico) = LOWER(?)
        `,
        [tecnico]
    );

    if (existing) {
        const sameRepresentative =
            normalizeTeamKey(existing.representante) === normalizeTeamKey(representante);
        const sameTechnicianName = existing.tecnico === tecnico;

        if (!sameRepresentative || !sameTechnicianName) {
            runStatement(
                `
                UPDATE equipes
                SET representante = ?, tecnico = ?, updated_at = ?
                WHERE id = ?
                `,
                [representante, tecnico, timestamp, existing.id]
            );
        }

        const savedItem = queryOne(
            `
            SELECT id, representante, tecnico, created_at, updated_at
            FROM equipes
            WHERE id = ?
            `,
            [existing.id]
        );

        return {
            action: sameRepresentative
                ? (sameTechnicianName ? "unchanged" : "updated")
                : "moved",
            item: serializeTeamLink(savedItem),
        };
    }

    runStatement(
        `
        INSERT INTO equipes (representante, tecnico, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        `,
        [representante, tecnico, timestamp, timestamp]
    );

    const savedItem = queryOne(
        `
        SELECT id, representante, tecnico, created_at, updated_at
        FROM equipes
        WHERE LOWER(tecnico) = LOWER(?)
        `,
        [tecnico]
    );

    return {
        action: "created",
        item: serializeTeamLink(savedItem),
    };
}

function buildSaveTeamMessage(results = []) {
    if (!results.length) {
        return "Nenhum tecnico foi processado.";
    }

    if (results.length === 1) {
        const [{ action }] = results;
        if (action === "unchanged") {
            return "Vinculo de equipe atualizado.";
        }
        if (action === "updated") {
            return "Vinculo de equipe atualizado.";
        }
        if (action === "moved") {
            return "Tecnico movido para a nova equipe com sucesso.";
        }
        return "Tecnico vinculado a equipe com sucesso.";
    }

    const counters = results.reduce((accumulator, current) => {
        accumulator[current.action] = (accumulator[current.action] || 0) + 1;
        return accumulator;
    }, {});

    const details = [];
    if (counters.created) {
        details.push(`${counters.created} novo(s)`);
    }
    if (counters.moved) {
        details.push(`${counters.moved} movido(s)`);
    }
    if (counters.updated) {
        details.push(`${counters.updated} ajustado(s)`);
    }
    if (counters.unchanged) {
        details.push(`${counters.unchanged} mantido(s)`);
    }

    return `${results.length} tecnico(s) processado(s) para o representante.${details.length ? ` ${details.join(", ")}.` : ""}`;
}

function saveTeamLink(payload = {}) {
    const representante = normalizeTeamText(payload.representante);
    const technicians = parseTechnicianNames(payload);
    const validationError = validateTeamPayload(representante, technicians);

    if (validationError) {
        return { error: validationError, statusCode: 400 };
    }

    const existing = queryOne(
        `
        SELECT 1 AS exists_flag
        FROM equipes
        WHERE LOWER(representante) = LOWER(?)
        LIMIT 1
        `,
        [representante]
    );
    const timestamp = nowTimestamp();
    const results = runInTransaction(() =>
        technicians.map((tecnico) => saveSingleTeamLink(representante, tecnico, timestamp))
    );
    const allCreated = results.every((result) => result.action === "created");

    return {
        statusCode: allCreated && !existing ? 201 : 200,
        message: buildSaveTeamMessage(results),
        item: results[0]?.item || null,
        items: results.map((result) => result.item),
    };
}

function deleteTeamLink(teamId) {
    const existing = queryOne(
        `
        SELECT id
        FROM equipes
        WHERE id = ?
        `,
        [teamId]
    );

    if (!existing) {
        return { error: "Vinculo de equipe nao encontrado.", statusCode: 404 };
    }

    runStatement(
        `
        DELETE FROM equipes
        WHERE id = ?
        `,
        [teamId]
    );

    return {
        statusCode: 200,
        message: "Vinculo de equipe removido com sucesso.",
    };
}

function getRepresentativeLookup() {
    const items = listTeamLinks();
    const lookup = new Map();

    for (const item of items) {
        lookup.set(normalizeTeamKey(item.tecnico), item.representante);
    }

    return lookup;
}

module.exports = {
    deleteTeamLink,
    getRepresentativeLookup,
    listTeamLinks,
    listTeams,
    normalizeTeamKey,
    saveTeamLink,
};
