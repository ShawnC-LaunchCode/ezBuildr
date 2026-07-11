import express from "express";
import helmet from "helmet";
import cors from "cors";

/**
 * Applies security headers, CORS, and payload limits uniformly across
 * both development (index.ts) and production (production.ts) entrypoints
 * to prevent configuration drift (SEC-055).
 */
export function applySecurityMiddleware(app: express.Application) {
    // =====================================================================
    // 1️⃣ HELMET SECURITY HEADERS
    // =====================================================================
    // CSP: 'unsafe-eval' is only needed by Vite's dev server / HMR. Drop it in production so the
    // production bundle runs under a stricter policy. ('unsafe-inline' is retained for now because
    // removing it from script-src requires nonce/hash-based CSP wired through the frontend build;
    // that is tracked as a follow-up.)
    const cspIsProduction = process.env.NODE_ENV === 'production';
    const cspScriptSrc = ["'self'", "https://accounts.google.com", "https://*.google.com", "https://*.gstatic.com"];
    
    if (!cspIsProduction) {
        cspScriptSrc.push("'unsafe-eval'"); // Vite dev/HMR only
        cspScriptSrc.push("'unsafe-inline'"); // Keep for dev
    }

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: cspScriptSrc,
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com", "https://*.google.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
                connectSrc: ["'self'", "https://accounts.google.com", "https://*.googleapis.com", "https://*.google.com", "https://*.gstatic.com", "wss:", "ws:"],
                frameSrc: ["'self'", "https://accounts.google.com", "https://*.google.com"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: cspIsProduction ? [] : null,
            },
        },
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
        },
        frameguard: {
            action: 'deny', // Prevent clickjacking
        },
        noSniff: true, // Prevent MIME type sniffing
        xssFilter: true, // Enable XSS filter
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },
        crossOriginOpenerPolicy: {
            policy: "same-origin-allow-popups",
        },
    }));

    // =====================================================================
    // 2️⃣ CORS CONFIGURATION
    // =====================================================================
    const corsOptions = {
        origin: function (
            origin: string | undefined,
            callback: (err: Error | null, allow?: boolean) => void,
        ) {
            const isDevelopment = process.env.NODE_ENV === "development";
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) {
                return callback(null, true);
            }
            
            // Extract hostname from origin
            let hostname: string;
            try {
                hostname = new URL(origin).hostname;
            } catch (e) {
                return callback(new Error("Invalid origin URL"), false);
            }
            
            // In development, allow localhost origins
            if (isDevelopment) {
                const allowedPatterns = [
                    /^localhost$/,
                    /^127\.0\.0\.1$/,
                    /^0\.0\.0\.0$/,
                ];
                if (allowedPatterns.some((pattern) => pattern.test(hostname))) {
                    return callback(null, true);
                }
            }
            
            // Allow ezBuildr production domains (explicit)
            if (hostname === "ezbuildr.com" || hostname === "www.ezbuildr.com") {
                return callback(null, true);
            }
            
            // In production, check against ALLOWED_ORIGIN environment variable
            const allowedOrigin = process.env.ALLOWED_ORIGIN;
            if (allowedOrigin) {
                const allowedHosts = allowedOrigin.split(",").map((h) => h.trim());
                if (allowedHosts.some((host) => hostname === host)) {
                    return callback(null, true);
                }
            }
            
            // Default: deny
            callback(new Error("Not allowed by CORS"), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    };
    app.use(cors(corsOptions));

    // =====================================================================
    // 3️⃣ PAYLOAD SIZE LIMITS (DoS Protection)
    // =====================================================================
    const maxRequestSize = process.env.MAX_REQUEST_SIZE ?? '10mb';
    app.use(express.json({ limit: maxRequestSize }));
    app.use(express.urlencoded({ extended: false, limit: maxRequestSize }));
}
