const fs = require('fs');

const REPORT_PATH = process.argv[2] || 'eslint-report.json';
const TARGET_RULE = process.argv[3];

try {
    if (!fs.existsSync(REPORT_PATH)) {
        console.log('Report not found.');
        process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    let totalErrors = 0;
    const ruleCounts = {};
    const fileRuleCounts = {};

    report.forEach(file => {
        let fileTargetCount = 0;
        file.messages.forEach(msg => {
            totalErrors++;
            const ruleId = msg.ruleId || 'unknown';
            ruleCounts[ruleId] = (ruleCounts[ruleId] || 0) + 1;

            if (TARGET_RULE && ruleId === TARGET_RULE) {
                fileTargetCount++;
            }
        });
        if (fileTargetCount > 0) {
            fileRuleCounts[file.filePath] = fileTargetCount;
        }
    });

    console.log(`Total Errors: ${totalErrors}`);

    if (TARGET_RULE) {
        console.log(`\nHotspots for ${TARGET_RULE}:`);
        Object.entries(fileRuleCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .forEach(([f, c]) => console.log(`${c} - ${f}`));
    } else {
        console.log('\nTop Violations by Rule:');
        Object.entries(ruleCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([rule, count]) => {
                console.log(`${count} - ${rule}`);
            });
    }

} catch (e) {
    console.error(e);
}
