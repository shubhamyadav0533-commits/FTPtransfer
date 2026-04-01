/** @type {File[]} */
let selectedFiles = [];

// ---- DOM Elements ----
const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('file-input'));
const dropzone = /** @type {HTMLDivElement} */ (document.getElementById('dropzone'));
const fileList = /** @type {HTMLUListElement} */ (document.getElementById('file-list'));
const uploadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('upload-btn'));
const getFilesBtn = /** @type {HTMLButtonElement} */ (document.getElementById('get-files-btn'));
const statusBar = /** @type {HTMLDivElement} */ (document.getElementById('upload-status'));
const progressContainer = /** @type {HTMLDivElement} */ (document.getElementById('progress-container'));
const progressFill = /** @type {HTMLDivElement} */ (document.getElementById('progress-fill'));
const progressText = /** @type {HTMLParagraphElement} */ (document.getElementById('progress-text'));
const resultsContainer = /** @type {HTMLDivElement} */ (document.getElementById('results-container'));
const emptyState = /** @type {HTMLDivElement} */ (document.getElementById('empty-state'));

// ---- Helpers ----
function getCredentials() {
  return {
    host: /** @type {HTMLInputElement} */ (document.getElementById('ftp-host')).value.trim(),
    user: /** @type {HTMLInputElement} */ (document.getElementById('ftp-user')).value.trim(),
    password: /** @type {HTMLInputElement} */ (document.getElementById('ftp-password')).value,
    port: /** @type {HTMLInputElement} */ (document.getElementById('ftp-port')).value || '21',
    domain: /** @type {HTMLInputElement} */ (document.getElementById('ftp-domain')).value.trim(),
    folder: /** @type {HTMLInputElement} */ (document.getElementById('ftp-folder')).value.trim(),
  };
}

function validateCredentials() {
  const creds = getCredentials();
  if (!creds.host || !creds.user || !creds.password || !creds.domain || !creds.folder) {
    showStatus('error', '⚠️ Please fill in all required fields');
    return false;
  }
  return true;
}

/**
 * @param {'success' | 'error' | 'loading'} type
 * @param {string} message
 */
function showStatus(type, message) {
  statusBar.className = `status-bar status-bar--visible status-bar--${type}`;
  statusBar.innerHTML = type === 'loading'
    ? `<span class="spinner"></span> ${message}`
    : message;
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ---- File Selection ----
function renderFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span>🖼️ ${file.name}</span>
      <span style="color: var(--text-muted); font-size: 0.75rem;">(${formatSize(file.size)})</span>
      <button class="file-item__remove" data-index="${index}" title="Remove">✕</button>
    `;
    fileList.appendChild(li);
  });
  uploadBtn.disabled = selectedFiles.length === 0;
}

/** @param {FileList | File[]} newFiles */
function addFiles(newFiles) {
  const existingNames = new Set(selectedFiles.map(f => f.name));
  for (const file of newFiles) {
    if (!existingNames.has(file.name)) selectedFiles.push(file);
  }
  renderFileList();
}

fileInput.addEventListener('change', () => {
  if (fileInput.files) { addFiles(fileInput.files); fileInput.value = ''; }
});

fileList.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (target.classList.contains('file-item__remove')) {
    selectedFiles.splice(parseInt(target.getAttribute('data-index') || '0', 10), 1);
    renderFileList();
  }
});

// ---- Drag & Drop ----
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dropzone--active'); });
dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('dropzone--active'); });
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--active');
  if (e.dataTransfer && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
});

// ---- Upload ----
uploadBtn.addEventListener('click', async () => {
  if (!validateCredentials() || selectedFiles.length === 0) return;

  const creds = getCredentials();
  const formData = new FormData();
  formData.append('host', creds.host);
  formData.append('user', creds.user);
  formData.append('password', creds.password);
  formData.append('port', creds.port);
  formData.append('domain', creds.domain);
  formData.append('folder', creds.folder);
  selectedFiles.forEach(file => formData.append('files', file));

  uploadBtn.disabled = true;
  getFilesBtn.disabled = true;
  showStatus('loading', 'Connecting to server and uploading...');
  progressContainer.classList.add('progress-container--visible');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  try {
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = pct + '%';
        }
      });
      xhr.addEventListener('load', () => {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid server response')); }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });

    const result = /** @type {{ success: boolean, urls: string[], message: string }} */ (response);
    if (result.success) {
      showStatus('success', `✅ ${result.message}`);
      displayUrls(result.urls.map(url => ({
        name: decodeURIComponent(url.split('/').pop() || ''),
        url, size: 0,
      })));
      selectedFiles = [];
      renderFileList();
    } else {
      showStatus('error', `❌ ${result.message}`);
    }
  } catch (err) {
    showStatus('error', `❌ ${err instanceof Error ? err.message : 'Upload failed'}`);
  } finally {
    uploadBtn.disabled = selectedFiles.length === 0;
    getFilesBtn.disabled = false;
    setTimeout(() => progressContainer.classList.remove('progress-container--visible'), 2000);
  }
});

// ---- Get Files ----
getFilesBtn.addEventListener('click', async () => {
  if (!validateCredentials()) return;
  const creds = getCredentials();
  getFilesBtn.disabled = true;
  showStatus('loading', 'Fetching files from server...');

  try {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const result = await res.json();
    if (result.success) {
      showStatus('success', `✅ ${result.message}`);
      displayUrls(result.files);
    } else {
      showStatus('error', `❌ ${result.message}`);
    }
  } catch (err) {
    showStatus('error', `❌ ${err instanceof Error ? err.message : 'Failed to fetch files'}`);
  } finally {
    getFilesBtn.disabled = false;
    uploadBtn.disabled = selectedFiles.length === 0;
  }
});

// ---- Display Results ----
/** @param {Array<{name: string, url: string, size: number}>} files */
function displayUrls(files) {
  if (files.length === 0) {
    emptyState.style.display = 'block';
    const g = resultsContainer.querySelector('.results-grid');
    if (g) g.remove();
    return;
  }
  emptyState.style.display = 'none';
  const old = resultsContainer.querySelector('.results-grid');
  if (old) old.remove();

  const grid = document.createElement('div');
  grid.className = 'results-grid';

  files.forEach((file, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${i * 0.08}s`;
    const sizeText = file.size > 0 ? formatSize(file.size) : '';
    card.innerHTML = `
      <img class="result-card__preview" src="${file.url}" alt="${file.name}" loading="lazy" onerror="this.style.display='none'" />
      <div class="result-card__info">
        <p class="result-card__name" title="${file.name}">${file.name}</p>
        ${sizeText ? `<p class="result-card__size">${sizeText}</p>` : ''}
        <div class="result-card__url">
          <input class="result-card__url-input" type="text" value="${file.url}" readonly />
          <button class="btn--copy" data-url="${file.url}">Copy</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  resultsContainer.appendChild(grid);
}

// ---- Copy to Clipboard ----
resultsContainer.addEventListener('click', async (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!target.classList.contains('btn--copy')) return;
  const url = target.getAttribute('data-url');
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    target.textContent = '✓';
    target.classList.add('copied');
    setTimeout(() => { target.textContent = 'Copy'; target.classList.remove('copied'); }, 1500);
  } catch {
    const input = target.previousElementSibling;
    if (input instanceof HTMLInputElement) {
      input.select(); document.execCommand('copy');
      target.textContent = '✓';
      target.classList.add('copied');
      setTimeout(() => { target.textContent = 'Copy'; target.classList.remove('copied'); }, 1500);
    }
  }
});
