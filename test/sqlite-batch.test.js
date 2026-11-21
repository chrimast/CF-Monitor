import assert from 'node:assert/strict';
import test from 'node:test';
import { createSqliteD1 } from '../src/runtime/node-host.js';

test('SQLite D1 batches return ordered query results and roll back failed writes', async () => {
  const db = createSqliteD1(':memory:');
  try {
    db.sqlite.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
    const insert = (id, label) => db.prepare('INSERT INTO items VALUES (?, ?)').bind(id, label);
    const query = () => db.prepare('SELECT * FROM items ORDER BY id');
    const [written, read] = await db.batch([insert(1, 'first'), query()]);
    assert.equal(written.meta.changes, 1);
    assert.equal(read.results[0].label, 'first');
    await assert.rejects(db.batch([insert(2, 'rollback'), insert(1, 'duplicate')]), /UNIQUE/);
    assert.deepEqual((await query().all()).results.map(row => row.id), [1]);
  } finally {
    db.sqlite.close();
  }
});
