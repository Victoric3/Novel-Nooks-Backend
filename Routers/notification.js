const express = require("express");
const {
  getUnreadNotifications,
  getAllNotifications,
  getNotificationCounts,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteMultipleNotifications,
  deleteAllNotifications,
  sendNotification,
  testNotification
} = require("../Controllers/notification");
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

const router = express.Router();

// Protect all routes
router.use(getAccessToRoute);

// GET routes - fetch notifications
router.get("/unread", getUnreadNotifications);
router.get("/all", getAllNotifications);
router.get("/counts", getNotificationCounts);

// PUT routes - update notifications
router.put("/:notificationId/read", markAsRead);
router.put("/read-all", markAllAsRead);

// POST routes - create notifications
router.post("/send", sendNotification);
router.post("/test", testNotification);

// DELETE routes - remove notifications
router.delete("/:notificationId", deleteNotification);
router.delete("/", deleteAllNotifications);
router.post("/delete-multiple", deleteMultipleNotifications); // Using POST for array of IDs

module.exports = router;