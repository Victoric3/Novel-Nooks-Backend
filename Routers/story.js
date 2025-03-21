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
  getEbooksForUserEndPoint,
  checkStoryUpdates
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
router.get("/", validateSession, getAllStories);
router.get("/:id", validateSession, detailStory);
router.get("/:slug/edit", validateSession, editStoryPage);
router.post("/:id/like", validateSession, likeStory);
router.put("/:id/rate", validateSession, rateStory);
router.delete("/:slug/delete", validateSession, deleteStory);

router.get("/user/get", validateSession, getEbooksForUserEndPoint);

// Add route for checking story updates
router.get("/:id/check-updates", validateSession, checkStoryUpdates);

module.exports = router;
