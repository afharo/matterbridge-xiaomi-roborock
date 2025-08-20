<p align="center">
    <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">
    <img src="xiaomi-home.png" alt="Xiaomi Home app logo" width="64px" height="64px">
</p>

<h1 align="center">Matterbridge Xiaomi Roborock Plugin</h1>

<p align="center">
    <a href="https://www.npmjs.com/package/matterbridge-xiaomi-roborock">
        <img src="https://img.shields.io/npm/v/matterbridge-xiaomi-roborock.svg" alt="npm version">
    </a>
    <a href="https://www.npmjs.com/package/matterbridge-xiaomi-roborock">
        <img src="https://img.shields.io/npm/dt/matterbridge-xiaomi-roborock.svg" alt="npm downloads">
    </a>
    <a href="https://github.com/afharo/matterbridge-xiaomi-roborock/actions/workflows/build-matterbridge-plugin.yml">
        <img src="https://github.com/afharo/matterbridge-xiaomi-roborock/actions/workflows/build-matterbridge-plugin.yml/badge.svg" alt="Node.js CI">   
    </a>
    <a href="https://github.com/afharo/matterbridge-xiaomi-roborock/actions/workflows/codeql.yml">
        <img src="https://github.com/afharo/matterbridge-xiaomi-roborock/actions/workflows/codeql.yml/badge.svg" alt="CodeQL">  
    </a>
    <a href="https://codecov.io/gh/afharo/matterbridge-xiaomi-roborock">
        <img src="https://codecov.io/gh/afharo/matterbridge-xiaomi-roborock/branch/main/graph/badge.svg" alt="Codecov">
    </a>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/matterbridge">
        <img src="https://img.shields.io/badge/powered%20by-matterbridge-blue" alt="powered by matterbridge">
    </a>
    <a href="https://www.npmjs.com/package/node-miio">
        <img src="https://img.shields.io/badge/powered%20by-node-miio-blue" alt="powered by node-miio">
    </a>
    <a href="https://www.npmjs.com/package/rxjs">
        <img src="https://img.shields.io/badge/powered%20by-rxjs-blue" alt="powered by rxjs">
    </a>
    <a href="https://www.npmjs.com/package/semver">
        <img src="https://img.shields.io/badge/powered%20by-semver-blue" alt="powered by semver">
    </a>
</p>

---

**Matterbridge Xiaomi Roborock Plugin** is a dynamic platform plugin
for [Matterbridge](https://www.npmjs.com/package/matterbridge) that integrates with Roborock vacuum cleaners
**controlled via the Xiaomi Home app**, enabling control via Apple Home and other Matter-compatible apps. If you use the
Roborock app, refer to
the [Matterbridge Roborock Platform Plugin](https://www.npmjs.com/package/matterbridge-roborock-vacuum-plugin) instead.

> ⭐️ If you like this project and find it useful, please consider giving it a star on GitHub
> at [Matterbridge Xiaomi Roborock Plugin](https://github.com/afharo/matterbridge-xiaomi-roborock).

> ⚠️ **Disclaimer**
>
> This project is in a very early stage of development. I'm initially building it to integrate with my Roborock S5, and
> will be extending the support once the basic features are implemented.
>
> Other models might work at this stage, but I cannot guarantee that (mostly because I haven't been able to test them).
> Any help testing other models is welcome. If you find a model that works, please open an issue or a PR to add it to
> the
> list of [supported models](#supported-models).

<!-- TOC -->

- [Features](#features)
  - [Room cleaning and discovery](#room-cleaning-and-discovery)
  - [TODO](#todo)
- [Supported models](#supported-models)
- [Known issues](#known-issues)
<!-- TOC -->

## Features

- Basic RVC operations (start/stop/pause/resume/go back to dock)
- Fan speed control
- Water level control (only in supported models)
- Room cleaning and discovery (only in supported models)
- Battery information

### Room cleaning and discovery

The plugin uses 2 methods to discover the rooms defined in the Xiaomi Home app, depending on the features supported by
the model (and shown in the Xiaomi Home app):

1. For supported models where the app allows to add names in the rooms, it is capable of retrieving the names from the
   app.
2. For other models, it needs a workaround:
   1. In the Xiaomi Home app, while in the vacuum view, open the options by clicking on the 3 dots in the top right
      corner.
   2. Then, in "Timer", define a cleaning timer for midnight (00:00). Make sure to select all the rooms individually.
   3. Finally, set up the `roomNames` in this plugin's configuration. Make sure to follow the same order as you
      selected the rooms in the app.

> ‼️ If you need to rely on the 2nd approach, chances are that the vacuum does not support the command to run room
> cleaning (`app_segment_clean`). This is the case for the Roborock S5 (`roborock.vacuum.s5`).
> If you find the command that works for these models (testing via `node-miio` or `python-miio`), please open an issue
> or a PR to add this support.

### TODO

- [ ] Improve state control
- [ ] Additional controls like initiate dust collection are missing
- [ ] Add information about the Maintenance counters (sensors, filter, brush)
- [ ] Add better error handling (expose the errors to the user if possible)

---

## Supported models

| Model       | Code name            | Basic info (battery, serial, firmware) | Full cleaning | Room cleaning |
| ----------- | -------------------- | :------------------------------------: | :-----------: | :-----------: |
| Roborock S5 | `roborock.vacuum.s5` |                   ✅                   |      ✅       |      ❌       |

## Known issues

| Issue                                                             | Comment                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The name of the device is not automatically placed in Apple Home. | AFAIK, this happens to all Matterbridge devices (all show as `Matterbridge Accessory`). |
