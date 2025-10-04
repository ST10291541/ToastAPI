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
// SHARE RSVP PAGE
// ------------------------
router.get('/share/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return res.status(404).send('<h1>Event not found</h1>');
    }

    const event = eventDoc.data();
    const dietaryOptions = event.dietaryRequirements || [];

    // HTML page for RSVP
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
          label { font-weight: bold; margin-top: 12px; display: block; }
          input, select, button { margin-top: 6px; padding: 8px; width: 100%; max-width: 400px; }
          button { cursor: pointer; }
          .section { margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>${event.title}</h1>
        <p><strong>Date:</strong> ${event.date} ${event.time}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p><strong>Description:</strong> ${event.description}</p>
        <p><strong>Going:</strong> ${event.attendeeCount || 0}</p>

        <div class="section">
          <label>Dietary Requirement / Option:</label>
          <select id="dietary">
            <option value="">Select an option</option>
            ${dietaryOptions.map(option => `<option value="${option}">${option}</option>`).join('')}
          </select>
        </div>

        <div class="section">
          <label>Song Suggestion:</label>
          <input type="text" id="song" placeholder="Suggest a song, artist, or genre" />
        </div>

        <div class="section">
          <label>RSVP Status:</label>
          <select id="rsvpStatus">
            <option value="">Select your status</option>
            <option value="going">Going</option>
            <option value="maybe">Maybe</option>
            <option value="not going">Can't Go</option>
          </select>
        </div>

        <div class="section">
          <button id="submitRSVPButton">Submit RSVP</button>
        </div>

        <script>
          document.getElementById('submitRSVPButton').addEventListener('click', async () => {
            const dietary = document.getElementById('dietary').value;
            const song = document.getElementById('song').value;
            const status = document.getElementById('rsvpStatus').value;

            if (!status) {
              alert('Please select your RSVP status.');
              return;
            }

            try {
              const response = await fetch('${process.env.API_BASE_URL}/api/events/rsvps/${eventId}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status,
                  dietaryChoice: dietary,
                  musicChoice: song,
                  userName: 'Anonymous',  // optionally fetch from login
                  userEmail: ''            // optionally fetch from login
                })
              });

              const data = await response.json();
              alert(data.message || 'RSVP submitted successfully!');
              window.location.reload();
            } catch (err) {
              alert('Failed to submit RSVP');
              console.error(err);
            }
          });
        </script>

      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('<h1>Server error</h1>');
  }
});

// ------------------------
// RSVP submission route
// ------------------------
router.post('/rsvps/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, dietaryChoice, musicChoice, userName, userEmail } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'RSVP status is required' });
    }

    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const rsvps = eventDoc.data().rsvps || {};
    const uid = userEmail || `guest_${Date.now()}`;

    rsvps[uid] = {
      status,
      dietaryChoice: dietaryChoice || 'Not specified',
      musicChoice: musicChoice || 'Not specified',
      userName: userName || 'Anonymous',
      respondedAt: new Date().toISOString()
    };

    const attendeeCount = Object.values(rsvps).filter(r => r.status === 'going').length;

    await eventRef.update({ rsvps, attendeeCount });

    res.json({ message: 'RSVP submitted successfully', attendeeCount });
  } catch (error) {
    console.error('RSVP submission failed:', error);
    res.status(500).json({ error: 'Failed to submit RSVP' });
  }
});

// ------------------------
// Other routes (events CRUD, polls, etc.) remain unchanged
// ------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const eventDoc = await db.collection('events').doc(req.params.id).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    res.json({ id: eventDoc.id, ...eventDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
      attendeeCount: 0,
      rsvps: {}
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

console.log('✅ All events routes defined');

module.exports = router;
