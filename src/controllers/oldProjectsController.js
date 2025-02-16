const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');
const multer = require('multer');

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

exports.addOldProject = async (req, res) => {
  let filePath;
  try {
    let { old_project_name_th, old_project_name_eng, project_type, document_year } = req.body;

    // แปลงค่า undefined เป็น null
    old_project_name_th = old_project_name_th || null;
    old_project_name_eng = old_project_name_eng || null;
    project_type = project_type || null;
    document_year = document_year || null;

    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดไฟล์' });
    }

    // แปลงชื่อไฟล์ให้ปลอดภัย
    const fileExtension = path.extname(req.file.originalname);
    const baseFilename = path.basename(req.file.originalname, fileExtension);
    const sanitizedFilename = sanitizeFilename(baseFilename) + fileExtension;
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}`;
    const filePath = `old_projects/${uniqueFilename}`;

    // อัปโหลดไฟล์ไปยัง Supabase
    const {  error: uploadError } = await supabase.storage
      .from('upload')
      .upload(filePath, req.file.buffer, { contentType: 'application/pdf' });

    if (uploadError) {
      console.error('❌ ข้อผิดพลาดในการอัปโหลด Supabase:', uploadError.message);
      return res.status(500).json({
        message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์',
        error: uploadError.message
      });
    }

    // สร้าง URL สำหรับไฟล์ที่อัปโหลด
    const { data: { publicUrl } } = supabase.storage
      .from('upload')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('ไม่สามารถสร้าง URL สาธารณะสำหรับไฟล์ได้');
    }

    console.log(`✅ อัปโหลดไฟล์สำเร็จ: ${publicUrl}`);

    // ตรวจสอบข้อมูลก่อนบันทึก
    console.log('📝 ข้อมูลที่จะบันทึก:', {
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
      fileUrl: publicUrl
    });

    const query = `
      INSERT INTO old_projects (old_project_name_th, old_project_name_eng, project_type, document_year, file_path)
      VALUES (?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      old_project_name_th,
      old_project_name_eng,
      project_type,
      document_year,
      publicUrl
    ]);

    res.status(201).json({
      message: 'เพิ่มโครงงานเก่าสำเร็จ',
      fileUrl: publicUrl
    });

  } catch (error) {
    console.error('❌ ข้อผิดพลาดในการบันทึกโครงงาน:', error.message);

    // ถ้าเกิดข้อผิดพลาด ให้พยายามลบไฟล์ที่อัปโหลดไปแล้ว
    if (filePath) {
      try {
        await supabase.storage.from('upload').remove([filePath]);
      } catch (deleteError) {
        console.error('❌ ไม่สามารถลบไฟล์ที่อัปโหลดได้:', deleteError.message);
      }
    }

    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
      error: error.message
    });
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
