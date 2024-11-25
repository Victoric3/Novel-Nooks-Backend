const express = require("express");
const { handleImageUpload } = require("../Helpers/Libraries/handleUpload");
const { getAccessToRoute } = require('../Middlewares/Authorization/auth');
const {updateInterests, updatePhoto } = require("../Controllers/userPreferences")
// Router setup
const router = express.Router();

router.put('/update-photo', getAccessToRoute, handleImageUpload, updatePhoto);
router.put('/update-interests', getAccessToRoute, updateInterests);

module.exports = router;
