import { MatterbridgeEndpoint } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import type { Logger } from 'matterbridge/logger';
import { firstValueFrom, mergeMap } from 'rxjs';
import { PowerSource, RvcRunMode, RvcCleanMode, RvcOperationalState } from 'matterbridge/matter/clusters';

import { applyConfigDefaults, type Config } from './services/config_service.js';
import { DeviceManager } from './services/device_manager.js';
import { getLogger, type ModelLogger } from './utils/logger.js';
import { findSpeedModes } from './utils/find_speed_modes.js';

const SUPPORTED_MODES: RvcRunMode.ModeOption[] = [
  { label: 'Idle', mode: 0, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
  { label: 'Cleaning', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
];

const SUPPORTED_CLEAN_MODES: RvcCleanMode.ModeOption[] = [
  { label: 'Vacuum', mode: 0, modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }] },
  { label: 'Mop', mode: 1, modeTags: [{ value: RvcCleanMode.ModeTag.Mop }] },
];

const SUPPORTED_OPERATIONAL_STATES: RvcOperationalState.OperationalStateStruct[] = [
  { operationalStateId: RvcOperationalState.OperationalState.Docked },
  { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
  { operationalStateId: RvcOperationalState.OperationalState.Charging },
  { operationalStateId: RvcOperationalState.OperationalState.Running },
  { operationalStateId: RvcOperationalState.OperationalState.Stopped },
  { operationalStateId: RvcOperationalState.OperationalState.Paused },
  { operationalStateId: RvcOperationalState.OperationalState.Error },
];

export class VacuumDeviceAccessory {
  private readonly config: Config;
  private readonly log: ModelLogger;
  private readonly deviceManager: DeviceManager;
  private endpoint?: RoboticVacuumCleaner;

  constructor(config: Partial<Config>, logger: Logger) {
    this.config = applyConfigDefaults(config);
    this.log = getLogger(logger, this.config);
    this.deviceManager = new DeviceManager(this.log, this.config);
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

    const modelSpeeds = findSpeedModes(this.deviceManager.model, firmware.fw_ver);
    const supportedCleanModes = modelSpeeds.waterspeed ? SUPPORTED_CLEAN_MODES : [SUPPORTED_CLEAN_MODES[0]];

    this.endpoint = new RoboticVacuumCleaner(
      this.config.name,
      serialNumber,
      'server', // Use 'server' or 'matter' if you want Apple Home compatibility.
      // RvcRunMode
      SUPPORTED_MODES[0].mode,
      SUPPORTED_MODES,
      // RvcCleanMode
      supportedCleanModes[0].mode,
      supportedCleanModes,
      undefined,
      undefined,
      RvcOperationalState.OperationalState.Docked,
      SUPPORTED_OPERATIONAL_STATES,
      // TODO: Add service areas
    );

    this.endpoint.vendorName = 'Xiaomi';
    this.endpoint.productName = this.deviceManager.model;
    this.endpoint.softwareVersionString = firmware.fw_ver;
    this.endpoint.productUrl = 'https://github.com/afharo/matterbridge-xiaomi-roborock';
    this.endpoint.hardwareVersionString = this.deviceManager.model;

    this.endpoint.lifecycle.destroying.on(() => {
      this.deviceManager.stop();
    });

    this.endpoint?.addCommandHandler('changeToMode', async (data) => {
      this.log.debug(`Start command received: ${JSON.stringify(data)}`);
      switch (data.request.newMode) {
        case 0: // Idle
          await this.deviceManager.device.pause();
          break;
        case 1: // Cleaning
          await this.deviceManager.device.activateCleaning();
          break;
        default:
          this.log.warn(`Unknown mode ${data.request.newMode}`);
          break;
      }
    });
    this.endpoint?.addCommandHandler('stop', async () => {
      await this.deviceManager.device.deactivateCleaning();
    });
    this.endpoint?.addCommandHandler('pause', async () => {
      await this.deviceManager.device.pause();
    });
    this.endpoint?.addCommandHandler('resume', async () => {
      await this.deviceManager.device.activateCleaning();
    });
    this.endpoint?.addCommandHandler('goHome', async () => {
      await this.deviceManager.device.activateCharging();
    });
    this.endpoint?.addCommandHandler('identify', async () => {
      await this.deviceManager.device.find();
    });

    return this.endpoint;
  }

  public postRegister() {
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
      await this.endpoint?.updateAttribute(PowerSource.Cluster.id, 'batPercentRemaining', level * 2);
      await this.endpoint?.updateAttribute(PowerSource.Cluster.id, 'batChargeLevel', getBatteryChargeLevel(level));
    },
    charging: async (charging: boolean) => {
      await this.endpoint?.updateAttribute(
        PowerSource.Cluster.id,
        'batChargeState',
        charging === true ? PowerSource.BatChargeState.IsCharging : PowerSource.BatChargeState.IsNotCharging,
      );
    },
    state: async (state: string) => {
      await this.stateChangedHandlers.charging(state === 'charging');
      switch (state) {
        case 'cleaning':
        case 'spot-cleaning':
        case 'zone-cleaning':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[1].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running);
          break;

        case 'returning': // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
        case 'docking':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[1].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
          break;

        case 'error':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          // await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.CommandInvalidInState);
          // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
          break;
        case 'full':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.DustBinFull);
          break;

        case 'charging-error':
        case 'charger-offline':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.FailedToFindChargingDock);
          break;

        case 'initializing':
        case 'waiting':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Stopped);
          break;

        case 'charging':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Charging);
          break;

        default:
          this.log.warn(`Unknown state: ${state}`);
          break;
      }
    },
  };
}

/**
 *
 * @param {number} batteryLevel The battery level in percentage
 * @returns {PowerSource.BatChargeLevel} The battery charge level (OK, Warning, Critical)
 */
function getBatteryChargeLevel(batteryLevel: number): PowerSource.BatChargeLevel {
  return batteryLevel < 10 ? PowerSource.BatChargeLevel.Critical : batteryLevel < 20 ? PowerSource.BatChargeLevel.Warning : PowerSource.BatChargeLevel.Ok;
}
