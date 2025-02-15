const mysql = require("mysql2");

const ENV = process.env.NODE_ENV || "development";

const connection = mysql.createPool({
  host: ENV === "production" ? process.env.PROD_DB_HOST : process.env.DEV_DB_HOST,
  port: ENV === "production" ? process.env.PROD_DB_PORT : process.env.DEV_DB_PORT,
  user: ENV === "production" ? process.env.PROD_DB_USER : process.env.DEV_DB_USER,
  password: ENV === "production" ? process.env.PROD_DB_PASSWORD : process.env.DEV_DB_PASSWORD,
  database: ENV === "production" ? process.env.PROD_DB_NAME : process.env.DEV_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
// ใช้ Pool + Promise
const pool = mysql.createPool(connection).promise();

// ตรวจสอบการเชื่อมต่อฐานข้อมูล
const checkConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Connected to database: ${connection.database} at ${connection.host}:${connection.port}`);
    connection.release();
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    reconnectDatabase();
  }
};

// ฟังก์ชัน Reconnect กรณีฐานข้อมูลล่ม
const reconnectDatabase = () => {
  console.log("🔄 Attempting to reconnect to database...");
  setTimeout(async () => {
    await checkConnection();
  }, 5000); // ลองเชื่อมต่อใหม่ทุก 5 วินาที
};

// ตรวจสอบการเชื่อมต่อเมื่อเริ่มต้นเซิร์ฟเวอร์
checkConnection();

// จัดการข้อผิดพลาดของฐานข้อมูล
pool.on("error", (err) => {
  console.error("❌ Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
    reconnectDatabase();
  } else {
    throw err;
  }
});

module.exports = pool;
