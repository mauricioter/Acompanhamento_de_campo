const assert = require("node:assert/strict");

const {
    canRepairIntegrityIssuesWithReindex,
    isIntegrityCheckOk,
    normalizeIntegrityCheckMessages,
} = require("../backend/services/database");

module.exports = async function runDatabaseIntegrityTest() {
    const normalized = normalizeIntegrityCheckMessages([
        { integrity_check: " row 17 missing from index idx_atendimentos_status " },
        { integrity_check: "wrong # of entries in index idx_atendimentos_updated_at" },
        { integrity_check: "" },
    ]);

    assert.deepEqual(normalized, [
        "row 17 missing from index idx_atendimentos_status",
        "wrong # of entries in index idx_atendimentos_updated_at",
    ]);

    assert.equal(isIntegrityCheckOk(["ok"]), true);
    assert.equal(isIntegrityCheckOk(["OK"]), true);
    assert.equal(isIntegrityCheckOk(normalized), false);

    assert.equal(canRepairIntegrityIssuesWithReindex(normalized), true);
    assert.equal(canRepairIntegrityIssuesWithReindex(["database disk image is malformed"]), false);
    assert.equal(
        canRepairIntegrityIssuesWithReindex([
            "row 17 missing from index idx_atendimentos_status",
            "database disk image is malformed",
        ]),
        false
    );
};
