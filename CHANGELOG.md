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

- [Support for Dreame](TBD): As requested in [#83](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/83), there's an initial support for Dreame vacuums.

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
