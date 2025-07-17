import { MatterbridgeEndpoint, roboticVacuumCleaner } from 'matterbridge';
import type { RoboticVacuumCleaner } from 'matterbridge/devices';
import type { Logger } from 'matterbridge/logger';
import { firstValueFrom, mergeMap } from 'rxjs';
import { PowerSource } from 'matterbridge/matter/clusters';

import { applyConfigDefaults, type Config } from './services/config_service.js';
import { DeviceManager } from './services/device_manager.js';
import { getLogger, type ModelLogger } from './utils/logger.js';

export class VacuumDeviceAccessory {
  private readonly config: Config;
  private readonly log: ModelLogger;
  private readonly deviceManager: DeviceManager;
  private readonly endpoint: RoboticVacuumCleaner;

  constructor(config: Partial<Config>, logger: Logger) {
    this.config = applyConfigDefaults(config);
    this.log = getLogger(logger, this.config);
    this.deviceManager = new DeviceManager(this.log, this.config);
    this.endpoint = new MatterbridgeEndpoint(roboticVacuumCleaner, { uniqueStorageKey: config.name }) as RoboticVacuumCleaner;
  }

  public async initializeMatterbridgeEndpoint(): Promise<MatterbridgeEndpoint> {
    this.log.info(`Waiting for the connection to the vacuum to be established...`);

    // Wait for the device to be connected
    await firstValueFrom(this.deviceManager.deviceConnected$);
    this.log.info(`Connected to device!`);

    const serial = await this.deviceManager.device.call<{ serial_number: string }[]>('get_serial_number');
    const serialNumber = serial[0].serial_number;
    const firmware = await this.deviceManager.device.call<{ fw_ver: string }>('miIO.info');
    this.log.info(`Serial number: ${serialNumber}`);
    this.log.info(`Firmware: ${firmware.fw_ver}`);

    const level = this.deviceManager.property<number>('battery');

    this.endpoint
      .createDefaultBasicInformationClusterServer(this.config.name, serialNumber, undefined, undefined, undefined, this.deviceManager.model, undefined, firmware.fw_ver)
      .createDefaultPowerSourceRechargeableBatteryClusterServer(level, typeof level === 'undefined' ? undefined : getBatteryChargeLevel(level), undefined)
      // TODO: Continue here
      // .createDefaultRvcRunModeClusterServer()
      // .createDefaultRvcCleanModeClusterServer()
      // .createDefaultServiceAreaClusterServer() // Only when Room is implemented and supported by the device
      // .createDefaultRvcOperationalStateClusterServer()
      .addRequiredClusterServers();

    this.endpoint.lifecycle.destroying.on(() => {
      this.deviceManager.stop();
    });

    return this.endpoint;
  }

  public postRegister() {
    this.endpoint.addCommandHandler('start', (data) => {
      this.log.info(`Start command received: ${JSON.stringify(data)}`);
    });
    // this.endpoint.addCommandHandler('stop');
    // this.endpoint.addCommandHandler('pause');
    // this.endpoint.addCommandHandler('resume');
    // this.endpoint.addCommandHandler('goHome');

    this.deviceManager.stateChanged$
      .pipe(
        mergeMap(async ({ key, value }) => {
          this.log.debug(`Device state changed: ${key} = ${value}`);

          if (key in this.stateChangedHandlers) {
            // @ts-expect-error key is a string, this.stateChangedHandlers is not an index signature, and value is unknown
            await this.stateChangedHandlers[key](value);
          }
        }),
      )
      .subscribe();
  }

  private readonly stateChangedHandlers = {
    batteryLevel: async (level: number) => {
      this.log.debug(`Battery level: ${level}`);
      await this.endpoint.updateAttribute(PowerSource.Cluster.id, 'batPercentRemaining', level * 2);
      await this.endpoint.updateAttribute(PowerSource.Cluster.id, 'batChargeLevel', getBatteryChargeLevel(level));
    },
    charging: async (charging: boolean) => {
      await this.endpoint.updateAttribute(
        PowerSource.Cluster.id,
        'batChargeState',
        charging === true ? PowerSource.BatChargeState.IsCharging : PowerSource.BatChargeState.IsNotCharging,
      );
    },
    state: async (state: string) => {
      await this.stateChangedHandlers.charging(state === 'charging');
    },
  };
}

/**
 *
 * @param batteryLevel
 */
function getBatteryChargeLevel(batteryLevel: number): PowerSource.BatChargeLevel {
  return batteryLevel < 10 ? PowerSource.BatChargeLevel.Critical : batteryLevel < 20 ? PowerSource.BatChargeLevel.Warning : PowerSource.BatChargeLevel.Ok;
}
