const fs = require("fs");
const os = require("os");
const path = require("path");

function createTempWorkspace(prefix = "controle-atendimentos-") {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function resetBackendModules(rootDir) {
    for (const modulePath of Object.keys(require.cache)) {
        if (modulePath.startsWith(path.join(rootDir, "backend"))) {
            delete require.cache[modulePath];
        }
    }
}

module.exports = {
    createTempWorkspace,
    resetBackendModules,
};
