const express = require("express")
const router = express.Router() ;

const { getStorySearchSuggestions } = require('../Controllers/searchSuggestion')
const {validateSession} = require("../Middlewares/Authorization/auth")

router.get('/searchSuggestion', validateSession, getStorySearchSuggestions);

module.exports = router