import { jest } from '@jest/globals';
import type { MiioDevice, MiioErrorChangedEvent } from 'node-miio';
import { Subject } from 'rxjs';

import type { DeviceManager, StateChangedEvent } from './services/device_manager.js';
import { miio } from './test.mocks.js';

type PublicMethodsOf<T> = { [K in keyof T]: T[K] };

interface ObservableProps {
  deviceConnected$: Subject<MiioDevice>;
  stateChanged$: Subject<StateChangedEvent>;
  errorChanged$: Subject<MiioErrorChangedEvent>;
}

export const deviceManagerMock: jest.Mocked<PublicMethodsOf<Omit<DeviceManager, keyof ObservableProps>>> & ObservableProps = {
  device: miio.device,
  deviceConnected$: new Subject<MiioDevice>(),
  ensureDevice: jest.fn(),
  errorChanged$: new Subject<MiioErrorChangedEvent>(),
  isCleaning: false,
  isPaused: false,
  model: miio.device.miioModel as string,
  property: jest.fn(() => undefined),
  state: 'charging',
  stateChanged$: new Subject<StateChangedEvent>(),
  stop: jest.fn(),
};

jest.unstable_mockModule('./services/device_manager.js', () => {
  return { DeviceManager: jest.fn(() => deviceManagerMock) };
});
