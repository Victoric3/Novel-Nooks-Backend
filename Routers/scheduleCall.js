const express = require("express")
const {
    scheduleCall
} = require("../Controllers/scheduleCall");
const router = express.Router() ;

router.post("/scheduleCall", scheduleCall)

module.exports = router