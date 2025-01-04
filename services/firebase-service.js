const admin = require('../config/firebase-config');

class FCMService {
  static async sendFcmNotification(fcmMessage) {
    try {
      const message = {
        token: fcmMessage.message.token,
        notification: {
          title: fcmMessage.message.notification.title,
          body: fcmMessage.message.notification.body,
        },
        data: fcmMessage.message.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('Successfully sent message:', response);
      return response;
    } catch (error) {
      console.error('Error sending FCM notification:', error);
      throw error;
    }
  }

  static async sendMultipleFcmNotifications(tokens, notification, data) {
    try {
      const message = {
        tokens: tokens, // Array of tokens
        notification: notification,
        data: data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log('Successfully sent messages:', response);
      return response;
    } catch (error) {
      console.error('Error sending multiple FCM notifications:', error);
      throw error;
    }
  }
}

module.exports = FCMService;