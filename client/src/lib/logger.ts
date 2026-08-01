
/**
 * Structured Client-Side Logger
 * Wrapper around console.* with log levels, context, and production filtering.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
type _LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
    module: string;
}

class Logger {
    private module: string;
    private isDevelopment: boolean;

    constructor(config: LoggerConfig) {
        this.module = config.module;
        // In Vite, import.meta.env.PROD is true in production
        // Fallback to checking hostname or manual flag if needed
        this.isDevelopment = import.meta.env.DEV;
    }

    private formatMessage(message: string): string {
        return `[${this.module}] ${message}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
    debug(message: string, ...args: any[]) {

        if (this.isDevelopment) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, no-console
            console.debug(this.formatMessage(message), ...args);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
    info(message: string, ...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.info(this.formatMessage(message), ...args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
    warn(message: string, ...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.warn(this.formatMessage(message), ...args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
    error(message: string, ...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.error(this.formatMessage(message), ...args);
    }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createLogger = (config: LoggerConfig) => new Logger(config);
