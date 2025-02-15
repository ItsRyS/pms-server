const bcrypt = require('bcrypt');
const db = require('../config/db');

exports.login = async (req, res) => {
  try {
    const { email, password, tabId } = req.body;
    if (!tabId) return res.status(400).json({ error: "Missing Tab ID" });

    const [userResult] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = userResult[0];

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: "Invalid credentials" });

    req.session.tabs = req.session.tabs || {};
    req.session.tabs[tabId] = { user_id: user.user_id, role: user.role, username: user.username };

    res.cookie("session_id", req.sessionID, { httpOnly: true, secure: true, sameSite: "None" });
    res.status(200).json({ message: "Login successful", user: req.session.tabs[tabId] });
  } catch {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'อีเมลนี้ถูกใช้ไปแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, 'student']
    );
    res.status(201).json({
      message: 'User registered successfully',
      userId: result.insertId,
    });
  } catch (error) {
    console.error('Failed to register user:', error.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
};

exports.logout = (req, res) => {
  try {
    const { tabId } = req.body;

    if (req.session && req.session.tabs && req.session.tabs[tabId]) {
      delete req.session.tabs[tabId];
      res.status(200).json({ message: 'Logout successful', success: true });
    } else {
      res.status(400).json({ error: 'Invalid tabId', success: false });
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการออกจากระบบ:', error.message);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', success: false });
  }
};

exports.checkSession = (req, res) => {
  const tabId = req.headers['x-tab-id'];

  if (req.session && req.session.tabs && req.session.tabs[tabId]) {
    req.session.touch();
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24;
    res.status(200).json({ isAuthenticated: true, user: req.session.tabs[tabId] });
  } else {
    res.status(401).json({ isAuthenticated: false });
  }
};

exports.refreshSession = (req, res) => {
  const tabId = req.headers['x-tab-id'];

  if (req.session && req.session.tabs && req.session.tabs[tabId]) {
    req.session.touch();
    res.status(200).json({ success: true, message: 'Session refreshed' });
  } else {
    res.status(401).json({ success: false, message: 'Session expired' });
  }
};

exports.updateSession = async (req, res) => {
  const { tabId, username, profileImage } = req.body;

  if (!tabId) {
    return res.status(400).json({ error: 'Missing tabId', success: false });
  }

  if (req.session && req.session.tabs && req.session.tabs[tabId]) {
    if (username) req.session.tabs[tabId].username = username;
    if (profileImage) req.session.tabs[tabId].profileImage = profileImage;

    res.status(200).json({ success: true, message: 'Session updated successfully' });
  } else {
    res.status(400).json({ error: 'Invalid tabId', success: false });
  }
};
