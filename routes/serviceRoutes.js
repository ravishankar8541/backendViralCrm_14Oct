const router = require('express').Router();
const auth = require('../middleware/auth');
const { getServices, createService, updateService, deleteService } = require('../controllers/serviceController');

router.use(auth);
router.get('/', getServices);
router.post('/', createService);
router.patch('/:id', updateService);
router.delete('/:id', deleteService);

module.exports = router;
