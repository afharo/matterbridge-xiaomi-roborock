import { Matterbridge } from 'matterbridge';
import { type AnsiLogger } from 'matterbridge/logger';

import { XiaomiRoborockVacuumPlatform, type XiaomiRoborockVacuumPluginConfig } from './xiaomi_roborock_vacuum_platform.js';

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {Matterbridge} matterbridge - An instance of MatterBridge.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes and in the frontend.
 * @param {XiaomiRoborockVacuumPluginConfig} config - The platform configuration.
 * @returns {XiaomiRoborockVacuumPlatform} - An instance of the MatterbridgeAccessory or MatterbridgeDynamicPlatform class. This is the main interface for interacting with the Matterbridge system.
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: XiaomiRoborockVacuumPluginConfig): XiaomiRoborockVacuumPlatform {
  return new XiaomiRoborockVacuumPlatform(matterbridge, log, config);
}
