const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'migrations');

fs.readdir(migrationsDir, (err, files) => {
    if (err) {
        console.error("Could not list directory", err);
        process.exit(1);
    }

    files.forEach(file => {
        if (file.endsWith('.sql')) {
            const filePath = path.join(migrationsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // Replace "public". with empty string to use search_path
            // Also handle public. without quotes if present (less likely in drizzle output but possible)
            // Drizzle usually outputs "public"."table_name"

            const newContent = content.replace(/"public"\./g, '');

            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent);
                console.log(`Updated ${file}`);
            }
        }
    });
});
