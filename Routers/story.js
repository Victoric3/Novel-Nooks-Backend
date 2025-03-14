const express = require("express");
const { validateSession } = require("../Middlewares/Authorization/auth");
const { handleImageUpload, handleStoryUpload } = require("../Helpers/Libraries/handleUpload");

const {
  addStory,
  addImage,
  getAllStories,
  detailStory,
  likeStory,
  rateStory,
  editStoryPage,
  editStory,
  deleteStory,
} = require("../Controllers/story");

const router = express.Router();

// Single image upload for editor
router.post("/upload", [validateSession, handleImageUpload], addImage);

// Story routes with PDF support - uses our enhanced handler
router.post("/", [
  validateSession,
  handleStoryUpload,
  addStory
]);

// Edit story with PDF support
router.put("/:slug/edit", [
  validateSession,
  handleStoryUpload,
  editStory
]);

// Other routes remain unchanged
router.get("/", getAllStories);
router.get("/:slug", validateSession, detailStory);
router.get("/:slug/edit", [validateSession], editStoryPage);
router.post("/:slug/like", validateSession, likeStory);
router.post("/:slug/rate", validateSession, rateStory);
router.delete("/:slug/delete", [validateSession], deleteStory);

module.exports = router;
