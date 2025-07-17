import { jest } from '@jest/globals';

import { miio } from '../test.mocks.js';

jest.doMock('miio', () => miio.createMock());
