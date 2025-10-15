import { jest } from '@jest/globals';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { Matterbridge, PlatformConfig } from 'matterbridge';

jest.unstable_mockModule('./vacuum_device_accessory.js', () => ({
  VacuumDeviceAccessory: jest.fn(() => {
    return {
      initializeMatterbridgeEndpoint: jest.fn(() => Promise.resolve({})),
      postRegister: jest.fn(() => {}),
      stop: jest.fn(() => {}),
    };
  }),
}));

// import initializePlugin from './module.js';
import type { XiaomiRoborockVacuumPlatform } from './xiaomi_roborock_vacuum_platform.js';

const mockLog = {
  fatal: jest.fn(() => {}),
  error: jest.fn(() => {}),
  warn: jest.fn(() => {}),
  notice: jest.fn(() => {}),
  info: jest.fn(() => {}),
  debug: jest.fn(() => {}),
} as unknown as AnsiLogger;

const mockMatterbridge = {
  matterbridgeDirectory: './jest/matterbridge',
  matterbridgePluginDirectory: './jest/plugins',
  systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
  matterbridgeVersion: '3.0.0',
  log: mockLog,
  getDevices: jest.fn(() => {
    return [];
  }),
  getPlugins: jest.fn(() => {
    return [];
  }),
  addBridgedEndpoint: jest.fn(async () => {}),
  removeBridgedEndpoint: jest.fn(async () => {}),
  removeAllBridgedEndpoints: jest.fn(async () => {}),
} as unknown as Matterbridge;

const mockConfig = {
  name: 'matterbridge-plugin-template',
  type: 'DynamicPlatform',
  version: '1.0.0',
  debug: false,
  unregisterOnShutdown: false,
} as PlatformConfig;

jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation(() => {});

describe('Matterbridge Xiaomi Roborock Vacuum Plugin', () => {
  let instance: XiaomiRoborockVacuumPlatform;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should throw an error if matterbridge is not the required version', async () => {
    mockMatterbridge.matterbridgeVersion = '2.0.0'; // Simulate an older version
    const initializePlugin = (await import('./module.js')).default;
    expect(() => initializePlugin(mockMatterbridge, mockLog, mockConfig)).toThrow(
      'This plugin requires Matterbridge version >= "3.0.7". Please update Matterbridge from 2.0.0 to the latest version in the frontend.',
    );
    mockMatterbridge.matterbridgeVersion = '3.0.7';
  });

  it('should create an instance of the platform', async () => {
    const configWithDevices = {
      ...mockConfig,
      devices: [{ name: 'Test vacuum', ip: '1.1.1.1', token: 'token1' }],
    };
    instance = (await import('./module.js')).default(mockMatterbridge, mockLog, configWithDevices) as XiaomiRoborockVacuumPlatform;
    const XiaomiRoborockVacuumPlatformClass = (await import('./xiaomi_roborock_vacuum_platform.js')).XiaomiRoborockVacuumPlatform;
    expect(instance).toBeInstanceOf(XiaomiRoborockVacuumPlatformClass);
    expect(instance.matterbridge).toBe(mockMatterbridge);
    expect(instance.log).toBe(mockLog);
    expect(instance.config).toBe(configWithDevices);
    expect(instance.matterbridge.matterbridgeVersion).toBe('3.0.7');
    expect(mockLog.info).toHaveBeenCalledWith('Initializing Platform...');
  });

  it('should start', async () => {
    await instance.onStart('Jest');
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: Jest');
    await instance.onStart();
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: none');
  });

  it('should change logger level', async () => {
    await instance.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(mockLog.info).toHaveBeenCalledWith('onChangeLoggerLevel called with: debug');
  });

  it('should shutdown', async () => {
    await instance.onShutdown('Jest');
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason: Jest');

    // Mock the unregisterOnShutdown behavior
    instance.config.unregisterOnShutdown = true;
    await instance.onShutdown();
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason: none');
    expect(mockMatterbridge.removeAllBridgedEndpoints).toHaveBeenCalled();
    instance.config.unregisterOnShutdown = false;
  });
});
