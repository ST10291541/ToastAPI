//Imports
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize the Firebase app using the service account credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Initialize Firestore
const db = admin.firestore();

module.exports = { admin, db };