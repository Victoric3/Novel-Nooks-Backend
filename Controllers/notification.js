const FCMService = require("../services/firebase-service");
const asyncErrorWrapper = require("express-async-handler");
const Notification = require("../Models/notification");
const User = require('../Models/user');
const catchAsync = require('../Helpers/error/catchAsync');

/**
 * Enhanced function to extract the most relevant FCM token from a user
 * Checks multiple sources in order of reliability:
 * 1. Direct fcmToken field
 * 2. Most recent active session with a valid FCM token
 * 3. Most recent device in deviceInfo array with a valid FCM token
 * 
 * @param {Object} user - User document from MongoDB
 * @returns {String|null} The FCM token or null if none found
 */
const extractFcmToken = (user) => {
  if (!user) return null;
  
  // 1. Check if user has fcmToken directly
  if (user.fcmToken) return user.fcmToken;
  
  // 2. Check active sessions first (most reliable and recent)
  if (user.sessions && Array.isArray(user.sessions) && user.sessions.length > 0) {
    const now = new Date();
    
    // Filter valid sessions (not expired, not unverified)
    const validSessions = user.sessions
      .filter(session => 
        session && 
        session.device && 
        session.device.fcmToken &&
        session.expiresAt > now &&
        session.unverified !== true
      )
      .sort((a, b) => {
        // Sort by lastActive time (most recent first)
        return new Date(b.lastActive || 0) - new Date(a.lastActive || 0);
      });
    
    if (validSessions.length > 0) {
      return validSessions[0].device.fcmToken;
    }
  }
  
  // 3. Check deviceInfo as fallback
  if (user.deviceInfo && Array.isArray(user.deviceInfo) && user.deviceInfo.length > 0) {
    // Get devices with token, sorted by last activity time
    const devicesWithToken = user.deviceInfo
      .filter(device => device && device.fcmToken)
      .sort((a, b) => {
        // Sort by lastActive if available, otherwise by array order (assuming newer at end)
        if (a.lastActive && b.lastActive) {
          return new Date(b.lastActive) - new Date(a.lastActive);
        }
        return 1; // Keep original order if no lastActive
      });
    
    if (devicesWithToken.length > 0) {
      return devicesWithToken[0].fcmToken;
    }
  }
  
  return null;
};

// Get unread notifications with pagination
const getUnreadNotifications = asyncErrorWrapper(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const [notifications, count] = await Promise.all([
      Notification.find({
        recipient: req.user.id,
        read: false
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
      Notification.countDocuments({
        recipient: req.user.id,
        read: false
      })
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching unread notifications:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Get all notifications with filtering and pagination
const getAllNotifications = asyncErrorWrapper(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const type = req.query.type;
  const readStatus = req.query.read === 'true' ? true : (req.query.read === 'false' ? false : undefined);

  try {
    // Build filter query
    const filter = { recipient: req.user.id };
    if (type) filter.type = type;
    if (readStatus !== undefined) filter.read = readStatus;

    const [notifications, count] = await Promise.all([
      Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
      Notification.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching all notifications:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Get notification count by type (for badges/counters)
const getNotificationCounts = asyncErrorWrapper(async (req, res) => {
  try {
    const counts = await Notification.aggregate([
      { $match: { recipient: mongoose.Types.ObjectId(req.user.id), read: false } },
      { $group: { _id: "$type", count: { $sum: 1 } } }
    ]);

    // Convert to more useful format
    const result = {
      totalUnread: 0,
      byType: {}
    };

    counts.forEach(item => {
      result.byType[item._id] = item.count;
      result.totalUnread += item.count;
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("Error fetching notification counts:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Mark single notification as read
const markAsRead = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: req.user.id
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Mark all notifications as read
const markAllAsRead = asyncErrorWrapper(async (req, res) => {
  try {
    const type = req.query.type;
    const filter = { recipient: req.user.id, read: false };
    
    if (type) filter.type = type;

    const result = await Notification.updateMany(filter, { read: true });

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Delete notification
const deleteNotification = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  try {
    const result = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user.id
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted"
    });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Delete multiple notifications
const deleteMultipleNotifications = asyncErrorWrapper(async (req, res) => {
  const { notificationIds } = req.body;

  try {
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of notification IDs"
      });
    }

    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      recipient: req.user.id
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} notifications deleted`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("Error deleting multiple notifications:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Delete all notifications (with optional type filter)
const deleteAllNotifications = asyncErrorWrapper(async (req, res) => {
  try {
    const type = req.query.type;
    const filter = { recipient: req.user.id };
    
    if (type) filter.type = type;

    const result = await Notification.deleteMany(filter);

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} notifications deleted`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("Error deleting all notifications:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

/**
 * Create and send a notification
 * @param {string} userId - User ID to receive notification
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data for the notification
 * @param {Object} deviceInfo - Device information
 * @param {number} delayInSeconds - Optional delay before sending (0 for immediate)
 * @returns {Promise<Object|null>} The created notification or null if failed
 */
const createNotification = async (
  userId,
  type,
  title,
  message,
  data = {},
  deviceInfo = null,
  delayInSeconds = 0
) => {
  try {
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found for notification`);
      return null;
    }
    
    // Get FCM token
    const fcmToken = extractFcmToken(user);
    
    // Create notification in database
    const notification = await Notification.create({
      recipient: userId,
      type,
      title,
      message,
      data,
      deviceInfo: deviceInfo || {},
      read: false,
      sentToDevice: false
    });

    // Only attempt to send if FCM is enabled and we have a token
    if (process.env.FCM_ENABLED === 'true' && fcmToken) {
      try {
        // Send with delay or immediately
        const sendFunc = async () => {
          await FCMService.sendFcmNotification({
            message: {
              token: fcmToken,
              notification: { 
                title, 
                body: message 
              },
              data: { 
                ...data,
                notificationId: notification._id.toString(),
                type,
                time: new Date().toISOString()
              },
              android: {
                priority: 'high',
                notification: {
                  sound: 'default',
                  clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                }
              }
            }
          });
          
          // Update notification to mark it as sent
          await Notification.findByIdAndUpdate(notification._id, { sentToDevice: true });
          
          console.log(`Notification sent to user ${userId}`);
        };

        if (delayInSeconds > 0) {
          setTimeout(sendFunc, delayInSeconds * 1000);
        } else {
          await sendFunc();
        }
      } catch (error) {
        console.error('Failed to send FCM notification:', error);
        // Continue execution even if FCM fails
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Send a notification from API request
const sendNotification = asyncErrorWrapper(async (req, res) => {
  const {
    recipientId, // Optional, use current user if not provided
    type,
    title,
    message,
    data = {},
    delayInSeconds = 0
  } = req.body;
  
  try {
    // Validate required fields
    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Type, title and message are required"
      });
    }
    
    // Use authenticated user ID if recipientId not provided
    const userId = recipientId || req.user.id;
    
    // Admin check if sending to other users
    if (recipientId && recipientId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Not authorized to send notifications to other users"
      });
    }
    
    // Extract device info
    const deviceInfo = {
      deviceType: req.headers['x-device-type'] || 'unknown',
      os: req.headers['x-device-os'] || 'unknown',
      appVersion: req.headers['x-app-version'] || 'unknown',
      uniqueIdentifier: req.headers['x-device-id'] || 'unknown',
      ipAddress: req.ip
    };
    
    // Create and send notification
    const notification = await createNotification(
      userId,
      type,
      title,
      message,
      data,
      deviceInfo,
      delayInSeconds
    );
    
    if (!notification) {
      return res.status(500).json({
        success: false,
        message: "Failed to create notification"
      });
    }
    
    res.status(201).json({
      success: true,
      message: "Notification sent successfully",
      data: notification
    });
  } catch (err) {
    console.error("Error sending notification:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

// Test notification endpoint
const testNotification = catchAsync(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    const fcmToken = extractFcmToken(user);
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "No FCM token found for this user"
      });
    }
    
    // Get device info from request
    const deviceInfo = {
      deviceType: req.headers['x-device-type'] || 'unknown',
      os: req.headers['x-device-os'] || 'unknown',
      appVersion: req.headers['x-app-version'] || 'unknown',
      uniqueIdentifier: req.headers['x-device-id'] || req.body.uniqueIdentifier || 'unknown',
      ipAddress: req.ip
    };
    
    const notification = await createNotification(
      user._id,
      "TEST",
      "Test Notification",
      "This is a test notification from Novel Nooks",
      {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        screen: "notifications"
      },
      deviceInfo
    );
    
    if (!notification) {
      return res.status(500).json({
        success: false,
        message: "Failed to send test notification"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Test notification sent successfully",
      data: notification
    });
  } catch (err) {
    console.error("Error sending test notification:", err);
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error"
    });
  }
});

module.exports = {
  getUnreadNotifications,
  getAllNotifications,
  getNotificationCounts,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteMultipleNotifications,
  deleteAllNotifications,
  createNotification,
  sendNotification,
  testNotification
};
