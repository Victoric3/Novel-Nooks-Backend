const admin = require('firebase-admin');
const Device = require('../Models/device');
const Notification = require('../Models/notification');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './config.env' });

class FCMService {
  constructor() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    }
  }

  async sendToDevice(token, payload) {
    try {
      const message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data || {}
      };

      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered') {
        await this.removeInvalidToken(token);
      }
      
      console.error('FCM error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendToUser(userId, payload) {
    try {
      // Get all active devices for this user with valid FCM tokens
      const devices = await Device.find({ 
        user: userId, 
        isActive: true,
        fcmToken: { $exists: true, $ne: '' }
      });
      console.log('Devices:', devices);
      
      if (!devices || devices.length === 0) {
        return { success: false, message: 'No active devices found' };
      }
      
      // For multiple devices - use sendAll for efficiency
      if (devices.length > 1) {
        const messages = devices.map(device => ({
          token: device.fcmToken,
          notification: {
            title: payload.title,
            body: payload.body
          },
          data: payload.data || {}
        }));
  
        const response = await admin.messaging().sendAll(messages);
        await this.handleFailedDeliveries(response, devices);
        
        return {
          success: true,
          devicesCount: devices.length,
          successCount: response.successCount,
          failureCount: response.failureCount,
          results: response.responses.map((resp, idx) => ({
            deviceId: devices[idx]._id,
            success: !resp.error,
            error: resp.error ? resp.error.message : null
          }))
        };
      } 
      // For a single device - use sendToDevice
      else {
        const device = devices[0];
        const result = await this.sendToDevice(device.fcmToken, payload);
        
        return {
          success: result.success,
          devicesCount: 1,
          successCount: result.success ? 1 : 0,
          failureCount: result.success ? 0 : 1,
          results: [{ 
            deviceId: device._id, 
            success: result.success, 
            error: result.error 
          }]
        };
      }
    } catch (error) {
      console.error('Error sending to user:', error);
      return { success: false, error: error.message };
    }
  }

  async removeInvalidToken(token) {
    await Device.findOneAndUpdate(
      { fcmToken: token },
      { isActive: false }
    );
  }

  async handleFailedDeliveries(response, devices) {
    response.responses.forEach(async (resp, idx) => {
      if (resp.error) {
        if (resp.error.code === 'messaging/registration-token-not-registered') {
          await this.removeInvalidToken(devices[idx].fcmToken);
        }
      }
    });
  }
}

module.exports = new FCMService();