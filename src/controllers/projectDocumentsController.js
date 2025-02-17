// projectDocumentsController.js

const db = require('../config/db');
const supabase = require('../config/supabaseClient');
const path = require('path');

// Helper functions
const generateSafeFilename = (originalname) => {
  const fileExtension = path.extname(originalname);
  const baseFilename = path.basename(originalname, fileExtension);
  return baseFilename
    .normalize('NFC')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
};

const getPublicUrl = (filePath) => {
  const { data: { publicUrl } } = supabase.storage
    .from('upload')
    .getPublicUrl(filePath);
  return publicUrl;
};

// Upload document
exports.uploadDocument = async (req, res) => {
  const { request_id, type_id } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'File upload failed. No file received.' });
  }

  try {
    const sanitizedFilename = generateSafeFilename(file.originalname);
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${path.extname(file.originalname)}`;
    const filePath = `project-documents/${uniqueFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('upload')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const publicUrl = getPublicUrl(filePath);

    await db.query(
      'INSERT INTO project_documents (request_id, type_id, file_path) VALUES (?, ?, ?)',
      [request_id, type_id, publicUrl]
    );

    res.status(200).json({
      message: 'อัพโหลดเอกสารสำเร็จ',
      file_url: publicUrl
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกเอกสาร' });
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
         pd.status,
         pd.file_path
       FROM document_types dt
       LEFT JOIN project_documents pd
         ON dt.type_id = pd.type_id AND pd.request_id = ?
       ORDER BY dt.type_id`,
      [requestId]
    );
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching document types with status:', error.message);
    res.status(500).json({ message: 'Failed to fetch document types with status.' });
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

// Resubmit document
exports.resubmitDocument = async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'File upload failed.' });
  }

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

    // Extract old file path and delete from storage
    const oldFilePath = `project-documents/${path.basename(oldFileUrl)}`;
    await supabase.storage
      .from('upload')
      .remove([oldFilePath]);

    // Upload new file
    const sanitizedFilename = generateSafeFilename(file.originalname);
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${path.extname(file.originalname)}`;
    const newFilePath = `project-documents/${uniqueFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('upload')
      .upload(newFilePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const newFileUrl = getPublicUrl(newFilePath);

    // Update database
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

// Return document (for advisor/teacher returns)
exports.returnDocument = async (req, res) => {
  const { documentId } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'File upload failed.' });
  }

  try {
    const [document] = await db.query(
      'SELECT file_path FROM project_documents WHERE document_id = ?',
      [documentId]
    );

    if (!document || document.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    // Remove old file
    const oldFilePath = `project-documents/${path.basename(document[0].file_path)}`;
    await supabase.storage
      .from('upload')
      .remove([oldFilePath]);

    // Upload new file
    const sanitizedFilename = generateSafeFilename(file.originalname);
    const uniqueFilename = `${Date.now()}_${sanitizedFilename}${path.extname(file.originalname)}`;
    const newFilePath = `project-documents/${uniqueFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('upload')
      .upload(newFilePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const newFileUrl = getPublicUrl(newFilePath);

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

// Delete document
exports.deleteDocument = async (req, res) => {
  const { documentId } = req.params;

  try {
    const [document] = await db.query(
      'SELECT file_path FROM project_documents WHERE document_id = ?',
      [documentId]
    );

    if (!document || document.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    // Remove file from storage
    const filePath = `project-documents/${path.basename(document[0].file_path)}`;
    await supabase.storage
      .from('upload')
      .remove([filePath]);

    // Delete from database
    await db.query('DELETE FROM project_documents WHERE document_id = ?', [documentId]);

    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error.message);
    res.status(500).json({ message: 'Failed to delete document.' });
  }
};


