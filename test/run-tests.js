const tests = [
    {
        name: "serverless runtime compatibility",
        run: require("./serverless-runtime.test.js"),
    },
    {
        name: "database integrity helpers",
        run: require("./database-integrity.test.js"),
    },
    {
        name: "history snapshot preservation",
        run: require("./history.test.js"),
    },
    {
        name: "HTTP auth and automation flow",
        run: require("./http.test.js"),
    },
];

async function main() {
    let failures = 0;

    for (const currentTest of tests) {
        try {
            await currentTest.run();
            console.log(`PASS ${currentTest.name}`);
        } catch (error) {
            failures += 1;
            console.error(`FAIL ${currentTest.name}`);
            console.error(error);
        }
    }

    if (failures > 0) {
        process.exitCode = 1;
        return;
    }

    console.log(`PASS ${tests.length} test(s) executado(s)`);
}

main().catch((error) => {
    console.error("FAIL test runner");
    console.error(error);
    process.exit(1);
});
