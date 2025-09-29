//Imports
const express = require('express');
const router = express.Router();
const { db } = require('../models/firebase');
const auth = require('../middleware/auth');

// Checks if the route is being hit
console.log('✅ Events router loaded');

// Test route without authentication 
router.get('/test-no-auth', (req, res) => {
  console.log('✅ /api/events/test-no-auth route hit!');
  res.json({ message: 'Test no auth works!' });
});

// Test route with authentication  
router.get('/test-with-auth', auth, (req, res) => {
  console.log('✅ /api/events/test-with-auth route hit!');
  console.log('👤 User UID:', req.user?.uid);
  res.json({ 
    message: 'Test with auth works!', 
    user: req.user?.uid,
    email: req.user?.email 
  });
});

// GET all events for an authenticated user
router.get('/', auth, async (req, res) => {
  console.log('🔍 GET /api/events route hit!');
  console.log('👤 User UID:', req.user.uid);
  console.log('👤 User Email:', req.user.email);
  
  try {
    console.log('📊 Querying Firestore for events...');
    const eventsSnapshot = await db.collection('events')
      .where('hostUserId', '==', req.user.uid)
      .get();
    
    console.log(`📊 Found ${eventsSnapshot.size} events for user ${req.user.uid}`);
    
    const events = [];
    eventsSnapshot.forEach(doc => {
      console.log(`📄 Processing event: ${doc.id} - ${doc.data().title}`);
      events.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Sending ${events.length} events to client`);
    res.json(events);
  } catch (error) {
    console.error('❌ GET /api/events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new event with polls and manual Google Drive link
router.post('/', auth, async (req, res) => {
  console.log('🔍 POST /api/events route hit!');
  console.log('👤 User UID:', req.user.uid);
  console.log('📦 Request body:', req.body);
  
  try {
    const { 
      title, 
      date, 
      time, 
      location, 
      description, 
      category,
      // POLL FEATURES
      dietaryRequirements = [],  
      musicSuggestions = [],     
      // MANUAL GOOGLE DRIVE LINK 
      googleDriveLink = ""
    } = req.body;
    
    const eventData = {
      title,
      date,
      time,
      location,
      description,
      category: category || 'General',
      // POLL DATA
      dietaryRequirements: Array.isArray(dietaryRequirements) ? dietaryRequirements : [],
      musicSuggestions: Array.isArray(musicSuggestions) ? musicSuggestions : [],
      pollResponses: {},
      // SIMPLE GOOGLE DRIVE LINK 
      googleDriveLink: googleDriveLink,
      // BASIC INFO
      hostUserId: req.user.uid,
      hostEmail: req.user.email || 'unknown',
      createdAt: new Date().toISOString(),
      attendeeCount: 0
    };
    
    console.log('📝 Creating event in Firestore...');

    // Create the event in Firebase
    const docRef = await db.collection('events').add(eventData);
    const eventId = docRef.id;
    
    console.log(`✅ Event created with ID: ${eventId}`);
    
    res.status(201).json({ 
      message: 'Event created successfully', 
      eventId: eventId,
      pollOptions: {
        dietaryRequirements: eventData.dietaryRequirements,
        musicSuggestions: eventData.musicSuggestions
      },
      googleDriveLink: eventData.googleDriveLink,
      instructions: eventData.googleDriveLink ? 
        "Google Drive link saved! Attendees can use this to view and upload media." :
        "No Google Drive link provided. You can add one later by editing the event."
    });
  } catch (error) {
    console.error('❌ POST /api/events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE event (to add Google Drive link later if needed)
router.put('/:id', auth, async (req, res) => {
  console.log(`🔍 PUT /api/events/${req.params.id} route hit!`);
  
  try {
    const eventRef = db.collection('events').doc(req.params.id);
    const eventDoc = await eventRef.get();
    
    if (!eventDoc.exists) {
      console.log(`❌ Event ${req.params.id} not found`);
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (eventDoc.data().hostUserId !== req.user.uid) {
      console.log(`❌ User ${req.user.uid} not authorized to update event ${req.params.id}`);
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }
    
    console.log(`📝 Updating event ${req.params.id} with:`, req.body);
    await eventRef.update(req.body);
    
    console.log(`✅ Event ${req.params.id} updated successfully`);
    res.json({ 
      message: 'Event updated successfully',
      updatedFields: Object.keys(req.body)
    });
  } catch (error) {
    console.error(`❌ PUT /api/events/${req.params.id} error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET specific event (so app can display Drive link)
router.get('/:id', auth, async (req, res) => {
  console.log(`🔍 GET /api/events/${req.params.id} route hit!`);
  
  try {
    const eventDoc = await db.collection('events').doc(req.params.id).get();
    
    if (!eventDoc.exists) {
      console.log(`❌ Event ${req.params.id} not found`);
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const eventData = eventDoc.data();
    console.log(`✅ Found event: ${eventData.title}`);
    
    res.json({
      id: eventDoc.id,
      ...eventData,
      // Include helpful info about the Drive link
      hasDriveLink: !!eventData.googleDriveLink,
      driveLinkStatus: eventData.googleDriveLink ? 
        "Media sharing enabled" : "No media folder set up"
    });
  } catch (error) {
    console.error(`❌ GET /api/events/${req.params.id} error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// POLL: Submit poll responses
router.post('/:eventId/poll', auth, async (req, res) => {
  console.log(`🔍 POST /api/events/${req.params.eventId}/poll route hit!`);
  
  try {
    const { eventId } = req.params;
    const { dietaryChoice, musicChoice } = req.body;
    
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    
    if (!eventDoc.exists) {
      console.log(`❌ Event ${eventId} not found for poll`);
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const eventData = eventDoc.data();
    const pollResponses = eventData.pollResponses || {};
    
    pollResponses[req.user.uid] = {
      dietaryChoice: dietaryChoice || 'Not specified',
      musicChoice: musicChoice || 'Not specified',
      respondedAt: new Date().toISOString(),
      userName: req.user.name || 'Anonymous User'
    };
    
    console.log(`📝 Updating poll for event ${eventId}, user ${req.user.uid}`);
    await eventRef.update({ 
      pollResponses: pollResponses,
      attendeeCount: Object.keys(pollResponses).length
    });
    
    console.log(`✅ Poll response submitted for event ${eventId}`);
    res.json({ 
      message: 'Poll response submitted successfully',
      yourResponse: {
        dietaryChoice,
        musicChoice
      }
    });
  } catch (error) {
    console.error(`❌ POST /api/events/${req.params.eventId}/poll error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// POLL: Get poll results for an event
router.get('/:eventId/poll-results', auth, async (req, res) => {
  console.log(`🔍 GET /api/events/${req.params.eventId}/poll-results route hit!`);
  
  try {
    const { eventId } = req.params;
    
    const eventDoc = await db.collection('events').doc(eventId).get();
    
    if (!eventDoc.exists) {
      console.log(`❌ Event ${eventId} not found for poll results`);
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const eventData = eventDoc.data();
    const pollResponses = eventData.pollResponses || {};
    
    console.log(`📊 Processing ${Object.keys(pollResponses).length} poll responses`);
    
    // Calculate statistics
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
    
    console.log(`✅ Sending poll results for event ${eventId}`);
    res.json({
      eventTitle: eventData.title,
      totalResponses: Object.keys(pollResponses).length,
      pollOptions: {
        dietaryRequirements: eventData.dietaryRequirements,
        musicSuggestions: eventData.musicSuggestions
      },
      results: {
        dietary: dietaryStats,
        music: musicStats
      },
      allResponses: pollResponses,
      // Include Drive link in poll results too
      googleDriveLink: eventData.googleDriveLink
    });
  } catch (error) {
    console.error(`❌ GET /api/events/${req.params.eventId}/poll-results error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Just update the Google Drive link for an event
router.patch('/:id/drive-link', auth, async (req, res) => {
  console.log(`🔍 PATCH /api/events/${req.params.id}/drive-link route hit!`);
  
  try {
    const { googleDriveLink } = req.body;
    const eventId = req.params.id;
    
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    
    if (!eventDoc.exists) {
      console.log(`❌ Event ${eventId} not found for drive link update`);
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (eventDoc.data().hostUserId !== req.user.uid) {
      console.log(`❌ User ${req.user.uid} not authorized to update drive link for event ${eventId}`);
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }
    
    console.log(`📝 Updating Google Drive link for event ${eventId}`);
    await eventRef.update({ 
      googleDriveLink: googleDriveLink 
    });
    
    console.log(`✅ Google Drive link updated for event ${eventId}`);
    res.json({ 
      message: 'Google Drive link updated successfully',
      googleDriveLink: googleDriveLink,
      instructions: "Attendees can now use this link to view and upload media"
    });
  } catch (error) {
    console.error(`❌ PATCH /api/events/${req.params.id}/drive-link error:`, error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ All events routes defined');

module.exports = router;