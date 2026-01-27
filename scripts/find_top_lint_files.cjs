const fs = require('fs');

try {
    const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));

    // Sort files by error count
    const files = report
        .map(file => ({
            filePath: file.filePath.replace(process.cwd() + '/', ''), // Relative path
            errorCount: file.errorCount,
            warningCount: file.warningCount,
            messages: file.messages
        }))
        .filter(f => f.errorCount > 0)
        .sort((a, b) => b.errorCount - a.errorCount);

    console.log("Top 20 Files by Error Count:");
    files.slice(0, 20).forEach(f => {
        console.log(`${f.errorCount} errors - ${f.filePath}`);
    });

} catch (err) {
    console.error("Error reading/parsing report:", err.message);
}
