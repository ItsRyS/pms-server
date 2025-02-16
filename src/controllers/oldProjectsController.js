const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');
const multer = require('multer');

// ✅ Middleware สำหรับอัปโหลดไฟล์
const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single('file');

// ✅ ฟังก์ชันอัปโหลดไฟล์ไปยัง Supabase Storage
exports.uploadFileToSupabase = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  try {
    const fileExtension = path.extname(req.file.originalname);
    const sanitizedFilename = `old_project_${Date.now()}${fileExtension}`;
    const filePath = `old_projects/${sanitizedFilename}`;

    // 🔥 อัปโหลดไฟล์ไปยัง Supabase Storage
    const { data, error } = await supabase.storage
      .from('upload')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

    if (error) throw error;

    req.fileUrl = `https://your-supabase-url.storage/v1/object/public/upload/${data.path}`;
    console.log(`✅ File uploaded successfully: ${req.fileUrl}`);

    next();
  } catch (error) {
    console.error('❌ Supabase Upload Error:', error.message);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// ✅ ฟังก์ชันเพิ่มโครงงานเก่า (บันทึก URL ของไฟล์ลง MySQL)
exports.addOldProject = async (req, res) => {
  const { old_project_name_th, old_project_name_eng, project_type, document_year } = req.body;

  if (!req.fileUrl) {
    return res.status(400).json({ message: 'File upload failed' });
  }

  try {
    const query = `
      INSERT INTO old_projects (old_project_name_th, old_project_name_eng, project_type, document_year, file_path)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.execute(query, [old_project_name_th, old_project_name_eng, project_type, document_year, req.fileUrl]);

    res.status(201).json({ message: 'Old project added successfully', filePath: req.fileUrl });
  } catch (error) {
    console.error('❌ Database Error:', error.message);
    res.status(500).json({ message: 'Database error' });
  }
};

// ✅ ฟังก์ชันดึงโครงงานเก่าทั้งหมด
exports.getOldProjects = async (req, res) => {
  try {
    const [projects] = await db.execute('SELECT * FROM old_projects ORDER BY document_year DESC');

    res.status(200).json(projects);
  } catch (error) {
    console.error('❌ Error fetching projects:', error.message);
    res.status(500).json({ message: 'Database query failed' });
  }
};

// ✅ ฟังก์ชันอัปเดตโครงงานเก่า
exports.updateOldProject = async (req, res) => {
  const { id } = req.params;
  const { old_project_name_th, old_project_name_eng, project_type, document_year } = req.body;

  try {
    // 🔍 ดึงข้อมูลโครงงานปัจจุบันจากฐานข้อมูล
    const [existingProject] = await db.execute('SELECT file_path FROM old_projects WHERE old_id = ?', [id]);

    if (existingProject.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    let fileUrl = existingProject[0].file_path;

    // ✅ ถ้ามีการอัปโหลดไฟล์ใหม่ ให้อัปโหลดไปยัง Supabase
    if (req.file) {
      console.log("📤 Uploading new file to Supabase...");

      const fileExtension = path.extname(req.file.originalname);
      const sanitizedFilename = `old_project_${Date.now()}${fileExtension}`;
      const filePath = `old_projects/${sanitizedFilename}`;

      // 🔥 ลบไฟล์เก่าก่อน (ถ้ามี)
      if (fileUrl) {
        const filePathToDelete = fileUrl.split('/').slice(-1)[0];
        await supabase.storage.from('upload').remove([`old_projects/${filePathToDelete}`]);
      }

      // 🔥 อัปโหลดไฟล์ใหม่
      const { data, error } = await supabase.storage
        .from('upload')
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

      if (error) throw error;

      fileUrl = `https://your-supabase-url.storage/v1/object/public/upload/${data.path}`;
      console.log(`✅ Updated file URL: ${fileUrl}`);
    }

    // 🔥 อัปเดตฐานข้อมูล
    await db.execute(
      `UPDATE old_projects
       SET old_project_name_th=?, old_project_name_eng=?, project_type=?, document_year=?, file_path=COALESCE(?, file_path)
       WHERE old_id = ?`,
      [old_project_name_th, old_project_name_eng, project_type, document_year, fileUrl, id]
    );

    res.status(200).json({ message: 'Old project updated successfully', filePath: fileUrl });

  } catch (error) {
    console.error('❌ Error updating project:', error.message);
    res.status(500).json({ message: 'Database update failed' });
  }
};

// ✅ ฟังก์ชันลบโครงงานเก่าและไฟล์จาก Supabase
exports.deleteOldProject = async (req, res) => {
  const { id } = req.params;

  try {
    const [project] = await db.execute('SELECT file_path FROM old_projects WHERE old_id = ?', [id]);

    if (project.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const fileUrl = project[0].file_path;
    const filePath = fileUrl.split('/').slice(-1)[0]; // ดึงชื่อไฟล์จาก URL

    // 🔥 ลบไฟล์จาก Supabase
    await supabase.storage.from('upload').remove([`old_projects/${filePath}`]);

    // 🔥 ลบข้อมูลจากฐานข้อมูล
    await db.execute('DELETE FROM old_projects WHERE old_id = ?', [id]);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting project:', error.message);
    res.status(500).json({ message: 'Database error' });
  }
};
