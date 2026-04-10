"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
const PORT = 3000;
// CORS middleware for browser clients
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});
// Parse JSON request bodies
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve static frontend files
const clientPath = path_1.default.join(__dirname, "..", "..", "Client", "dist");
app.use(express_1.default.static(clientPath));
// API routes
app.use("/api", routes_1.default);
// Fallback to index.html
app.get("/{*path}", (_req, res) => {
    res.sendFile(path_1.default.join(clientPath, "index.html"));
});
app.listen(PORT, () => {
    console.log(`\n🚀 Backend Server running at http://localhost:${PORT}\n`);
});
//# sourceMappingURL=server.js.map