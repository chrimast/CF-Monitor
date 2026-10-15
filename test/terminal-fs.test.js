import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AGENT_FORWARD_TYPES, BROWSER_FORWARD_TYPES } from '../src/durable/TerminalHub.js';

describe('terminal file messages', () => {
  it('forwards browser file-manager commands to the agent', () => {
    for (const type of ['fs_list', 'fs_read', 'fs_write', 'fs_mkdir', 'fs_rm', 'fs_rename']) {
      assert.equal(BROWSER_FORWARD_TYPES.has(type), true, type);
    }
  });

  it('forwards agent file-manager replies to the browser', () => {
    for (const type of ['fs_list_result', 'fs_data', 'fs_ok', 'fs_error']) {
      assert.equal(AGENT_FORWARD_TYPES.has(type), true, type);
    }
  });
});
