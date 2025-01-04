const FCMService = require("../services/firebase-service");
const asyncErrorWrapper = require("express-async-handler");
const Notification = require("../Models/notification");

// Get unread notifications only
const getUnreadNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
      read: false,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error",
    });
  }
};

// Get all notifications (both read and unread)
const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100); // Adjust limit as needed

    res.status(200).json({
      success: true,
      data: notifications,
      total: notifications.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: "Internal server error",
    });
  }
};

// Mark single notification as read
const markAsRead = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipient: req.user.id,
    },
    { read: true },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  res.status(200).json({
    success: true,
    data: notification,
  });
});

// Mark all as read
const markAllAsRead = asyncErrorWrapper(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user.id, read: false },
    { read: true }
  );

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
    updatedCount: result.modifiedCount,
  });
});

// Delete notification
const deleteNotification = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  const result = await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: req.user.id,
  });

  if (!result) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted",
  });
});

const createNotification = async (
  recipientId,
  type,
  title,
  message,
  data = {},
  timeInterval = 10 * 60 * 1000
) => {
  try {
    // Check for duplicate notifications
    const existingNotification = await Notification.findOne({
      recipient: recipientId,
      type,
      createdAt: { $gte: new Date(Date.now() - timeInterval) },
    });

    if (existingNotification) {
      console.log("Duplicate notification prevented");
      return null;
    }

    // Create notification
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data: {
        ...data,
        route: data.route || "notifications",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      createdAt: new Date(),
    });

    console.log("created notification: ", notification)

    // Prepare and send FCM message
    if (data.fcmToken) {
      const fcmMessage = {
        message: {
          token: data.fcmToken,
          notification: {
            title,
            body: message,
          },
          data: {
            route: data.route || "notifications",
            type: type,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            id: notification._id.toString(),
            message: message,
          },
          android: {
            priority: "high",
            notification: {
              sound: "default",
            },
          },
        },
      };

      await FCMService.sendFcmNotification(fcmMessage);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

const sendNotification = async (req, res) => {
  const {
    type,
    title,
    message,
    data = {},
    timeInterval,
  } = req.body;
  try {
    await createNotification(
      req.user.id,
      type,
      title,
      message,
      data,
      timeInterval
    );
    res.status(200).json({
      message: "successfully created notification",
    });
  } catch (err) {
    res.status(500).json({
      errorMessage: "internal server error",
    });
  }
};

module.exports = {
  getUnreadNotifications,
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  sendNotification,
};
