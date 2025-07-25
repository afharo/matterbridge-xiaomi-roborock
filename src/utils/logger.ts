import { Logger } from 'matterbridge/logger';

export interface CustomLoggerConfig {
  /**
   * The name of the vacuum
   */
  name: string;

  /**
   * When `true`, info and debug logs are silenced to avoid convoluted logs.
   */
  silent?: boolean;
}

const noop = () => {};

export interface ModelLogger extends Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> {
  setModel: (modelName: string) => void;
}

/**
 *
 * @param {Logger | ModelLogger} log The logger
 * @param {CustomLoggerConfig} config the config
 * @returns {ModelLogger} The logger
 */
export function getLogger(log: Logger | ModelLogger, config: CustomLoggerConfig): ModelLogger {
  if ('setModel' in log) {
    return log;
  }

  let model = 'unknown';

  /**
   *
   * @param {string} message The log message
   * @returns {string} The formatted message
   */
  function buildMsg(message: string) {
    return `[Name=${config.name}][Model=${model}] ${message}`;
  }

  return {
    debug: (msg, ...params) => (config.silent ? noop() : log.debug(buildMsg(msg), ...params)),
    info: (msg, ...params) => (config.silent ? noop() : log.info(buildMsg(msg), ...params)),
    warn: (msg, ...params) => log.warn(buildMsg(msg), ...params),
    error: (msg, ...params) => log.error(buildMsg(msg), ...params),
    setModel: (modelName) => (model = modelName),
  };
}
