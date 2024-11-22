const express = require("express");
const {
  updateVouchers,
  updateCoins,
  giftToAuthor,
  coinsToVouchers,
} = require("../Controllers/premiumRestrictions");
const router = express.Router();
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

router.post("/updateVouchers", getAccessToRoute, updateVouchers);
router.post("/updateCoins", getAccessToRoute, updateCoins);
router.post("/giftToAuthor", getAccessToRoute, giftToAuthor);
router.post("/coinsToVouchers", getAccessToRoute, coinsToVouchers);

module.exports = router;
