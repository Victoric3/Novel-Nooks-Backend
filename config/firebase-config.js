const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './config.env' });

function initializeFirebase() {
  try {
    // Check if Firebase is enabled
    if (process.env.FCM_ENABLED !== 'true') {
      console.log('Firebase is disabled by configuration');
      return null;
    }
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        return admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (parseError) {
        console.error('Error parsing Firebase service account JSON:', parseError);
        // Initialize with minimal config for testing
        return admin.initializeApp({
          projectId: 'novel-nooks-e1d16'
        });
      }
    } else {
      console.log('No Firebase service account found');
      return null;
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
}

// Initialize Firebase with error handling
let firebaseAdmin = null;
try {
  firebaseAdmin = initializeFirebase();
  if (firebaseAdmin) {
    console.log('Firebase initialized successfully');
  }
} catch (err) {
  console.error('Could not initialize Firebase:', err);
}

module.exports = firebaseAdmin;