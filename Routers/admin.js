const express = require("express");
const { validateSession, isAdmin } = require("../Middlewares/Authorization/auth");
const {
  addFeaturedBook,
  removeFeaturedBook,
  listFeaturedBooks,
  getRandomFeaturedBook
} = require("../Controllers/admin");

const router = express.Router();

// Protect all routes with authentication
router.use(validateSession);

// Admin only routes
router.post("/featured", isAdmin, addFeaturedBook);
router.delete("/featured", isAdmin, removeFeaturedBook);
router.get("/featured", isAdmin, listFeaturedBooks);

// This route can be accessed by all authenticated users
router.get("/random-featured", getRandomFeaturedBook);

module.exports = router;