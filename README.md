# Cloud Storage (SFTP Transfer Client)

A full-stack, lightweight web client built to seamlessly transfer, manage, and serve images from your local machine to your remote SFTP server. It is specifically tailored to bypass Hostinger Website Builder/CMS routing issues by auto-generating immediately usable, public-facing URLs.

## ✨ Features
* **Modern React UI:** Built with React, Vite, and Tailwind CSS. Features a beautiful glassmorphism UI, a responsive grid layout, and smooth CSS animations (including ripple-wave transitions).
* **Multi-Account Support:** Seamlessly switch between server accounts like Hostinger and Go Daddy from a centralized dashboard.
* **Interactive File Management:**
  * **Folder Browser:** View content as interactive cards with image thumbnails and fallback icons.
  * **Search & Filter:** Client-side search bar to instantly filter folders and files.
  * **Inline Renaming:** Rename files and folders directly from the UI with a native feel.
  * **Full Control:** Delete files and directories securely over SFTP.
* **Smart Uploads:** Drag-and-drop support, auto-sanitization of filenames (using timestamp suffixes to prevent overwrite collisions), and real-time progress bars.
* **Bypass CMS Routing:** Generates exact Hostinger Preview/Temporary URLs on the fly, letting you serve static images cleanly even if your primary domain is intercepted by a website builder like Zyro.

## 📦 Tech Stack & Dependencies

### Frontend
* **[React](https://react.dev/) & [Vite](https://vitejs.dev/)**: For a blazingly fast, component-based frontend.
* **[Tailwind CSS](https://tailwindcss.com/)**: Utility-first CSS framework for custom themes, rounded card UI, and dark-accent modes.
* **[Lucide React](https://lucide.dev/)**: Beautiful, consistent iconography.

### Backend
* **[Express](https://expressjs.com/)**: Fast, unopinionated web framework for Node.js.
* **[multer](https://www.npmjs.com/package/multer)**: Middleware for handling `multipart/form-data`, used exclusively for buffering uploaded image files.
* **[ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client)**: A highly secure, robust SSH2 SFTP client for Node.js used for secure file and directory operations natively.
* **[tsx](https://www.npmjs.com/package/tsx)**: TypeScript execution environment for live-reloading the backend.

## 🚀 How to Run

1. **Install Dependencies:**
   Make sure you have Node.js installed. In the project root, run:
   ```bash
   npm install
   cd Backend && npm install
   cd ../Client && npm install
   ```

2. **Start the Development Servers:**
   From the project root directory, run:
   ```bash
   npm run start
   ```
   This uses `concurrently` to boot up both the **Vite frontend development server** (`http://localhost:5173`) and the **Express backend server** (`http://localhost:3000`).

3. **Access the Client:**
   Open your browser and navigate to `http://localhost:5173`.

## 💼 Proper Workflow

1. **Connect:** 
   In the UI, enter your SFTP Host, Port (usually 65002 for Hostinger), Username, and Password. *Note: The Hostinger public URL is hardcoded into the application logic to prevent typing errors.*
2. **Browse or Create Folders:**
   Use the Folder Browser to navigate your remote `public_html` directory. You can create a new deployment folder via the Upload dropdown if needed.
3. **Upload:**
   Drag and drop your images into the UI, click upload. The files are securely streamed via SFTP directly to your server.
4. **Manage Files:**
   Single-click a file to see inline actions like Rename and Delete, or simply hover over the file to instantly **Copy the URL**.
5. **Use the URLs:**
   Use the copied hot-linkable URL anywhere! It natively bypasses Zyro/Hostinger CMS restrictions.

## 🔐 Security Note
Your SFTP credentials are only sent from your browser to your local Node server temporarily during connection and transfers. They are completely stateless and are **never** saved or stored anywhere permanently.
