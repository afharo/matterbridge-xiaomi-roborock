import { PlatformConfig } from 'matterbridge';

import type { CustomLoggerConfig } from '../utils/logger.ts';

import type { DeviceManagerConfig } from './device_manager.ts';

export interface Config
  extends PlatformConfig,
    // MainServiceConfig,
    DeviceManagerConfig,
    // RoomsConfig,
    // PauseConfig,
    // WaterBoxConfig,
    // DustBinConfig,
    // DustCollectionConfig,
    // FindMeConfig,
    // GoToConfig,
    // DockConfig,
    // ZonesConfig,
    // CareConfig,
    CustomLoggerConfig {
  /**
   * The name of the main service as it will show up in the Home App.
   */
  name: string;
}

/**
 * Applies the default configuration values to the config provided by the user.
 *
 * @param {Partial<Config>} config The config provided by the user.
 * @returns {Config} The config with default values applied.
 *
 * @remarks We may want to use a validation library like io-ts in the future for easier typing and defaulting.
 */
export function applyConfigDefaults(config: Partial<Config>): Config {
  return {
    name: 'Roborock vacuum cleaner',
    serviceType: 'fan',
    cleanword: 'cleaning',
    pause: false,
    pauseWord: 'Pause',
    findMe: false,
    findMeWord: 'where are you',
    goTo: false,
    goToWord: 'go to coordinates',
    goToX: 25500,
    goToY: 25500,
    roomTimeout: 0,
    waterBox: false,
    dustBin: false,
    dustCollection: false,
    dock: false,
    ...config,
  };
}
