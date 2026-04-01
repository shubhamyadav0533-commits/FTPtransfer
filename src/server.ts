import express from "express";
import path from "path";
import apiRoutes from "./routes";

const app = express();
const PORT = 3000;

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api", apiRoutes);

// Fallback to index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 FTP Transfer Server running at http://localhost:${PORT}\n`);
});
