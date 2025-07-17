import { Matterbridge, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, roboticVacuumCleaner, PlatformConfig } from 'matterbridge';
import type { AnsiLogger, LogLevel } from 'matterbridge/logger';
import type { RoboticVacuumCleaner } from 'matterbridge/devices';
import { firstValueFrom } from 'rxjs';

import { applyConfigDefaults, type Config } from './services/config_service.js';
import { DeviceManager } from './services/device_manager.js';
import { getLogger } from './utils/logger.js';

interface XiaomiRoborockVacuumPluginConfig extends PlatformConfig {
  devices: Partial<Config>[];
}

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {Matterbridge} matterbridge - An instance of MatterBridge.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes and in the frontend.
 * @param {PlatformConfig} config - The platform configuration.
 * @returns {TemplatePlatform} - An instance of the MatterbridgeAccessory or MatterbridgeDynamicPlatform class. This is the main interface for interacting with the Matterbridge system.
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: XiaomiRoborockVacuumPluginConfig): TemplatePlatform {
  return new TemplatePlatform(matterbridge, log, config);
}

// Here we define the TemplatePlatform class, which extends the MatterbridgeDynamicPlatform.
// If you want to create an Accessory platform plugin, you should extend the MatterbridgeAccessoryPlatform class instead.
export class TemplatePlatform extends MatterbridgeDynamicPlatform {
  constructor(
    matterbridge: Matterbridge,
    log: AnsiLogger,
    override config: XiaomiRoborockVacuumPluginConfig,
  ) {
    // Always call super(matterbridge, log, config)
    super(matterbridge, log, config);

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

    await Promise.allSettled(
      this.config.devices.map(async (cfg) => {
        const config = applyConfigDefaults(cfg);
        const logger = getLogger(this.log, config);
        this.log.info(`Discovering device: ${config.name}...`);
        const deviceManager = new DeviceManager(logger, config);

        // Wait for the device to be connected
        await firstValueFrom(deviceManager.deviceConnected$);
        this.log.info(`Connected to device: ${config.name}...`);

        const vacuum = new MatterbridgeEndpoint(roboticVacuumCleaner, { uniqueStorageKey: config.name }) as RoboticVacuumCleaner;
        // const serialNumber = await deviceManager.device.getSerialNumber();
        const serial = await deviceManager.device.call<{ serial_number: string }[]>('get_serial_number');
        const serialNumber = serial[0].serial_number;
        const firmware = await deviceManager.device.call<{ fw_ver: string }>('miIO.info');
        this.log.info(`Serial number: ${serialNumber}`);
        this.log.info(`Firmware: ${firmware.fw_ver}`);
        vacuum
          .createDefaultBasicInformationClusterServer(config.name, serialNumber, undefined, undefined, undefined, deviceManager.model, undefined, firmware.fw_ver)
          .createDefaultPowerSourceRechargeableBatteryClusterServer(deviceManager.device.property('battery'))
          // TODO: Continue here
          .createDefaultRvcRunModeClusterServer()
          // .createDefaultRvcCleanModeClusterServer()
          // .createDefaultServiceAreaClusterServer() // Only when Room is implemented and supported by the device
          // .createDefaultRvcOperationalStateClusterServer()
          .addRequiredClusterServers();

        this.log.info(`Adding device: ${config.name}...`);
        // vacuum.addRequiredClusterServers();
        vacuum.addCommandHandler('start', (data) => {
          this.log.info(`Start command received: ${JSON.stringify(data)}`);
        });
        // vacuum.addCommandHandler('stop');
        // vacuum.addCommandHandler('pause');
        // vacuum.addCommandHandler('resume');
        // vacuum.addCommandHandler('goHome');

        await this.registerDevice(vacuum);
      }),
    );

    // Implement device discovery logic here.
    // For example, you might fetch devices from an API.
    // and register them with the Matterbridge instance.

    // Example: Create and register an outlet device
    // If you want to create an Accessory platform plugin and your platform extends MatterbridgeAccessoryPlatform,
    // instead of createDefaultBridgedDeviceBasicInformationClusterServer, call createDefaultBasicInformationClusterServer().
    // const outlet = new MatterbridgeEndpoint(onOffOutlet, { uniqueStorageKey: 'outlet1' })
    //   .createDefaultBridgedDeviceBasicInformationClusterServer('Outlet', 'SN123456', this.matterbridge.aggregatorVendorId, 'Matterbridge', 'Matterbridge Outlet', 10000, '1.0.0')
    //   .createDefaultPowerSourceWiredClusterServer()
    //   .addRequiredClusterServers()
    //   .addCommandHandler('on', (data) => {
    //     this.log.info(`Command on called on cluster ${data.cluster}`);
    //   })
    //   .addCommandHandler('off', (data) => {
    //     this.log.info(`Command off called on cluster ${data.cluster}`);
    //   });
    //
    // await this.registerDevice(outlet);
  }
}
