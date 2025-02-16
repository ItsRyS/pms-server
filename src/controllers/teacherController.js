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
      const filePath = `profile-images/${Date.now()}_${sanitizedFilename}${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('upload')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('❌ Upload Error:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('upload')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }

      imageUrl = urlData.publicUrl;
      console.log('✅ Image uploaded successfully:', imageUrl);
    }

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
    res.status(500).json({ error: 'Failed to create teacher: ' + error.message });
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM teacher_info');

    const teachers = results.map(teacher => ({
      ...teacher,
      teacher_image: teacher.teacher_image || null,
    }));

    res.status(200).json(teachers);
  } catch (error) {
    console.error('❌ Error fetching teachers:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

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

    const teacher = {
      ...results[0],
      teacher_image: results[0].teacher_image || null,
    };

    res.status(200).json(teacher);
  } catch (error) {
    console.error('❌ Error fetching teacher:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

exports.updateTeacher = async (req, res) => {
  try {
    const { teacher_id } = req.params;
    const { teacher_name, teacher_phone, teacher_email, teacher_academic, teacher_expert } = req.body;
    const file = req.file;

    if (!teacher_name || !teacher_phone || !teacher_email || !teacher_academic || !teacher_expert) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let imageUrl = null;

    if (file) {
      console.log("📤 Uploading file to Supabase...");

      const fileExtension = path.extname(file.originalname);
      const sanitizedFilename = `teacher_${Date.now()}${fileExtension}`;
      const filePath = `profile-images/${sanitizedFilename}`;

      const { error: uploadError } = await supabase.storage
        .from('upload')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error("❌ Supabase Upload Error:", uploadError.message);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('upload')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }

      imageUrl = urlData.publicUrl;
      console.log(`✅ File uploaded successfully: ${imageUrl}`);
    }

    const updateQuery = `
      UPDATE teacher_info
      SET teacher_name = ?,
          teacher_phone = ?,
          teacher_email = ?,
          teacher_academic = ?,
          teacher_expert = ?,
          teacher_image = COALESCE(?, teacher_image)
      WHERE teacher_id = ?
    `;

    const [result] = await db.query(updateQuery, [
      teacher_name,
      teacher_phone,
      teacher_email,
      teacher_academic,
      teacher_expert,
      imageUrl,
      teacher_id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    console.log(`✅ Updated teacher ${teacher_id} with image URL: ${imageUrl || 'No new image'}`);
    res.status(200).json({
      message: "Teacher updated successfully",
      imageUrl: imageUrl || null
    });

  } catch (error) {
    console.error('❌ Error updating teacher:', error.message);
    res.status(500).json({
      message: 'Failed to update teacher',
      error: error.message
    });
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
      const storageUrl = 'https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/upload/';
      const filePath = fileUrl.replace(storageUrl, '');

      console.log(`🗑️ Deleting file from Supabase: ${filePath}`);

      const { error: deleteError } = await supabase.storage
        .from('upload')
        .remove([filePath]);

      if (deleteError) {
        console.error(`❌ Supabase Delete Error: ${deleteError.message}`);
        throw deleteError;
      }
    }

    const [deleteResult] = await db.query(
      `DELETE FROM teacher_info WHERE teacher_id = ?`,
      [id]
    );

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.status(200).json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting teacher:', error.message);
    res.status(500).json({
      error: 'Failed to delete teacher',
      message: error.message
    });
  }
};