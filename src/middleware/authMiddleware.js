const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token is invalid" });
    req.user = decoded;

    // 🔄 ต่ออายุ JWT และส่งกลับ
    const newToken = jwt.sign(
      { user_id: decoded.user_id, role: decoded.role, username: decoded.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    res.setHeader("Authorization", `Bearer ${newToken}`);

    next();
  });

};

module.exports = { verifyToken };
