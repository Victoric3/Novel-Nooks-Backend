const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './config.env' });

function initializeFirebase() {
  try {
    // Check if we have the Firebase service account in environment variables
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Parse the JSON string
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      console.log('Firebase initialized successfully with service account');
      return admin;
    } 
    // Fallback to application default credentials if available
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      
      console.log('Firebase initialized with application default credentials');
      return admin;
    }
    else {
      throw new Error('Firebase service account not found in environment variables');
    }
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

// Initialize Firebase
const firebaseAdmin = initializeFirebase();

module.exports = firebaseAdmin;