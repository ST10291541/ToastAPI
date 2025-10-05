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
// Sanitize helper for Drive links
// ------------------------
function sanitizeLink(link) {
  if (!link) return '';
  return link.startsWith('http') ? link : `https://${link}`;
}

// ------------------------
// Create new event (auth required)
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, date, time, location, description, category,
      dietaryRequirements = [], musicSuggestions = [], googleDriveLink = ""
    } = req.body;

    if (!title || !date || !time || !location) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sanitizedLink = sanitizeLink(googleDriveLink);

    const eventData = {
      title,
      date,
      time,
      location,
      description,
      category: category || 'General',
      dietaryRequirements: Array.isArray(dietaryRequirements) ? dietaryRequirements : [],
      musicSuggestions: Array.isArray(musicSuggestions) ? musicSuggestions : [],
      pollResponses: {},      // NEW: store poll responses
      googleDriveLink: sanitizedLink,
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
      googleDriveLink: eventData.googleDriveLink,
      pollOptions: {
        dietaryRequirements: eventData.dietaryRequirements,
        musicSuggestions: eventData.musicSuggestions
      }
    });
  } catch (error) {
    console.error('❌ Event creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Get single event (auth required)
router.get('/:id', auth, async (req, res) => {
  try {
    const eventDoc = await db.collection('events').doc(req.params.id).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    res.json({ id: eventDoc.id, ...eventDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Share RSVP page
router.get('/share/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) return res.status(404).send('<h1>Event not found</h1>');

    const event = eventDoc.data();
    const dietaryOptions = event.dietaryRequirements || [];

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
          a.button-link {
            display: inline-block;
            background: #4285F4;
            color: #fff;
            padding: 10px 14px;
            border-radius: 4px;
            text-decoration: none;
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        <h1>${event.title}</h1>
        <p><strong>Date:</strong> ${event.date} ${event.time}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p><strong>Description:</strong> ${event.description}</p>
        <p><strong>Going:</strong> ${event.attendeeCount || 0}</p>

        ${
          event.googleDriveLink
            ? `<p><strong>Google Drive Folder:</strong><br>
                <a href="${event.googleDriveLink}" target="_blank" class="button-link">Open Drive Folder</a></p>`
            : `<p style="color:#888;">No Google Drive link provided.</p>`
        }

        <div class="section">
          <label>First Name:</label>
          <input type="text" id="firstName" placeholder="Enter your first name" />
        </div>

        <div class="section">
          <label>Surname:</label>
          <input type="text" id="surname" placeholder="Enter your surname" />
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
          <button id="submitRSVPButton">Submit RSVP</button>
        </div>

        <script>
          document.getElementById('submitRSVPButton').addEventListener('click', async () => {
            const firstName = document.getElementById('firstName').value.trim();
            const surname = document.getElementById('surname').value.trim();
            const status = document.getElementById('rsvpStatus').value;
            const dietary = document.getElementById('dietary').value;
            const song = document.getElementById('song').value;

            if (!status) return alert('Please select your RSVP status.');
            const fullName = (firstName && surname) ? firstName + ' ' + surname : 'Anonymous';
            const guestId = 'guest_' + Date.now();

            try {
              // RSVP
              await fetch('/api/events/${eventId}/rsvps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guestId, userName: fullName, status })
              });

              // Preferences / Poll responses
              await fetch('/api/events/${eventId}/poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dietaryChoice: dietary || 'Not specified', musicChoice: song || 'Not specified', userName: fullName, uid: guestId })
              });

              alert('RSVP submitted successfully!');
              window.location.reload();
            } catch (err) {
              console.error(err);
              alert('Failed to submit RSVP.');
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error loading share page:', err);
    res.status(500).send('<h1>Server error</h1>');
  }
});

// ------------------------
// RSVP subcollection
router.post('/:eventId/rsvps', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { guestId, userName, status } = req.body;
    if (!guestId || !userName || !status) return res.status(400).json({ error: 'Missing RSVP data' });

    const rsvpRef = db.collection('events').doc(eventId).collection('rsvps').doc(guestId);
    await rsvpRef.set({ userName, status, respondedAt: new Date().toISOString() });

    // Update attendee count
    const rsvps = await db.collection('events').doc(eventId).collection('rsvps').get();
    const attendeeCount = rsvps.docs.filter(doc => doc.data().status === 'going').length;
    await db.collection('events').doc(eventId).update({ attendeeCount });

    res.json({ message: 'RSVP saved!', attendeeCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save RSVP' });
  }
});

// ------------------------
// Poll responses
router.post('/:eventId/poll', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { dietaryChoice, musicChoice, userName, uid } = req.body;

    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });

    const pollResponses = eventDoc.data().pollResponses || {};
    pollResponses[uid] = {
      dietaryChoice: dietaryChoice || 'Not specified',
      musicChoice: musicChoice || 'Not specified',
      userName: userName || 'Anonymous',
      respondedAt: new Date().toISOString()
    };

    await eventRef.update({ pollResponses });
    res.json({ message: 'Poll response submitted successfully', yourResponse: { dietaryChoice, musicChoice } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit poll response' });
  }
});

// ------------------------
// Poll results
router.get('/:eventId/poll-results', auth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });

    const eventData = eventDoc.data();
    const pollResponses = eventData.pollResponses || {};

    const dietaryStats = {};
    const musicStats = {};

    Object.values(pollResponses).forEach(r => {
      if (r.dietaryChoice && r.dietaryChoice !== 'Not specified') dietaryStats[r.dietaryChoice] = (dietaryStats[r.dietaryChoice] || 0) + 1;
      if (r.musicChoice && r.musicChoice !== 'Not specified') musicStats[r.musicChoice] = (musicStats[r.musicChoice] || 0) + 1;
    });

    res.json({
      eventTitle: eventData.title,
      totalResponses: Object.keys(pollResponses).length,
      pollOptions: { dietaryRequirements: eventData.dietaryRequirements, musicSuggestions: eventData.musicSuggestions },
      results: { dietary: dietaryStats, music: musicStats },
      allResponses: pollResponses,
      googleDriveLink: eventData.googleDriveLink
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch poll results' });
  }
});

console.log('✅ All events routes defined');
module.exports = router;
