const express = require("express");

const router = express.Router();

const storyRoute = require("./story");
const userRoute = require("./user");
const scheduleCallRoute = require("./scheduleCall");
const premiumRoute = require("./premium");
const commentRoute = require("./comment");
const sitemapRoute = require("./sitemapRouter");

router.use("/story", storyRoute);
router.use("/user", userRoute);
router.use("/call", scheduleCallRoute);
router.use("/premium", premiumRoute);
router.use("/comment", commentRoute);
router.use("/", sitemapRoute);

module.exports = router;
