
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({ 
  origin: true, 
  credentials: true 
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'EduNotify SMS Service',
    features: ['Database check', 'Auto-publish', 'SMS notifications'],
    environment: process.env.VERCEL ? 'production' : 'development'
  });
});

module.exports = app;
