/**
 * Responses of the legacy Roborock commands that node-miio returns untyped (`unknown[]` on the other vacuum classes).
 */

/** `get_room_mapping`: `[roomId, roomName]` pairs */
export type RoomMapping = Array<[string, string]>;

export type GetTimerResponseTimer = [
  string, // timer ID
  'off' | 'disable' | 'on' | 'enable', // status
  GetTimerResponseTimerDefinition, // timer definition
];

export type GetTimerResponseTimerDefinition = [
  string, // cron expression
  GetTimerResponseTimerDefinitionAction, // action
];

export type GetTimerResponseTimerDefinitionAction = [
  string, // method
  GetTimerResponseTimerDefinitionActionParams, // params
];

export type GetTimerResponseTimerDefinitionActionParams = {
  fan_power: number;
  segments: string; // comma-separated list of segments (e.g.: '28,19,18,17,16,20,29,23,26,25,24')
  repeat: number;
  clean_order_mode: number;
};
