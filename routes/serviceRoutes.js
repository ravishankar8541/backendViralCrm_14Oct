const router = require('express').Router();
const auth = require('../middleware/auth');
const { getServices, createService } = require('../controllers/serviceController');

router.use(auth);
router.get('/', getServices);
router.post('/', createService);

module.exports = router;
