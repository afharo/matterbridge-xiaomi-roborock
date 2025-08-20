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
