const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');

const sanitizeFilename = (filename) => {
  let cleanName = filename
    .normalize('NFC')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleanName.length > 0 ? cleanName : 'file';
};

exports.uploadDocument = async (req, res) => {
  try {
    const { doc_title, doc_description, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    if (!doc_title || !doc_description || !uploaded_by) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // สร้างชื่อไฟล์ที่ไม่ซ้ำกัน
    const fileExtension = path.extname(file.originalname);
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = sanitizeFilename(baseFilename);
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${fileExtension}`;

    // กำหนด path ใน Supabase Storage ให้ตรงกับโครงสร้าง bucket
    const filePath = `Document/${uniqueFilename}`;

    // อัพโหลดไฟล์ไปยัง Supabase Storage
    const { error } = await supabase.storage
      .from('upload')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase Upload Error:', error);
      return res.status(500).json({ message: 'Upload failed', error: error.message });
    }

    // สร้าง Public URL สำหรับไฟล์
    const { data: { publicUrl } } = supabase.storage
      .from('upload')
      .getPublicUrl(filePath);

    // บันทึกข้อมูลลงฐานข้อมูล MySQL
    const [result] = await db.query(
      `INSERT INTO document_forms (doc_title, doc_description, doc_path, uploaded_by, upload_date)
       VALUES (?, ?, ?, ?, NOW())`,
      [doc_title, doc_description, publicUrl, uploaded_by]
    );

    res.status(200).json({
      message: 'File uploaded successfully',
      doc_id: result.insertId,
      filePath: publicUrl
    });

  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

exports.getDocuments = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT
        df.doc_id,
        df.doc_title,
        df.doc_description,
        df.doc_path,
        u.username AS uploaded_by,
        df.upload_date
      FROM document_forms df
      JOIN users u ON df.uploaded_by = u.user_id
      ORDER BY df.upload_date DESC
    `);

    // แปลง results เพื่อให้แน่ใจว่า doc_path เป็น public URL ที่ถูกต้อง
    const documentsWithUrls = results.map(doc => ({
      ...doc,
      doc_path: doc.doc_path // URL จะถูกเก็บในฐานข้อมูลแล้ว
    }));

    res.status(200).json(documentsWithUrls);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Failed to retrieve documents', error: error.message });
  }
};

exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  try {
    const [results] = await db.query(
      `SELECT doc_path FROM document_forms WHERE doc_id = ?`, [id]
    );

    if (results.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const fileUrl = results[0].doc_path;
    const filePath = fileUrl.split('/').slice(1).join('/'); // แปลง URL เป็น path สำหรับ Supabase

    console.log(`🔍 Checking file existence in Supabase: ${filePath}`);

    // 🔥 ใช้ Promise.all() เพื่อลบไฟล์และข้อมูลพร้อมกัน
    await Promise.all([
      supabase.storage.from('upload').remove([filePath]),
      db.query(`DELETE FROM document_forms WHERE doc_id = ?`, [id])
    ]);

    res.status(200).json({ message: 'Document deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting document:', error.message);
    res.status(500).json({ message: 'Failed to delete document', error: error.message });
  }
};
