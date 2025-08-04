import semver from 'semver';

import { MODELS } from '../models/models.js';

/**
 * Finds the speed modes that apply to the current model and firmware version
 *
 * @param {string} model The Robot Vacuum's model
 * @param {string?} firmware The firmware's version
 *
 * @returns {ModelDefinition} The speed modes that apply to the robot.
 */
export function findSpeedModes(model: string, firmware?: string) {
  if (model.startsWith('viomi.')) {
    return MODELS.viomi[0];
  }

  return (MODELS[model] || []).reduce((acc, option) => {
    if (option.firmware) {
      const [, cleanFirmware] = (firmware || '').match(/^(\d+\.\d+\.\d+)/) || [];
      return semver.satisfies(cleanFirmware, option.firmware) ? option : acc;
    } else {
      return option;
    }
  }, MODELS.default[0]);
}
