const express = require('express');
const router = express.Router();
const projectRequestsController = require('../controllers/projectRequestsController');

router.post('/create', projectRequestsController.createRequest);
router.get('/status', projectRequestsController.getStudentRequests);
router.get('/all', projectRequestsController.getAllRequests);
router.delete('/delete/:requestId', projectRequestsController.deleteRequest);
module.exports = router;
