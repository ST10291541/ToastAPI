// events.js
const express = require('express');
const router = express.Router();
const { db } = require('../models/firebase');

// ------------------------
// Share RSVP page
// ------------------------
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
        </style>
      </head>
      <body>
        <h1>${event.title}</h1>
        <p><strong>Date:</strong> ${event.date} ${event.time}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p><strong>Description:</strong> ${event.description}</p>

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

            if (!firstName || !surname) return alert('Please enter your full name.');
            if (!status) return alert('Please select your RSVP status.');

            const fullName = firstName + ' ' + surname;
            const guestId = 'guest_' + Date.now();

            try {
              // Save RSVP
              await fetch('/api/events/${eventId}/rsvps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guestId, userName: fullName, status })
              });

              // Save preferences
              await fetch('/api/events/${eventId}/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guestId, dietaryChoice: dietary || 'Not specified', musicChoice: song || 'Not specified' })
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
    console.error(err);
    res.status(500).send('<h1>Server error</h1>');
  }
});

// ------------------------
// RSVP subcollection
// ------------------------
router.post('/:eventId/rsvps', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { guestId, userName, status } = req.body;

    if (!guestId || !userName || !status) return res.status(400).json({ error: 'Missing RSVP data' });

    const rsvpRef = db.collection('events').doc(eventId).collection('rsvps').doc(guestId);
    await rsvpRef.set({
      userName,
      status,
      respondedAt: new Date().toISOString()
    });

    res.json({ message: 'RSVP saved!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save RSVP' });
  }
});

// ------------------------
// Preferences subcollection
// ------------------------
router.post('/:eventId/preferences', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { guestId, dietaryChoice, musicChoice } = req.body;

    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    const prefRef = db.collection('events').doc(eventId).collection('preferences').doc(guestId);
    await prefRef.set({ dietaryChoice, musicChoice });

    res.json({ message: 'Preferences saved!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

module.exports = router;
