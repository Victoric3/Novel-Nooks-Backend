const CustomError = require("../../Helpers/error/CustomError");
const User = require("../../Models/user");
const jwt = require("jsonwebtoken");
const {
  isTokenIncluded,
  getAccessTokenFromCookies,
} = require("../../Helpers/auth/tokenHelpers");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const getAccessToRoute = async (req, res, next) => {
  try {
    // console.log("hit get access token route");
    const { JWT_SECRET_KEY } = process.env;

    if (!isTokenIncluded(req)) {
      console.log(req.cookies);
      return next(new CustomError("No token added ", 400));
    }

    const accessToken = getAccessTokenFromCookies(req);
    const decoded = jwt.verify(accessToken, JWT_SECRET_KEY);

    const user = await User.findById(decoded.id);

    if (!user || user?.tokenVersion !== decoded?.tokenVersion) {
      return res.status(401).json({
        errorMessage: "You are not authorized to access this route",
        status: "failed",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    return next(
      res
        .status(500)
        .json({ message: "internal server error", status: "failed" }),
    );
  }
};

const validateSession = async (req, res, next) => {
  try {
    const token = getAccessTokenFromCookies(req);
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const user = await User.findById(decoded.id);

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        status: "failed",
        errorMessage: "User not found or token invalid",
      });
    }

    // Clean up expired sessions first
    await user.cleanupSessions();

    if (!user.validateSession(token)) {
      return res.status(401).json({
        status: "failed",
        errorMessage: "Invalid or expired session",
      });
    }

    // Update session last active time
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const session = user.sessions.find((s) => s.token === hashedToken);

    if (session) {
      session.lastActive = new Date();

      // Check if it's time for daily voucher bonus
      const now = new Date();
      const lastVoucherTime = user.lastVoucherTime || new Date(0);
      const hoursSinceLastVoucher = (now - lastVoucherTime) / (1000 * 60 * 60);

      // If more than 24 hours have passed since last voucher bonus
      if (hoursSinceLastVoucher >= 24) {
        // Add 10 vouchers
        user.vouchers += 10;
        // Update last voucher time
        user.lastVoucherTime = now;
        console.log(
          `Daily bonus: Added 10 vouchers to user ${user.username}. New total: ${user.vouchers}`,
        );
      }

      await user.save();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({
      status: "failed",
      errorMessage: "Network Error",
    });
  }
};

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute
  keyGenerator: (req) => {
    // Use the user object to identify the user
    return req.user.username; // Adjust this based on your user object structure
  },
});

// Add this middleware function if not already present

const isAdmin = (req, res, next) => {
  try {
    // Check if user exists and has admin role
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error checking admin status",
    });
  }
};

module.exports = { getAccessToRoute, apiLimiter, validateSession, isAdmin };
