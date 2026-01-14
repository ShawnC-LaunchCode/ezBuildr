
import fs from 'fs';
import path from 'path';

// Define types for Vitest JSON output (simplified)
interface AssertionResult {
    ancestorTitles: string[];
    fullName: string;
    status: 'passed' | 'failed' | 'skipped' | 'pending';
    title: string;
    failureMessages: string[];
}

interface TestResult {
    assertionResults: AssertionResult[];
    name: string; // File path
    status: 'passed' | 'failed';
    message: string;
}

interface VitestOutput {
    numFailedTests: number;
    testResults: TestResult[];
}

interface CategorizedFailure {
    category: 'Easy' | 'Complex' | 'Hard';
    file: string;
    testName: string;
    message: string;
    fixSuggestion?: string;
    rawMessage: string;
}

const INPUT_FILE = 'test-results.json';
const OUTPUT_FILE = 'failure_report.md';

function analyze() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`File ${INPUT_FILE} not found.`);
        return;
    }

    const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
    const data: VitestOutput = JSON.parse(raw);

    const failures: CategorizedFailure[] = [];

    for (const result of data.testResults) {
        if (result.status === 'failed') {
            const fileName = path.relative(process.cwd(), result.name);

            // Check for file-level errors (like timeouts or compilation errors)
            if (result.message && (!result.assertionResults || result.assertionResults.length === 0)) {
                failures.push({
                    category: 'Hard',
                    file: fileName,
                    testName: 'File Level Error',
                    message: result.message.split('\n')[0],
                    rawMessage: result.message
                });
                continue;
            }

            for (const assertion of result.assertionResults) {
                if (assertion.status === 'failed') {
                    const rawMsg = assertion.failureMessages[0] || "Unknown Error";
                    const msg = rawMsg.split('\n')[0]; // First line usually contains the core error

                    let category: 'Easy' | 'Complex' | 'Hard' = 'Hard';
                    let fixSuggestion: string | undefined = undefined;

                    // HEURISTICS

                    // Easy: Missing Imports / References
                    if (msg.includes('is not defined')) {
                        category = 'Easy';
                        fixSuggestion = 'Add missing import or variable declaration.';
                    }
                    // Easy: Type Errors (Mocking/Simple logic)
                    else if (msg.includes('is not a function') || msg.includes('undefined is not an object')) {
                        category = 'Easy';
                        fixSuggestion = 'Check function name or mock definition.';
                    }
                    // Easy: Simple Assertion Mismatches
                    else if (msg.includes('expected') && msg.includes('received') && !msg.includes('200') && !msg.includes('401') && !msg.includes('500')) {
                        // Exclude HTTP status code mismatches as they often imply logic/server state issues
                        category = 'Easy';
                        fixSuggestion = 'Update test expectation or fix off-by-one/typo.';
                    }

                    // Complex: Auth
                    else if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
                        category = 'Complex';
                        fixSuggestion = 'Investigate Authentication Middleware/Mocking.';
                    }
                    // Complex: Database
                    else if (msg.includes('foreign key') || msg.includes('constraint') || msg.includes('violates') || msg.includes('lock')) {
                        category = 'Complex';
                        fixSuggestion = 'Fix DB setup/cleanup or race condition.';
                    }
                    // Complex: Server Errors
                    else if (msg.includes('500') || msg.includes('Internal Server Error')) {
                        category = 'Complex';
                        fixSuggestion = 'Debug Server-Side Logic/Exception.';
                    }

                    // Hard: Timeouts
                    if (msg.includes('timed out')) {
                        category = 'Hard';
                        fixSuggestion = 'Check for deadlocks or long-running async ops.';
                    }

                    failures.push({
                        category,
                        file: fileName,
                        testName: assertion.fullName,
                        message: msg,
                        fixSuggestion,
                        rawMessage: rawMsg
                    });
                }
            }
        }
    }

    // Generate Report
    let md = '# Test Failure Analysis\n\n';

    const grouped = {
        Easy: failures.filter(f => f.category === 'Easy'),
        Complex: failures.filter(f => f.category === 'Complex'),
        Hard: failures.filter(f => f.category === 'Hard'),
    };

    md += `**Total Failures:** ${failures.length}\n`;
    md += `- **Easy:** ${grouped.Easy.length}\n`;
    md += `- **Complex:** ${grouped.Complex.length}\n`;
    md += `- **Hard:** ${grouped.Hard.length}\n\n`;

    md += '## 1. Easy Fixes (Candidates for Auto-Fix)\n';
    grouped.Easy.forEach(f => {
        md += `- **${f.file}**\n  - Test: \`${f.testName}\`\n  - Error: \`${f.message}\`\n  - Suggestion: ${f.fixSuggestion}\n`;
    });

    md += '\n## 2. Complex Issues (Auth/DB/Logic)\n';
    grouped.Complex.forEach(f => {
        md += `- **${f.file}**\n  - Test: \`${f.testName}\`\n  - Error: \`${f.message}\`\n`;
    });

    md += '\n## 3. Hard Issues (Timeouts/Unknown)\n';
    grouped.Hard.forEach(f => {
        md += `- **${f.file}**\n  - Test: \`${f.testName}\`\n  - Error: \`${f.message}\`\n`;
    });

    fs.writeFileSync(OUTPUT_FILE, md);
    console.log(`Analysis complete. Report written to ${OUTPUT_FILE}`);
}

analyze();
