const fs = require('fs');

const REPORT_PATH = process.argv[2] || 'naming-report.json';

try {
    if (!fs.existsSync(REPORT_PATH)) {
        console.log('Report not found yet.');
        process.exit(0);
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    let totalErrors = 0;
    const fileCounts = {};
    const idCounts = {};
    const failureTypes = {};

    report.forEach(file => {
        let fileErrors = 0;
        file.messages.forEach(msg => {
            if (msg.ruleId === '@typescript-eslint/naming-convention') {
                totalErrors++;
                fileErrors++;

                // Try to extract the identifier from message
                // Message format usually: "Variable name `foo_bar` must match one of the following formats: camelCase"
                // or "Property name `foo_bar` ..."
                const match = msg.message.match(/`([^`]+)`/);
                if (match) {
                    const id = match[1];
                    idCounts[id] = (idCounts[id] || 0) + 1;
                }

                // Categorize by start of message (Variable name, Property name, etc)
                const typeMatch = msg.message.split(' ')[0];
                failureTypes[typeMatch] = (failureTypes[typeMatch] || 0) + 1;
            }
        });
        if (fileErrors > 0) {
            fileCounts[file.filePath] = fileErrors;
        }
    });

    console.log(`Total Naming Errors: ${totalErrors}`);
    console.log('\nTop 20 Files:');
    Object.entries(fileCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([f, c]) => console.log(`${c} - ${f}`));

    console.log('\nTop 20 Identifiers:');
    Object.entries(idCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([k, v]) => console.log(`${v} - ${k}`));

    console.log('\nFailure Types:');
    Object.entries(failureTypes).forEach(([k, v]) => console.log(`${v} - ${k}`));

} catch (e) {
    console.error(e);
}
