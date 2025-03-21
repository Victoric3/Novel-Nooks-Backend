const express = require("express");

const router = express.Router();

const storyRoute = require("./story");
const userRoute = require("./user");
const scheduleCallRoute = require("./scheduleCall");
const premiumRoute = require("./premium");
const commentRoute = require("./comment");
const sitemapRoute = require("./sitemapRouter");
const searchSuggestionsRoute = require("./searchSuggestions");
const notification = require("./notification");
const userPreferences = require("./userPreference");

router.use("/userPreferences", userPreferences);
router.use("/notification", notification);
router.use("/ebook", storyRoute);
router.use("/search", searchSuggestionsRoute);
router.use("/user", userRoute);
router.use("/call", scheduleCallRoute);
router.use("/premium", premiumRoute);
router.use("/comment", commentRoute);
router.use("/", sitemapRoute);

module.exports = router;
