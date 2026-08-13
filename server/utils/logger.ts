/**
 * Logger structuré pour Jarvis-OS
 *
 * Remplace les console.log éparpillés par un système centralisé avec :
 * - Niveaux configurables (debug, info, warn, error)
 * - Préfixes automatiques (module/composant)
 * - Timestamps ISO
 * - Possibilité d'écriture fichier (future)
 * - Coloration console
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

export interface LoggerOptions {
  /** Niveau minimum de log affiché */
  level?: LogLevel;
  /** Activer les timestamps dans la sortie console */
  timestamps?: boolean;
  /** Activer la coloration ANSI */
  colors?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════════

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gris
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // jaune
  error: "\x1b[31m",  // rouge
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ═══════════════════════════════════════════════════════════════════════════════
// Logger
// ═══════════════════════════════════════════════════════════════════════════════

class LoggerInstance {
  private level: LogLevel;
  private timestamps: boolean;
  private colors: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.timestamps = options.timestamps ?? true;
    this.colors = options.colors ?? true;
  }

  /** Reconfigure le logger à chaud */
  configure(options: Partial<LoggerOptions>): void {
    if (options.level !== undefined) this.level = options.level;
    if (options.timestamps !== undefined) this.timestamps = options.timestamps;
    if (options.colors !== undefined) this.colors = options.colors;
  }

  /** Crée un logger enfant avec un préfixe de module */
  child(module: string): ModuleLogger {
    return new ModuleLogger(module, this);
  }

  /** Vérifie si un niveau est actif */
  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  /** Méthode interne d'écriture */
  write(entry: LogEntry): void {
    if (!this.isLevelEnabled(entry.level)) return;

    const parts: string[] = [];

    // Timestamp
    if (this.timestamps) {
      const ts = entry.timestamp.split("T")[1]?.replace("Z", "") ?? entry.timestamp;
      parts.push(this.colors ? `\x1b[90m${ts}${RESET}` : ts);
    }

    // Level
    const levelTag = entry.level.toUpperCase().padEnd(5);
    if (this.colors) {
      parts.push(`${LEVEL_COLORS[entry.level]}${levelTag}${RESET}`);
    } else {
      parts.push(levelTag);
    }

    // Module
    if (this.colors) {
      parts.push(`${BOLD}[${entry.module}]${RESET}`);
    } else {
      parts.push(`[${entry.module}]`);
    }

    // Message
    parts.push(entry.message);

    const line = parts.join(" ");

    // Sortie
    switch (entry.level) {
      case "error":
        console.error(line);
        if (entry.data) console.error(entry.data);
        break;
      case "warn":
        console.warn(line);
        if (entry.data) console.warn(entry.data);
        break;
      default:
        console.log(line);
        if (entry.data) console.log(entry.data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ModuleLogger — Logger avec préfixe de module intégré
// ═══════════════════════════════════════════════════════════════════════════════

export class ModuleLogger {
  constructor(
    private readonly module: string,
    private readonly parent: LoggerInstance
  ) {}

  debug(message: string, data?: unknown): void {
    this.parent.write({
      level: "debug",
      module: this.module,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  info(message: string, data?: unknown): void {
    this.parent.write({
      level: "info",
      module: this.module,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  warn(message: string, data?: unknown): void {
    this.parent.write({
      level: "warn",
      module: this.module,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  error(message: string, data?: unknown): void {
    this.parent.write({
      level: "error",
      module: this.module,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /** Crée un sous-logger (ex: "Orchestrator" → "Orchestrator:Execution") */
  child(subModule: string): ModuleLogger {
    return new ModuleLogger(`${this.module}:${subModule}`, this.parent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton global
// ═══════════════════════════════════════════════════════════════════════════════

export const logger = new LoggerInstance();

/**
 * Crée un logger pour un module spécifique.
 * Usage: const log = createLogger("McpBridge");
 */
export function createLogger(module: string): ModuleLogger {
  return logger.child(module);
}
