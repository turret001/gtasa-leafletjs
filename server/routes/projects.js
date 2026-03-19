const express = require('express');
const { getDb } = require('../db/schema');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// POST /api/projects
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const db = getDb();
  const result = db.prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)').run(req.userId, name.trim());

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ project });
});

// GET /api/projects
router.get('/', (req, res) => {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId);
  res.json({ projects });
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const objects = db.prepare('SELECT * FROM map_objects WHERE project_id = ? ORDER BY created_at ASC').all(project.id);
  // Parse positions JSON
  const parsed = objects.map(o => ({
    ...o,
    positions: JSON.parse(o.positions),
    metadata: JSON.parse(o.metadata),
  }));

  res.json({ project, objects: parsed });
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  db.prepare('UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), project.id);
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  res.json({ project: updated });
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  res.json({ message: 'Project deleted' });
});

module.exports = router;
