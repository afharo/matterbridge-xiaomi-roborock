import { unknownStateCode, unknownStateIssueUrl } from './unknown_state.js';

describe('unknownStateCode', () => {
  test.each([
    ['unknown-31', 31],
    ['charging', undefined],
    ['unknown-', undefined],
    [undefined, undefined],
  ])('%p → %p', (state, code) => {
    expect(unknownStateCode(state)).toBe(code);
  });
});

describe('unknownStateIssueUrl', () => {
  test('fills in the issue form', () => {
    const url = new URL(unknownStateIssueUrl({ model: 'xiaomi.vacuum.d101', state: 'unknown-31', description: 'New Station Mode' }));
    expect(url.origin + url.pathname).toBe('https://github.com/afharo/matterbridge-xiaomi-roborock/issues/new');
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({
      template: 'bug_report.yml',
      title: 'Unknown status 31 ("New Station Mode") on xiaomi.vacuum.d101',
      model: 'xiaomi.vacuum.d101',
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      description: expect.stringContaining('What was the robot doing when it reported it'),
    });
  });

  test('without a code nor a description', () => {
    const url = new URL(unknownStateIssueUrl({ model: 'roborock.vacuum.a75', state: 'something-new' }));
    expect(url.searchParams.get('title')).toBe('Unknown status something-new on roborock.vacuum.a75');
  });
});
