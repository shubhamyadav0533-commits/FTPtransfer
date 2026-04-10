import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import apiRoutes from "./routes";
import publicRoutes from "./public/publicRoutes";
// Import workers so they start processing jobs on server boot
import "./public/uploadQueue";
import "./public/deleteQueue";

const app = express();
const PORT = 3000;

// CORS middleware for browser clients
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
const clientPath = path.join(__dirname, "..", "..", "Client", "dist");
app.use(express.static(clientPath));

// Dashboard API routes (existing — untouched)
app.use("/api", apiRoutes);

// Public API routes (new)
app.use("/api/v1", publicRoutes);

// Fallback to index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend Server running at http://localhost:${PORT}`);
  console.log(`📡 Public API available at http://localhost:${PORT}/api/v1\n`);
});
