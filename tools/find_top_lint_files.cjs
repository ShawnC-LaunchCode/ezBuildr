const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running ESLint... this may take a minute...');

try {
    // Increase buffer size for large output
    execSync('npx eslint . --format json --output-file lint_report.json', {
        stdio: 'inherit',
        maxBuffer: 1024 * 1024 * 10
    });
} catch (e) {
    // ESLint returns non-zero exit code on errors, which is expected
}

if (!fs.existsSync('lint_report.json')) {
    console.error('Failed to generate lint_report.json');
    process.exit(1);
}

const report = JSON.parse(fs.readFileSync('lint_report.json', 'utf8'));

const fileErrors = report
    .map(file => ({
        filePath: file.filePath,
        errorCount: file.errorCount,
        warningCount: file.warningCount,
        messages: file.messages
    }))
    .filter(file => file.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount);

console.log('\nTop 10 Files with Lint Errors:\n');

fileErrors.slice(0, 10).forEach(file => {
    console.log(`${file.errorCount} errors - ${file.filePath}`);
});

console.log(`\nTotal Files with Errors: ${fileErrors.length}`);
const totalErrors = fileErrors.reduce((sum, file) => sum + file.errorCount, 0);
console.log(`Total Errors: ${totalErrors}`);
