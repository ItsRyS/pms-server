const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');
const multer = require('multer');

// ✅ Middleware สำหรับอัปโหลดไฟล์
const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single('file');
const sanitizeFilename = (filename) => {
  let cleanName = filename
    .normalize('NFC')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleanName.length > 0 ? cleanName : 'file';
};

// ✅ ฟังก์ชันเพิ่มโครงงานเก่า
exports.addOldProject = async (req, res) => {
  try {
    let {
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
    } = req.body;
    old_project_name_th = old_project_name_th || null;
    old_project_name_eng = old_project_name_eng || null;
    project_type = project_type || null;
    document_year = document_year || null;
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const fileExtension = path.extname(req.file.originalname);
    const baseFilename = path.basename(req.file.originalname, fileExtension);
    const sanitizedFilename = sanitizeFilename(baseFilename) + fileExtension;
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}`;

    const filePath = `old_projects/${uniqueFilename}`;


    // ✅ อัปโหลดไฟล์ไปยัง Supabase
    const { error } = await supabase.storage
      .from('upload')
      .upload(filePath, req.file.buffer, { contentType: 'application/pdf' });

    if (error) {
      console.error('❌ Supabase Upload Error:', error.message);
      return res
        .status(500)
        .json({ message: 'Upload to Supabase failed', error: error.message });
    }

    // ✅ บันทึก URL ไฟล์ลงในฐานข้อมูล
    const fileUrl = supabase.storage
      .from('upload')
      .getPublicUrl(filePath).publicUrl;
    const query = `
      INSERT INTO old_projects (old_project_name_th, old_project_name_eng, project_type, document_year, file_path)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.execute(query, [
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
      fileUrl,
    ]);

    res
      .status(201)
      .json({ message: 'Old project added successfully', fileUrl });
  } catch (error) {
    console.error('❌ Error inserting project:', error.message);
    res.status(500).json({ message: 'Database error' });
  }
};

// ✅ ฟังก์ชันดึงข้อมูลโครงงานเก่าทั้งหมด
exports.getOldProjects = async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT * FROM old_projects ORDER BY document_year DESC'
    );
    res.status(200).json(results);
  } catch (error) {
    console.error('❌ Error fetching old projects:', error.message);
    res.status(500).json({ message: 'Database query failed' });
  }
};

// ✅ ฟังก์ชันอัปเดตโครงงานเก่า
exports.updateOldProject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
    } = req.body;

    // 🔍 ดึงข้อมูลโครงงานเก่าจากฐานข้อมูล
    const [existingProject] = await db.query(
      'SELECT file_path FROM old_projects WHERE old_id = ?',
      [id]
    );

    if (existingProject.length === 0) {
      return res.status(404).json({ message: 'Old project not found' });
    }

    let fileUrl = existingProject[0].file_path;

    // ✅ ถ้ามีการอัปโหลดไฟล์ใหม่
    if (req.file) {
      // 🔥 ลบไฟล์เก่าจาก Supabase
      if (fileUrl) {
        const storageUrl =
          'https://your-supabase-url.com/storage/v1/object/public/upload/';
        const filePath = fileUrl.replace(storageUrl, '');

        await supabase.storage.from('upload').remove([filePath]);
      }

      // ✅ อัปโหลดไฟล์ใหม่ไปยัง Supabase
      const newFilePath = `old_projects/${Date.now()}_${req.file.originalname}`;
      const { error } = await supabase.storage
        .from('upload')
        .upload(newFilePath, req.file.buffer, {
          contentType: 'application/pdf',
        });

      if (error) {
        console.error('❌ Supabase Upload Error:', error.message);
        return res.status(500).json({ message: 'Upload to Supabase failed' });
      }

      fileUrl = supabase.storage
        .from('upload')
        .getPublicUrl(newFilePath).publicUrl;
    }

    // ✅ อัปเดตข้อมูลโครงงานเก่าในฐานข้อมูล
    const updateQuery = `
      UPDATE old_projects
      SET old_project_name_th = ?, old_project_name_eng = ?, project_type = ?, document_year = ?, file_path = ?
      WHERE old_id = ?
    `;
    await db.execute(updateQuery, [
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
      fileUrl,
      id,
    ]);

    res
      .status(200)
      .json({ message: 'Old project updated successfully', fileUrl });
  } catch (error) {
    console.error('❌ Error updating old project:', error.message);
    res.status(500).json({ message: 'Database update failed' });
  }
};

// ✅ ฟังก์ชันลบโครงงานเก่า
exports.deleteOldProject = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔍 ดึงข้อมูลโครงงานที่ต้องการลบ
    const [existingProject] = await db.query(
      'SELECT file_path FROM old_projects WHERE old_id = ?',
      [id]
    );

    if (existingProject.length === 0) {
      return res.status(404).json({ message: 'Old project not found' });
    }

    const fileUrl = existingProject[0].file_path;

    // ✅ ลบไฟล์จาก Supabase ถ้ามี
    if (fileUrl) {
      const storageUrl =
        'https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/upload/';
      const filePath = fileUrl.replace(storageUrl, '');

      const { error } = await supabase.storage
        .from('upload')
        .remove([filePath]);

      if (error) {
        console.error('❌ Supabase Delete Error:', error.message);
        return res
          .status(500)
          .json({ message: 'Failed to delete file from Supabase' });
      }
    }

    // ✅ ลบข้อมูลจากฐานข้อมูล
    await db.query('DELETE FROM old_projects WHERE old_id = ?', [id]);

    res.status(200).json({ message: 'Old project deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting old project:', error.message);
    res.status(500).json({ message: 'Database delete failed' });
  }
};
