/**
 * Centralized logger utility for the application.
 * 
 * Provides consistent logging across all components with:
 * - Log levels (debug, info, warn, error)
 * - Namespaced logging for easier filtering
 * - Development vs production control
 * 
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.debug('MyComponent', 'Debug message');
 *   logger.error('MyComponent', 'Error message', error);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
}

// Default configuration - in development, log everything; in production, only warnings and errors
const isDev = process.env.NODE_ENV !== 'production';

const defaultConfig: LoggerConfig = {
  level: isDev ? 'debug' : 'warn',
  enabled: true,
};

// Log level priorities
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Centralized logger with namespace support
 */
export const logger = {
  /**
   * Debug level - verbose logging for development
   */
  debug(namespace: string, message: string, ...args: unknown[]): void {
    log('debug', namespace, message, ...args);
  },

  /**
   * Info level - general information
   */
  info(namespace: string, message: string, ...args: unknown[]): void {
    log('info', namespace, message, ...args);
  },

  /**
   * Warn level - potentially harmful situations
   */
  warn(namespace: string, message: string, ...args: unknown[]): void {
    log('warn', namespace, message, ...args);
  },

  /**
   * Error level - error events that might still allow the application to continue running
   */
  error(namespace: string, message: string, ...args: unknown[]): void {
    log('error', namespace, message, ...args);
  },

  /**
   * Configure the logger
   */
  configure(config: Partial<LoggerConfig>): void {
    Object.assign(defaultConfig, config);
  },

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    if (!defaultConfig.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[defaultConfig.level];
  },
};

/**
 * Internal log function that handles the actual logging
 */
function log(level: LogLevel, namespace: string, message: string, ...args: unknown[]): void {
  if (!defaultConfig.enabled) return;
  
  // Check if this level should be logged
  if (LOG_LEVELS[level] < LOG_LEVELS[defaultConfig.level]) return;

  // Format the message with namespace and timestamp
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${namespace}] ${message}`;

  // Use appropriate console method based on level
  switch (level) {
    case 'debug':
      console.debug(formattedMessage, ...args);
      break;
    case 'info':
      console.info(formattedMessage, ...args);
      break;
    case 'warn':
      console.warn(formattedMessage, ...args);
      break;
    case 'error':
      console.error(formattedMessage, ...args);
      break;
  }
}

/**
 * Create a namespaced logger for a specific component/module
 * 
 * Usage:
 *   const log = createLogger('MyComponent');
 *   log.debug('Initializing...');
 *   log.error('Failed to load', error);
 */
export function createLogger(namespace: string) {
  return {
    debug(message: string, ...args: unknown[]): void {
      logger.debug(namespace, message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
      logger.info(namespace, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      logger.warn(namespace, message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
      logger.error(namespace, message, ...args);
    },
  };
}

/**
 * Backwards-compatible console wrapper that can be replaced with the logger
 * 
 * This provides a drop-in replacement for direct console.log calls
 * while maintaining the same API.
 */
export const log = {
  debug: (message: string, ...args: unknown[]) => logger.debug('global', message, ...args),
  info: (message: string, ...args: unknown[]) => logger.info('global', message, ...args),
  warn: (message: string, ...args: unknown[]) => logger.warn('global', message, ...args),
  error: (message: string, ...args: unknown[]) => logger.error('global', message, ...args),
};
