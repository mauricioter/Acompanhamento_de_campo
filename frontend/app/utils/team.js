const TECHNICIAN_LIST_SEPARATOR_PATTERN = /[\r\n,;\t]+/;

export function parseTechnicianList(rawValue) {
    const seen = new Set();
    const technicians = [];

    for (const part of String(rawValue || "").split(TECHNICIAN_LIST_SEPARATOR_PATTERN)) {
        const technician = String(part || "").trim();
        const key = technician.toLowerCase();

        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        technicians.push(technician);
    }

    return technicians;
}

export function buildTeamSubmissionPayload(teamForm = {}) {
    const representante = String(teamForm.representante || "").trim();
    const rawTechnicians = String(teamForm.tecnicos || teamForm.tecnico || "");
    const technicians = parseTechnicianList(rawTechnicians);

    return {
        representante,
        tecnico: technicians[0] || "",
        tecnicos: technicians,
    };
}
