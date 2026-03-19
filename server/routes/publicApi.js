const express = require('express');
const { getDb } = require('../db/schema');
const apiKeyMiddleware = require('../middleware/apiKey');

const router = express.Router();

// GET /public/v1/map-data — returns map objects for the project linked to this API key
router.get('/map-data', apiKeyMiddleware, (req, res) => {
  const { project_id, project_name } = req.apiKeyData;

  if (!project_id) {
    return res.status(400).json({
      error: 'This API key is not linked to a project. Update the key to assign a project.'
    });
  }

  const db = getDb();

  // Verify project still exists
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(404).json({ error: 'Linked project no longer exists' });
  }

  const objects = db.prepare('SELECT id, type, name, color, positions, metadata FROM map_objects WHERE project_id = ? ORDER BY created_at ASC').all(project_id);

  const parsed = objects.map(o => ({
    id: o.id,
    type: o.type,
    name: o.name,
    color: o.color,
    positions: JSON.parse(o.positions),
    metadata: JSON.parse(o.metadata),
  }));

  res.json({
    project: project_name || project.name,
    objects: parsed,
  });
});

module.exports = router;
