
const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const multer = require('multer');
const path = require('path');
const upload = multer({ storage: multer.memoryStorage() }); // ใช้ memory storage เพื่อส่งไป Supabase
exports.uploadMiddleware = upload.single('teacher_image');
const sanitizeFilename = (filename) => {
  let cleanName = filename
    .normalize('NFC')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleanName.length > 0 ? cleanName : 'file';
};
// ดึงข้อมูลอาจารย์ทั้งหมด
exports.getAllTeachers = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM teacher_info');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching teachers:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};
// ดึงข้อมูลอาจารย์ตาม ID
exports.getTeacherById = async (req, res) => {
  const { id } = req.params;

  try {
    const [results] = await db.query(
      'SELECT * FROM teacher_info WHERE teacher_id = ?',
      [id]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.status(200).json(results[0]);
  } catch (error) {
    console.error('Error fetching teacher:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

exports.createTeacher = async (req, res) => {
  try {
    const { teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert } = req.body;

    if (!teacher_name || !teacher_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let imageUrl = null;
    if (req.file) {
      const fileExtension = path.extname(req.file.originalname);
      const baseFilename = path.basename(req.file.originalname, fileExtension);
      const sanitizedFilename = sanitizeFilename(baseFilename) + fileExtension; // ✅ ทำให้ชื่อไฟล์ปลอดภัย
      const filePath = `profile-images/${Date.now()}_${sanitizedFilename}`;

      const { error } = await supabase.storage
        .from('upload')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (error) throw error;
      imageUrl = supabase.storage.from('upload').getPublicUrl(filePath).publicUrl;
    }

    const [result] = await db.query(
      `INSERT INTO teacher_info (teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert, teacher_image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert, imageUrl]
    );

    res.status(201).json({ message: 'Teacher created successfully', teacherId: result.insertId, imageUrl });

  } catch (error) {
    console.error('❌ Error creating teacher:', error.message);
    res.status(500).json({ error: 'Database insert failed' });
  }
};


// อัปเดตข้อมูลอาจารย์
exports.updateTeacher = async (req, res) => {
  const { id } = req.params;
  const {
    teacher_name,
    teacher_phone,
    teacher_email,
    teacher_academic,
    teacher_expert,
  } = req.body;
  const teacher_image = req.file ? req.file.filename : req.body.teacher_image;

  try {
    const [result] = await db.query(
      `UPDATE teacher_info
       SET teacher_name = ?, teacher_phone = ?, teacher_email = ?, teacher_academic = ?, teacher_expert = ?, teacher_image = ?
       WHERE teacher_id = ?`,
      [
        teacher_name,
        teacher_phone,
        teacher_email,
        teacher_academic,
        teacher_expert,
        teacher_image,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.status(200).json({ message: 'Teacher updated successfully' });
  } catch (error) {
    console.error('Error updating teacher:', error.message);
    res.status(500).json({ error: 'Database update failed' });
  }
};
exports.deleteTeacher = async (req, res) => {
  const { id } = req.params;

  try {
    const [results] = await db.query(
      `SELECT teacher_image FROM teacher_info WHERE teacher_id = ?`,
      [id]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const fileUrl = results[0].teacher_image;
    if (fileUrl) {
      const filePath = fileUrl.split('/').slice(4).join('/'); // แปลง URL เป็น path สำหรับ Supabase
      console.log(`🗑️ Deleting file from Supabase: ${filePath}`);

      const { error } = await supabase.storage.from('upload').remove([filePath]);
      if (error) console.error(`❌ Supabase Delete Error: ${error.message}`);
    }

    await db.query(`DELETE FROM teacher_info WHERE teacher_id = ?`, [id]);
    res.status(200).json({ message: 'Teacher deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting teacher:', error.message);
    res.status(500).json({ error: 'Database delete failed' });
  }
};

