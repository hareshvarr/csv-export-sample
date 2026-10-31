const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Work on a temp copy of the data so tests never touch data/expenses.json
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'expenses-')), 'expenses.json');
fs.copyFileSync(path.join(__dirname, '..', 'data', 'expenses.json'), tmp);
process.env.EXPENSES_FILE = tmp;

const app = require('../src/app');
const { toCsvField } = require('../src/export');
const server = app.listen(0);
after(() => server.close());

// Raw GET; parse JSON bodies (errors), keep CSV bodies as text
function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path: urlPath }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const parsed = res.headers['content-type']?.includes('json') ? JSON.parse(body) : body;
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    }).on('error', reject);
  });
}

const SEPT = '/expenses/export.csv?from=2026-09-01&to=2026-09-30';

test('export.csv returns header and 18 September rows, date ascending', async () => {
  const res = await get(SEPT);
  assert.strictEqual(res.status, 200);
  const lines = res.body.split('\n');
  assert.strictEqual(lines[0], 'date,category,amount,note');
  assert.strictEqual(lines.length - 1, 18);
  // Every data line's date must be >= the previous one
  const dates = lines.slice(1).map((l) => l.slice(0, 10));
  assert.deepStrictEqual(dates, [...dates].sort());
});

test('export.csv quotes a note containing a comma', async () => {
  const res = await get(SEPT);
  assert.ok(res.body.split('\n').includes('2026-09-05,food,700,"Groceries: rice, dal, oil"'));
});

test('export.csv rejects missing, invalid and reversed ranges with 400', async () => {
  // Each case must fail validation and return a JSON error
  for (const qs of ['from=2026-09-01', 'from=2026-13-45&to=2026-09-30', 'from=2026-09-30&to=2026-09-01']) {
    const res = await get('/expenses/export.csv?' + qs);
    assert.strictEqual(res.status, 400, qs);
    assert.strictEqual(typeof res.body.error, 'string', qs);
  }
});

test('export.csv sets CSV content type and attachment filename', async () => {
  const res = await get(SEPT);
  assert.ok(res.headers['content-type'].startsWith('text/csv'));
  assert.strictEqual(res.headers['content-disposition'], 'attachment; filename="expenses-2026-09-01-2026-09-30.csv"');
});

test('export.csv returns only the header for an empty range', async () => {
  const res = await get('/expenses/export.csv?from=2020-01-01&to=2020-01-31');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, 'date,category,amount,note');
});

test('toCsvField doubles quotes and wraps quotes/newlines', () => {
  assert.strictEqual(toCsvField('say "hi"'), '"say ""hi"""');
  assert.strictEqual(toCsvField('a\nb'), '"a\nb"');
  assert.strictEqual(toCsvField('plain'), 'plain');
  assert.strictEqual(toCsvField(undefined), '');
});
