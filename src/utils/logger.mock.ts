import { vi, type Mocked } from 'vitest';

import type { ModelLogger } from './logger.js';

export type LoggerMock = Mocked<ModelLogger>;

export const getLoggerMock = (): LoggerMock => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setModel: vi.fn(),
});
