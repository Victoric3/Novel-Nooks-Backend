const asyncErrorWrapper = require("express-async-handler");
const Notification = require("../Models/notification");

const getNotifications = asyncErrorWrapper(async (req, res) => {
  console.log("tried hitting this route")
  const notifications = await Notification.find({ recipient: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({
    success: true,
    data: notifications,
  });
});

const markAsRead = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: req.user.id,
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  notification.read = true;
  await notification.save();

  res.status(200).json({
    success: true,
    data: notification,
  });
});

const markAllAsRead = asyncErrorWrapper(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user.id, read: false },
    { read: true }
  );

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
  });
});

const deleteNotification = asyncErrorWrapper(async (req, res) => {
  const { notificationId } = req.params;

  await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: req.user.id,
  });

  res.status(200).json({
    success: true,
    message: "Notification deleted",
  });
});

// Helper function to create notifications
const createNotification = async (recipientId, type, title, message, data = {}) => {
  console.log(recipientId, type, title, message, data);
  return await Notification.create({
    recipient: recipientId,
    type,
    title,
    message,
    data,
  });
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
};