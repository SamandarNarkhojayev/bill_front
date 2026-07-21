import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Maximize2, RefreshCw } from 'lucide-react';
import '../App.css';
import { translate } from '../i18n/translate';
import type { AppLanguage, Tournament, TournamentParticipant } from '../types';

interface BracketPayload {
  tournament: Tournament;
  language: AppLanguage;
  currency: string;
}

const getParticipantLabel = (p?: TournamentParticipant | null): string => {
  if (!p) return 'TBD';
  const full = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  return full || p.name || '—';
};

const BracketWindow: React.FC = () => {
  const [payload, setPayload] = useState<BracketPayload | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.bracket;
    if (!api) return;
    let mounted = true;
    api.getData().then((d: BracketPayload | null) => {
      if (mounted && d) setPayload(d);
    });
    api.onData((d: (BracketPayload & { _force?: boolean }) | null) => {
      if (!d) return;
      setPayload((prev) => {
        // Принудительное переключение (явное открытие) — всегда применяем.
        if (d._force) return d;
        // Фоновое обновление применяем только для той же сетки, что показана.
        if (prev && prev.tournament.id !== d.tournament.id) return prev;
        return d;
      });
    });
    return () => {
      mounted = false;
      api.removeDataListener?.();
    };
  }, []);

  const lang = payload?.language || 'ru';
  const t = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);

  const tournament = payload?.tournament || null;

  const rounds = useMemo(() => {
    if (!tournament) return [];
    return Array.from(new Set(tournament.matches.map((m) => m.round))).sort((a, b) => a - b);
  }, [tournament]);

  const isElim = tournament
    ? tournament.bracketType === 'single-elimination' || tournament.bracketType === 'double-elimination'
    : false;

  const roundLabel = (roundIndex: number, total: number): string => {
    if (isElim) {
      const fromEnd = total - roundIndex;
      if (fromEnd === 1) return `🏆 ${t('tournaments.roundFinal')}`;
      if (fromEnd === 2) return t('tournaments.roundSemifinal');
      if (fromEnd === 3) return t('tournaments.roundQuarterfinal');
      if (fromEnd === 4) return t('tournaments.roundEighthfinal');
      if (fromEnd === 5) return t('tournaments.roundSixteenthfinal');
    }
    return t('tournaments.roundNumber', { number: roundIndex + 1 });
  };

  const champion = useMemo(() => {
    if (!tournament?.winnerId) return null;
    return tournament.participants.find((p) => p.id === tournament.winnerId) || null;
  }, [tournament]);

  if (!tournament) {
    return (
      <div className="bracket-window">
        <div className="bracket-win-loading">
          <RefreshCw size={28} className="animate-spin" />
          <span>{translate(lang, 'common.loading')}</span>
        </div>
      </div>
    );
  }

  const totalRounds = rounds.length;
  const statusKey =
    tournament.status === 'active' ? 'tournaments.statusActive'
    : tournament.status === 'completed' ? 'tournaments.statusCompleted'
    : tournament.status === 'cancelled' ? 'tournaments.statusCancelled'
    : 'tournaments.statusDraft';

  return (
    <div className="bracket-window" data-theme="dark">
      <div className="bracket-window-header">
        <div className="bracket-window-title">
          <Trophy size={26} className="text-amber-400" />
          <div>
            <h1>{tournament.name}</h1>
            <span className={`bracket-window-status status-${tournament.status}`}>{t(statusKey)}</span>
          </div>
        </div>
        {champion && (
          <div className="bracket-window-champion">
            🏆 {t('tournaments.winnerLabel')}: <strong>{getParticipantLabel(champion)}</strong>
          </div>
        )}
        <button className="btn btn-ghost" onClick={() => window.electronAPI?.bracket?.toggleFullscreen?.()}>
          <Maximize2 size={16} /> {t('tournaments.fullscreen')}
        </button>
      </div>

      <div className="bracket-window-body">
        {rounds.length === 0 ? (
          <div className="bracket-win-loading">{t('tournaments.bracketEmptyText')}</div>
        ) : (
          <div className="bracket-container bracket-window-container">
            {rounds.map((round, roundIndex) => {
              const roundMatches = tournament.matches
                .filter((m) => m.round === round)
                .sort((a, b) => a.matchNumber - b.matchNumber);
              const isFinalRound = roundIndex === totalRounds - 1 && isElim;
              return (
                <div className="bracket-round" key={round}>
                  <div className="bracket-round-title">{roundLabel(roundIndex, totalRounds)}</div>
                  <div className="bracket-round-matches">
                    {roundMatches.map((match) => {
                      const isCompleted = match.matchStatus === 'completed';
                      const isActive = match.matchStatus === 'in-progress';
                      const isBye = match.matchStatus === 'bye';
                      const win1 = match.winner?.id && match.winner.id === match.participant1?.id;
                      const win2 = match.winner?.id && match.winner.id === match.participant2?.id;
                      return (
                        <div className="bracket-match-wrapper" key={match.id}>
                          <div className={`bracket-match${isFinalRound ? ' is-final' : ''}${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}${isBye ? ' is-bye' : ''}`}>
                            <div className="bracket-match-number" style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{isFinalRound ? `★ ${t('tournaments.roundFinal')}` : t('tournaments.matchLabel', { number: match.matchNumber })}</span>
                              {isActive && match.tableNumber ? (
                                <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: 4 }}>
                                  {t('tournaments.tableHash', { number: match.tableNumber })}
                                </span>
                              ) : isBye ? (
                                <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontStyle: 'italic' }}>BYE</span>
                              ) : null}
                            </div>
                            <div className={`bracket-match-player${!match.participant1 ? ' is-tbd' : ''}${win1 ? ' is-winner' : ''}`}>
                              <span className="bracket-match-name">{getParticipantLabel(match.participant1)}</span>
                              {isCompleted && match.score1 != null && <span className="bracket-match-score">{match.score1}</span>}
                            </div>
                            <div className="bracket-match-vs">
                              {isActive ? `⚡ ${t('tournaments.inProgressShort')}` : isCompleted && match.score1 != null ? `${match.score1} : ${match.score2}` : 'VS'}
                            </div>
                            <div className={`bracket-match-player${!match.participant2 ? ' is-tbd' : ''}${win2 ? ' is-winner' : ''}`}>
                              <span className="bracket-match-name">{getParticipantLabel(match.participant2)}</span>
                              {isCompleted && match.score2 != null && <span className="bracket-match-score">{match.score2}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BracketWindow;
