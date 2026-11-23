# AGENTS.md

Guidance for AI coding agents (and humans) working on `matterbridge-xiaomi-roborock`.

## Context

- Matterbridge plugin that exposes Xiaomi / Roborock vacuums (paired in the Mi Home app) as Matter Robotic Vacuum Cleaners.
- The device protocol lives in [node-miio](https://github.com/afharo/node-miio) (same author). Protocol/model fixes belong **there**:
  this plugin should only translate between node-miio and Matter.
- **The maintainer no longer owns any of the supported models** (see [#387](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387)).
  Every behavioural change must be covered by unit tests, and be validated by users on a beta release.
- Changes are delivered as PRs from feature branches into `main`.
- **Label every PR** when creating it, so `.github/release.yml` can group the release notes:
  `enhancement`, `bug`, `dependencies`, `documentation` (and `New Model` when adding support for a device). `release` is for version bumps.

## Commands

```sh
npm install -g matterbridge   # the plugin is tested against the globally installed matterbridge
npm ci
npm run dev:link              # = npm link matterbridge: required before lint/test/build (CI does the same)
npm run lint                  # eslint --max-warnings=0
npm run format:check          # prettier
npm test                      # jest in ESM mode (node --experimental-vm-modules)
npm run build                 # tsc
```

CI (`.github/workflows/build-matterbridge-plugin.yml`) runs them on Node 22/24/26 × Ubuntu/Windows/macOS.

## Layout

- `src/module.ts`: plugin entry point. `src/xiaomi_roborock_vacuum_platform.ts`: the Matterbridge platform.
- `src/vacuum_device_accessory.ts`: the Matter endpoint. It maps commands (run mode, clean mode, areas, pause, go home…)
  to node-miio calls, and node-miio states to Matter operational states.
- `src/services/device_manager.ts`: connects to the device (`miio.device({ address, token })`), polls it, and emits state/error changes.
  The `device.matches("type:vaccuum")` spelling is intentional: it's how abstract-things (used by node-miio) names the type.
- `src/utils/find_speed_modes.ts`: fan speeds / water levels → Matter clean modes.
  - The fan speeds and water levels come from node-miio. `findSpeedModes(model, fw)`: node-miio's table
    (`resolveVacuumModes`, with the firmware variants). `resolveSpeedModes(device, model, fw)`: the models in that table
    (`vacuumModels()`) use it; any other model uses `device.fanSpeeds()` / `device.waterBoxModes()` (e.g. from the device's
    MIoT spec), or the brand's defaults. The Matter tags are derived from the mode names (`fanTags` / `waterTags`), following the tags' meaning in the Matter spec (e.g. Min / Max are the lowest / highest setting, Day / Night when to use it): keep them in sync with homebridge-xiaomi-roborock-vacuum's `src/matter/clean_modes.ts`.
    **Add or fix a model's speeds in node-miio, not here**: a snapshot test pins what each model gets.
  - The first entry of each list is the "off" level. The fan's is always `UNSUPPORTED_LEVEL` (NaN: -1 isn't a fan speed),
    and so is the water's when the device can't turn it off (MIoT). The clean-mode handler skips it (`isSupportedLevel`),
    and the current mode is matched on the levels a mode sets (`levelsMatch`).
- The cleaning states come from node-miio (`isCleaningState`).
- node-miio ships its own types (since 0.5.0). The device is a `VacuumDevice` (union of node-miio's vacuum classes): only their
  shared API is available, so narrow with `'getMaps' in device` (or `instanceof`) for the class-specific methods.
  `src/utils/miio_types.ts` types the legacy Roborock responses that node-miio returns untyped (room mapping, timers).

## Tests

- `src/test.mocks.ts` mocks the node-miio device. `src/vacuum_device_accessory.test.mock.ts` mocks the `DeviceManager` and `find_speed_modes`.
  ESM mocks use `jest.unstable_mockModule`, so the code under test must be imported dynamically after the mocks.

## Dependencies

- `.npmrc` exempts `node-miio` from any `min-release-age` cooldown (`min-release-age-exclude`), so new betas can be picked up right away.
  Every other package still follows the cooldown.
- Renovate keeps dependencies up to date.

## Releasing

Follow [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md) (in Claude Code: `/release <patch|minor|major>`).
In short: a `Prepare for vX.Y.Z` changelog commit and `npm version <level>` on a branch named after the version, a PR labelled `release`
with auto-merge (squash), then restore the version branch and create the GitHub release with `--notes-start-tag <previous tag>`.

## Licensing

Apache-2.0. Don't copy code from GPL projects (e.g. python-miio). Use them as behavioural references only.
