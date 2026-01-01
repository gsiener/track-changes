type LogLevel = "debug" | "info" | "warn" | "error";

const levelColors: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const reset = "\x1b[0m";

function formatTime(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const color = levelColors[level];
  const prefix = `${color}[${formatTime()}] ${level.toUpperCase()}${reset}`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log("debug", message, data),
  info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => log("error", message, data),
};
