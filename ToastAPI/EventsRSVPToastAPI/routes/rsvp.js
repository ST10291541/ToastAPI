const express = require('express');
const router = express.Router();
const { db } = require('../models/firebase');
const auth = require('../middleware/auth');

// RSVP to an event
router.post('/:eventId', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const { eventId } = req.params;

    if (!status) {
      return res.status(400).json({ error: 'RSVP status is required' });
    }

    // Check if the event exists
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Save or update the RSVP
    const rsvpRef = db.collection('rsvps').doc(`${eventId}_${req.user.uid}`);
    await rsvpRef.set({
      eventId,
      userId: req.user.uid,
      userName: req.user.name || req.user.email,
      status,
      dietaryChoice: req.body.dietaryChoice || null,
      musicChoice: req.body.musicChoice || null,
      responseDate: new Date().toISOString()
    });

    res.status(200).json({ message: 'RSVP submitted successfully' });
  } catch (error) {
    console.error('RSVP Error:', error.message);
    res.status(500).json({ error: 'Failed to submit RSVP' });
  }
});

// Get all RSVPs (attendees) for a specific event
router.get('/:eventId/attendees', auth, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Get RSVPs for this event
    const rsvpsSnapshot = await db.collection('rsvps')
      .where('eventId', '==', eventId)
      .get();

    const attendees = await Promise.all(
      rsvpsSnapshot.docs.map(async (doc) => {
        const rsvp = doc.data();
        const userDoc = await db.collection('users').doc(rsvp.userId).get();
        return {
          userId: rsvp.userId,
          name: userDoc.exists ? userDoc.data().displayName : rsvp.userName,
          status: rsvp.status
        };
      })
    );

    res.status(200).json(attendees);
  } catch (error) {
    console.error('Get Attendees Error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve attendees' });
  }
});

module.exports = router;
