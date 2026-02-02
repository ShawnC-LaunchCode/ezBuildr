
const fs = require('fs');

try {
    const data = fs.readFileSync('lint_report.json', 'utf8');
    const report = JSON.parse(data);

    const fileStats = report
        .map(file => ({
            filePath: file.filePath,
            errorCount: file.errorCount,
            warningCount: file.warningCount,
            total: file.errorCount + file.warningCount
        }))
        .filter(file => file.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    console.log('Top 10 Lint Offenders:');
    fileStats.forEach((file, index) => {
        console.log(`${index + 1}. ${file.filePath} (Errors: ${file.errorCount}, Warnings: ${file.warningCount})`);
    });
} catch (err) {
    console.error('Error reading/parsing report:', err.message);
}
