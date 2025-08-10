import { jest } from '@jest/globals';
import { Logger } from 'matterbridge/logger';

import { getLogger } from './logger.js';

describe('getLogger', () => {
  const mockLog: jest.Mocked<Logger> = {
    fatal: jest.fn((_message: string, ..._parameters: any[]) => {}),
    error: jest.fn((_message: string, ..._parameters: any[]) => {}),
    warn: jest.fn((_message: string, ..._parameters: any[]) => {}),
    notice: jest.fn((_message: string, ..._parameters: any[]) => {}),
    info: jest.fn((_message: string, ..._parameters: any[]) => {}),
    debug: jest.fn((_message: string, ..._parameters: any[]) => {}),
    log: jest.fn((_message: string, ..._parameters: any[]) => {}),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('it should create a new logger out of the Logging structure', () => {
    const logger = getLogger(mockLog, { name: 'test' });
    expect(logger).toMatchObject({
      debug: expect.any(Function),
      info: expect.any(Function),
      warn: expect.any(Function),
      error: expect.any(Function),
      setModel: expect.any(Function),
    });
  });

  test('it should return the logger as-is if log is already a logger', () => {
    const firstLogger = getLogger(mockLog, { name: 'test' });
    const secondLogger = getLogger(firstLogger, { name: 'test' });
    expect(secondLogger).toStrictEqual(firstLogger);
  });

  test.each(['debug', 'info', 'warn', 'error'] as const)('it should log %p messages by default', (level) => {
    const logSpy = jest.spyOn(mockLog, level);
    const logger = getLogger(mockLog, { name: 'test' });
    logger[level]('Test message');
    expect(logSpy).toHaveBeenCalledWith('[Name=test][Model=unknown] Test message');
  });

  test.each(['debug', 'info', 'warn', 'error'] as const)('it should log %p messages with a model set', (level) => {
    const logSpy = jest.spyOn(mockLog, level);
    const logger = getLogger(mockLog, { name: 'test' });
    logger.setModel('test-model');
    logger[level]('Test message');
    expect(logSpy).toHaveBeenCalledWith('[Name=test][Model=test-model] Test message');
  });
});
