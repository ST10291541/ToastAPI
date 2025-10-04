// Imports
const express = require('express');
const router = express.Router();
const { db } = require('../models/firebase');
const auth = require('../middleware/auth');

// ✅ Logs when router loads
console.log('✅ Events router loaded');

// ------------------------
// Test Routes
// ------------------------
router.get('/test-no-auth', (req, res) => {
  console.log('✅ /api/events/test-no-auth route hit!');
  res.json({ message: 'Test no auth works!' });
});

router.get('/test-with-auth', auth, (req, res) => {
  console.log('✅ /api/events/test-with-auth route hit!');
  console.log('👤 User UID:', req.user?.uid);
  res.json({ 
    message: 'Test with auth works!', 
    user: req.user?.uid,
    email: req.user?.email 
  });
});

// ------------------------
// SHARE RSVP PAGE (Must be before /:id route!)
// ------------------------
router.get('/share/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return res.status(404).send('<h1>Event not found</h1>');
    }

    const event = eventDoc.data();

    // Basic HTML page for RSVP
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${event.title} - RSVP</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; background: #fff; color: #000; }
          h1 { font-size: 28px; }
          .section { margin-top: 16px; }
          button { margin: 4px; padding: 8px 16px; font-size: 16px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>${event.title}</h1>
        <p><strong>Date:</strong> ${event.date} ${event.time}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p><strong>Description:</strong> ${event.description}</p>
        <p><strong>Going:</strong> ${event.attendeeCount || 0}</p>

        <div class="section">
          <h3>RSVP</h3>
          <button onclick="submitRSVP('going')">Going</button>
          <button onclick="submitRSVP('maybe')">Maybe</button>
          <button onclick="submitRSVP('not going')">Can't Go</button>
        </div>

        <div class="section">
          <a href="${event.googleDriveLink || '#'}" target="_blank">
            <button>View Event Photos (Google Drive)</button>
          </a>
        </div>

        <script>
          async function submitRSVP(status) {
            try {
              const response = await fetch('${process.env.API_BASE_URL}/api/rsvps/${eventId}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              });
              const data = await response.json();
              alert(data.message || 'RSVP submitted!');
            } catch (err) {
              alert('Failed to submit RSVP');
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('<h1>Server error</h1>');
  }
});

// ------------------------
// GET all events for authenticated user
// ------------------------
router.get('/', auth, async (req, res) => {
  try {
    const eventsSnapshot = await db.collection('events')
      .where('hostUserId', '==', req.user.uid)
      .get();

    const events = [];
    eventsSnapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// GET specific event
// ------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const eventDoc = await db.collection('events').doc(req.params.id).get();

    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });

    const eventData = eventDoc.data();
    res.json({
      id: eventDoc.id,
      ...eventData,
      hasDriveLink: !!eventData.googleDriveLink,
      driveLinkStatus: eventData.googleDriveLink ? "Media sharing enabled" : "No media folder set up"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Create event
// ------------------------
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, date, time, location, description, category,
      dietaryRequirements = [], musicSuggestions = [], googleDriveLink = ""
    } = req.body;

    const eventData = {
      title, date, time, location, description,
      category: category || 'General',
      dietaryRequirements: Array.isArray(dietaryRequirements) ? dietaryRequirements : [],
      musicSuggestions: Array.isArray(musicSuggestions) ? musicSuggestions : [],
      pollResponses: {},
      googleDriveLink,
      hostUserId: req.user.uid,
      hostEmail: req.user.email || 'unknown',
      createdAt: new Date().toISOString(),
      attendeeCount: 0
    };

    const docRef = await db.collection('events').add(eventData);
    res.status(201).json({ 
      message: 'Event created successfully', 
      eventId: docRef.id,
      googleDriveLink: eventData.googleDriveLink
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Update event (PUT)
// ------------------------
router.put('/:id', auth, async (req, res) => {
  try {
    const eventRef = db.collection('events').doc(req.params.id);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    if (eventDoc.data().hostUserId !== req.user.uid) return res.status(403).json({ error: 'Not authorized' });

    await eventRef.update(req.body);
    res.json({ message: 'Event updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Submit poll
// ------------------------
router.post('/:eventId/poll', auth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { dietaryChoice, musicChoice } = req.body;
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });

    const pollResponses = eventDoc.data().pollResponses || {};
    pollResponses[req.user.uid] = {
      dietaryChoice: dietaryChoice || 'Not specified',
      musicChoice: musicChoice || 'Not specified',
      respondedAt: new Date().toISOString(),
      userName: req.user.name || 'Anonymous User'
    };

    await eventRef.update({ 
      pollResponses,
      attendeeCount: Object.keys(pollResponses).length
    });
    res.json({ message: 'Poll response submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Get poll results
// ------------------------
router.get('/:eventId/poll-results', auth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });

    const pollResponses = eventDoc.data().pollResponses || {};
    const dietaryStats = {};
    const musicStats = {};

    Object.values(pollResponses).forEach(response => {
      if (response.dietaryChoice && response.dietaryChoice !== 'Not specified') {
        dietaryStats[response.dietaryChoice] = (dietaryStats[response.dietaryChoice] || 0) + 1;
      }
      if (response.musicChoice && response.musicChoice !== 'Not specified') {
        musicStats[response.musicChoice] = (musicStats[response.musicChoice] || 0) + 1;
      }
    });

    res.json({
      eventTitle: eventDoc.data().title,
      totalResponses: Object.keys(pollResponses).length,
      pollOptions: {
        dietaryRequirements: eventDoc.data().dietaryRequirements,
        musicSuggestions: eventDoc.data().musicSuggestions
      },
      results: { dietary: dietaryStats, music: musicStats },
      allResponses: pollResponses,
      googleDriveLink: eventDoc.data().googleDriveLink
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// PATCH Google Drive link only
// ------------------------
router.patch('/:id/drive-link', auth, async (req, res) => {
  try {
    const { googleDriveLink } = req.body;
    const eventId = req.params.id;
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    if (eventDoc.data().hostUserId !== req.user.uid) return res.status(403).json({ error: 'Not authorized' });

    await eventRef.update({ googleDriveLink });
    res.json({ message: 'Google Drive link updated successfully', googleDriveLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ All events routes defined');

module.exports = router;
