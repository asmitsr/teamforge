const express = require('express');
const { createCaptcha } = require('../utils/captcha');

const router = express.Router();

// GET /api/captcha -> { captchaId, question }
// The answer is stored server-side only and is never sent to the client.
router.get('/', (req, res) => res.json(createCaptcha()));

module.exports = router;
