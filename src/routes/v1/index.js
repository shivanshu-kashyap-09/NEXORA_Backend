const express = require('express');
const router = express.Router();
const identityModule = require('../../modules/identity');

// Mount Authentication & Identity Routes
router.use('/auth', identityModule.routes);

module.exports = router;
