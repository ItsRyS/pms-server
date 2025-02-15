const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateJWT } = require('../middleware/authMiddleware');
const { uploadProfile } = require('../config/multer');

router.get('/me', authenticateJWT, userController.getCurrentUser);
router.put('/:id', authenticateJWT, userController.updateUser);
router.post(
  '/upload-profile-image',
  authenticateJWT,
  uploadProfile.single('profileImage'),
  userController.uploadProfileImage
);

// Other routes
router.get('/', userController.getAllUsers);
router.post('/', userController.createUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
