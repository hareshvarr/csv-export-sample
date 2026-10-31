// CSV export of expenses for a date range: GET /expenses/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD

const HEADER = 'date,category,amount,note';

// Quote a note only when CSV requires it (comma, quote or newline); inner quotes are doubled
function toCsvField(note) {
  const s = note == null ? '' : String(note);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Header line plus one line per row; only the note can contain CSV-special characters
function toCsv(rows) {
  const lines = rows.map((r) => [r.date, r.category, r.amount, toCsvField(r.note)].join(','));
  return [HEADER, ...lines].join('\n');
}

// Mount the export route; deps are passed in so app.js's validator and store are reused
function register(app, { store, isValidDate }) {
  app.get('/expenses/export.csv', (req, res) => {
    const { from, to } = req.query;

    // Both bounds are required and must be real calendar dates
    if (!isValidDate(from)) {
      return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
    }
    if (!isValidDate(to)) {
      return res.status(400).json({ error: 'to must be YYYY-MM-DD' });
    }
    // ISO dates compare correctly as strings
    if (from > to) {
      return res.status(400).json({ error: 'from must not be after to' });
    }

    // Inclusive range, date ascending; Array.prototype.sort is stable so same-day rows keep file order
    const rows = store
      .readAll()
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="expenses-${from}-${to}.csv"`);
    res.send(toCsv(rows));
  });
}

module.exports = { register, toCsv, toCsvField };
