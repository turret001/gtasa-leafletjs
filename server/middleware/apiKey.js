const { getDb } = require('../db/schema');

function apiKeyMiddleware(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apikey;
  if (!key) {
    return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header or ?apikey= query param.' });
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT ak.id, ak.user_id, ak.project_id, ak.label, p.name as project_name
    FROM api_keys ak
    LEFT JOIN projects p ON p.id = ak.project_id
    WHERE ak.key = ?
  `).get(key);

  if (!row) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Update last_used_at
  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);

  req.apiKeyData = row;
  next();
}

module.exports = apiKeyMiddleware;
