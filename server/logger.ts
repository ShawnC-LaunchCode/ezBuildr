import pino from 'pino';

/**
 * Logger Configuration
 *
 * Uses Pino for structured logging with:
 * - Development: Pretty formatting for readability
 * - Production: JSON format for log aggregation/analysis
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  // Redact sensitive information from logs
  redact: {
    paths: [
      'token',
      'idToken',
      'password',
      'credential',
      'SESSION_SECRET',
      'GOOGLE_CLIENT_ID',
      'DATABASE_URL',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
  // Base context for all logs
  base: {
    env: process.env.NODE_ENV,
  },
});

/**
 * Create a child logger with additional context
 * @param context - Additional context to add to all logs
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

/**
 * Express middleware for request logging
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const requestLogger = (req: unknown, res: unknown, next: unknown) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  const reqTyped = req as { id?: string; log?: unknown; method?: string; url?: string; ip?: string; get?: (key: string) => string | undefined };
  const resTyped = res as { on: (event: string, handler: () => void) => void; statusCode?: number };
  const nextTyped = next as () => void;

  reqTyped.id = requestId;
  reqTyped.log = logger.child({ requestId, method: reqTyped.method, url: reqTyped.url });

  resTyped.on('finish', () => {
    const duration = Date.now() - start;
    (reqTyped.log as typeof logger).info(
      {
        statusCode: resTyped.statusCode,
        duration,
        ip: reqTyped.ip,
        userAgent: reqTyped.get?.('User-Agent'),
      },
      `${reqTyped.method} ${reqTyped.url} ${resTyped.statusCode} - ${duration}ms`
    );
  });

  nextTyped();
};

export default logger;
