const express = require("express")
const {
    updateVouchers
} = require("../Controllers/premiumRestrictions");
const router = express.Router() ;
const { getAccessToRoute } = require("../Middlewares/Authorization/auth");

router.post("/updateVouchers", getAccessToRoute, updateVouchers)

module.exports = router