import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTerminalEnabled, terminalEnabledHeader } from '../src/handlers/terminal.js';
import { buildAgentConfig, serializeAgentConfig } from '../src/utils/agentConfig.js';

describe('terminal gate', () => {
  it('defaults off unless terminal_enabled is 1', () => {
    assert.equal(isTerminalEnabled(null), false);
    assert.equal(isTerminalEnabled({}), false);
    assert.equal(isTerminalEnabled({ terminal_enabled: '0' }), false);
    assert.equal(isTerminalEnabled({ terminal_enabled: '1' }), true);
    assert.equal(terminalEnabledHeader({ terminal_enabled: '1' }), '1');
  });

  it('puts terminal_enabled into schema 8 agent config', () => {
    const off = serializeAgentConfig(buildAgentConfig({ collect_interval: 1, report_interval: 60, reset_day: 15 }));
    assert.match(off, /schema_version=8/);
    assert.match(off, /terminal_enabled=0/);
    const on = serializeAgentConfig(buildAgentConfig({
      collect_interval: 1,
      report_interval: 60,
      reset_day: 15,
      terminal_enabled: '1'
    }));
    assert.match(on, /terminal_enabled=1/);
  });
});
