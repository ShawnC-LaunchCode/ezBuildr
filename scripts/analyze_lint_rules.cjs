const fs = require('fs');

const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
const rules = {};

report.forEach(f => {
    f.messages.forEach(m => {
        rules[m.ruleId] = (rules[m.ruleId] || 0) + 1;
    });
});

const sorted = Object.entries(rules).sort((a, b) => b[1] - a[1]);

console.log('Top 20 ESLint Rules:');
sorted.slice(0, 20).forEach(([rule, count]) => {
    console.log(`${count.toString().padStart(5)} - ${rule}`);
});
