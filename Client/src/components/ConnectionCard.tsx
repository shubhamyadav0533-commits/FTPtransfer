import React, { useState } from 'react';
import { Link, Zap } from 'lucide-react';
import { SftpCredentials } from '../types';

interface Props {
  credentials: SftpCredentials;
  onChange: (creds: SftpCredentials) => void;
  onConnect: () => void;
  label?: string;
  onPreset?: () => void;
  presetLabel?: string;
}

export const ConnectionCard: React.FC<Props> = ({
  credentials,
  onChange,
  onConnect,
  label = 'Hostinger',
  onPreset,
  presetLabel,
}) => {
  const [error, setError] = useState<string | null>(null);
  const handleChange = (field: keyof SftpCredentials, value: string) => {
    onChange({ ...credentials, [field]: field === 'port' ? parseInt(value) || 22 : value });
  };

  const protocolLabel = 'SFTP';

  const handleConnect = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!credentials.host || !credentials.user || !credentials.password) {
      setError('Required: Host, User, Password');
      return;
    }
    setError(null);
    onConnect();
  };

  return (
    <section className="bg-card shadow-sm rounded-2xl border border-taupe-200 p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-taupe-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0">
            <Link className="text-primary w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">{protocolLabel} Connection</h2>
            <p className="text-sm text-text-muted line-clamp-1">Enter your {label} credentials</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onPreset && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onPreset();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-text transition-colors rounded-lg text-sm font-semibold border border-taupe-200 shadow-sm"
              type="button"
            >
              <span className="hidden sm:inline">{presetLabel || 'Load preset'}</span>
              <span className="sm:hidden">Preset</span>
            </button>
          )}
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/80 text-white transition-colors rounded-lg text-sm font-semibold shadow-sm shrink-0"
            type="button"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Connect</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-50 text-red-600 text-xs font-medium rounded-lg border border-red-100 flex items-center gap-1.5">
          {error}
        </div>
      )}

      <form className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 content-start" autoComplete="off">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text">{protocolLabel} Hostname / IP</label>
          <input
            className="w-full bg-background border border-taupe-200 rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            type="text"
            placeholder="123.234.456.87"
            value={credentials.host}
            onChange={(e) => handleChange('host', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text">Port</label>
          <input
            className="w-full bg-background border border-taupe-200 rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            type="number"
            placeholder="22"
            value={credentials.port || ''}
            onChange={(e) => handleChange('port', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text">Username</label>
          <input
            className="w-full bg-background border border-taupe-200 rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            type="text"
            placeholder={`${protocolLabel} username`}
            value={credentials.user}
            onChange={(e) => handleChange('user', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text">Password</label>
          <input
            className="w-full bg-background border border-taupe-200 rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            type="password"
            placeholder={`${protocolLabel} password`}
            value={credentials.password || ''}
            onChange={(e) => handleChange('password', e.target.value)}
          />
        </div>
      </form>
    </section>
  );
};
