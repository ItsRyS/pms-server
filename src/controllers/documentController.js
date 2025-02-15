const db = require("../config/db");
const supabase = require("../config/supabaseClient");

// อัปโหลดเอกสารไปยัง Supabase Storage
exports.uploadDocument = async (req, res) => {
  try {
    const { doc_title, doc_description, uploaded_by } = req.body;
    const file = req.file;

    if (!doc_title || !doc_description || !uploaded_by || !file) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const fileName = `${Date.now()}_${file.originalname}`;
    const filePath = `Document/${fileName}`; // ✅ เก็บในโฟลเดอร์ `Document`

    // 🔥 อัปโหลดไฟล์ไปยัง Supabase
    const { error } = await supabase.storage
      .from("upload")
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (error) throw error;

    // 🔥 รับ URL ของไฟล์ที่อัปโหลด
    const { data: fileUrlData } = supabase.storage.from("upload").getPublicUrl(filePath);
    const fileUrl = fileUrlData.publicUrl;

    // ✅ บันทึก URL ของไฟล์ลงฐานข้อมูล
    const [result] = await db.query(
      `INSERT INTO document_forms (doc_title, doc_description, doc_path, uploaded_by, upload_date)
       VALUES (?, ?, ?, ?, ?)`,
      [doc_title, doc_description, fileUrl, uploaded_by, new Date()]
    );

    res.status(200).json({ message: "File uploaded successfully", fileUrl, doc_id: result.insertId });
  } catch (error) {
    console.error("Error uploading document:", error.message);
    res.status(500).json({ message: "Upload failed", error: error.message });
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
    console.error("Error fetching documents:", error.message);
    res.status(500).json({ message: "Failed to retrieve documents", error: error.message });
  }
};

// ลบเอกสารออกจาก Supabase และฐานข้อมูล
exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  try {
    const [results] = await db.query(`SELECT doc_path FROM document_forms WHERE doc_id = ?`, [id]);
    if (results.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    const fileUrl = results[0].doc_path;
    const fileName = fileUrl.split("/").pop(); // ดึงชื่อไฟล์จาก URL

    // 🔥 ลบไฟล์จาก Supabase
    await supabase.storage.from("upload").remove([`Document/${fileName}`]);

    // 🔥 ลบเอกสารจากฐานข้อมูล
    await db.query(`DELETE FROM document_forms WHERE doc_id = ?`, [id]);

    res.status(200).json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Error deleting document:", error.message);
    res.status(500).json({ message: "Failed to delete document", error: error.message });
  }
};
