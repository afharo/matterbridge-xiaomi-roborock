import { readFileSync } from 'node:fs';

const NEW_ISSUE_URL = 'https://github.com/afharo/matterbridge-xiaomi-roborock/issues/new';

/** What node-miio reports for a status it can't translate */
const UNKNOWN_STATE = /^unknown-(-?\d+)$/;

/**
 * @param {unknown} state The vacuum's `state` property
 * @returns {number | undefined} The status code of an `unknown-<code>` state, otherwise `undefined`
 */
export function unknownStateCode(state: unknown): number | undefined {
  const match = typeof state === 'string' && UNKNOWN_STATE.exec(state);
  return match ? Number(match[1]) : undefined;
}

let pluginVersion: string | undefined;

/**
 * @returns {string} The plugin's version (from its package.json)
 */
function getPluginVersion(): string {
  if (pluginVersion === undefined) {
    try {
      // Same relative path from src/utils (tests) and dist/utils
      const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: string };
      pluginVersion = pkg.version ?? '';
    } catch {
      pluginVersion = '';
    }
  }
  return pluginVersion;
}

export interface UnknownStateReport {
  model: string;
  /** The state reported by node-miio: `unknown-<code>`, or a state the plugin doesn't know */
  state: string;
  /** The status's description in the model's MIoT spec, if any */
  description?: string;
}

/**
 * A link to a new bug report, filled in with what the plugin knows about a state it can't translate.
 *
 * @param {UnknownStateReport} report The model and the state
 * @returns {string} The URL of the issue form
 */
export function unknownStateIssueUrl({ model, state, description }: UnknownStateReport): string {
  const code = unknownStateCode(state);
  const status = `${code ?? state}${description ? ` ("${description}")` : ''}`;
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: `Unknown status ${status} on ${model}`,
    model,
    version: getPluginVersion(),
    description: [
      `The plugin logs that the robot reports an unknown status: ${status}.`,
      '',
      'What was the robot doing when it reported it (so we know what it should show as)?',
      '<!-- e.g. washing the mop on the dock, returning to the dock, cleaning a room -->',
      '',
    ].join('\n'),
  });
  return `${NEW_ISSUE_URL}?${params}`;
}
