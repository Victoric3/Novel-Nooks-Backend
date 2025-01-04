const admin = require('firebase-admin');
require('dotenv').config();

function initializeFirebase() {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('Firebase service account not found in environment variables');
    }

    // Decode and parse the service account from environment variable
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    return admin;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

module.exports = initializeFirebase();