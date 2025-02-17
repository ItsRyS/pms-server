const bcrypt = require('bcrypt');
const db = require('../config/db');
const path = require('path');
const supabase = require('../config/supabaseClient');

const sanitizeFilename = (filename) => {
  let cleanName = filename
    .normalize('NFC')
    .replace(/[\u0300-\u036f]/g, '') // ลบตัวกำกับเสียง
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_') // แทนที่ตัวอักษรพิเศษ
    .replace(/_{2,}/g, '_') // แทนที่หลาย _ ด้วย _
    .replace(/^_+|_+$/g, ''); // ลบ _ ที่ต้นและท้าย

  return cleanName.length > 0 ? cleanName : 'file';
};
exports.getAllUsers = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM users');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Create a new user
exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    const userId = req.user.user_id;
    const [results] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { user_id, username, email, role, profile_image } = results[0];
    res.status(200).json({ id: user_id, username, email, role, profile_image });
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};


// Update user data
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, email, role, password } = req.body;

  console.log('Request Payload:', { username, email, role, password }); // Log the payload

  if (!username || !email || !role) { // ตรวจสอบ role ด้วย
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        'UPDATE users SET username = ?, email = ?, role = ?, password = ? WHERE user_id = ?',
        [username, email, role, hashedPassword, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      const [result] = await db.query(
        'UPDATE users SET username = ?, email = ?, role = ? WHERE user_id = ?',
        [username, email, role, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
    }
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Delete a user
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM users WHERE user_id = ?', [
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Fetch current user data
exports.getCurrentUser = async (req, res) => {
  const userId = req.session.user.user_id; // Assuming the user ID is stored in the session
  try {
    const [results] = await db.query('SELECT * FROM users WHERE user_id = ?', [
      userId,
    ]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { user_id, username, email, role, profile_image } = results[0]; // Include profile_image in the response
    res.status(200).json({ id: user_id, username, email, role, profile_image }); // Return profile_image
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    const userId = req.user.user_id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // ล้างชื่อไฟล์
    const fileExtension = path.extname(file.originalname);
    const baseFilename = path.basename(file.originalname, fileExtension);
    const sanitizedFilename = sanitizeFilename(baseFilename);
    const filePath = `profile-images/${Date.now()}_${sanitizedFilename}${fileExtension}`;

    // อัปโหลดไปที่ Supabase Storage
    const { error } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (error) {
      console.error('❌ Supabase Upload Error:', error.message);
      return res.status(500).json({ error: 'Failed to upload profile image' });
    }

    // URL ของไฟล์ที่ Supabase
    const imageUrl = `https://tgyexptoqpnoxcalnkyo.supabase.co/storage/v1/object/public/${filePath}`; // แก้ไข URL ตามที่คุณต้องการprocess.env.SUPABASE_URL}/storage/v1/object/public/${filePath}`;

    // อัปเดต URL ในฐานข้อมูล
    await db.query('UPDATE users SET profile_image = ? WHERE user_id = ?', [imageUrl, userId]);

    res.status(200).json({ profileImage: imageUrl });
  } catch (error) {
    console.error('❌ Error uploading profile image:', error.message);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
};
