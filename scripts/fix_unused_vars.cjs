const fs = require('fs');
const path = require('path');

const REPORT_PATH = process.argv[2] || 'unused-vars-report.json';

function run() {
    if (!fs.existsSync(REPORT_PATH)) {
        console.error(`Report file not found: ${REPORT_PATH}`);
        process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    let totalFixed = 0;

    for (const result of report) {
        if (result.messages.length === 0) continue;

        const filePath = result.filePath;
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            continue;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        let modifications = [];

        for (const msg of result.messages) {
            if (msg.ruleId !== '@typescript-eslint/no-unused-vars') continue;

            // Extract variable name
            const match = listMatch(msg.message);
            if (!match) {
                console.warn(`Could not extract var name from: "${msg.message}"`);
                continue;
            }

            const varName = match;
            const lineIdx = msg.line - 1;
            const lineContent = lines[lineIdx];

            if (!lineContent) {
                console.warn(`Line ${msg.line} not found in ${filePath}`);
                continue;
            }

            // Check if already prefixed
            if (varName.startsWith('_')) continue;

            // We need to find the variable in the line.
            // Easiest is to look for the identifier at the approximate column, but column info might point to start.
            // Let's rely on simple replacement within the line for safety, but be careful of overlapping names.
            // Actually, column is usually reliable.
            const col = msg.column - 1;

            // Verify the text at column matches varName
            const textAtCol = lineContent.substring(col, col + varName.length);
            if (textAtCol !== varName) {
                // Fallback: search in line
                const idx = lineContent.indexOf(varName);
                if (idx === -1) {
                    console.warn(`Variable ${varName} not found in line ${msg.line} of ${filePath}`);
                    continue;
                }
                // Use this index
                modifications.push({ line: lineIdx, col: idx, old: varName, new: '_' + varName });
            } else {
                modifications.push({ line: lineIdx, col: col, old: varName, new: '_' + varName });
            }
            totalFixed++;
        }

        // Apply modifications from bottom - right to top - left to preserve indices
        // Sort by line desc, then col desc
        modifications.sort((a, b) => {
            if (a.line !== b.line) return b.line - a.line;
            return b.col - a.col;
        });

        // Deduplicate (in case error reported multiple times for same var)
        modifications = modifications.filter((mod, index, self) =>
            index === self.findIndex((m) => (
                m.line === mod.line && m.col === mod.col
            ))
        );

        // Apply
        for (const mod of modifications) {
            const line = lines[mod.line];
            const before = line.substring(0, mod.col);
            const after = line.substring(mod.col + mod.old.length);
            lines[mod.line] = before + mod.new + after;
        }

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`Updated ${filePath} (${modifications.length} fixes)`);
    }

    console.log(`Total variables prefixed: ${totalFixed}`);
}

function listMatch(msg) {
    // try different patterns
    // "'foo' is defined but never used"
    // "'foo' is assigned a value but never used"
    const simple = /'([^']+)' is/;
    const m = msg.match(simple);
    return m ? m[1] : null;

}

run();
