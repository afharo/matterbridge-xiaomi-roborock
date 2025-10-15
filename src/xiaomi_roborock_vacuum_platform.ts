import { MatterbridgeDynamicPlatform, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { type AnsiLogger, LogLevel } from 'matterbridge/logger';

import { type Config } from './services/config_service.js';
import { VacuumDeviceAccessory } from './vacuum_device_accessory.js';

export interface XiaomiRoborockVacuumPluginConfig extends PlatformConfig {
  devices?: Partial<Config>[];
  debug: boolean;
}

export class XiaomiRoborockVacuumPlatform extends MatterbridgeDynamicPlatform {
  private readonly vacuumDevices = new Set<VacuumDeviceAccessory>();

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: XiaomiRoborockVacuumPluginConfig,
  ) {
    // Always call super(matterbridge, log, config)
    super(matterbridge, log, config);

    log.logLevel = this.config.debug ? LogLevel.DEBUG : LogLevel.INFO;

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.3.0')) {
      throw new Error(`This plugin requires Matterbridge version >= "3.3.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version."`);
    }

    this.log.info(`Initializing Platform...`);
    // You can initialize your platform here, like setting up initial state or loading configurations.
  }

  override async onStart(reason?: string) {
    this.log.info(`onStart called with reason: ${reason ?? 'none'}`);

    // Wait for the platform to fully load the select
    await this.ready;

    // Clean the selectDevice and selectEntity maps, if you want to reset the select.
    await this.clearSelect();

    // Implements your own logic there
    await this.discoverDevices();
  }

  override async onChangeLoggerLevel(logLevel: LogLevel) {
    this.log.info(`onChangeLoggerLevel called with: ${logLevel}`);
    // Change here the logger level of the api you use or of your devices
  }

  override async onShutdown(reason?: string) {
    // Always call super.onShutdown(reason)
    await super.onShutdown(reason);

    this.log.info(`onShutdown called with reason: ${reason ?? 'none'}`);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();

    this.vacuumDevices.forEach((vacuum) => vacuum.stop());
  }

  private async discoverDevices() {
    this.log.info('Discovering devices...');

    const devices = this.config.devices ?? [];

    this.log.info(`Found ${devices.length} devices`);

    await Promise.all(
      devices.map(async (cfg) => {
        const vacuumDevice = new VacuumDeviceAccessory(cfg, this.log);
        const vacuum = await vacuumDevice.initializeMatterbridgeEndpoint();
        await this.registerDevice(vacuum);
        await vacuumDevice.postRegister();
        this.vacuumDevices.add(vacuumDevice);
      }),
    );
  }
}
