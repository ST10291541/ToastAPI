const { admin, db } = require("../models/firebase");

async function sendRSVPNotification(eventId, userName) {
  try {
    // Fetch event
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) return;

    const hostUserId = eventDoc.data().hostUserId;

    // Fetch host device tokens
    const tokensSnap = await db.collection("users")
      .doc(hostUserId)
      .collection("tokens")
      .get();

    const tokens = tokensSnap.docs.map(d => d.id);
    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: "New RSVP Received 🎉",
        body: `${userName} just RSVP'd to your event.`,
      },
      tokens: tokens
    };

    await admin.messaging().sendMulticast(message);
    console.log("📨 RSVP Notification sent to host:", hostUserId);

  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

module.exports = { sendRSVPNotification };
