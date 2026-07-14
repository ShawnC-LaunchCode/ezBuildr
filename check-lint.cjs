const { ESLint } = require("eslint");
const fs = require("fs");

(async function main() {
  const files = fs.readFileSync("files.txt", "utf8").split(/\r?\n/).filter(f => (f.trim().endsWith(".ts") || f.trim().endsWith(".tsx")) && fs.existsSync(f.trim()));
  
  console.log(`Running eslint on ${files.length} files...`);
  
  const eslint = new ESLint();
  const results = await eslint.lintFiles(files);
  const errors = results.filter(r => r.errorCount > 0);
  
  for (const r of errors) {
    console.log(r.filePath);
    for (const msg of r.messages) {
      if (msg.severity === 2) {
        console.log(`  ${msg.line}:${msg.column}  error  ${msg.message}  ${msg.ruleId}`);
      }
    }
  }
  
  const totalErrors = errors.reduce((acc, r) => acc + r.errorCount, 0);
  console.log(`\nTotal files with errors: ${errors.length}`);
  console.log(`Total errors: ${totalErrors}`);
})().catch(console.error);
