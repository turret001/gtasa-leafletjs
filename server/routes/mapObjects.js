const express = require('express');
const { getDb } = require('../db/schema');
const authMiddleware = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

const VALID_TYPES = ['polygon', 'polyline', 'marker'];

// Helper: verify project ownership
function getProject(projectId, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
}

// POST /api/projects/:projectId/objects
router.post('/', (req, res) => {
  const project = getProject(req.params.projectId, req.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { type, name, color, positions, metadata } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (!positions || !Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: 'positions must be a non-empty array' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO map_objects (project_id, type, name, color, positions, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    type,
    name || '',
    color || '#e94560',
    JSON.stringify(positions),
    JSON.stringify(metadata || {})
  );

  // Update project timestamp
  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);

  const obj = db.prepare('SELECT * FROM map_objects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    object: { ...obj, positions: JSON.parse(obj.positions), metadata: JSON.parse(obj.metadata) }
  });
});

// GET /api/projects/:projectId/objects
router.get('/', (req, res) => {
  const project = getProject(req.params.projectId, req.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const db = getDb();
  const objects = db.prepare('SELECT * FROM map_objects WHERE project_id = ? ORDER BY created_at ASC').all(project.id);
  const parsed = objects.map(o => ({
    ...o,
    positions: JSON.parse(o.positions),
    metadata: JSON.parse(o.metadata),
  }));

  res.json({ objects: parsed });
});

// PUT /api/projects/:projectId/objects/:objId
router.put('/:objId', (req, res) => {
  const project = getProject(req.params.projectId, req.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const db = getDb();
  const obj = db.prepare('SELECT * FROM map_objects WHERE id = ? AND project_id = ?').get(req.params.objId, project.id);
  if (!obj) return res.status(404).json({ error: 'Map object not found' });

  const { type, name, color, positions, metadata } = req.body;

  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (positions && (!Array.isArray(positions) || positions.length === 0)) {
    return res.status(400).json({ error: 'positions must be a non-empty array' });
  }

  db.prepare(`
    UPDATE map_objects SET
      type = COALESCE(?, type),
      name = COALESCE(?, name),
      color = COALESCE(?, color),
      positions = COALESCE(?, positions),
      metadata = COALESCE(?, metadata),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    type || null,
    name !== undefined ? name : null,
    color || null,
    positions ? JSON.stringify(positions) : null,
    metadata ? JSON.stringify(metadata) : null,
    obj.id
  );

  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);

  const updated = db.prepare('SELECT * FROM map_objects WHERE id = ?').get(obj.id);
  res.json({
    object: { ...updated, positions: JSON.parse(updated.positions), metadata: JSON.parse(updated.metadata) }
  });
});

// DELETE /api/projects/:projectId/objects/:objId
router.delete('/:objId', (req, res) => {
  const project = getProject(req.params.projectId, req.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const db = getDb();
  const obj = db.prepare('SELECT * FROM map_objects WHERE id = ? AND project_id = ?').get(req.params.objId, project.id);
  if (!obj) return res.status(404).json({ error: 'Map object not found' });

  db.prepare('DELETE FROM map_objects WHERE id = ?').run(obj.id);
  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);

  res.json({ message: 'Map object deleted' });
});

module.exports = router;
