const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fcmToken: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    required: true
  },
  os: String,
  appVersion: String,
  uniqueIdentifier: {
    type: String,
    required: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sessionIds: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// Create a compound index on user + uniqueIdentifier for faster lookups
deviceSchema.index({ user: 1, uniqueIdentifier: 1 }, { unique: true });

// Remove the unique constraint on fcmToken since it can change
deviceSchema.index({ fcmToken: 1 });

// Method to link a session to this device
deviceSchema.methods.linkSession = function(sessionId) {
  if (sessionId && !this.sessionIds.includes(sessionId)) {
    this.sessionIds.push(sessionId);
  }
  this.lastUsed = new Date();
  this.isActive = true;
  return this.save();
};

// Add a new method to update FCM token and device details
deviceSchema.methods.updateDetails = function(details) {
  if (details.fcmToken) this.fcmToken = details.fcmToken;
  if (details.deviceType) this.deviceType = details.deviceType;
  if (details.os) this.os = details.os;
  if (details.appVersion) this.appVersion = details.appVersion;
  this.lastUsed = new Date();
  this.isActive = true;
  return this.save();
};

// Add a static method to find or create a device
deviceSchema.statics.findOrCreateDevice = async function(userId, deviceDetails) {
  // Parse deviceDetails if it's a string
  if (typeof deviceDetails === 'string') {
    try {
      deviceDetails = JSON.parse(deviceDetails);
    } catch (err) {
      throw new Error('Invalid device details format');
    }
  }
  
  // Validate required fields
  if (!deviceDetails.uniqueIdentifier || !deviceDetails.fcmToken) {
    throw new Error('Device details missing required fields');
  }
  
  // Try to find existing device
  let device = await this.findOne({
    user: userId,
    uniqueIdentifier: deviceDetails.uniqueIdentifier
  });
  
  if (device) {
    // Update existing device
    device.fcmToken = deviceDetails.fcmToken;
    device.deviceType = deviceDetails.deviceType || device.deviceType;
    device.os = deviceDetails.os || device.os;
    device.appVersion = deviceDetails.appVersion || device.appVersion;
    device.lastUsed = new Date();
    device.isActive = true;
    
    await device.save();
  } else {
    // Create new device
    device = new this({
      user: userId,
      fcmToken: deviceDetails.fcmToken,
      deviceType: deviceDetails.deviceType || 'unknown',
      os: deviceDetails.os || 'unknown',
      appVersion: deviceDetails.appVersion || 'unknown',
      uniqueIdentifier: deviceDetails.uniqueIdentifier,
      sessionIds: []
    });
    
    await device.save();
    
    // Enforce device limit
    await this.enforceDeviceLimit(userId);
  }
  
  return device;
};

// Method to handle device limit per user
deviceSchema.statics.enforceDeviceLimit = async function(userId, maxDevices = 5) {
  const count = await this.countDocuments({ user: userId });
  
  if (count > maxDevices) {
    // Find and remove oldest devices to maintain the limit
    const oldestDevices = await this.find({ user: userId })
      .sort({ lastUsed: 1 })
      .limit(count - maxDevices);
      
    if (oldestDevices.length > 0) {
      const oldestDeviceIds = oldestDevices.map(device => device._id);
      await this.deleteMany({ _id: { $in: oldestDeviceIds } });
    }
  }
};

// Add a function to synchronize devices from user sessions

deviceSchema.statics.syncFromUserSessions = async function(userId) {
  const User = require('../Models/user');
  const user = await User.findById(userId);
  
  if (!user || !user.sessions || user.sessions.length === 0) {
    return { created: 0, updated: 0, removed: 0 };
  }
  
  const results = {
    created: 0,
    updated: 0,
    removed: 0
  };
  
  // Process each session with device info
  for (const session of user.sessions) {
    if (!session.device) continue;
    
    try {
      let deviceInfo;
      
      // Parse device info if it's a string
      if (typeof session.device === 'string') {
        deviceInfo = JSON.parse(session.device);
      } else {
        deviceInfo = session.device;
      }
      
      if (!deviceInfo.uniqueIdentifier || !deviceInfo.fcmToken) {
        continue;
      }
      
      // Look for existing device
      const existingDevice = await this.findOne({
        user: userId,
        uniqueIdentifier: deviceInfo.uniqueIdentifier
      });
      
      if (existingDevice) {
        // Update existing device
        existingDevice.fcmToken = deviceInfo.fcmToken;
        existingDevice.deviceType = deviceInfo.deviceType || existingDevice.deviceType;
        existingDevice.os = deviceInfo.os || existingDevice.os;
        existingDevice.appVersion = deviceInfo.appVersion || existingDevice.appVersion;
        existingDevice.lastUsed = new Date();
        existingDevice.isActive = true;
        
        // Add session token if not already present
        if (session.token && !existingDevice.sessionIds.includes(session.token)) {
          existingDevice.sessionIds.push(session.token);
        }
        
        await existingDevice.save();
        results.updated++;
      } else {
        // Create new device
        const newDevice = new this({
          user: userId,
          fcmToken: deviceInfo.fcmToken,
          deviceType: deviceInfo.deviceType || 'unknown',
          os: deviceInfo.os || 'unknown',
          appVersion: deviceInfo.appVersion || 'unknown',
          uniqueIdentifier: deviceInfo.uniqueIdentifier,
          sessionIds: session.token ? [session.token] : []
        });
        
        await newDevice.save();
        results.created++;
      }
    } catch (error) {
      console.warn(`Failed to process device from session: ${error.message}`);
    }
  }
  
  // Remove devices with no matching sessions
  const userSessionTokens = user.sessions.map(s => s.token).filter(Boolean);
  const allUserDevices = await this.find({ user: userId });
  
  for (const device of allUserDevices) {
    // Check if any of this device's sessions exist in user's valid sessions
    const hasValidSession = device.sessionIds.some(sid => userSessionTokens.includes(sid));
    
    if (!hasValidSession && device.sessionIds.length > 0) {
      // Device has sessions but none are valid anymore
      device.isActive = false;
      await device.save();
      results.removed++;
    }
  }
  
  return results;
};

module.exports = mongoose.model('Device', deviceSchema);