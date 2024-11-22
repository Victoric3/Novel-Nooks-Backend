const express = require("express");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../Controllers/notification");
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

const router = express.Router();

router.use(getAccessToRoute);

router.get("/", getNotifications);
router.put("/:notificationId/read", markAsRead);
router.put("/read-all", markAllAsRead);
router.delete("/:notificationId", deleteNotification);

module.exports = router;