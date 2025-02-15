const jwt = require("jsonwebtoken");

const authenticateSession = (req, res, next) => {
  const tabId = req.headers['x-tab-id'];
  if (!tabId) return res.status(400).json({ error: "Missing Tab ID" });

  if (req.session && req.session.tabs && req.session.tabs[tabId]) {
    req.user = req.session.tabs[tabId];
    req.session.touch(); // ✅ ต่ออายุ Session
    next();
  } else {
    res.status(401).json({ error: "Session expired, please login again" });
  }
};
module.exports = { authenticateSession };


const authenticateAndRefreshSession = (req, res, next) => {
  const tabId = req.headers['x-tab-id']; // รับ tabId จาก Header

  if (!tabId) {
    return res.status(400).json({ error: 'Missing Tab ID in request headers' });
  }

  if (req.session && req.session.tabs && req.session.tabs[tabId]) {
    req.session.touch(); // ต่ออายุ Session
    req.session.user = req.session.tabs[tabId]; // แนบข้อมูล user ไว้ใน request
    next();
  } else {
    res.status(401).json({ error: 'Session expired, please login again' });
  }
};


export const verifyToken = (req, res, next) => {
  const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token is invalid" });
    req.user = decoded;
    next();
  });
};

module.exports = {
  authenticateSession,
  authenticateAndRefreshSession,
  verifyToken
};