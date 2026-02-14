const fs = require('fs');

try {
    const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
    let misused = 0;
    let floating = 0;
    let total = 0;

    const ruleCounts = {};
    report.forEach(file => {
        file.messages.forEach(msg => {
            total++;
            ruleCounts[msg.ruleId] = (ruleCounts[msg.ruleId] || 0) + 1;
            if (msg.ruleId === '@typescript-eslint/no-floating-promises') {floating++;}
            if (msg.ruleId === '@typescript-eslint/no-misused-promises') {misused++;}
        });
    });

    console.log(`Total Errors: ${total}`);
    console.log(`Floating Promises: ${floating}`);
    console.log(`Misused Promises: ${misused}`);

    console.log("\nTop 10 Rules:");
    Object.entries(ruleCounts)
        // Sort by count descending
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .forEach(([rule, count]) => console.log(`${rule}: ${count}`));

    console.log("\nTop 10 Files with Errors:");
    const fileCounts = report.map(file => ({
        name: file.filePath,
        count: file.errorCount + file.warningCount
    })).sort((a, b) => b.count - a.count);

    fileCounts.slice(0, 10).forEach(f => {
        // Clean up path for readability (handle Windows backslashes)
        const relativePath = f.name.replace(/\\/g, '/').split('VaultLogic/')[1] || f.name;
        console.log(`${relativePath}: ${f.count}`);
    });

} catch (e) {
    console.error("Error parsing report:", e);
}
