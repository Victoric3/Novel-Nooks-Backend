const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { registerDeviceForUser } = require('../Controllers/notification');

dotenv.config({ path: "./config.env" });

const UserSchema = new mongoose.Schema(
  {
    firstname: String,
    lastname: String,
    birthdate: {
      type: String,
      default: 'Not available'
    },
    interests: {
      type: [String],
      default: [
        "Romance",
        "Werewolf",
        "Mafia",
        "System",
        "Fantasy",
        "Urban",
        "YA/TEEN",
        "Paranormal",
        "Mystery/Thriller",
        "Eastern",
        "Games",
        "History",
        "MM Romance",
        "Sci-Fi",
        "War",
        "Other"
      ],
    },
    temporary: Boolean,
    isAnonymous: {
      type: Boolean,
      default: false
    },
    anonymousId: {
      type: String,
      unique: true
    },
    accountType: {
      type: String,
      enum: ['anonymous', 'registered', 'converted'],
      default: 'registered'
    },
    username: {
      type: String,
      required: [true, "Please provide a username"],
    },
    photo: {
      type: String,
      default:
        "https://drive.google.com/uc?id=1RhzpswcIei9GQ1ecuhjkSRGJwIeWHHf1",
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please fill a valid email address",
      ],
    },
    emailStatus: {
      type: String,
      default: "pending",
    },
    password: {
      type: String,
      minlength: [6, "Please provide a password with min length : 6 "],
      required: [true, "Please provide a password"],
      select: false,
    },
    role: {
      type: String,
      default: "user",
      enum: ["user", "admin", "employee"],
    },
    verificationToken: {
      type: String,
      default: "",
    },
    verificationTokenExpires: {
      type: Number,
      default: -1,
    },
    readList: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Story",
      },
    ],
    readListLength: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Story",
      },
    ],
    preferences: {
      type: [Object],
      default: [],
    },
    location: {
      type: [Object],
      required: true,
    },
    ipAddress: {
      type: [String],
      required: true,
    },
    deviceInfo: {
      type: [Object],
      required: true,
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    sessions: [{
      token: String,
      device: Object,
      lastActive: Date,
      expiresAt: Date,
      ipAddress: String,
      unverified: Boolean
    }],
    validTokens: [String],
    maxSessions: {
      type: Number,
      default: 5
    },
    passwordHistory: {
      type: [String],
      select: false,
      default: []
    },
    googleId: {
      type: String,
      sparse: true,
      index: true
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local'
    },
    vouchers: {
      type: Number,
      default: 0
    },
    lastVoucherTime: {
      type: Date,
      default: null
    },
    coins: {
      type: Number,
      default: 0
    },
    free: {
      type: Boolean,
      default: true
    },
    purchased: {
      type: [Object],
      default: []
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {

  if (!this.isModified("password")) {
    next()
  }

  const salt = await bcrypt.genSalt(10)

  this.password = await bcrypt.hash(this.password, salt)
  next();

})


UserSchema.methods.generateJwtFromUser = function () {

  const { JWT_SECRET_KEY, JWT_EXPIRE } = process.env;

  payload = {
    id: this._id,
    username: this.username,
    email: this.email
  }

  const token = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: JWT_EXPIRE })

  return token
}

UserSchema.methods.getResetPasswordTokenFromUser = function () {

  const randomHexString = crypto.randomBytes(20).toString("hex")

  const resetPasswordToken = crypto.createHash("SHA256").update(randomHexString).digest("hex")

  this.resetPasswordToken = resetPasswordToken

  this.resetPasswordExpire = Date.now() + 1200000

  return resetPasswordToken
}

UserSchema.methods.createToken = function () {
  const verificationToken = Math.floor(100000 + Math.random() * 900000).toString()
  //hash the reset token

  this.verificationToken = crypto.createHash('shake256').update(verificationToken).digest('hex')
  this.verificationTokenExpires = Date.now() + 20 * 60 * 1000;
  return verificationToken
}

// Add password history method
UserSchema.methods.isPasswordPreviouslyUsed = async function (newPassword) {
  const user = await this.model('User').findById(this._id).select('+passwordHistory');
  if (!user.passwordHistory) return false;

  for (const oldPassword of user.passwordHistory) {
    if (await bcrypt.compare(newPassword, oldPassword)) {
      return true;
    }
  }
  return false;
};

// Add session management methods
UserSchema.methods.addSession = async function (sessionData) {
  this.sessions = this.sessions || [];
  this.validTokens = this.validTokens || [];

  const now = Date.now();
  const expiredSessionTokens = this.sessions
    .filter(session => session.expiresAt <= now)
    .map(session => session.token);
  // Remove expired sessions
  this.sessions = this.sessions.filter(session =>
    session.expiresAt > now
  );
  this.validTokens = this.validTokens.filter(token =>
    !expiredSessionTokens.includes(token)
  );

  // Check max sessions
  if (this.sessions.length >= this.maxSessions) {
    // Find the oldest session
    const oldestSession = this.sessions[0];
    const oldestToken = oldestSession.token;

    // Remove the oldest session
    this.sessions.shift();

    // Find and remove the matching token from validTokens
    const tokenIndex = this.validTokens.findIndex(token => token === oldestToken);
    if (tokenIndex !== -1) {
      this.validTokens.splice(tokenIndex, 1);
    }
  }

  this.sessions.push({
    ...sessionData,
    lastActive: new Date(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000) // 30 days
  });
  
  // Register device for notifications if device info is provided
  if (sessionData && sessionData.device) {
    try {
      let deviceInfo;
      
      // Handle the device info whether it's a string or object
      if (typeof sessionData.device === 'string') {
        deviceInfo = JSON.parse(sessionData.device);
      } else {
        deviceInfo = sessionData.device;
      }
      
      // Check if we have the required fields
      if (deviceInfo.uniqueIdentifier && deviceInfo.fcmToken) {
        const Device = require('../Models/device');
        
        // Look for an existing device with this unique identifier for this user
        const existingDevice = await Device.findOne({ 
          user: this._id,
          uniqueIdentifier: deviceInfo.uniqueIdentifier
        });
        
        if (existingDevice) {
          // Update the existing device
          existingDevice.fcmToken = deviceInfo.fcmToken;
          existingDevice.deviceType = deviceInfo.deviceType || 'unknown';
          existingDevice.os = deviceInfo.os || 'unknown';
          existingDevice.appVersion = deviceInfo.appVersion || 'unknown';
          existingDevice.lastUsed = new Date();
          existingDevice.isActive = true;
          
          // Add the session token to the device's sessions
          if (sessionData.token && !existingDevice.sessionIds.includes(sessionData.token)) {
            existingDevice.sessionIds.push(sessionData.token);
          }
          
          await existingDevice.save();
          console.log(`Updated existing device: ${existingDevice._id}`);
        } else {
          // Create a new device
          const newDevice = new Device({
            user: this._id,
            fcmToken: deviceInfo.fcmToken,
            deviceType: deviceInfo.deviceType || 'unknown',
            os: deviceInfo.os || 'unknown',
            appVersion: deviceInfo.appVersion || 'unknown',
            uniqueIdentifier: deviceInfo.uniqueIdentifier,
            sessionIds: sessionData.token ? [sessionData.token] : []
          });
          
          await newDevice.save();
          console.log(`Created new device: ${newDevice._id}`);
          
          // Check device limit for this user
          await Device.enforceDeviceLimit(this._id, this.maxSessions);
        }
      } else {
        console.warn('Device info missing required fields: uniqueIdentifier or fcmToken');
      }
    } catch (error) {
      console.warn(`Failed to register device: ${error.message}`);
      // Don't fail the session creation if device registration fails
    }
  }
};

UserSchema.methods.validateSession = function (token) {
  return this.validTokens && this.validTokens.includes(
    crypto.createHash('sha256').update(token).digest('hex')
  );
};

UserSchema.methods.cleanupSessions = async function () {
  const now = Date.now();

  // Find expired sessions
  const expiredSessions = this.sessions.filter(session =>
    session.expiresAt <= now
  );

  if (expiredSessions.length > 0) {
    // Get tokens from expired sessions
    const expiredTokens = expiredSessions.map(session => session.token);

    // Remove expired sessions
    this.sessions = this.sessions.filter(session =>
      session.expiresAt > now
    );

    // Remove expired tokens from validTokens
    this.validTokens = this.validTokens.filter(token =>
      !expiredTokens.includes(token)
    );

    await this.save();
    return true;
  }

  return false;
};

// Add pre-find middleware to clean sessions
UserSchema.pre('find', async function () {
  const users = await this.model.find(this.getQuery());
  for (const user of users) {
    await user.cleanupSessions();
  }
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
