const express = require("express")
const router = express.Router() ;

const { getTitleSuggestions } = require('../Controllers/searchSuggestion')

router.get('/searchSuggestion', getTitleSuggestions);

module.exports = router