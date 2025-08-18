# Contributing Guide

PRs are welcome! If you'd like to extend the fix any bug that you find on your device, or add a new feature, please feel
free to open a PR.

## Development Setup

Matterbridge plugins require an additional step in the development setup: after running `npm install`, make sure to run
`npm run dev:link` to add the `matterbridge` dependency to the `node_modules` folder. Refer
to https://github.com/Luligu/matterbridge/discussions/370#discussioncomment-14060324 for more information about why this
is needed.

After running the previous commands, you should be able to run `npm start` to run your local matterbridge instance with
the plugin installed.

## Testing

This repo uses [Jest](https://jestjs.io/) for testing. To run the tests, run `npm test`.

The test files are located next to the source files, and follow the name convention `<file_to_test>.test.ts`.

## Adding support to new devices

If your device is not supported yet, you can add support for it in the underlying communication library, `node-miio` (link to the repo: https://github.com/afharo/node-miio). It provides a CLI tool to test your device, and commands
required to interact with it.

Once the PR is merged in `node-miio`, and a new version is released. This plugin will upgrade the dependency automatically in a matter of hours.

> [!TIP]
> Some commands might have already been implemented in https://github.com/rytilahti/python-miio/,
> and it should just be a matter of porting them to `node-miio`.

## Pull Request Checklist

To keep the repo as healthy as possible, when submitting a PR, please, make sure to complete these tasks:

- [ ] Update the CHANGELOG.md file, including a description of the changes, following the convention commented at the
      top of the file.
- [ ] Add tests for the new code that you just changed. We'd like to keep the coverage as close to 100% as possible.

Thank you for helping our community to keep this project healthy!
