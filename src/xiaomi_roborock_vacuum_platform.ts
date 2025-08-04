import { Matterbridge, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { type AnsiLogger, LogLevel } from 'matterbridge/logger';

import { type Config } from './services/config_service.js';
import { VacuumDeviceAccessory } from './vacuum_device_accessory.js';

export interface XiaomiRoborockVacuumPluginConfig extends PlatformConfig {
  devices?: Partial<Config>[];
  debug?: boolean;
}

export class XiaomiRoborockVacuumPlatform extends MatterbridgeDynamicPlatform {
  constructor(
    matterbridge: Matterbridge,
    log: AnsiLogger,
    override config: XiaomiRoborockVacuumPluginConfig,
  ) {
    // Always call super(matterbridge, log, config)
    super(matterbridge, log, config);

    log.logLevel = this.config.debug ? LogLevel.DEBUG : LogLevel.INFO;

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.0.7')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.0.7". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
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

  override async onConfigure() {
    // Always call super.onConfigure()
    await super.onConfigure();

    this.log.info('onConfigure called');

    // Configure all your devices. The persisted attributes need to be updated.
    for (const device of this.getDevices()) {
      this.log.info(`Configuring device: ${device.uniqueId}`);
      // You can update the device configuration here, for example:
      // device.updateConfiguration({ key: 'value' });
    }
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
        vacuumDevice.postRegister();
      }),
    );
  }
}
