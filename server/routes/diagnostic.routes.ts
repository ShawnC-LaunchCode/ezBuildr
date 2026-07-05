import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { Express } from "express";

// eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js ESM convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js ESM convention
const __dirname = path.dirname(__filename);

export function registerDiagnosticRoutes(app: Express): void {
    // SECURITY: diagnostics must never be exposed in production. This static auth-testing
    // page is a development aid only.
    if (process.env.NODE_ENV === 'production') {
        return;
    }

    app.get("/test-auth.html", (req, res) => {
        // Look for the file in client/test-auth.html
        // We need to go up from server/routes to root, then into client
        const filePath = path.resolve(__dirname, "../../client/test-auth.html");

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            // Do not reflect the absolute filesystem path back to the client.
            res.status(404).send("Diagnostic file not found");
        }
    });
}
