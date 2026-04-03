import { useState, useCallback } from 'react';
import { AccountSwitcher } from './components/AccountSwitcher';
import { ConnectionCard } from './components/ConnectionCard';
import { FolderBrowserCard } from './components/FolderBrowserCard';
import { UploadCard } from './components/UploadCard';
import { GoDaddyPage } from './components/GoDaddyPage';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SftpCredentials, FolderEntry, ActivePage } from './types';

interface ModalState {
  isOpen: boolean;
  message: string;
  action: () => void;
}

function App() {
  const [activePage, setActivePage] = useState<ActivePage>('hostinger');

  // ── Hostinger credentials ──
  const [credentials, setCredentials] = useState<SftpCredentials>({
    host: '',
    user: '',
    password: '',
    port: 65002,
    domain: 'paleturquoise-lion-613082.hostingersite.com',
  });

  // ── GoDaddy credentials ──
  const [gdCredentials, setGdCredentials] = useState<SftpCredentials>({
    host: '',
    user: '',
    password: '',
    port: 22,
    domain: 'brijvrindafarms.in',
  });

  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal State
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    message: '',
    action: () => {},
  });

  const confirmDelete = useCallback((message: string, action: () => void) => {
    setModalState({ isOpen: true, message, action });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="min-h-screen bg-background py-6 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* ── Top Row: Account Switcher + Connection ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-stretch">
          <AccountSwitcher
            activePage={activePage}
            onSwitch={setActivePage}
          />
          {activePage === 'hostinger' && (
            <ConnectionCard
              credentials={credentials}
              onChange={setCredentials}
              onConnect={handleRefresh}
            />
          )}
          {activePage === 'godaddy' && (
            <ConnectionCard
              credentials={gdCredentials}
              onChange={setGdCredentials}
              onConnect={handleRefresh}
              label="Go Daddy"
            />
          )}
        </div>

        {/* ── Content Area ── */}
        {activePage === 'hostinger' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-4 items-start">
            <FolderBrowserCard
              credentials={credentials}
              folders={folders}
              setFolders={setFolders}
              onConfirmDelete={confirmDelete}
              refreshTrigger={refreshTrigger}
            />
            <UploadCard
              credentials={credentials}
              folders={folders}
              onUploadSuccess={handleRefresh}
            />
          </div>
        ) : (
          <GoDaddyPage
            credentials={gdCredentials}
            onConfirmDelete={confirmDelete}
            refreshTrigger={refreshTrigger}
          />
        )}
      </div>

      <ConfirmationModal
        isOpen={modalState.isOpen}
        message={modalState.message}
        onConfirm={modalState.action}
        onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default App;
