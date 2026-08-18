<p align="center">
    <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">
    <img src="xiaomi-home.png" alt="Xiaomi Home app logo" width="64px" height="64px">
</p>

<h1 align="center">Matterbridge Xiaomi Dreame Plugin</h1>

<p align="center">
    <a href="https://www.npmjs.com/package/matterbridge">
        <img src="https://img.shields.io/badge/powered%20by-matterbridge-blue" alt="powered by matterbridge">
    </a>
    <a href="https://www.npmjs.com/package/node-miio">
        <img src="https://img.shields.io/badge/powered%20by-node--miio-blue" alt="powered by node-miio">
    </a>
    <a href="https://www.npmjs.com/package/rxjs">
        <img src="https://img.shields.io/badge/powered%20by-rxjs-blue" alt="powered by rxjs">
    </a>
</p>

---

**Matterbridge Xiaomi Dreame Plugin** is a dynamic platform plugin
for [Matterbridge](https://www.npmjs.com/package/matterbridge) that exposes **Dreame robot vacuums** as native Matter
robotic vacuum cleaners (RVC) in Apple Home and other Matter-compatible controllers.

Everything runs **locally over the miIO/MIoT protocol** — the plugin talks to the vacuum directly on your LAN using its
IP and token. No Xiaomi cloud session, no cloud tokens to refresh, and it keeps working when your internet connection
does not.

> ℹ️ This is a fork of [afharo/matterbridge-xiaomi-roborock](https://github.com/afharo/matterbridge-xiaomi-roborock),
> which targets Roborock vacuums. The Matter layer, speed tables and platform code are theirs; this fork adds the MIoT
> transport that Dreame models need. The change has been submitted upstream — if it lands there, use the original plugin
> instead of this one.

## Why a separate transport?

Dreame vacuums connect fine over miIO, but they do not implement the Roborock RPCs (`app_start`, `get_status`, …). Sending
them makes the robot reply with:

    { code: -9999, message: 'user ack timeout' }

which surfaces in Matterbridge as `Could not complete call to device`, thrown from `node-miio`'s `checkResult`.

This fork adds an adapter that keeps the same `node-miio` connection (handshake, encryption, socket reuse) but routes every
read and command through MIoT (`get_properties` / `set_properties` / `action`) using the
[`dreame.vacuum.p2008` spec](https://home.miot-spec.com/spec/dreame.vacuum.p2008). Roborock devices are untouched: the
adapter only kicks in when the reported model starts with `dreame.`.

## Features

- Basic RVC operations: start, stop, pause, return to dock
- Suction power control: Quiet, Standard, Strong, Turbo
- Water level control: Low, Medium, High
- Battery level and charging state
- Operational state reporting (idle, cleaning, mopping, returning, charging, error)
- Identify (locate the robot by playing a sound)
- Rooms shown as Matter service areas, declared through the configuration

Everything above works locally. There is no cloud fallback.

### Rooms

The F9 family does not expose its segment list over MIoT — the map is only available as an opaque blob — so rooms cannot
be discovered automatically. Declare them in the configuration instead, using `roomIds` and `roomNames`.

To find the segment IDs, either check the Xiaomi Home app or use
[`mibridge`](https://www.npmjs.com/package/@mibridge/cli):

    XIAOMI_REGION=<your-region> mibridge rooms <device-id>

    Rooms:
      ID 1    Laundry
      ID 2    Bathroom
      ID 3    Study

> ⚠️ Matter requires every service area to have a unique name. If two rooms share a name (two bathrooms, for example),
> pairing fails with `Areas must have a unique AreaInfo field`. Give them distinct names in `roomNames`.

### Limitations

- **Selecting a room starts a full clean.** Service areas are advertised so the rooms show up in your controller, but
  segment cleaning needs a vendor-specific payload that is not part of the shared MIoT spec. Until that is
  reverse-engineered, a room request logs a warning and cleans everything.
- **Pause maps to `stop_clean`.** The F9 spec has no dedicated pause action, so the robot halts in place.
- Maintenance counters (filter, brush, sieve) are read from the device but not yet exposed as Matter attributes.

### TODO

- [ ] Segment cleaning (needs the vendor payload for `start_clean` with segment arguments)
- [ ] Automatic room discovery (requires decoding the `map_view` blob)
- [ ] Expose maintenance counters
- [ ] Surface device faults as Matter `OperationalError` events

---

## Supported models

The MIoT property/action map is shared across the F9 family, so these models are all expected to work. Only the F9 has
been verified.

| Model                | Code name              | Basic info (battery, serial, firmware) | Full cleaning | Room cleaning |  Tested by  |
| -------------------- | ---------------------- | :------------------------------------: | :-----------: | :-----------: | :---------: |
| Dreame F9            | `dreame.vacuum.p2008`  |                   ✅                   |      ✅       |   ⚠️ shown    |  @lirik44   |
| Dreame D9            | `dreame.vacuum.p2009`  |                   ❔                   |      ❔       |   ⚠️ shown    |             |
| Dreame Z10 Pro       | `dreame.vacuum.p2028`  |                   ❔                   |      ❔       |   ⚠️ shown    |             |
| Dreame Mop 2 Pro+    | `dreame.vacuum.p2041o` |                   ❔                   |      ❔       |   ⚠️ shown    |             |
| Dreame Mop 2 Ultra   | `dreame.vacuum.p2150a` |                   ❔                   |      ❔       |   ⚠️ shown    |             |
| Dreame Mop 2         | `dreame.vacuum.p2150o` |                   ❔                   |      ❔       |   ⚠️ shown    |             |

⚠️ *shown* = rooms appear as service areas, but selecting one triggers a full clean (see [Limitations](#limitations)).

Tested with firmware `4.1.8_1107` on Matterbridge 3.10.5 (Node 22, Raspberry Pi OS).

If you get another model working, please open an issue or a PR to add it to this table.

> ⚠️ The Dreame 1C (`dreame.vacuum.mc1808`) uses a **different** MIoT map and is not supported yet.

## Known issues

| Issue                                                              | Comment                                                                                                | Workaround                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| The device name is not carried over to Apple Home.                 | This affects all Matterbridge devices.                                                                 | Rename the device in the Home app.                                                                      |
| Apple Home misbehaves when an RVC shares a bridge with other devices. | A known Apple limitation — the whole bridge can become unstable.                                        | This plugin already exposes the vacuum as its own Matter node (`server` mode) with a separate QR code.   |
| The vacuum shows without controls on macOS.                        | The Home app on macOS occasionally fails to render the RVC tile.                                        | Restart the Home app or the Mac; controls also always work from iPhone and Siri.                        |

## Installation

This plugin leverages the Matterbridge ecosystem, so you can install it like any other Matterbridge plugin.

> ℹ️ This is not a Homebridge plugin. You need Matterbridge.

### Prerequisites

You need [Matterbridge](https://github.com/Luligu/matterbridge) installed — see
their [installation guide](https://github.com/Luligu/matterbridge?tab=readme-ov-file#prerequisites).

You also need the **IP address and token** of the vacuum. The
[Xiaomi Cloud Tokens Extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor) is the easiest way to
get them.

> ⚠️ The vacuum must be paired in the **Xiaomi Home** app. Tokens cannot be extracted for robots that live only in the
> Dreamehome app.
>
> Reconfiguring the vacuum's Wi-Fi generates a new token, and you will need to update the plugin configuration.

To verify the IP and token before configuring the plugin, `python-miio` is handy:

    miiocli dreamevacuum --ip <IP> --token <TOKEN> status

If that prints the battery level and status, the plugin will work too.

### Install

    npm install -g matterbridge-xiaomi-dreame --omit=dev
    matterbridge --add matterbridge-xiaomi-dreame

### Configuration

Add your vacuum to the `devices` array, either through the Matterbridge UI or directly in
`~/.matterbridge/matterbridge-xiaomi-dreame.config.json`:

```json
{
  "name": "matterbridge-xiaomi-dreame",
  "type": "DynamicPlatform",
  "devices": [
    {
      "name": "Vacuum",
      "ip": "192.168.1.50",
      "token": "0123456789abcdef0123456789abcdef",
      "roomIds": [1, 2, 3, 4, 5, 6],
      "roomNames": ["Laundry", "Bathroom", "Study", "Living Room", "Master Bedroom", "Corridor"]
    }
  ],
  "debug": false,
  "unregisterOnShutdown": false
}
```

`roomIds` and `roomNames` are optional — omit both and the vacuum is exposed without service areas.

### Pair with Apple Home

Restart Matterbridge. The vacuum is exposed as its **own Matter node**, so it gets a **separate QR code** in the
Matterbridge UI — scan that one, not the QR code of the Matterbridge bridge itself.

    sudo systemctl restart matterbridge

Look for these lines in the log to confirm the adapter is active:

    STA getDevice | Dreame detected (dreame.vacuum.p2008), using MIoT adapter
    STA getDevice | Connected to: 192.168.1.50

If pairing gets stuck on "Connecting", remove the accessory from Apple Home, then reset the commissioning state and try
again:

    matterbridge -reset matterbridge-xiaomi-dreame

## Credits

- [afharo/matterbridge-xiaomi-roborock](https://github.com/afharo/matterbridge-xiaomi-roborock) — the plugin this fork is
  based on
- [Luligu/matterbridge](https://github.com/Luligu/matterbridge) — the Matter bridge itself
- [rytilahti/python-miio](https://github.com/rytilahti/python-miio) — reference implementation of the Dreame MIoT mapping

## License

Apache-2.0, same as the upstream project.
