import { jest } from '@jest/globals';

import { miio } from '../test.mocks.js';

export const miioMock = miio.createMock();
jest.doMock('miio', () => miioMock);
