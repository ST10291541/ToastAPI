const express = require('express');
const cors = require('cors');
require('dotenv').config();

const eventRoutes = require('./routes/events');
const rsvpRoutes = require('./routes/rsvp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple debug middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/events', eventRoutes);
app.use('/api/rsvp', rsvpRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ message: 'API is running!' });
});

// Root Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Toast Event API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      events: {
        list: 'GET /api/events',
        create: 'POST /api/events',
        getById: 'GET /api/events/:id',
        poll: 'POST /api/events/:id/poll'
      },
      rsvp: {
        submit: 'POST /api/rsvp/:eventId',
        attendees: 'GET /api/rsvp/:eventId/attendees'
      }
    }
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    url: req.url
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;