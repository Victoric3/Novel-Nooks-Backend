const fcmService = require('../services/firebase-service');
const Device = require('../Models/device');
const Notification = require('../Models/notification');
const rateLimit = require('express-rate-limit');
const User = require('../Models/user');
const mongoose = require("mongoose")

const notificationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// API endpoint version
const registerDevice = async (req, res) => {
  try {
    const { fcmToken, deviceType, os, appVersion, uniqueIdentifier } = req.body;
    
    // Use the in-app version
    const result = await registerDeviceForUser(
      req.user._id, 
      { fcmToken, deviceType, os, appVersion, uniqueIdentifier }
    );
    
    res.status(200).json({
      status: 'success',
      message: 'Device registered successfully',
      device: result
    });
  } catch (error) {
    // console.error('Device registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register device',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function registerDeviceForUser(userId, deviceData) {
  const { fcmToken, deviceType, os, appVersion, uniqueIdentifier } = deviceData;
  
  if (!uniqueIdentifier) {
    throw new Error('Device uniqueIdentifier is required');
  }
  
  if (!fcmToken) {
    throw new Error('FCM token is required');
  }
  
  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if device already exists for this user
  let device = await Device.findOne({ 
    user: userId, 
    uniqueIdentifier: uniqueIdentifier 
  });
  
  if (device) {
    // Update existing device
    device.fcmToken = fcmToken;
    device.isActive = true;
    device.lastUsed = new Date();
    if (os) device.os = os;
    if (appVersion) device.appVersion = appVersion;
  } else {
    // Create new device
    device = new Device({
      user: userId,
      fcmToken,
      deviceType: deviceType || 'unknown',
      os: os || 'unknown',
      appVersion: appVersion || 'unknown',
      uniqueIdentifier
    });
  }
  
  await device.save();
  
  // Enforce device limit after saving
  await Device.enforceDeviceLimit(userId, user.maxSessions || 5);
  
  return device;
}

// API endpoint version
const sendNotification = async (req, res) => {
  try {
    const { userId, title, body, type, data } = req.body;
    
    // Use the in-app version
    const result = await sendNotificationToUser(userId, { title, body, type, data });
    
    res.status(200).json({
      status: 'success',
      message: 'Notification sent successfully',
      data: result
    });
  } catch (error) {
    // console.error('Send notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send notification',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function sendNotificationToUser(userId, notificationData) {
  const { title, body, type, data } = notificationData;
  console.log("called login");
  if (!title || !body) {
    throw new Error('Notification title and body are required');
  }
  
  // Create notification record
  const notification = await Notification.create({
    recipient: userId,
    title,
    body,
    type: type || 'general',
    data: data || {}
  });
  
  // Send via FCM
  const response = await fcmService.sendToUser(userId, {
    title,
    body,
    data: {
      notificationId: notification._id.toString(),
      type: type || 'general',
      ...(data || {})
    }
  });
  console.log("fcm_response",response);
  
  return {
    notification,
    fcmResponse: response
  };
}

// API endpoint version
const getNotificationHistory = async (req, res) => {
  try {
    console.log("called this getnotificationHistory");
    const { limit = 15 } = req.query;
    // Use the in-app version
    const notifications = await getNotificationsForUser(req.user._id, limit);

    console.log(notifications)
    
    res.status(200).json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function getNotificationsForUser(userId, limit = 15) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  
  const notifications = await Notification.find({ 
    recipient: userId 
  })
  .select('title body type data status read createdAt updatedAt')
  .sort('-createdAt')
  .limit(parseInt(limit));
  
  return notifications;
}

// Method to send login notification
async function sendLoginNotification(userId, loginData) {
  try {
    // Ensure we have valid userId
    if (!userId) {
      console.error('Missing userId for login notification');
      return null;
    }

    // Extract data with defaults
    const { deviceInfo, location, ipAddress, time = new Date().toISOString() } = loginData || {};
    
    // Parse deviceInfo if it's a string
    let parsedDeviceInfo = deviceInfo;
    if (typeof deviceInfo === 'string') {
      try {
        parsedDeviceInfo = JSON.parse(deviceInfo);
      } catch (parseError) {
        console.log('Failed to parse deviceInfo string:', parseError.message);
        parsedDeviceInfo = { unknownDevice: true };
      }
    }

    // Fallback to defaults if deviceInfo is invalid
    parsedDeviceInfo = parsedDeviceInfo || {};
    
    // Extract device details with fallbacks
    const deviceName = parsedDeviceInfo.uniqueIdentifier || 'Unknown device';
    const deviceOS = parsedDeviceInfo.os || 'Unknown OS';

    // Create notification message
    // Note: Location is prepared for future integration but not used yet
    const locationString = ''; // Will be used in future when location is implemented
    
    return await sendNotificationToUser(userId, {
      title: 'New Login Detected',
      body: `Your account was accessed on ${deviceName} (${deviceOS})${locationString}`,
      type: 'warning',
      data: {
        deviceInfo: deviceInfo,
        ipAddress,
        time,
        action: 'view_security'
      }
    });
  } catch (error) {
    console.error('Failed to send login notification:', error);
    // Don't throw error so login process isn't interrupted
    return null;
  }
}

// Method to send password reset notification
async function sendPasswordResetNotification(userId, resetData) {
  try {
    const { deviceInfo, ipAddress, time = new Date().toISOString() } = resetData || {};
    
    return await sendNotificationToUser(userId, {
      title: 'Password Changed Successfully',
      body: 'Your account password has been reset. If you did not make this change, please contact support immediately.',
      type: 'security',
      data: {
        ipAddress: String(ipAddress || ''),
        time: String(time),
        action: 'view_security',
        securityEvent: 'password_reset'
      }
    });
  } catch (error) {
    console.error('Failed to send password reset notification:', error);
    return null;
  }
}

// Method to send username change notification
async function sendUsernameChangeNotification(userId, changeData) {
  try {
    const { oldUsername, newUsername } = changeData;
    
    return await sendNotificationToUser(userId, {
      title: 'Username Changed',
      body: `Your username has been updated from ${oldUsername} to ${newUsername}.`,
      type: 'profile',
      data: {
        oldUsername: String(oldUsername || ''),
        newUsername: String(newUsername || ''),
        action: 'view_profile',
        profileEvent: 'username_change'
      }
    });
  } catch (error) {
    console.error('Failed to send username change notification:', error);
    return null;
  }
}

const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // Use the in-app version
    const result = await markNotificationAsRead(req.user._id, notificationId);
    
    if (!result) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found or you do not have permission to update it'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function markNotificationAsRead(userId, notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error('Invalid notification ID');
  }
  
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  
  // Find and update the notification, ensuring it belongs to the user
  const notification = await Notification.findOneAndUpdate(
    { 
      _id: notificationId,
      recipient: userId
    },
    { read: true },
    { new: true } // Return the updated document
  );
  
  return notification;
}

// API endpoint version - for marking multiple notifications as read
const markAllAsRead = async (req, res) => {
  try {
    // Use the in-app version
    const result = await markAllNotificationsAsRead(req.user._id);
    
    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notifications as read',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function markAllNotificationsAsRead(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  
  // Update all unread notifications for the user
  const result = await Notification.updateMany(
    { 
      recipient: userId,
      read: false
    },
    { read: true }
  );
  
  return result;
}

// API endpoint version - for marking multiple specific notifications as read
const markMultipleAsRead = async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request. Please provide an array of notification IDs.'
      });
    }
    
    // Validate each ID
    const validIds = notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    // Use the in-app version
    const result = await markMultipleNotificationsAsRead(req.user._id, validIds);
    
    res.status(200).json({
      status: 'success',
      message: 'Notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notifications as read',
      error: error.message
    });
  }
};

// In-app version that doesn't need req/res
async function markMultipleNotificationsAsRead(userId, notificationIds) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    throw new Error('Invalid notification IDs');
  }
  
  // Update all specified unread notifications for the user
  const result = await Notification.updateMany(
    { 
      _id: { $in: notificationIds },
      recipient: userId,
      read: false
    },
    { read: true }
  );
  
  return result;
}

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    const count = await getUnreadNotificationCount(req.user._id);
    
    res.status(200).json({
      status: 'success',
      count
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch unread notification count',
      error: error.message
    });
  }
};

// In-app version for getting unread notification count
async function getUnreadNotificationCount(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  
  const count = await Notification.countDocuments({
    recipient: userId,
    read: false
  });
  
  return count;
}

module.exports = {
  // API endpoints
  registerDevice,
  sendNotification,
  getNotificationHistory,
  notificationLimit,
  markAsRead,
  markAllAsRead,
  markMultipleAsRead,
  getUnreadCount,
  
  // In-app methods
  registerDeviceForUser,
  sendNotificationToUser,
  getNotificationsForUser,
  sendLoginNotification,
  sendPasswordResetNotification,
  sendUsernameChangeNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markMultipleNotificationsAsRead,
  getUnreadNotificationCount
};