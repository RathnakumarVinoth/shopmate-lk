const express = require("express");

const { shopLogin } = require("../controllers/shopAuthController");

const router = express.Router();

router.post("/login", shopLogin);

module.exports = router;
