import { jest } from '@jest/globals';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { PlatformConfig, PlatformMatterbridge } from 'matterbridge';

jest.unstable_mockModule('./vacuum_device_accessory.js', () => ({
  VacuumDeviceAccessory: jest.fn(() => {
    return {
      initializeMatterbridgeEndpoint: jest.fn(() => Promise.resolve({})),
      postRegister: jest.fn(() => {}),
      stop: jest.fn(() => {}),
    };
  }),
}));

const locate = jest.fn(async ({ did, ip }: { did?: string; ip?: string }): Promise<{ ip: string; token: string } | undefined> => {
  if (did === '123') return { ip: '4.4.4.4', token: 'did-token' };
  if (ip === '2.2.2.2') return { ip: '2.2.2.2', token: 'cloud-token' };
  return undefined;
});
jest.unstable_mockModule('./services/cloud_service.js', () => ({
  CloudService: jest.fn(() => ({ locate })),
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
  matterbridgeVersion: '3.0.0',
} as Partial<PlatformMatterbridge> as { -readonly [P in keyof PlatformMatterbridge]: PlatformMatterbridge[P] };

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
    if (instance) {
      jest.spyOn(instance, 'registerDevice').mockResolvedValue();
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should throw an error if matterbridge is not the required version', async () => {
    mockMatterbridge.matterbridgeVersion = '2.0.0'; // Simulate an older version
    const initializePlugin = (await import('./module.js')).default;
    expect(() => initializePlugin(mockMatterbridge, mockLog, mockConfig)).toThrow(
      'This plugin requires Matterbridge version >= "3.10.12". Please update Matterbridge from 2.0.0 to the latest version.',
    );
    mockMatterbridge.matterbridgeVersion = '3.10.12';
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
    expect(instance.matterbridge.matterbridgeVersion).toBe('3.10.12');
    expect(mockLog.info).toHaveBeenCalledWith('Initializing Platform...');
  });

  it('should start', async () => {
    await instance.onStart('Jest');
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: Jest');
    await instance.onStart();
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: none');
  });

  it('skips vacuums that could not be initialized, without failing the start (#248)', async () => {
    const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
    const accessoryMock = VacuumDeviceAccessory as unknown as jest.Mock;
    accessoryMock.mockImplementationOnce(() => ({
      initializeMatterbridgeEndpoint: jest.fn(() => Promise.resolve(undefined)),
      postRegister: jest.fn(),
      stop: jest.fn(),
    }));
    await instance.onStart('offline');
    expect(instance.registerDevice).not.toHaveBeenCalled();

    accessoryMock.mockImplementationOnce(() => ({
      initializeMatterbridgeEndpoint: jest.fn(() => Promise.reject(new Error('boom'))),
      postRegister: jest.fn(),
      stop: jest.fn(),
    }));
    await expect(instance.onStart('error')).resolves.toBeUndefined();
    expect(mockLog.error).toHaveBeenCalledWith('Failed to initialize the vacuum "Test vacuum": Error: boom');
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
    instance.config.unregisterOnShutdown = false;
  });

  it('gets the IP and token of the robots configured with their did, or without a token, from the Xiaomi Cloud', async () => {
    const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
    const accessoryMock = VacuumDeviceAccessory as unknown as jest.Mock;
    const config = {
      ...mockConfig,
      cloud: { enabled: true },
      devices: [
        { name: 'With token', ip: '1.1.1.1', token: 'token1' },
        { name: 'From the cloud', ip: '2.2.2.2' },
        { name: 'Not in the account', ip: '3.3.3.3' },
        { name: 'By did', did: '123', ip: '9.9.9.9', token: 'old-token' },
      ],
    };
    const platform = (await import('./module.js')).default(mockMatterbridge, mockLog, config) as XiaomiRoborockVacuumPlatform;
    jest.spyOn(platform, 'registerDevice').mockResolvedValue();
    await platform.onStart('cloud');
    expect(locate).toHaveBeenCalledTimes(3);
    expect(locate).toHaveBeenCalledWith({ did: '123', ip: '9.9.9.9' });
    const configs = accessoryMock.mock.calls.map(([cfg]) => cfg);
    expect(configs).toEqual([
      { name: 'With token', ip: '1.1.1.1', token: 'token1' },
      { name: 'From the cloud', ip: '2.2.2.2', token: 'cloud-token' },
      { name: 'Not in the account', ip: '3.3.3.3' },
      { name: 'By did', did: '123', ip: '4.4.4.4', token: 'did-token' },
    ]);
  });
});
