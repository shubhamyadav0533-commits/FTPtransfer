import express from "express";
import cors from "cors";
import path from "path";
import apiRoutes from "./routes";

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

// API routes
app.use("/api", apiRoutes);

// Fallback to index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend Server running at http://localhost:${PORT}\n`);
});
