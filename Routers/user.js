const express = require("express");

const {
  testmail,
  register,
  login,
  forgotpassword,
  resetpassword,
  getPrivateData,
  confirmEmailAndSignUp,
  resendVerificationToken,
  unUsualSignIn,
  googleSignIn,
  changeUserName,
  verificationRateLimit,
  signOut,
} = require("../Controllers/auth");

const {
  addStoryToReadList,
  readListPage,
  checkStoryInReadList,
  getLikedStoriesPage
} = require("../Controllers/user");

const { anonymousRateLimit, getAnonymousSession } = require("../Helpers/auth/anonymousHelper");

const { validateSession } = require("../Middlewares/Authorization/auth");

const router = express.Router();

router.post("/testmail", testmail);
router.post("/register", register);
router.post("/googleSignIn", googleSignIn);
router.post("/resendVerificationToken", verificationRateLimit, resendVerificationToken);
router.patch("/confirmEmailAndSignUp", confirmEmailAndSignUp);
router.patch("/unUsualSignIn", unUsualSignIn);
router.post("/anonymous", anonymousRateLimit, getAnonymousSession);

router.post("/login", login);

router.post("/forgotpassword", forgotpassword);

router.post("/changeUserName", validateSession, changeUserName);

router.put("/resetpassword", resetpassword);

router.get("/private", validateSession, getPrivateData);

router.post("/:ebookId/addStoryToReadList", validateSession, addStoryToReadList)

router.get("/readList", validateSession, readListPage)

router.get("/readList/check/:ebookId", validateSession, checkStoryInReadList);

router.get("/favorites", validateSession, getLikedStoriesPage);

router.get("/favorites", validateSession, signOut);


module.exports = router;
