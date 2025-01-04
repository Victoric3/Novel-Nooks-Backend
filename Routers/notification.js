const express = require("express");
const {
  getUnreadNotifications,
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotification
} = require("../Controllers/notification");
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

const router = express.Router();

router.use(getAccessToRoute);

// Get notifications
router.get("/unread", getUnreadNotifications);
router.get("/", getAllNotifications);

// Manage notifications
router.put("/:notificationId/read", markAsRead);
router.put("/read-all", markAllAsRead);
router.post("/send", sendNotification);
router.delete("/:notificationId", deleteNotification);

module.exports = router;