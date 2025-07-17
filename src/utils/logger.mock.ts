import { jest } from '@jest/globals';

import type { ModelLogger } from './logger.js';

export type LoggerMock = jest.Mocked<ModelLogger>;

export const getLoggerMock = (): LoggerMock => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  setModel: jest.fn(),
});
