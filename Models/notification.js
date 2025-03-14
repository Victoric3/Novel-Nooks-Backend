const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        "STORY_UPDATE", 
        "NEW_LOGIN", 
        "PURCHASE", 
        "SYSTEM", 
        "ACHIEVEMENT", 
        "VOUCHER", 
        "COINS", 
        "SUBSCRIPTION",
        "AUTHOR_UPDATE",
        "READING_REMINDER",
        "TEST"
      ],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    data: {
      type: Object,
      default: {}
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    sentToDevice: {
      type: Boolean,
      default: false
    },
    deviceInfo: {
      deviceType: String,
      os: String,
      appVersion: String,
      uniqueIdentifier: String,
      ipAddress: String
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  }
);

// Create TTL index to automatically delete old notifications after 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model("Notification", NotificationSchema);
module.exports = Notification;