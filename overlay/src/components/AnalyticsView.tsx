import React, { useState } from 'react';
import {
  Trophy,
  Award,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Flame,
  MapPin,
  Calendar,
  Save,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GHOSTS } from '../data/ghosts';

export interface ObjectiveRecord {
  objective_text?: string;
  text?: string;
  completed: boolean;
}

export interface MatchRecord {
  id?: number;
  started_at: number;
  ended_at: number;
  duration_sec: number;
  map_name: string;
  difficulty: string;
  predicted_ghost: string;
  actual_ghost: string;
  is_win: number;
  perfect_game: number;
  evidence_count: number;
  sanity_start: number;
  sanity_end: number;
  hunt_count: number;
  max_ghost_speed: number;
  objectives?: ObjectiveRecord[];
}

export interface AnalyticsSummary {
  total_matches: number;
  wins: number;
  losses: number;
  accuracy_pct: number;
  perfect_games: number;
  avg_duration_sec: number;
  ghost_distribution: Array<{ ghost: string; count: number; wins: number }>;
  map_records: Array<{ map: string; count: number; wins: number; win_rate: number; avg_time: number }>;
  recent_matches: MatchRecord[];
}

interface AnalyticsViewProps {
  summary: AnalyticsSummary | null;
  onRefresh: () => void;
  onSaveMatch: (matchData: Record<string, any>) => void;
  currentMatchState: {
    selectedMap: string;
    difficulty: string;
    evidenceCount: number;
    predictedGhost: string;
    activeDurationSec: number;
    currentSanity: number;
    huntCount: number;
    maxSpeed: number;
    objectives: Array<{ id: string; text: string; completed: boolean }>;
  };
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  summary,
  onRefresh,
  onSaveMatch,
  currentMatchState,
}) => {
  const [actualGhostInput, setActualGhostInput] = useState<string>(
    currentMatchState.predictedGhost || 'Spirit'
  );
  const [isWinInput, setIsWinInput] = useState<boolean>(true);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLogCurrentMatch = () => {
    setIsSaving(true);
    const now = Date.now() / 1000;
    const started = now - currentMatchState.activeDurationSec;

    const payload = {
      started_at: started,
      ended_at: now,
      duration_sec: Math.max(10, currentMatchState.activeDurationSec),
      map_name: currentMatchState.selectedMap,
      difficulty: currentMatchState.difficulty,
      predicted_ghost: currentMatchState.predictedGhost || 'Unknown',
      actual_ghost: actualGhostInput,
      is_win: isWinInput ? 1 : 0,
      evidence_count: currentMatchState.evidenceCount,
      sanity_start: 100,
      sanity_end: currentMatchState.currentSanity,
      hunt_count: currentMatchState.huntCount,
      max_ghost_speed: currentMatchState.maxSpeed,
      objectives: currentMatchState.objectives.map((o) => ({
        objective_text: o.text,
        completed: o.completed ? 1 : 0,
      })),
    };

    onSaveMatch(payload);
    setTimeout(() => {
      setIsSaving(false);
      onRefresh();
    }, 400);
  };

  const total = summary?.total_matches || 0;
  const wins = summary?.wins || 0;
  const perfect = summary?.perfect_games || 0;
  const acc = summary?.accuracy_pct || 0;
  const avgDur = summary?.avg_duration_sec || 0;

  return (
    <div className="flex-1 grid grid-cols-12 gap-4 overflow-y-auto pr-1">
      {/* Top 4 KPI Metric Cards */}
      <div className="col-span-12 grid grid-cols-4 gap-3">
        {/* Total Matches */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Matches Investigated
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{total}</span>
              <span className="text-xs text-slate-400">
                ({wins}W • {total - wins}L)
              </span>
            </div>
          </div>
          <div className="p-3 bg-sky-500/15 border border-sky-500/30 rounded-xl text-sky-400">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Identification Accuracy
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400">{acc}%</span>
              <span className="text-xs text-slate-400">Correct Ghost</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        {/* Perfect Games */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Perfect Games
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-300">{perfect}</span>
              <span className="text-xs text-amber-200/80">3-Star & All Obj</span>
            </div>
          </div>
          <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* Avg Duration */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Avg Contract Time
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-indigo-300">
                {formatDuration(avgDur)}
              </span>
              <span className="text-xs text-slate-400">Per Match</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Left Column: Quick Match Logger & Ghost Breakdown */}
      <div className="col-span-5 flex flex-col gap-4">
        {/* Quick Log Current Match Card */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <Save className="w-4 h-4" /> Log Active Contract to SQLite
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Live Duration: {formatDuration(currentMatchState.activeDurationSec)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div>
              <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">
                Contract Map
              </label>
              <div className="px-2.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 truncate">
                {currentMatchState.selectedMap}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">
                Predicted Ghost
              </label>
              <div className="px-2.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-emerald-300 font-bold truncate">
                {currentMatchState.predictedGhost || 'None Selected'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div>
              <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">
                Actual True Ghost
              </label>
              <select
                value={actualGhostInput}
                onChange={(e) => setActualGhostInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-slate-100 font-medium focus:outline-none focus:border-sky-500"
              >
                {GHOSTS.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">
                Investigation Result
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsWinInput(true)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1 ${
                    isWinInput
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Won
                </button>
                <button
                  type="button"
                  onClick={() => setIsWinInput(false)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1 ${
                    !isWinInput
                      ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" /> Lost
                </button>
              </div>
            </div>
          </div>

          {/* Objectives in current match */}
          {currentMatchState.objectives.length > 0 && (
            <div className="mb-3.5 bg-slate-950/80 rounded-xl p-2.5 border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Active Objectives ({currentMatchState.objectives.filter((o) => o.completed).length}/
                {currentMatchState.objectives.length})
              </span>
              <div className="space-y-1">
                {currentMatchState.objectives.map((obj) => (
                  <div key={obj.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <span
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                        obj.completed
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 border border-slate-700'
                      }`}
                    >
                      {obj.completed ? '✓' : ''}
                    </span>
                    <span className={`truncate ${obj.completed ? 'line-through text-slate-400' : ''}`}>
                      {obj.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={handleLogCurrentMatch}
            className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition active:scale-[0.98]"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving to Database...' : 'Record Match & Refresh Analytics'}
          </button>
        </div>

        {/* Ghost Encounter Frequency Bar Chart */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
            <Flame className="w-4 h-4 text-amber-400" /> Ghost Encounter Distribution
          </h3>

          {!summary || summary.ghost_distribution.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center">
              No recorded ghost encounters yet. Play matches or log a contract to populate graphs!
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {summary.ghost_distribution.map((item) => {
                const maxCount = summary.ghost_distribution[0]?.count || 1;
                const pct = Math.round((item.count / maxCount) * 100);
                const winRate = item.count > 0 ? Math.round((item.wins / item.count) * 100) : 0;
                return (
                  <div key={item.ghost} className="flex flex-col text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-slate-200">{item.ghost}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.count}x ({winRate}% Win)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="bg-sky-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(6, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Map Win Rates & Recent Match History */}
      <div className="col-span-7 flex flex-col gap-4">
        {/* Map Win Rates & Play Records */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-sky-400" /> Map Win Rates & Records
            </h3>
            <button
              onClick={onRefresh}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {!summary || summary.map_records.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">
              No map history recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                    <th className="pb-2">Map Name</th>
                    <th className="pb-2 text-center">Played</th>
                    <th className="pb-2 text-center">Win Rate</th>
                    <th className="pb-2 text-right">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summary.map_records.map((mr) => (
                    <tr key={mr.map} className="hover:bg-slate-800/30">
                      <td className="py-2 font-medium text-slate-200">{mr.map}</td>
                      <td className="py-2 text-center font-mono text-slate-300">{mr.count}</td>
                      <td className="py-2 text-center">
                        <span
                          className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                            mr.win_rate >= 75
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : mr.win_rate >= 50
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {mr.win_rate}%
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-slate-400">
                        {formatDuration(mr.avg_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Matches Detailed History */}
        <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
            <Calendar className="w-4 h-4 text-indigo-400" /> Recent Match History
          </h3>

          {!summary || summary.recent_matches.length === 0 ? (
            <div className="text-xs text-slate-400 py-12 text-center">
              No recent match recaps found in database.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {summary.recent_matches.map((m) => {
                const isExpanded = expandedMatchId === m.id;
                const won = Boolean(m.is_win);
                const perfectGame = Boolean(m.perfect_game);
                return (
                  <div
                    key={m.id || m.ended_at}
                    className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-3 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            won ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-xs font-bold text-white">{m.map_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {m.difficulty}
                        </span>
                        {perfectGame && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Perfect
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-slate-400">
                          {formatDuration(m.duration_sec)}
                        </span>
                        <button
                          onClick={() => setExpandedMatchId(isExpanded ? null : m.id || null)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          True Ghost:{' '}
                          <strong className={won ? 'text-emerald-300' : 'text-slate-200'}>
                            {m.actual_ghost}
                          </strong>
                        </span>
                        {m.predicted_ghost && m.predicted_ghost !== m.actual_ghost && (
                          <span className="text-slate-400 line-through text-[11px]">
                            Guessed: {m.predicted_ghost}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(m.ended_at)}
                      </span>
                    </div>

                    {/* Expanded Objectives & Extra Stats */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 bg-slate-900/50 rounded-lg p-2.5 space-y-1.5">
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-300 font-mono mb-2">
                          <div>Hunts: {m.hunt_count}</div>
                          <div>Max Speed: {m.max_ghost_speed?.toFixed(2)} m/s</div>
                          <div>Final Sanity: {Math.round(m.sanity_end)}%</div>
                        </div>

                        {m.objectives && m.objectives.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Completed Objectives
                            </span>
                            {m.objectives.map((obj, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-xs text-slate-300"
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                                    obj.completed
                                      ? 'bg-emerald-500 text-slate-950 font-bold'
                                      : 'bg-slate-800 border border-slate-700'
                                  }`}
                                >
                                  {obj.completed ? '✓' : ''}
                                </span>
                                <span
                                  className={`truncate ${
                                    obj.completed ? 'text-slate-200' : 'text-slate-400 line-through'
                                  }`}
                                >
                                  {obj.objective_text || obj.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
