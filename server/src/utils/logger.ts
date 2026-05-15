type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m",  // green
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

const minLevel = LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LEVELS.info;

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function format(level: LogLevel, tag: string, message: string, context?: Record<string, any>): string {
  const color = COLORS[level];
  const lvl = level.toUpperCase().padEnd(5);
  const paddedTag = tag.padEnd(10);
  const base = `${color}[${timestamp()}] [${lvl}]${RESET} [${paddedTag}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

function log(level: LogLevel, tag: string, message: string, context?: Record<string, any>) {
  if (LEVELS[level] < minLevel) return;
  const out = format(level, tag, message, context);
  if (level === "error") {
    console.error(out);
  } else if (level === "warn") {
    console.warn(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  debug: (tag: string, message: string, context?: Record<string, any>) => log("debug", tag, message, context),
  info: (tag: string, message: string, context?: Record<string, any>) => log("info", tag, message, context),
  warn: (tag: string, message: string, context?: Record<string, any>) => log("warn", tag, message, context),
  error: (tag: string, message: string, context?: Record<string, any>) => log("error", tag, message, context),
};
