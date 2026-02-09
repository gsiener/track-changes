type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const levelColors: Record<LogLevel, string> = {
  trace: "\x1b[90m",
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const reset = "\x1b[0m";

// Default log level - can be changed at runtime
let currentLevel: LogLevel = "info";

function formatTime(): string {
  return new Date().toISOString().slice(11, 19);
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[currentLevel];
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const color = levelColors[level];
  const prefix = `${color}[${formatTime()}] ${level.toUpperCase()}${reset}`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  trace: (message: string, data?: Record<string, unknown>) => log("trace", message, data),
  debug: (message: string, data?: Record<string, unknown>) => log("debug", message, data),
  info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => log("error", message, data),

  setLevel: (level: LogLevel) => {
    currentLevel = level;
  },

  getLevel: (): LogLevel => currentLevel,
};
