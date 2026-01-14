import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { Express } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerDiagnosticRoutes(app: Express) {
    app.get("/test-auth.html", (req, res) => {
        // Look for the file in client/test-auth.html
        // We need to go up from server/routes to root, then into client
        const filePath = path.resolve(__dirname, "../../client/test-auth.html");

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send(`Diagnostic file not found at ${  filePath}`);
        }
    });
}
