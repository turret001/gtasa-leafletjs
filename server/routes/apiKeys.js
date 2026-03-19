const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// POST /api/keys — generate a new API key
router.post('/', (req, res) => {
  const { label, project_id } = req.body;

  const db = getDb();

  // Verify project ownership if project_id provided
  if (project_id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(project_id, req.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
  }

  const key = 'gtasa_' + uuidv4().replace(/-/g, '');
  const result = db.prepare('INSERT INTO api_keys (user_id, key, label, project_id) VALUES (?, ?, ?, ?)').run(
    req.userId,
    key,
    label || '',
    project_id || null
  );

  res.status(201).json({
    apiKey: {
      id: result.lastInsertRowid,
      key, // Show the full key only on creation
      label: label || '',
      project_id: project_id || null,
      created_at: new Date().toISOString(),
    },
    message: 'Save this key — it won\'t be shown in full again.'
  });
});

// GET /api/keys — list user's API keys (masked)
router.get('/', (req, res) => {
  const db = getDb();
  const keys = db.prepare(`
    SELECT ak.id, ak.key, ak.label, ak.project_id, ak.created_at, ak.last_used_at, p.name as project_name
    FROM api_keys ak
    LEFT JOIN projects p ON p.id = ak.project_id
    WHERE ak.user_id = ?
    ORDER BY ak.created_at DESC
  `).all(req.userId);

  // Mask keys: show first 10 and last 4 chars
  const masked = keys.map(k => ({
    ...k,
    key: k.key.substring(0, 10) + '...' + k.key.slice(-4),
  }));

  res.json({ apiKeys: masked });
});

// DELETE /api/keys/:id — revoke an API key
router.delete('/:id', (req, res) => {
  const db = getDb();
  const key = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!key) {
    return res.status(404).json({ error: 'API key not found' });
  }

  db.prepare('DELETE FROM api_keys WHERE id = ?').run(key.id);
  res.json({ message: 'API key revoked' });
});

module.exports = router;
