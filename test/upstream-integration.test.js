import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Docker host preserves upstream atomic D1 batches', () => {
  const host = readFileSync(new URL('../src/runtime/node-host.js', import.meta.url), 'utf8');
  assert.match(host, /async batch\(statements\)/);
  assert.match(host, /SAVEPOINT d1_batch/);
  assert.match(host, /ROLLBACK TO d1_batch/);
  assert.match(host, /statement\.columns\(\)\.length/);
});

test('upstream import and installers retain fork-owned protected settings and probe options', () => {
  const settings = readFileSync(new URL('../src/utils/settings.js', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/handlers/admin.js', import.meta.url), 'utf8');
  assert.match(settings, /'turnstile_secret_key'/);
  assert.match(settings, /'username',\s*'password',\s*'jwt_secret'/);
  assert.match(settings, /'ua', 'cron_offline_alert', 'cron_hourly'/);
  assert.match(auth, /await verifyTurnstileToken\(turnstileToken, turnstileSecretKey\)/);
  assert.match(admin, /chrimast\/cfm-agent/);
  assert.match(admin, /custom_ct/);
  assert.match(admin, /installUserAgent/);
  assert.doesNotMatch(admin, /cfsm-user/);
});

test('shared App password stays out of admin auth and cannot waive global Turnstile', () => {
  const auth = readFileSync(new URL('../src/middleware/auth.js', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /hasAppPasswordAccess|X-App-Password|UA_COOKIE_NAME|buildUaCookie/);
  const api = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(api, /if \(turnstileEnabled\)/);
  assert.doesNotMatch(api, /hasAppPasswordAccess/);
});