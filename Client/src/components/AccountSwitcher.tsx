import React, { useState, useCallback } from 'react';
import { Cloud, Server, ChevronRight } from 'lucide-react';
import { ActivePage } from '../types';

interface Props {
  activePage: ActivePage;
  onSwitch: (page: ActivePage) => void;
}

interface AccountOption {
  id: ActivePage;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const accounts: AccountOption[] = [
  { id: 'hostinger', label: 'Hostinger', description: 'Web hosting & SFTP file management', icon: <Cloud className="w-5 h-5" /> },
  { id: 'godaddy', label: 'Go Daddy', description: 'Domain & hosting management', icon: <Server className="w-5 h-5" /> },
];

export const AccountSwitcher: React.FC<Props> = ({ activePage, onSwitch }) => {
  const [pendingSwitch, setPendingSwitch] = useState<ActivePage | null>(null);
  const [rippleActive, setRippleActive] = useState(false);

  const handleAccountClick = useCallback((id: ActivePage) => {
    if (id === activePage) return;
    setPendingSwitch(id);
  }, [activePage]);

  const confirmSwitch = useCallback(() => {
    if (!pendingSwitch) return;

    // Trigger ripple animation
    setRippleActive(true);
    
    setTimeout(() => {
      onSwitch(pendingSwitch);
      setPendingSwitch(null);
    }, 350);

    setTimeout(() => {
      setRippleActive(false);
    }, 700);
  }, [pendingSwitch, onSwitch]);

  const cancelSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  return (
    <>
      <section className="bg-card shadow-sm rounded-2xl border border-taupe-200 p-5 flex flex-col justify-between h-full">
        {/* Title & Description */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="bg-primary/20 p-3 rounded-xl flex items-center justify-center shadow-inner">
            <Cloud className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Cloud Storage</h1>
            <p className="text-text-muted text-sm">Upload images & get public URLs instantly</p>
          </div>
        </div>

        {/* Account Switcher */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-text-muted tracking-wider uppercase mb-2.5">Switch Account</p>
          {accounts.map((account) => {
            const isActive = account.id === activePage;
            return (
              <button
                key={account.id}
                onClick={() => handleAccountClick(account.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all duration-200
                  ${isActive
                    ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                    : 'bg-background text-text-muted border border-transparent hover:border-taupe-200 hover:bg-taupe-50 hover:text-text'
                  }`}
              >
                <span className={`p-2 rounded-lg ${isActive ? 'bg-primary/20' : 'bg-taupe-100'}`}>
                  {account.icon}
                </span>
                <div className="flex-1 text-left">
                  <span className="block text-text text-sm font-semibold">{account.label}</span>
                  <span className={`block text-[11px] mt-0.5 leading-snug ${isActive ? 'text-primary/90' : 'text-text-muted/60'}`}>{account.description}</span>
                </div>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                )}
                {!isActive && (
                  <ChevronRight className="w-4 h-4 opacity-40 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Confirmation Popup */}
      {pendingSwitch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={cancelSwitch}
        >
          <div
            className="bg-card w-full max-w-xs rounded-2xl p-5 shadow-xl border border-taupe-200 card-enter"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                {accounts.find(a => a.id === pendingSwitch)?.icon}
              </div>
              <p className="text-text font-medium mb-1 text-sm">
                Switch to <span className="font-bold">{accounts.find(a => a.id === pendingSwitch)?.label}</span>?
              </p>
              <p className="text-text-muted text-xs mb-4">
                You'll be navigated to the {accounts.find(a => a.id === pendingSwitch)?.label} dashboard.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelSwitch}
                  className="flex-1 px-3 py-2 rounded-xl border border-taupe-200 text-text text-sm font-medium hover:bg-taupe-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSwitch}
                  className="flex-1 px-3 py-2 rounded-xl bg-text text-white text-sm font-medium hover:bg-primary transition-colors shadow-sm"
                >
                  Switch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ripple Animation Overlay */}
      {rippleActive && (
        <div className="ripple-overlay">
          <div
            className="ripple-circle"
            style={{ backgroundColor: activePage === 'hostinger' ? '#e9e5de' : '#f6f4f0' }}
          />
        </div>
      )}
    </>
  );
};
