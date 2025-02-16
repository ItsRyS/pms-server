const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');

const sanitizeFilename = (filename) => {
  return filename
    .normalize('NFC') // ✅ แปลง Unicode ให้เป็นรูปแบบมาตรฐาน
    .replace(/[\u0300-\u036f]/g, '') // ✅ ลบตัวกำกับเสียง (Accents)
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_') // ✅ อนุญาตภาษาไทย, a-z, 0-9, จุด (.), ขีด (-)
    .replace(/_{2,}/g, '_') // ✅ ป้องกันไม่ให้เกิด `_` ซ้อนกันหลายตัว
    .replace(/^_+|_+$/g, ''); // ✅ ลบ `_` ที่ขึ้นต้นและลงท้าย
};

// อัปโหลดเอกสารไปยัง Supabase Storage
exports.uploadDocument = async (req, res) => {
  try {
    const { doc_title, doc_description, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ message: 'No file uploaded. Please attach a file.' });
    }
    if (!doc_title || !doc_description || !uploaded_by) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    console.log('📌 Debug: รับค่าจาก Client:', {
      doc_title,
      doc_description,
      uploaded_by,
    });

    // ✅ ดึงนามสกุลไฟล์ด้วย `path`
    const fileExtension = path.extname(file.originalname);
    console.log('📌 File Extension:', fileExtension);

    // ✅ แปลงชื่อไฟล์ให้ปลอดภัยด้วย `sanitizeFilename`
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = sanitizeFilename(baseFilename) + fileExtension;
    const filePath = `Document/${Date.now()}_${sanitizedFilename}`;

    console.log('📌 Original Filename:', file.originalname);
    console.log('📌 Sanitized Filename:', sanitizedFilename);

    // ✅ อัปโหลดไฟล์ไปยัง Supabase
    const { error } = await supabase.storage
      .from('upload')
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (error) {
      console.error('❌ Supabase Upload Error:', error.message);
      return res
        .status(500)
        .json({ message: 'Upload to Supabase failed', error: error.message });
    }

    console.log('✅ Supabase Upload สำเร็จ:', filePath);

    // ✅ บันทึกลงฐานข้อมูล MySQL
    const [result] = await db.query(
      `INSERT INTO document_forms (doc_title, doc_description, doc_path, uploaded_by, upload_date)
       VALUES (?, ?, ?, ?, NOW())`,
      [doc_title, doc_description, filePath, uploaded_by]
    );

    console.log('✅ MySQL Insert สำเร็จ:', result);

    res
      .status(200)
      .json({
        message: 'File uploaded successfully',
        filePath,
        doc_id: result.insertId,
      });
  } catch (error) {
    console.error('❌ Error uploading document:', error.message);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};
// ดึงข้อมูลเอกสารจากฐานข้อมูล
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
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching documents:', error.message);
    res
      .status(500)
      .json({ message: 'Failed to retrieve documents', error: error.message });
  }
};

// ลบเอกสารออกจาก Supabase และฐานข้อมูล
exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  try {
    const [results] = await db.query(
      `SELECT doc_path FROM document_forms WHERE doc_id = ?`,
      [id]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const fileUrl = results[0].doc_path;
    const fileName = fileUrl.split('/').pop(); // ดึงชื่อไฟล์จาก URL

    // 🔥 ลบไฟล์จาก Supabase
    await supabase.storage.from('upload').remove([`Document/${fileName}`]);

    // 🔥 ลบเอกสารจากฐานข้อมูล
    await db.query(`DELETE FROM document_forms WHERE doc_id = ?`, [id]);

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error.message);
    res
      .status(500)
      .json({ message: 'Failed to delete document', error: error.message });
  }
};
