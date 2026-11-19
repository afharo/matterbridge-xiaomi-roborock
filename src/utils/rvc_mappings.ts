import { RvcOperationalState } from 'matterbridge/matter/clusters';

/**
 * The error reported by node-miio (`device.on('errorChanged')`): `null` when the error is cleared.
 *
 * The devices set `{ code, message }`, but abstract-things (used by node-miio) emits it as `{ id, description }`.
 */
export interface MiioError {
  id: number | string;
  description?: string;
}

const { ErrorState } = RvcOperationalState;

/**
 * Error codes of the Roborock / Mi Robot vacuums (legacy miIO), as mapped by node-miio.
 * Codes without an equivalent Matter error fall back to `UnableToCompleteOperation`.
 */
const ROBOROCK_ERRORS: Record<number, RvcOperationalState.ErrorState> = {
  1: ErrorState.NavigationSensorObscured, // Laser sensor fault
  2: ErrorState.Stuck, // Collision sensor fault
  3: ErrorState.Stuck, // Wheel floating
  4: ErrorState.NavigationSensorObscured, // Cliff sensor fault
  5: ErrorState.BrushJammed, // Main brush blocked
  6: ErrorState.BrushJammed, // Side brush blocked
  7: ErrorState.WheelsJammed, // Wheel blocked
  8: ErrorState.Stuck, // Device stuck
  9: ErrorState.DustBinMissing, // Dust bin missing
  12: ErrorState.LowBattery, // Low battery
  15: ErrorState.NavigationSensorObscured, // Wall sensor fault
  16: ErrorState.Stuck, // Uneven surface
  17: ErrorState.BrushJammed, // Side brush failure
  19: ErrorState.FailedToFindChargingDock, // Unpowered charging station
  21: ErrorState.NavigationSensorObscured, // Laser pressure sensor problem
  22: ErrorState.FailedToFindChargingDock, // Charge sensor problem
  23: ErrorState.FailedToFindChargingDock, // Dock problem
  24: ErrorState.CannotReachTargetArea, // No-go zone or invisible wall detected
  254: ErrorState.DustBinFull, // Bin full
};

/**
 * Keywords in the error message (e.g. the descriptions of the MIoT spec's `vacuum:fault`), checked in order.
 * Each entry needs every pattern to match.
 */
const ERROR_KEYWORDS: Array<[RegExp[], RvcOperationalState.ErrorState]> = [
  [[/dirty[- ]?water/i, /full/i], ErrorState.DirtyWaterTankFull],
  [[/dirty[- ]?water/i, /miss|not install|install/i], ErrorState.DirtyWaterTankMissing],
  [[/water/i, /lid/i], ErrorState.WaterTankLidOpen],
  [[/water/i, /empty|low|insufficient|lack|short/i], ErrorState.WaterTankEmpty],
  [[/water/i, /miss|not install|install/i], ErrorState.WaterTankMissing],
  [[/mop/i, /miss|not install|install|remove/i], ErrorState.MopCleaningPadMissing],
  [[/dust|bin|box/i, /full/i], ErrorState.DustBinFull],
  [[/dust|bin|box/i, /miss|not install|install/i], ErrorState.DustBinMissing],
  [[/battery/i, /low|insufficient/i], ErrorState.LowBattery],
  [[/brush|roller/i], ErrorState.BrushJammed],
  [[/wheel/i], ErrorState.WheelsJammed],
  [[/stuck|trapped|suspended|float|uneven|tilt/i], ErrorState.Stuck],
  [[/no-?go|forbidden|restricted|virtual wall|invisible wall/i], ErrorState.CannotReachTargetArea],
  [[/laser|lidar|lds|cliff|sensor|radar|camera/i], ErrorState.NavigationSensorObscured],
  [[/dock|charg|station|base|return/i], ErrorState.FailedToFindChargingDock],
];

/**
 * Translates an error reported by node-miio into a Matter RVC error state.
 *
 * @param {string} model The device model (e.g. `roborock.vacuum.s5`)
 * @param {MiioError} error The error reported by node-miio
 * @returns {RvcOperationalState.ErrorState} The Matter error state
 */
export function toErrorStateId(model: string, error: MiioError): RvcOperationalState.ErrorState {
  const code = Number(error.id);
  if (/^(roborock|rockrobo)\./.test(model) && code in ROBOROCK_ERRORS) {
    return ROBOROCK_ERRORS[code];
  }
  const message = error.description ?? '';
  for (const [patterns, errorState] of ERROR_KEYWORDS) {
    if (patterns.every((pattern) => pattern.test(message))) return errorState;
  }
  return ErrorState.UnableToCompleteOperation;
}

/**
 * Translates the auxiliary states reported by node-miio (dock and maintenance activities) into the Matter RVC
 * operational states added in revision 4 of the cluster. The states are normalized by node-miio, e.g.
 * `dust-collection` (Roborock), or the kebab-cased descriptions of the MIoT spec (`dustcollecting`, `drying`…).
 *
 * @param {string} state The state reported by node-miio
 * @returns {RvcOperationalState.OperationalState | undefined} The Matter state, or `undefined` if it's not an auxiliary state
 */
export function toAuxiliaryOperationalState(state: string): RvcOperationalState.OperationalState | undefined {
  if (/dust|emptying/.test(state)) return RvcOperationalState.OperationalState.EmptyingDustBin;
  if (/wash|dry|self-?clean|station-?working/.test(state)) return RvcOperationalState.OperationalState.CleaningMop;
  if (/water|refill|filling/.test(state)) return RvcOperationalState.OperationalState.FillingWaterTank;
  if (/map|building|relocat/.test(state)) return RvcOperationalState.OperationalState.UpdatingMaps;
  return undefined;
}
