const fs = require('fs');
const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');
// Helper functions
const deleteFileIfExists = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const findDocumentById = async (documentId) => {
  const [document] = await db.query(
    'SELECT * FROM project_documents WHERE document_id = ?',
    [documentId]
  );
  return document[0];
};

// Upload document
exports.uploadDocument = async (req, res) => {
    //console.log('🚀 Request Headers:', req.headers);
    //console.log('📂 Received file:', req.file);
    //console.log('📝 Request Body:', req.body);
  const { request_id, type_id } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ message: 'File upload failed.No file received.' });

  try {
    // กำหนดชื่อไฟล์ที่ปลอดภัย
    const fileExtension = path.extname(file.originalname);
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = baseFilename
      .normalize('NFC')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${fileExtension}`;
    const filePath = `project-documents/${uniqueFilename}`;

    // อัปโหลดไฟล์ไปที่ Supabase
    const { error } = await supabase.storage
      .from('upload')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) throw error;

    // บันทึก URL ไฟล์ลงในฐานข้อมูล
    const { data: { publicUrl } } = supabase.storage
      .from('upload')
      .getPublicUrl(filePath);
    await db.query(
      'INSERT INTO project_documents (request_id, type_id, file_path) VALUES (?, ?, ?)',
      [request_id, type_id, publicUrl]
    );

    res
      .status(200)
      .json({ message: 'อัพโหลดเอกสารสำเร็จ', file_url: publicUrl });
  } catch (error) {
    console.error('Error uploading document:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกเอกสาร' });
  }
};

// Get all documents
exports.getAllDocuments = async (req, res) => {
  try {
    const [documents] = await db.query(`
      SELECT
        pd.document_id,
        pr.project_name,
        dt.type_name,
        u.username AS student_name,
        pd.file_path,
        pd.submitted_at,
        pd.status,
        pd.reject_reason
      FROM project_documents pd
      LEFT JOIN project_requests pr ON pd.request_id = pr.request_id
      LEFT JOIN document_types dt ON pd.type_id = dt.type_id
      LEFT JOIN users u ON pr.student_id = u.user_id
      ORDER BY pd.submitted_at DESC;
    `);
    res.status(200).json(documents);
  } catch (error) {
    console.error('Error fetching project documents:', error.message);
    res.status(500).json({ message: 'Failed to fetch documents.' });
  }
};

// Approve document
exports.approveDocument = async (req, res) => {
  const { documentId } = req.params;

  try {
    const result = await db.query(
      "UPDATE project_documents SET status = 'approved', reject_reason = NULL WHERE document_id = ?",
      [documentId]
    );

    if (result[0].affectedRows > 0) {
      res.status(200).json({ message: 'Document approved successfully.' });
    } else {
      res.status(404).json({ message: 'Document not found.' });
    }
  } catch (error) {
    console.error('Error approving document:', error.message);
    res.status(500).json({ message: 'Failed to approve document.' });
  }
};

// Reject document
exports.rejectDocument = async (req, res) => {
  const { documentId } = req.params;
  const { reason } = req.body;

  if (!reason) return res.status(400).json({ message: 'Reason is required.' });

  try {
    const result = await db.query(
      "UPDATE project_documents SET status = 'rejected', reject_reason = ? WHERE document_id = ?",
      [reason, documentId]
    );

    if (result[0].affectedRows > 0) {
      res.status(200).json({ message: 'Document rejected successfully.' });
    } else {
      res.status(404).json({ message: 'Document not found.' });
    }
  } catch (error) {
    console.error('Error rejecting document:', error.message);
    res.status(500).json({ message: 'Failed to reject document.' });
  }
};

// Return document

exports.returnDocument = async (req, res) => {
  const { documentId } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ message: 'File upload failed.' });

  try {
    // ค้นหาเอกสารเดิม
    const document = await findDocumentById(documentId);
    if (!document)
      return res.status(404).json({ message: 'Document not found.' });

    const oldFileUrl = document.file_path;

    // ดึงชื่อไฟล์เก่าจาก URL
    const oldFilePath = oldFileUrl.split('/').pop();

    // ลบไฟล์เก่าออกจาก Supabase Storage
    const { error: deleteError } = await supabase.storage
      .from('Document')
      .remove([`project-documents/${oldFilePath}`]);

    if (deleteError) {
      console.warn(
        'Warning: Failed to delete old file from Supabase:',
        deleteError.message
      );
    }

    // กำหนดชื่อไฟล์ใหม่ให้ปลอดภัย
    const fileExtension = path.extname(file.originalname);
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = baseFilename
      .normalize('NFC')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${fileExtension}`;
    const newFilePath = `project-documents/${uniqueFilename}`;

    // อัปโหลดไฟล์ที่แก้ไขไปที่ Supabase
    const { error: uploadError } = await supabase.storage
      .from('Document')
      .upload(newFilePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // สร้าง URL สาธารณะสำหรับไฟล์ใหม่
    const newFileUrl = `https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/Document/${newFilePath}`;

    // อัปเดตฐานข้อมูลให้ใช้ไฟล์ที่แก้ไขใหม่
    await db.query(
      "UPDATE project_documents SET file_path = ?, status = 'returned' WHERE document_id = ?",
      [newFileUrl, documentId]
    );

    res.status(200).json({
      message: 'Document returned successfully.',
      file_url: newFileUrl,
    });
  } catch (error) {
    console.error('Error returning document:', error.message);
    res.status(500).json({ message: 'Failed to return document.' });
  }
};

// Resubmit document;
exports.resubmitDocument = async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ message: 'File upload failed.' });

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [documentDetails] = await connection.query(
      'SELECT request_id, type_id, file_path FROM project_documents WHERE document_id = ?',
      [id]
    );

    if (!documentDetails || documentDetails.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const { request_id, type_id, file_path: oldFileUrl } = documentDetails[0];

    // ดึงชื่อไฟล์เก่าจาก URL และลบออกจาก Supabase
    const oldFilePath = oldFileUrl.split('/').pop();
    const oldStoragePath = `project-documents/${oldFilePath}`;

    const { error: deleteError } = await supabase.storage
      .from('upload')
      .remove([oldStoragePath]);

    if (deleteError) {
      console.warn('Warning: Failed to delete old file from Supabase:', deleteError.message);
    }

    // อัปโหลดไฟล์ใหม่
    const fileExtension = path.extname(file.originalname);
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = baseFilename
      .normalize('NFC')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${fileExtension}`;
    const newFilePath = `project-documents/${uniqueFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('upload')
      .upload(newFilePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // สร้าง URL สาธารณะใหม่
    const { data: { publicUrl: newFileUrl } } = supabase.storage
      .from('upload')
      .getPublicUrl(newFilePath);

    // อัปเดตฐานข้อมูล
    await connection.query(
      'DELETE FROM project_documents WHERE document_id = ?',
      [id]
    );

    await connection.query(
      "INSERT INTO project_documents (request_id, type_id, file_path, status) VALUES (?, ?, ?, 'pending')",
      [request_id, type_id, newFileUrl]
    );

    await connection.commit();
    res.status(200).json({
      message: 'Document resubmitted successfully.',
      file_url: newFileUrl,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error resubmitting document:', error.message);
    res.status(500).json({ message: 'Failed to resubmit document.' });
  } finally {
    connection.release();
  }
};

// Get document types
exports.getDocumentTypes = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM document_types');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching document types:', error.message);
    res.status(500).json({ message: 'Failed to fetch document types.' });
  }
};

// Get document types with status
exports.getDocumentTypesWithStatus = async (req, res) => {
  const { requestId } = req.query;

  try {
    const [results] = await db.query(
      `SELECT
         dt.type_id,
         dt.type_name,
         pd.status
       FROM document_types dt
       LEFT JOIN project_documents pd
         ON dt.type_id = pd.type_id AND pd.request_id = ?
       ORDER BY dt.type_id`,
      [requestId]
    );
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching document types with status:', error.message);
    res
      .status(500)
      .json({ message: 'Failed to fetch document types with status.' });
  }
};

// Get document history
exports.getDocumentHistory = async (req, res) => {
  const { requestId } = req.query;

  try {
    const [documents] = await db.query(
      `SELECT
         pd.document_id,
         pd.file_path,
         dt.type_name,
         pd.submitted_at,
         pd.status,
         pd.reject_reason
       FROM project_documents pd
       LEFT JOIN document_types dt ON pd.type_id = dt.type_id
       WHERE pd.request_id = ?
       ORDER BY pd.submitted_at DESC`,
      [requestId]
    );
    res.status(200).json(documents);
  } catch (error) {
    console.error('Error fetching document history:', error.message);
    res.status(500).json({ message: 'Failed to fetch document history.' });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await findDocumentById(documentId);
    if (!document)
      return res.status(404).json({ message: 'Document not found.' });

    deleteFileIfExists(document.file_path);

    await db.query('DELETE FROM project_documents WHERE document_id = ?', [
      documentId,
    ]);
    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error.message);
    res.status(500).json({ message: 'Failed to delete document.' });
  }
};
