//Imports
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize the Firebase app using the service account credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Initialize Firestore
const db = admin.firestore();

// Export both the admin instance and Firestore database for use in other parts of the app
module.exports = { admin, db };