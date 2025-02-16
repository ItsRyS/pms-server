const express = require('express');
const router = express.Router();
const oldProjectsController = require('../controllers/oldProjectsController');

// ✅ ใช้ `uploadMiddleware` สำหรับอัปโหลดไฟล์
router.get('/', oldProjectsController.getOldProjects);
router.post('/', oldProjectsController.uploadMiddleware, oldProjectsController.uploadFileToSupabase, oldProjectsController.addOldProject);
router.put('/:id', oldProjectsController.uploadMiddleware, oldProjectsController.uploadFileToSupabase, oldProjectsController.updateOldProject);
router.delete('/:id', oldProjectsController.deleteOldProject);

// ✅ Middleware จัดการ Error
router.use((err, req, res) => {
  console.error('Old Project Route Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Error processing old project request',
      status: err.status || 500,
    },
  });
});

module.exports = router;
