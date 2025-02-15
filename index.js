require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const app = express();
const ENV = process.env.NODE_ENV || "development";
const PORT = ENV === "development" ? process.env.DEV_PORT : process.env.PROD_PORT;

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET || "yourSuperSecretKey";

// CORS Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "https://pms-client-production.up.railway.app",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Middleware ตรวจสอบ JWT Token
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token is invalid" });
    req.user = decoded;
    next();
  });
};

// Static Files (PDF & Images)
app.use(
  "/upload",
  express.static(path.join(__dirname, "upload"), {
    setHeaders: (res, filePath) => {
      if ([".pdf", ".jpg", ".png"].includes(path.extname(filePath))) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    },
  })
);

// Import Routes
const authRoutes = require("./src/routes/auth");
const projectRoutes = require("./src/routes/projects");
const teacherRoutes = require("./src/routes/teacher");
const documentRoutes = require("./src/routes/document");
const userRoutes = require("./src/routes/users");
const projectRequestsRoutes = require("./src/routes/projectRequests");
const projectDocumentsRoutes = require("./src/routes/project_documents");
const projectReleaseRoutes = require("./src/routes/projectRelease");
const projectTypesRoutes = require("./src/routes/projectTypes");
const oldProjectsRoutes = require("./src/routes/oldProjects");

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", authenticateJWT, projectRoutes);
app.use("/api/teacher", authenticateJWT, teacherRoutes);
app.use("/api/document", authenticateJWT, documentRoutes);
app.use("/api/users", authenticateJWT, userRoutes);
app.use("/api/project-requests", authenticateJWT, projectRequestsRoutes);
app.use("/api/document-types", authenticateJWT, projectDocumentsRoutes);
app.use("/api/project-documents", authenticateJWT, projectDocumentsRoutes);
app.use("/api/project-release", authenticateJWT, projectReleaseRoutes);
app.use("/api/project-types", authenticateJWT, projectTypesRoutes);
app.use("/api/old-projects", authenticateJWT, oldProjectsRoutes);

// Test API
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// Root Endpoint
app.get("/", (req, res) => {
  res.send("Hello from server");
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

// Handle 404 Not Found
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global Error Handler
app.use((err, req, res) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Unexpected error occurred", details: err.message });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
