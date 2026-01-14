import pino from "pino";

import { env } from "../../../client/src/lib/config/environment";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
    level: env.LOG_LEVEL || "info",
    transport: isDev
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                ignore: "pid,hostname",
            },
        }
        : undefined,
    base: {
        env: env.NODE_ENV,
    },
});

export const requestLogger = (req: any, res: any, next: any) => {
    const startTime = Date.now();

    // Log request
    logger.debug({
        msg: "Incoming request",
        method: req.method,
        url: req.url,
        requestId: req.id,
    });

    // Hook into response finish
    res.on("finish", () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

        logger[logLevel]({
            msg: "Request completed",
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            requestId: req.id,
        });
    });

    next();
};
