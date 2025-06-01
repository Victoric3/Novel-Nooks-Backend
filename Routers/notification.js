const express = require('express');
const router = express.Router();
const { validateSession } = require("../Middlewares/Authorization/auth");
const { 
  registerDevice, 
  sendNotification, 
  getNotificationHistory,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  markMultipleAsRead,
  notificationLimit 
} = require('../Controllers/notification');

router.use(validateSession);

router.post('/device/register', registerDevice);
router.post('/send', notificationLimit, sendNotification);
router.get('/history', getNotificationHistory);

router.patch('/read/:notificationId', markAsRead);
router.patch('/read-all', markAllAsRead);
router.get('/unread-count', getUnreadCount);
router.patch('/read-multiple', markMultipleAsRead);


module.exports = router;