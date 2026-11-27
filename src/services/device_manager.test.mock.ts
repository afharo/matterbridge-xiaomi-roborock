import { vi } from 'vitest';

import { miio } from '../test.mocks.js';

export const miioMock = miio.createMock();
vi.doMock('node-miio', () => miioMock);
