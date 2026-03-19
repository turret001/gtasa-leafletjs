require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const mapObjectRoutes = require('./routes/mapObjects');
const apiKeyRoutes = require('./routes/apiKeys');
const publicApiRoutes = require('./routes/publicApi');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: false, // Allow CDN scripts in frontend
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});

const publicApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded. Max 60 requests per minute.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/projects', apiLimiter, projectRoutes);
app.use('/api/projects/:projectId/objects', apiLimiter, mapObjectRoutes);
app.use('/api/keys', apiLimiter, apiKeyRoutes);
app.use('/public/v1', publicApiLimiter, publicApiRoutes);

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback — serve index.html for unmatched GET routes (except /api and /public)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/public')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  next();
});

// 404 for unmatched API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
