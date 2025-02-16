const path = require('path');
const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });
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
      const sanitizedFilename = sanitizeFilename(baseFilename);
      const filePath = `profile-images/${Date.now()}_${sanitizedFilename}`;

      const { error } = await supabase.storage
        .from('upload')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) throw error;

      imageUrl = supabase.storage.from('upload').getPublicUrl(filePath).publicUrl;
    }

    // ✅ บันทึก URL ลงในฐานข้อมูล
    const [result] = await db.query(
      `INSERT INTO teacher_info (teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert, teacher_image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert, imageUrl]
    );

    res.status(201).json({
      message: 'Teacher created successfully',
      teacherId: result.insertId,
      imageUrl,
    });

  } catch (error) {
    console.error('❌ Error creating teacher:', error.message);
    res.status(500).json({ error: 'Database insert failed' });
  }
};

// ดึงข้อมูลอาจารย์ทั้งหมด
exports.getAllTeachers = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM teacher_info');

    // ✅ ตรวจสอบว่าแต่ละรายการมี URL รูปภาพหรือไม่
    const teachers = results.map(teacher => ({
      ...teacher,
      teacher_image: teacher.teacher_image || null, // ถ้าไม่มีรูปให้เป็น null
    }));

    res.status(200).json(teachers);
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



// อัปเดตข้อมูลอาจารย์
exports.updateTeacher = async (req, res) => {
  const { id } = req.params;
  const { teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert } = req.body;

  try {
    // 🔍 ดึงข้อมูลอาจารย์ปัจจุบันจากฐานข้อมูล
    const [existingTeacher] = await db.query(
      `SELECT teacher_image FROM teacher_info WHERE teacher_id = ?`, [id]
    );

    if (existingTeacher.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    let imageUrl = existingTeacher[0].teacher_image; // เก็บ URL รูปเดิมไว้

    if (req.file) {
      // 🔥 ลบรูปเก่าถ้ามี
      if (imageUrl) {
        const storageUrl = 'https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/upload/';
        const filePath = imageUrl.replace(storageUrl, '');

        await supabase.storage.from('upload').remove([filePath]);
      }

      // ✅ อัปโหลดรูปใหม่ไปยัง Supabase
      const fileExtension = path.extname(req.file.originalname);
      const baseFilename = path.basename(req.file.originalname, fileExtension);
      const sanitizedFilename = baseFilename.replace(/[^a-zA-Z0-9ก-๙._-]/gu, '_') + fileExtension;
      const filePath = `profile-images/${Date.now()}_${sanitizedFilename}`;

      const { data, error } = await supabase.storage
        .from('upload')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) throw error;
      console.log(`✅ File uploaded successfully:`, data);
      imageUrl = supabase.storage.from('upload').getPublicUrl(filePath).publicUrl;
    }

    // ✅ บันทึกข้อมูลอัปเดตลงฐานข้อมูล
    await db.query(
      `UPDATE teacher_info
       SET teacher_name=?, teacher_phone=?, teacher_email=?, teacher_academic=?, teacher_expert=?, teacher_image=?
       WHERE teacher_id = ?`,
      [teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert, imageUrl, id]
    );

    console.log(`✅ Updated teacher ${id} with image URL: ${imageUrl}`);

    res.status(200).json({ message: 'Teacher updated successfully', imageUrl });

  } catch (error) {
    console.error('❌ Error updating teacher:', error.message);
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
      const storageUrl =
        'https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/upload/';
      const filePath = fileUrl.replace(storageUrl, '');

      console.log(`🗑️ Deleting file from Supabase: ${filePath}`);

      const { error } = await supabase.storage
        .from('upload')
        .remove([filePath]);
      if (error) console.error(`❌ Supabase Delete Error: ${error.message}`);
    }

    await db.query(`DELETE FROM teacher_info WHERE teacher_id = ?`, [id]);
    res.status(200).json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting teacher:', error.message);
    res.status(500).json({ error: 'Database delete failed' });
  }
};
