import React, { useEffect } from 'react';
import { Sparkles, GitCommit, Calendar, User, FileCode, CheckCircle, X } from 'lucide-react';

export interface PendingChangelog {
  commit_sha: string;
  date: string;
  author: string;
  message: string;
  files_updated: number;
}

interface ChangelogModalProps {
  version: string;
  changelog: PendingChangelog;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  version,
  changelog,
  onClose,
}) => {
  // Allow ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Split commit message into headline and details
  const messageLines = changelog.message.split('\n').map((l) => l.trim()).filter(Boolean);
  const headline = messageLines[0] || 'PhasmoSense Update Applied';
  const detailLines = messageLines.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="relative w-full max-w-xl bg-slate-900/95 border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/60 overflow-hidden flex flex-col max-h-[85vh]"
        style={{ borderColor: 'var(--accent-color, #06b6d4)' }}
      >
        {/* Top Glow Bar */}
        <div
          className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400"
          style={{
            background: 'linear-gradient(90deg, var(--accent-color, #06b6d4), #3b82f6, #10b981)',
          }}
        />

        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
              style={{
                color: 'var(--accent-color, #06b6d4)',
                borderColor: 'var(--accent-color, #06b6d4)',
              }}
            >
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Updated Successfully
                </span>
                <span className="text-xs font-mono text-slate-400">v{version}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-100 tracking-wide mt-1">
                What's New in PhasmoSense
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-300">
          {/* Metadata pill badge row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-700/60">
              <GitCommit className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="font-mono text-slate-300 truncate">{changelog.commit_sha}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-700/60">
              <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-300 truncate">{changelog.author || 'Author'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-700/60">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-300 truncate">
                {changelog.date ? changelog.date.split('T')[0] : 'Today'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-700/60">
              <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-300 truncate">{changelog.files_updated} file(s) synced</span>
            </div>
          </div>

          {/* Headline Banner */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5">
            <h3 className="text-slate-100 font-semibold text-sm leading-snug flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              {headline}
            </h3>
            {detailLines.length > 0 && (
              <div className="mt-3 space-y-1.5 pl-6 border-l-2 border-slate-700">
                {detailLines.map((line, idx) => {
                  const cleaned = line.replace(/^[*-•]\s*/, '');
                  return (
                    <div key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                      <span className="text-cyan-400 font-bold shrink-0">•</span>
                      <span>{cleaned}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Zero-Friction Info Note */}
          <div className="text-xs text-slate-400 bg-cyan-950/20 border border-cyan-800/30 p-2.5 rounded-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              PhasmoSense updates delta files automatically on launch without disrupting your existing settings or database.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg font-semibold text-sm text-slate-900 bg-cyan-400 hover:bg-cyan-300 transition-all shadow-md hover:shadow-cyan-500/20 active:scale-95 flex items-center gap-2"
            style={{
              backgroundColor: 'var(--accent-color, #06b6d4)',
              color: '#0f172a',
            }}
          >
            <span>Let's Hunt</span>
            <span>👻</span>
          </button>
        </div>
      </div>
    </div>
  );
};
