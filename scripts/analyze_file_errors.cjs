const fs = require('fs');

const filename = process.argv[2] || 'vault-api.ts';
const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
const file = report.find(f => f.filePath.includes(filename));

if (file) {
    console.log(`File: ${file.filePath}`);
    console.log(`Total: ${file.errorCount} errors, ${file.warningCount} warnings\n`);

    const rules = {};
    file.messages.forEach(m => {
        rules[m.ruleId] = (rules[m.ruleId] || 0) + 1;
    });

    console.log('Top 15 Rules:');
    Object.entries(rules)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([rule, count]) => {
            console.log(`  ${count.toString().padStart(3)} - ${rule}`);
        });

    // Show first 5 error messages as examples
    console.log('\nFirst 5 Error Examples:');
    file.messages.slice(0, 5).forEach((m, i) => {
        console.log(`\n${i + 1}. Line ${m.line}: ${m.ruleId}`);
        console.log(`   ${m.message}`);
    });
} else {
    console.log(`File "${filename}" not found in report`);
}
