const os = require("os");
const path = require("path");

function isServerlessRuntime() {
    return Boolean(
        process.env.VERCEL
        || process.env.AWS_LAMBDA_FUNCTION_NAME
        || process.env.AWS_EXECUTION_ENV
        || process.env.NOW_REGION
        || process.env.SERVERLESS
    );
}

function getWritableDataRoot(rootDir) {
    if (!isServerlessRuntime()) {
        return rootDir;
    }

    return path.join(os.tmpdir(), "controle-atendimentos-eace");
}

module.exports = {
    getWritableDataRoot,
    isServerlessRuntime,
};
