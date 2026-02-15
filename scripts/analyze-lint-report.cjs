const fs = require('fs');

try {
    const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));

    const errorsByRule = {};
    const errorsByFile = {};
    let totalErrors = 0;
    let totalWarnings = 0;

    report.forEach(file => {
        if (file.errorCount > 0 || file.warningCount > 0) {
            errorsByFile[file.filePath] = {
                errorCount: file.errorCount,
                warningCount: file.warningCount,
                messages: file.messages
            };

            file.messages.forEach(msg => {
                if (!errorsByRule[msg.ruleId]) {
                    errorsByRule[msg.ruleId] = 0;
                }
                errorsByRule[msg.ruleId]++;

                if (msg.severity === 2) totalErrors++;
                else totalWarnings++;
            });
        }
    });

    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Total Warnings: ${totalWarnings}`);
    console.log('\nTop Rules:');
    Object.entries(errorsByRule)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([rule, count]) => console.log(`${rule}: ${count}`));

    console.log('\nTop Files:');
    Object.entries(errorsByFile)
        .sort((a, b) => b[1].errorCount - a[1].errorCount)
        .slice(0, 10)
        .forEach(([path, stats]) => console.log(`${path}: ${stats.errorCount} errors`));

    // meaningful snippet for emailTemplates.routes.ts
    const emailRoutes = Object.keys(errorsByFile).find(f => f.includes('emailTemplates.routes.ts'));
    if (emailRoutes) {
        console.log(`\nErrors in emailTemplates.routes.ts:`);
        errorsByFile[emailRoutes].messages.forEach(m => console.log(`${m.line}:${m.column} [${m.ruleId}] ${m.message}`));
    }

} catch (e) {
    console.error('Failed to parse report:', e);
}
