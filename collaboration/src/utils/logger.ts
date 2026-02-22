const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const threshold = LEVELS[LOG_LEVEL as keyof typeof LEVELS] ?? LEVELS.info;

function log(level: keyof typeof LEVELS, ...args: unknown[]) {
  if (LEVELS[level] >= threshold) {
    const ts = new Date().toISOString();
    console[level](`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};
