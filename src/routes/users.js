const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { uploadProfile } = require('../config/multer');
//console.log("🔍 Debug userController:", userController);

const { verifyToken } = require('../middleware/authMiddleware');

router.get('/me', verifyToken, userController.getCurrentUser);
router.put('/:id', verifyToken, userController.updateUser);
router.post(
  '/upload-profile-image',
  verifyToken,
  uploadProfile.single('profileImage'),
  userController.uploadProfileImage
);
router.get('/', verifyToken, userController.getAllUsers);
router.post('/', verifyToken, userController.createUser);
router.delete('/:id', verifyToken, userController.deleteUser);


module.exports = router;
