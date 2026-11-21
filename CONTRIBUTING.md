# Contributing

Thank you for helping! The maintainer **only owns one of the supported vacuums**: changes are developed against
automated tests, and your device is the only way to know if they really work. So the most valuable contributions are
**testing betas** and **sharing what your vacuum reports**. No coding needed.

- [Become a beta tester](#become-a-beta-tester)
- [Request support for a model or a feature](#request-support-for-a-model-or-a-feature)
- [Report a bug](#report-a-bug)
- [How-to](#how-to): model and firmware, debug logs, raw captures, removing private data
- [Contributing code](#contributing-code)

## Become a beta tester

1. Comment on [#387](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387) with your **model** (e.g.
   `roborock.vacuum.a75`), your **firmware version** and your dock, if any (e.g. "auto-empty", "wash & dry"). You'll get
   a mention whenever a beta needs a device like yours.
2. When you're mentioned, install the beta: in the Matterbridge UI, open this plugin's menu and install the `beta`
   version (or run `npm install -g matterbridge-xiaomi-roborock@beta`), then restart Matterbridge.
3. Go through the test list in the mention (it's usually short: "start a room cleaning, check that Y happens"), and
   reply with ✅ / ❌ for each item. For ❌, add the [debug logs](#debug-logs).
4. Go back to the `latest` version whenever you want, the same way.

You can stop at any time: just say so in #387.

## Request support for a model or a feature

Open an issue with:

- [ ] Your [**model** and **firmware version**](#model-and-firmware).
- [ ] What you'd like to do, and **how you do it in the Mi Home app** (screenshots help).
- [ ] The [raw status of your vacuum](#raw-captures): `get_status` for Roborock models, or the output of `spec` for any
      other brand. Ideally, capture `get_status` twice: before and after doing the action in the app, so we can see
      which field changes.
- [ ] Whether you're happy to [test a beta](#become-a-beta-tester) (it can't be released without that).

## Report a bug

- [ ] Model, firmware version, plugin version and Matterbridge version.
- [ ] What you did, what you expected and what happened.
- [ ] The [debug logs](#debug-logs) around the time it happened.

## How-to

The commands below use the [node-miio](https://github.com/afharo/node-miio) CLI, the library this plugin uses to talk
to the vacuum. Run them on any machine in the same network as the vacuum (it needs Node.js), with its IP and token.

### Model and firmware

```sh
npx node-miio@latest protocol call <ip> miIO.info --token <token>
```

The `model` and `fw_ver` fields are what we need. The firmware is also in the plugin's logs (`Firmware: ...`).

### Debug logs

1. In the plugin's config, enable `debug` and restart Matterbridge.
2. Reproduce the problem.
3. Download the logs as explained in
   [Matterbridge's README](https://github.com/Luligu/matterbridge/blob/main/README.md#how-to-send-the-debug-log-files),
   and attach the lines of this plugin.

### Raw captures

```sh
# Roborock (roborock.vacuum.*, rockrobo.vacuum.*): the full status
npx node-miio@latest protocol call <ip> get_status --token <token>
npx node-miio@latest protocol call <ip> get_consumable --token <token>

# Any other brand (Dreame, Viomi, Xiaomi, ijai…): the spec describing what your model supports
npx node-miio@latest spec <model>
```

### Remove private data before posting

Logs and captures can contain private data. Replace these with `xxx`:

- the **token**, and any `ssecurity` / `serviceToken`;
- the **serial number**, **MAC address** and **IP address**;
- your Wi-Fi name (`ssid`) and anything else that identifies your home.

## Contributing code

Pull requests are very welcome, too. Read [AGENTS.md](./AGENTS.md): it describes the layout, the commands and the
conventions (for humans as well).

### Development setup

Matterbridge plugins require an additional step: after running `npm install`, run `npm run dev:link` to add the
`matterbridge` dependency to the `node_modules` folder (see
[why](https://github.com/Luligu/matterbridge/discussions/370#discussioncomment-14060324)). Then `npm start` runs a local
Matterbridge instance with the plugin installed.

### Guidelines

- Every change needs **unit tests** (Jest, next to the source files as `<file>.test.ts`), because most of them can't be
  tested on real hardware. We'd like to keep the coverage as close to 100% as possible.
- Update the `CHANGELOG.md`, following the convention at the top of the file.
- The plugin only translates between node-miio and Matter. Protocol and per-model fixes belong in
  [node-miio](https://github.com/afharo/node-miio). Once a new node-miio version is released, Renovate updates it here.
- Don't copy code from GPL projects (e.g. python-miio): this project and node-miio are MIT. Using them as a reference
  for how a device behaves is fine.
