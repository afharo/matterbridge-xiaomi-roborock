<!-- Commented out section
## [1.0.0] - 2025-07-01

### Added

- [Feature 1]: Description of the feature.
- [Feature 2]: Description of the feature.

### Changed

- [Feature 3]: Description of the change.
- [Feature 4]: Description of the change.

### Deprecated

- [Feature 5]: Description of the deprecation.

### Removed

- [Feature 6]: Description of the removal.

### Fixed

- [Bug 1]: Description of the bug fix.
- [Bug 2]: Description of the bug fix.

### Security

- [Security 1]: Description of the security improvement.

-->

# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px"> <img src="xiaomi-home.png" alt="Xiaomi Home app logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Xiaomi Roborock Plugin changelog

All notable changes to this project will be documented in this file.

## [Next] - ??

### Added

- **Error reasons**: the robot's errors are reported with a specific Matter error state (stuck, wheels or brush jammed, dust bin missing or full, water tank empty or missing, mop pad missing, low battery, sensor obscured, no-go zone…) and the robot's message as details, so controllers can tell _why_ it stopped. The error is cleared when the robot recovers.
- **Dock and maintenance states**: emptying the dust bin, washing or drying the mop, filling the water tank and building a map are reported with their own operational states (Matter RVC Operational State revision 4).
- **Skip area**: skipping a room while cleaning rooms carries on with the remaining ones (or sends the robot home if it was the last one).
- **Operation completion**: cleaning sessions started outside Matter (Mi Home app, schedules, the robot's buttons) now emit the "operation completed" event too, so automations work for every run.
- **Multi-floor maps**: when the robot has more than one saved map, the maps are exposed and the rooms are assigned to the current one. Only the rooms of the current map are listed: the robot doesn't report the other floors' rooms ([#212](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/212)).
- **Vacuum & mop presets** ([#162](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/162)): robots with a water box get 3 presets that vacuum and mop at the same time, like native Matter vacuums. **Automatic** (balanced fan + medium water), **Deep clean** (max fan + high water) and **Quiet** (quiet fan + low water) are listed first. The existing vacuum-only and mop-only modes are kept, with the same mode numbers.
- **Vacuum & mop / Vacuum then mop** clean modes on MIoT vacuums that support them (requires node-miio with cleaning types). On those devices, the vacuum and mop modes also switch the robot to vacuum-only or mop-only.

## [v0.8.0] - 2026-11-19

### Added

- Support for **any MIoT vacuum** (Xiaomi, Dreame, Mijia, ijai, newer Viomi like the S9/V13…) via [node-miio 0.3.0-beta.4](https://github.com/afharo/node-miio), which drives the device from its spec on [miot-spec.org](https://home.miot-spec.com). The specs are cached, and a snapshot is bundled for offline setups (related: [#365](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/365), [#242](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/242), [#240](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/240), [#246](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/246), [#83](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/83)).
- Clean modes (fan speeds / water levels) of models not listed in the plugin are now reported by node-miio, instead of defaulting to the Roborock values.

### Changed

- Requires Node.js 22.13+, 24 or 26 (Node.js 20 is EOL).
- Devices that can't turn off the vacuum or the water (e.g. MIoT models) no longer receive those (invalid) levels when switching between vacuum and mop clean modes.
- The project is looking for a new maintainer: see [#387](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387).

## [v0.7.1] - 2026-09-11

### Fixed

- Resolves Matter transaction deadlock on `goHome` command by removing redundant `await updateAttribute` call within the command handler, which blocked Matter interaction transactions (fixes [#273](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/273)).
- Implements `RvcRunMode.changeToMode` Idle mode (mode 1) to send the vacuum back to the dock rather than an empty `break`.
- Fixes `in_returning` state handler unintentionally overriding paused status when the vacuum is paused while returning to the dock.
- Adds support for `'disable'` status in timer definitions for room cleaning discovery on Roborock models.

## [v0.7.0] - 2026-09-08

- [Fix recent breaking changes from matterbridge](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/352)

## [v0.6.1] - 2026-05-22

### Fixed

- [Error that impeded selecting rooms](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/274).

## [v0.6.0] - 2026-03-12

### Fixed

- [Assign the first room when cleaning rooms](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/251): As highlighted in [#98](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/98), while in room cleaning mode, the vacuum stays in the state "Traveling". Now the plugin will assign the first room to the vacuum. This is hack until a proper solution is found to retrieve the map (which requires a connection to the Xiaomi Cloud servers).

## [0.5.0] - 2025-10-16

### Added

- [Support for Dreame](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/102): As requested in [#83](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/83), there's an initial support for Dreame vacuums.

### Changed

- [Simplified CI and dependencies](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/195): Removing some unnecessary dependencies coming from the original template and simplifying the CI to install matterbridge globally before linking instead of git-cloning and building it.

### Fixed

- [Compatibility with `matterbridge`'s new architecture coming in v3.3.0](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/184).

## [0.4.0] - 2025-08-25

### Changed

- [Battery reports `IsAtFullCharge` when fully charged](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/88): Follow up to the previous version's change. But mostly for consistency and completeness (since iOS makes no visual distinction between `IsAtFullCharge` and `IsNotCharging`).
- [Remove Current Room information](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/94): Retrieving the current room is not available yet. Always reporting the first room (even when not cleaning it) is not a great experience. I think that it's better to not report it at all.
- [Allow using `roomNames` to override the room names retrieved from the vacuum](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/95): Some RVCs return long numeric names to the rooms instead of the actual names configured in the app. This change allows overriding those retrieved names via the existing `roomNames` setting.

### Fixed

- [Check `paused` state when handling `in_cleaning`](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/96): To avoid flipping between `paused` and `cleaning` states, the plugin now checks the `paused` state when handling `in_cleaning`.

## [0.3.0] - 2025-08-22

### Changed

- [Report `ready` when fully charged](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/86): When the vacuum is fully charged, it will report `ready` instead of `charging`.

## [0.2.3] - 2025-08-21

### Fixed

- [Emit changes in properties](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/84): The plugin now emits changes in the properties of the vacuum. This means that many handlers that were not running before will run now.

## [0.2.2] - 2025-08-21

### Added

- [React to `in_returning` state](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/80): This should make the plugin aware of when the vacuum is returning to its dock.

## [0.2.1] - 2025-08-21

### Fixed

- [Room cleaning](https://github.com/afharo/matterbridge-xiaomi-roborock/pull/72): It returned _Method `app_segment_clean` is not supported_. The reason was the format of the parameters (Room IDs must be numbers, not strings).

## [0.2.0] - 2025-08-21

### Fixed

- [Clean modes support](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/68): It now handles the cleaning mode changes.

## [0.1.2] - 2025-08-19

### Fixed

- [`locationName` must be a string](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/64): Makes sure to stringify the room name in case the RV returns a number.

## [0.1.1] - 2025-08-18

### Fixed

- [Errors when no rooms]: Handle the situation when no rooms are found.

## [0.1.0] - 2025-08-18

### Added

Initial release including basic full cleaning support ported from [homebridge-xiaomi-roborock-vacuum](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/).
