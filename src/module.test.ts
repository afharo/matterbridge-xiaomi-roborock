import { jest } from '@jest/globals';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';

jest.unstable_mockModule('./vacuum_device_accessory.js', () => ({
  VacuumDeviceAccessory: jest.fn(() => {
    return {
      initializeMatterbridgeEndpoint: jest.fn(() => Promise.resolve({})),
      postRegister: jest.fn(() => {}),
    };
  }),
}));

// import initializePlugin from './module.js';
import type { XiaomiRoborockVacuumPlatform } from './xiaomi_roborock_vacuum_platform.js';

const mockLog = {
  fatal: jest.fn((message: string, ...parameters: any[]) => {}),
  error: jest.fn((message: string, ...parameters: any[]) => {}),
  warn: jest.fn((message: string, ...parameters: any[]) => {}),
  notice: jest.fn((message: string, ...parameters: any[]) => {}),
  info: jest.fn((message: string, ...parameters: any[]) => {}),
  debug: jest.fn((message: string, ...parameters: any[]) => {}),
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
  addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
  removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
  removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
} as unknown as Matterbridge;

const mockConfig = {
  name: 'matterbridge-plugin-template',
  type: 'DynamicPlatform',
  version: '1.0.0',
  debug: false,
  unregisterOnShutdown: false,
} as PlatformConfig;

const loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {});

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

  // eslint-disable-next-line jest/no-commented-out-tests
  // it('should call the command handlers', async () => {
  //   for (const device of instance.getDevices()) {
  //     if (device.hasClusterServer('onOff')) {
  //       await device.executeCommandHandler('on');
  //       await device.executeCommandHandler('off');
  //     }
  //   }
  //   expect(mockLog.info).toHaveBeenCalledWith('Command on called on cluster undefined'); // Is undefined here cause the endpoint in not active
  //   expect(mockLog.info).toHaveBeenCalledWith('Command off called on cluster undefined'); // Is undefined here cause the endpoint in not active
  // });

  it('should configure', async () => {
    jest.spyOn(instance, 'getDevices').mockReturnValueOnce([{ uniqueId: '1234' } as MatterbridgeEndpoint]);
    await instance.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith('onConfigure called');
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Configuring device:'));
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
