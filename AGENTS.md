# AGENTS.md

Guidance for AI coding agents (and humans) working on `matterbridge-xiaomi-roborock`.

## Context

- Matterbridge plugin that exposes Xiaomi / Roborock vacuums (paired in the Mi Home app) as Matter Robotic Vacuum Cleaners.
- The device protocol lives in [node-miio](https://github.com/afharo/node-miio) (same author). Protocol/model fixes belong **there**:
  this plugin should only translate between node-miio and Matter.
- **The maintainer no longer owns test hardware** (see [#387](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387)).
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
  - `resolveSpeedModes(device, model, fw)`: models listed in `src/models/` keep the local definitions.
    Any other model uses `device.fanSpeeds()` / `device.waterBoxModes()` from node-miio (e.g. from the device's MIoT spec),
    with Matter labels derived from the mode names.
  - The first entry of each list is the "off" level. If the device can't turn the vacuum or the water off (MIoT), it's `UNSUPPORTED_LEVEL` (NaN),
    and the clean-mode handler skips it (`isSupportedLevel`).
- `src/models/`: legacy per-model tables (also copied into node-miio's `vacuum_modes.ts`). The plan is to remove them once
  node-miio's lists are confirmed to cover every model. Prefer fixing speeds in node-miio.
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
