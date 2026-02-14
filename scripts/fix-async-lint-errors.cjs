const fs = require('fs');
const _path = require('path');

// Read the critical files list
let criticalFiles = { misusedPromises: [], floatingPromises: [] };
try {
    criticalFiles = JSON.parse(fs.readFileSync('lint-critical-files.json', 'utf8'));
} catch (e) {
    console.error("Could not read lint-critical-files.json", e);
    process.exit(1);
}

function processFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {return;}

        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        // Strategy: Match common event handlers
        const eventHandlers = ['onClick', 'onSubmit', 'onChange', 'onBlur', 'onFocus', 'onKeyDown', 'onKeyUp'];

        eventHandlers.forEach(handlerProp => {
            // Case A: onClick={handleSave}
            // Regex explanation:
            // ${handlerProp}=\{      Match prop name and opening brace e.g. onClick={
            // \s*                    Optional whitespace
            // ([a-zA-Z0-9_]+)        Capture function name (group 1)
            // \s*                    Optional whitespace
            // \}                     Closing brace
            const regexA = new RegExp(`${handlerProp}=\\{\\s*([a-zA-Z0-9_]+)\\s*\\}`, 'g');
            content = content.replace(regexA, (match, funcName) => {
                // Heuristic: only apply if it looks like an action handler (starts with handle or on)
                // AND we are in a file known to have errors.
                if (funcName.startsWith('handle') || funcName.startsWith('on')) {
                    const isSubmit = handlerProp === 'onSubmit';
                    const arg = isSubmit ? 'e' : '';
                    const preventDefault = isSubmit ? 'e.preventDefault(); ' : '';
                    return `${handlerProp}={(${arg}) => { ${preventDefault}void ${funcName}(${arg}); }}`;
                }
                return match;
            });

            // Case B: onClick={() => handleSave(arg)}  -> onClick={() => { void handleSave(arg); }}
            // This targets implicit returns of promises in arrow functions
            // Regex: onClick={() => func(...)}
            // We need to be careful not to break existing block bodies (check for { after arrow)
            const regexB = new RegExp(`${handlerProp}=\\{\\s*\\(([^)]*)\\)\\s*=>\\s*([^\\{\\s]+)\\(([^)]*)\\)\\s*\\}`, 'g');
            content = content.replace(regexB, (match, args, funcName, funcArgs) => {
                // only if funcName looks async-ish or is a likely candidate
                if (funcName.startsWith('handle') || funcName.startsWith('on') || funcName.includes('Async')) {
                    return `${handlerProp}={(${args}) => { void ${funcName}(${funcArgs}); }}`;
                }
                return match;
            });
        });

        // Pattern 2: useEffect(() => { asyncFunc(); }, deps) -> useEffect(() => { void asyncFunc(); }, deps)
        // Regex: useEffect(\(\) => \{\s*([a-zA-Z0-9_]+\(.*\));\s*\},
        // match group 1 is the function call
        const useEffectRegex = /useEffect\(\(\) => \{\s*([a-zA-Z0-9_]+\([^;]*\));?\s*\},/g;
        content = content.replace(useEffectRegex, (match, funcCall) => {
            return `useEffect(() => { void ${funcCall}; },`;
        });

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed: ${filePath}`);
        }
    } catch (e) {
        // Ignore file access errors
    }
}

console.log(`Processing ${criticalFiles.misusedPromises.length} files for Misused Promises...`);
criticalFiles.misusedPromises.forEach(file => processFile(file));

console.log(`Processing ${criticalFiles.floatingPromises.length} files for Floating Promises...`);
criticalFiles.floatingPromises.forEach(file => processFile(file));
