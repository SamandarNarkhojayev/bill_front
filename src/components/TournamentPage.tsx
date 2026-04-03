import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Plus, Users, Grid, Settings as SettingsIcon, Play, Award, Trash2, Info, Camera, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Tournament, BracketType, TournamentStatus, TournamentParticipant, TournamentMatch, MatchStatus, TournamentPlacement } from '../types';

type ParticipantDraft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  photo: string;
};

const dateToStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const emptyParticipantDraft = (): ParticipantDraft => ({
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  photo: '',
});

const toDigits = (value: string) => value.replace(/\D/g, '');

const formatPhone = (raw: string) => {
  const digits = toDigits(raw);
  if (!digits) return '';

  let normalized = digits;
  if (normalized.startsWith('8')) normalized = `7${normalized.slice(1)}`;
  if (!normalized.startsWith('7')) normalized = `7${normalized}`;
  normalized = normalized.slice(0, 11);

  const code = normalized.slice(1, 4);
  const p1 = normalized.slice(4, 7);
  const p2 = normalized.slice(7, 9);
  const p3 = normalized.slice(9, 11);

  let out = '+7';
  if (code) out += ` (${code}`;
  if (code.length === 3 && normalized.length > 4) out += ')';
  if (p1) out += ` ${p1}`;
  if (p2) out += `-${p2}`;
  if (p3) out += `-${p3}`;

  return out;
};

type SeedSlot = TournamentParticipant | null;

const nextPowerOfTwo = (value: number) => {
  let p = 1;
  while (p < value) p *= 2;
  return p;
};

const getParticipantLabel = (p?: TournamentParticipant | null) => {
  if (!p) return 'TBD';
  const full = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  return full || p.name || 'Без имени';
};

const getSeedSlotCount = (tournament: Tournament) => {
  const base = Math.max(2, tournament.participantCount, tournament.participants.length);
  if (tournament.bracketType === 'single-elimination' || tournament.bracketType === 'double-elimination') {
    return nextPowerOfTwo(base);
  }
  if (tournament.bracketType === 'page-playoff') {
    return Math.max(4, base);
  }
  return base;
};

const buildSeedSlots = (tournament: Tournament): SeedSlot[] => {
  const ordered = [...tournament.participants].sort((a, b) => (a.position || 0) - (b.position || 0));
  const count = getSeedSlotCount(tournament);
  const slots: SeedSlot[] = [...ordered];
  while (slots.length < count) slots.push(null);
  return slots;
};

const createMatch = (
  tournamentId: string,
  round: number,
  matchNumber: number,
  participant1?: TournamentParticipant,
  participant2?: TournamentParticipant,
): TournamentMatch => {
  const hasBye = (!!participant1 && !participant2) || (!participant1 && !!participant2);
  let matchStatus: MatchStatus = 'pending';
  let winner: TournamentParticipant | undefined;
  if (hasBye) {
    matchStatus = 'bye';
    winner = participant1 || participant2;
  }
  return {
    id: `${tournamentId}-${round}-${matchNumber}-${Math.random().toString(36).slice(2, 8)}`,
    round,
    matchNumber,
    participant1,
    participant2,
    winner,
    matchStatus,
  };
};

const generateSingleElimination = (tournament: Tournament, slots: SeedSlot[]) => {
  const n = nextPowerOfTwo(Math.max(2, slots.length));
  const entrants = [...slots];
  while (entrants.length < n) entrants.push(null);

  const matches: TournamentMatch[] = [];
  let matchNumber = 1;

  for (let i = 0; i < n / 2; i++) {
    matches.push(createMatch(tournament.id, 1, matchNumber++, entrants[i] || undefined, entrants[n - 1 - i] || undefined));
  }

  const rounds = Math.log2(n);
  for (let round = 2; round <= rounds; round++) {
    const matchesInRound = n / Math.pow(2, round);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push(createMatch(tournament.id, round, matchNumber++));
    }
  }

  return matches;
};

const generateRoundRobin = (tournament: Tournament, slots: SeedSlot[]) => {
  const players = slots.filter(Boolean) as TournamentParticipant[];
  if (players.length < 2) return [];

  const list: (TournamentParticipant | null)[] = [...players];
  if (list.length % 2 !== 0) list.push(null);

  const rounds = list.length - 1;
  const matchesPerRound = list.length / 2;
  const matches: TournamentMatch[] = [];
  let matchNumber = 1;

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a && b) {
        matches.push(createMatch(tournament.id, round, matchNumber++, a, b));
      }
    }

    const fixed = list[0];
    const rotated = [fixed, list[list.length - 1], ...list.slice(1, -1)];
    list.splice(0, list.length, ...rotated);
  }

  return matches;
};

const generateSwiss = (tournament: Tournament, slots: SeedSlot[]) => {
  const players = slots.filter(Boolean) as TournamentParticipant[];
  if (players.length < 2) return [];

  const rounds = Math.max(1, Math.ceil(Math.log2(players.length)));
  const firstRound: TournamentMatch[] = [];
  let matchNumber = 1;

  for (let i = 0; i < Math.floor(players.length / 2); i++) {
    firstRound.push(createMatch(tournament.id, 1, matchNumber++, players[i], players[players.length - 1 - i]));
  }

  const all = [...firstRound];
  const perRound = Math.floor(players.length / 2);
  for (let round = 2; round <= rounds; round++) {
    for (let i = 0; i < perRound; i++) {
      all.push(createMatch(tournament.id, round, matchNumber++));
    }
  }

  return all;
};

const generateGroupPlayoff = (tournament: Tournament, slots: SeedSlot[]) => {
  const players = slots.filter(Boolean) as TournamentParticipant[];
  if (players.length < 2) return [];

  const groupSize = 4;
  const groupsCount = Math.max(2, Math.ceil(players.length / groupSize));
  const groups: TournamentParticipant[][] = Array.from({ length: groupsCount }, () => []);
  players.forEach((p, i) => groups[i % groupsCount].push(p));

  const matches: TournamentMatch[] = [];
  let round = 1;
  let matchNumber = 1;

  groups.forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push(createMatch(tournament.id, round, matchNumber++, group[i], group[j]));
      }
    }
    round += 1;
  });

  matches.push(createMatch(tournament.id, round, matchNumber++));
  matches.push(createMatch(tournament.id, round, matchNumber++));
  matches.push(createMatch(tournament.id, round + 1, matchNumber++));

  return matches;
};

const generatePagePlayoff = (tournament: Tournament, slots: SeedSlot[]) => {
  const players = (slots.filter(Boolean) as TournamentParticipant[]).slice(0, 4);

  const p1 = players[0];
  const p2 = players[1];
  const p3 = players[2];
  const p4 = players[3];

  return [
    createMatch(tournament.id, 1, 1, p1, p2),
    createMatch(tournament.id, 1, 2, p3, p4),
    createMatch(tournament.id, 2, 3),
    createMatch(tournament.id, 3, 4),
  ];
};

const generateDoubleElimination = (tournament: Tournament, slots: SeedSlot[]) => {
  const upper = generateSingleElimination(tournament, slots);
  const upperRounds = Math.max(...upper.map((m) => m.round));
  const n = nextPowerOfTwo(Math.max(2, slots.length));
  const lowerMatches = n - 1;
  const matches: TournamentMatch[] = [...upper];

  let matchNumber = upper.length + 1;
  for (let i = 0; i < lowerMatches; i++) {
    const round = upperRounds + 1 + Math.floor(i / Math.max(1, n / 4));
    matches.push(createMatch(tournament.id, round, matchNumber++));
  }

  return matches;
};

const generateMatchesByType = (tournament: Tournament, slots: SeedSlot[]) => {
  switch (tournament.bracketType) {
    case 'single-elimination':
      return generateSingleElimination(tournament, slots);
    case 'double-elimination':
      return generateDoubleElimination(tournament, slots);
    case 'round-robin':
      return generateRoundRobin(tournament, slots);
    case 'swiss':
      return generateSwiss(tournament, slots);
    case 'group-playoff':
      return generateGroupPlayoff(tournament, slots);
    case 'page-playoff':
      return generatePagePlayoff(tournament, slots);
    default:
      return [];
  }
};

/* ── Продвижение победителя по сетке ── */
const advanceWinnerInBracket = (
  matches: TournamentMatch[],
  completedMatch: TournamentMatch,
  bType: BracketType,
): TournamentMatch[] => {
  const updated = matches.map(m => ({ ...m }));
  const winner = completedMatch.winner;
  if (!winner) return updated;

  if (bType === 'single-elimination' || bType === 'double-elimination') {
    const roundMatches = updated
      .filter(m => m.round === completedMatch.round)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const pos = roundMatches.findIndex(m => m.id === completedMatch.id);
    if (pos === -1) return updated;

    const nextRound = completedMatch.round + 1;
    const nextRoundMatches = updated
      .filter(m => m.round === nextRound)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    if (nextRoundMatches.length === 0) return updated; // Финал — некуда продвигать

    const nextIdx = Math.floor(pos / 2);
    if (nextIdx >= nextRoundMatches.length) return updated;

    const mIdx = updated.findIndex(m => m.id === nextRoundMatches[nextIdx].id);
    if (mIdx === -1) return updated;

    updated[mIdx] = pos % 2 === 0
      ? { ...updated[mIdx], participant1: winner }
      : { ...updated[mIdx], participant2: winner };

    // Проверяем: оба фидера разрешены — и получился bye?
    const nm = updated[mIdx];
    const feeders = roundMatches.filter((_, i) => Math.floor(i / 2) === nextIdx);
    const allFeedersResolved = feeders.every(f => f.matchStatus === 'completed' || f.matchStatus === 'bye');
    if (allFeedersResolved) {
      const isBye = (!!nm.participant1 && !nm.participant2) || (!nm.participant1 && !!nm.participant2);
      if (isBye) {
        updated[mIdx] = { ...updated[mIdx], winner: nm.participant1 || nm.participant2, matchStatus: 'bye' };
        return advanceWinnerInBracket(updated, updated[mIdx], bType);
      }
    }
    return updated;
  }

  if (bType === 'page-playoff') {
    const mn = completedMatch.matchNumber;
    const loser = completedMatch.participant1?.id === winner.id
      ? completedMatch.participant2
      : completedMatch.participant1;
    if (mn === 1) {
      const i4 = updated.findIndex(m => m.matchNumber === 4);
      const i3 = updated.findIndex(m => m.matchNumber === 3);
      if (i4 !== -1) updated[i4] = { ...updated[i4], participant1: winner };
      if (i3 !== -1 && loser) updated[i3] = { ...updated[i3], participant1: loser };
    } else if (mn === 2) {
      const i3 = updated.findIndex(m => m.matchNumber === 3);
      if (i3 !== -1) updated[i3] = { ...updated[i3], participant2: winner };
    } else if (mn === 3) {
      const i4 = updated.findIndex(m => m.matchNumber === 4);
      if (i4 !== -1) updated[i4] = { ...updated[i4], participant2: winner };
    }
    return updated;
  }

  // round-robin, swiss, group-playoff — нет древовидного продвижения
  return updated;
};

type StandingsRow = {
  participant: TournamentParticipant;
  wins: number;
  losses: number;
  points: number;
  scored: number;
  conceded: number;
};

const pairKey = (a: string, b: string) => [a, b].sort().join('::');

const buildStandings = (
  participants: TournamentParticipant[],
  matches: TournamentMatch[],
  rounds: number[],
) => {
  const map = new Map<string, StandingsRow>();
  participants.forEach((p) => {
    map.set(p.id, {
      participant: p,
      wins: 0,
      losses: 0,
      points: 0,
      scored: 0,
      conceded: 0,
    });
  });

  matches
    .filter((m) => rounds.includes(m.round))
    .forEach((m) => {
      const p1 = m.participant1;
      const p2 = m.participant2;
      const w = m.winner;
      if (!w) return;

      if (m.matchStatus === 'bye') {
        const row = map.get(w.id);
        if (row) {
          row.wins += 1;
          row.points += 1;
          row.scored += 1;
        }
        return;
      }

      if (!p1 || !p2) return;
      const r1 = map.get(p1.id);
      const r2 = map.get(p2.id);
      if (!r1 || !r2) return;

      const s1 = m.score1 ?? 0;
      const s2 = m.score2 ?? 0;
      r1.scored += s1;
      r1.conceded += s2;
      r2.scored += s2;
      r2.conceded += s1;

      if (w.id === p1.id) {
        r1.wins += 1;
        r1.points += 1;
        r2.losses += 1;
      } else if (w.id === p2.id) {
        r2.wins += 1;
        r2.points += 1;
        r1.losses += 1;
      }
    });

  return [...map.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.scored - a.conceded;
    const diffB = b.scored - b.conceded;
    if (diffB !== diffA) return diffB - diffA;
    return (a.participant.position || 0) - (b.participant.position || 0);
  });
};

const buildTournamentPlacements = (
  tournament: Tournament,
  matches: TournamentMatch[],
): TournamentPlacement[] => {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const standings = buildStandings(tournament.participants, matches, rounds);
  const prizeMap = new Map<number, string>();
  (tournament.prizePlaces || []).forEach((p) => prizeMap.set(p.place, p.prize));

  return standings.map((row, idx) => ({
    place: idx + 1,
    participantId: row.participant.id,
    participantName: getParticipantLabel(row.participant),
    prize: prizeMap.get(idx + 1),
  }));
};

const fillSwissNextRound = (
  tournament: Tournament,
  matches: TournamentMatch[],
  nextRound: number,
) => {
  const nextRoundMatches = matches
    .filter((m) => m.round === nextRound)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (nextRoundMatches.length === 0) return matches;

  const standings = buildStandings(
    tournament.participants,
    matches,
    Array.from({ length: nextRound - 1 }, (_, i) => i + 1),
  );

  const played = new Set<string>();
  matches
    .filter((m) => m.round < nextRound)
    .forEach((m) => {
      if (m.participant1 && m.participant2) {
        played.add(pairKey(m.participant1.id, m.participant2.id));
      }
    });

  const pool = standings.map((s) => s.participant);
  const pairs: Array<[TournamentParticipant, TournamentParticipant]> = [];
  while (pool.length >= 2) {
    const first = pool.shift()!;
    let idx = pool.findIndex((cand) => !played.has(pairKey(first.id, cand.id)));
    if (idx < 0) idx = 0;
    const second = pool.splice(idx, 1)[0];
    pairs.push([first, second]);
    played.add(pairKey(first.id, second.id));
  }

  const out = matches.map((m) => ({ ...m }));
  nextRoundMatches.forEach((m, i) => {
    const idx = out.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    const pair = pairs[i];
    if (pair) {
      out[idx] = {
        ...out[idx],
        participant1: pair[0],
        participant2: pair[1],
        winner: undefined,
        score1: undefined,
        score2: undefined,
        matchStatus: 'pending',
      };
    }
  });
  return out;
};

const fillGroupPlayoffNextRound = (
  tournament: Tournament,
  matches: TournamentMatch[],
  curRound: number,
  nextRound: number,
) => {
  const out = matches.map((m) => ({ ...m }));
  const nextRoundMatches = out
    .filter((m) => m.round === nextRound)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (nextRoundMatches.length === 0) return out;

  // Финал после полуфиналов
  if (nextRoundMatches.length === 1) {
    const winners = out
      .filter((m) => m.round === curRound)
      .map((m) => m.winner)
      .filter(Boolean) as TournamentParticipant[];
    const finalIdx = out.findIndex((m) => m.id === nextRoundMatches[0].id);
    if (finalIdx !== -1) {
      out[finalIdx] = {
        ...out[finalIdx],
        participant1: winners[0],
        participant2: winners[1],
        matchStatus: winners.length >= 2 ? 'pending' : out[finalIdx].matchStatus,
      };
    }
    return out;
  }

  // Вход в полуфиналы: берём топ-2 из каждой группы (или топ-4 общий fallback)
  const players = [...tournament.participants].sort((a, b) => (a.position || 0) - (b.position || 0));
  const groupSize = 4;
  const groupsCount = Math.max(2, Math.ceil(players.length / groupSize));
  const groups: TournamentParticipant[][] = Array.from({ length: groupsCount }, () => []);
  players.forEach((p, i) => groups[i % groupsCount].push(p));

  const groupTop: TournamentParticipant[][] = groups.map((group, idx) => {
    const table = buildStandings(group, out, [idx + 1]);
    return table.slice(0, 2).map((r) => r.participant);
  });

  let semis: Array<[TournamentParticipant | undefined, TournamentParticipant | undefined]> = [];
  if (groupTop.length >= 2) {
    const a = groupTop[0] || [];
    const b = groupTop[1] || [];
    semis = [
      [a[0], b[1]],
      [b[0], a[1]],
    ];
  } else {
    const allTable = buildStandings(players, out, Array.from({ length: curRound }, (_, i) => i + 1));
    const top4 = allTable.slice(0, 4).map((r) => r.participant);
    semis = [
      [top4[0], top4[3]],
      [top4[1], top4[2]],
    ];
  }

  nextRoundMatches.forEach((m, i) => {
    const idx = out.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    const pair = semis[i];
    out[idx] = {
      ...out[idx],
      participant1: pair?.[0],
      participant2: pair?.[1],
      winner: undefined,
      score1: undefined,
      score2: undefined,
      matchStatus: pair?.[0] && pair?.[1] ? 'pending' : out[idx].matchStatus,
    };
  });

  return out;
};

const TournamentPage: React.FC = () => {
  const { settings, addToast, tournaments, addTournament, updateTournament, removeTournament } = useStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [participantTournament, setParticipantTournament] = useState<Tournament | null>(null);
  const [participantDrafts, setParticipantDrafts] = useState<ParticipantDraft[]>([emptyParticipantDraft()]);
  const [cameraRowIndex, setCameraRowIndex] = useState<number | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  
  // Форма создания турнира
  const [tournamentName, setTournamentName] = useState('');
  const [participantCount, setParticipantCount] = useState(8);
  const [participantCountMode, setParticipantCountMode] = useState<'fixed' | 'min' | 'max'>('fixed');
  const [bracketType, setBracketType] = useState<BracketType>('single-elimination');
  const [showBracketHelp, setShowBracketHelp] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(dateToStr(new Date()));
  const [scheduledTime, setScheduledTime] = useState('19:00');
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [entryFee, setEntryFee] = useState(0);
  const [prizeFund, setPrizeFund] = useState(0);
  const [prizePlacesCount, setPrizePlacesCount] = useState(3);
  const [prizePlaceRewards, setPrizePlaceRewards] = useState<string[]>(['', '', '']);
  const [bracketSeedSlots, setBracketSeedSlots] = useState<SeedSlot[]>([]);
  const [bracketPreviewMatches, setBracketPreviewMatches] = useState<TournamentMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState<TournamentMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');

  const activeTables = settings.tables.filter(t => t.isActive);

  const handleCreateTournament = () => {
    if (!tournamentName.trim()) {
      addToast('error', 'Введите название турнира');
      return;
    }

    if (selectedTableIds.length === 0) {
      addToast('error', 'Выберите хотя бы один стол');
      return;
    }

    if (!Number.isFinite(participantCount) || participantCount < 2) {
      addToast('error', 'Укажите минимум 2 участника');
      return;
    }

    const scheduledStartTime = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
    if (!Number.isFinite(scheduledStartTime)) {
      addToast('error', 'Укажите корректные дату и время начала');
      return;
    }

    const newTournament: Tournament = {
      id: Date.now().toString(),
      name: tournamentName,
      status: 'draft',
      bracketType,
      participantCountMode,
      participantCount: Math.floor(participantCount),
      participants: [],
      tableIds: selectedTableIds,
      tableCount: selectedTableIds.length,
      matches: [],
      scheduledStartTime,
      entryFee: entryFee > 0 ? entryFee : undefined,
      prizeFund: prizeFund > 0 ? prizeFund : undefined,
      prizePlaces: Array.from({ length: Math.max(1, prizePlacesCount) }, (_, i) => ({
        place: i + 1,
        prize: (prizePlaceRewards[i] || '').trim(),
      })),
    };

    addTournament(newTournament);
    addToast('success', `Турнир "${tournamentName}" создан`);
    setShowCreateModal(false);
    resetForm();
  };

  const resetForm = () => {
    setTournamentName('');
    setParticipantCount(8);
    setParticipantCountMode('fixed');
    setBracketType('single-elimination');
    setShowBracketHelp(false);
    setScheduledDate(dateToStr(new Date()));
    setScheduledTime('19:00');
    setSelectedTableIds([]);
    setEntryFee(0);
    setPrizeFund(0);
    setPrizePlacesCount(3);
    setPrizePlaceRewards(['', '', '']);
  };

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp || !Number.isFinite(timestamp)) return '—';
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const regenerateBracket = (tournament: Tournament, slots: SeedSlot[]) => {
    setBracketPreviewMatches(generateMatchesByType(tournament, slots));
  };

  const handleOpenBracket = (tournament: Tournament) => {
    const freshT = tournaments.find(t => t.id === tournament.id) || tournament;
    const slots = buildSeedSlots(freshT);
    setSelectedTournament(freshT);
    setBracketSeedSlots(slots);
    if (freshT.status !== 'draft' && freshT.matches.length > 0) {
      setBracketPreviewMatches(freshT.matches);
    } else {
      regenerateBracket(freshT, slots);
    }
  };

  const handleShuffleSeeds = () => {
    if (!selectedTournament || selectedTournament.status !== 'draft') return;
    const filled = bracketSeedSlots.filter(Boolean) as TournamentParticipant[];
    for (let i = filled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filled[i], filled[j]] = [filled[j], filled[i]];
    }
    const next: SeedSlot[] = [...filled];
    while (next.length < bracketSeedSlots.length) next.push(null);
    setBracketSeedSlots(next);
    regenerateBracket(selectedTournament, next);
  };

  const handleMoveSeed = (index: number, direction: -1 | 1) => {
    if (!selectedTournament || selectedTournament.status !== 'draft') return;
    const target = index + direction;
    if (target < 0 || target >= bracketSeedSlots.length) return;
    const next = [...bracketSeedSlots];
    [next[index], next[target]] = [next[target], next[index]];
    setBracketSeedSlots(next);
    regenerateBracket(selectedTournament, next);
  };

  const handleSwapInsidePair = (pairIndex: number) => {
    if (!selectedTournament || selectedTournament.status !== 'draft') return;
    const i = pairIndex * 2;
    if (i + 1 >= bracketSeedSlots.length) return;
    const next = [...bracketSeedSlots];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setBracketSeedSlots(next);
    regenerateBracket(selectedTournament, next);
  };

  const handleSwapPairs = (pairIndex: number) => {
    if (!selectedTournament || selectedTournament.status !== 'draft') return;
    const i = pairIndex * 2;
    const j = i + 2;
    if (j + 1 >= bracketSeedSlots.length) return;
    const next = [...bracketSeedSlots];
    [next[i], next[j]] = [next[j], next[i]];
    [next[i + 1], next[j + 1]] = [next[j + 1], next[i + 1]];
    setBracketSeedSlots(next);
    regenerateBracket(selectedTournament, next);
  };

  const handleSaveBracket = () => {
    if (!selectedTournament) return;
    const orderedParticipants = (bracketSeedSlots.filter(Boolean) as TournamentParticipant[]).map((p, idx) => ({
      ...p,
      position: idx + 1,
    }));
    const matches = generateMatchesByType(selectedTournament, bracketSeedSlots);
    updateTournament(selectedTournament.id, { participants: orderedParticipants, matches });
    setSelectedTournament((prev) => prev ? { ...prev, participants: orderedParticipants, matches } : prev);
    setBracketPreviewMatches(matches);
    addToast('success', 'Сетка сохранена');
  };

  const handleOpenAddParticipant = (tournament: Tournament) => {
    setParticipantTournament(tournament);
    setParticipantDrafts([emptyParticipantDraft()]);
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraRowIndex(null);
    setCameraLoading(false);
    setCameraError('');
  };

  const closeParticipantModal = () => {
    stopCamera();
    setParticipantTournament(null);
  };

  const handleParticipantFieldChange = (index: number, field: keyof ParticipantDraft, value: string) => {
    setParticipantDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleAddParticipantRow = () => {
    setParticipantDrafts((prev) => [...prev, emptyParticipantDraft()]);
  };

  const handleRemoveParticipantRow = (index: number) => {
    if (cameraRowIndex === index) {
      stopCamera();
    } else if (cameraRowIndex !== null && cameraRowIndex > index) {
      setCameraRowIndex((prev) => (prev === null ? null : prev - 1));
    }

    setParticipantDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyParticipantDraft()];
    });
  };

  const handlePhoneChange = (index: number, value: string) => {
    handleParticipantFieldChange(index, 'phone', formatPhone(value));
  };

  const handleParticipantPhoto = (index: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      handleParticipantFieldChange(index, 'photo', result);
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCamera = async (index: number) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      addToast('error', 'Камера не поддерживается на этом устройстве');
      return;
    }

    stopCamera();
    setCameraError('');
    setCameraLoading(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraRowIndex(index);
    } catch {
      setCameraError('Не удалось получить доступ к камере. Проверьте разрешения.');
      addToast('error', 'Нет доступа к камере');
    } finally {
      setCameraLoading(false);
    }
  };

  const handleCaptureFromCamera = () => {
    if (cameraRowIndex === null || !cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    handleParticipantFieldChange(cameraRowIndex, 'photo', dataUrl);
    stopCamera();
    addToast('success', 'Фото сделано');
  };

  useEffect(() => {
    if (cameraRowIndex === null || !cameraVideoRef.current || !cameraStreamRef.current) return;
    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    cameraVideoRef.current.play().catch(() => undefined);
  }, [cameraRowIndex]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleAddParticipant = () => {
    if (!participantTournament) return;

    const prepared = participantDrafts
      .map((p) => ({
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        birthDate: p.birthDate.trim(),
        phone: p.phone.trim(),
        photo: p.photo,
      }))
      .filter((p) => p.firstName || p.lastName || p.birthDate || p.phone || p.photo);

    if (prepared.length === 0) {
      addToast('error', 'Заполните хотя бы одного участника');
      return;
    }

    const invalid = prepared.find((p) => !p.firstName || !p.lastName);
    if (invalid) {
      addToast('error', 'Для каждого участника нужны имя и фамилия');
      return;
    }

    const mode = participantTournament.participantCountMode || 'fixed';
    if (
      (mode === 'fixed' || mode === 'max') &&
      participantTournament.participants.length + prepared.length > participantTournament.participantCount
    ) {
      addToast('error', 'Лимит участников уже достигнут');
      return;
    }

    const updatedParticipants = [
      ...participantTournament.participants,
      ...prepared.map((p, idx) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
        name: `${p.firstName} ${p.lastName}`.trim(),
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate || undefined,
        birthYear: p.birthDate ? new Date(p.birthDate).getFullYear() : undefined,
        phone: p.phone || undefined,
        photo: p.photo || undefined,
        position: participantTournament.participants.length + idx + 1,
      })),
    ];

    updateTournament(participantTournament.id, { participants: updatedParticipants });
    addToast('success', `Добавлено участников: ${prepared.length}`);
    setParticipantDrafts([emptyParticipantDraft()]);
    setParticipantTournament((prev) => prev ? { ...prev, participants: updatedParticipants } : prev);
  };

  const handleToggleTable = (tableId: number) => {
    setSelectedTableIds(prev =>
      prev.includes(tableId)
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    );
  };

  // Переназначить номера столов для всех матчей с участниками
  const assignTableNumbers = (matches: TournamentMatch[], tableCount: number): TournamentMatch[] => {
    if (!tableCount || tableCount < 1) return matches;
    let tableNumberCounter = 1;
    return matches.map(m => {
      if (m.participant1 && m.participant2 && m.matchStatus !== 'bye') {
        const result = { ...m, tableNumber: tableNumberCounter };
        tableNumberCounter = tableNumberCounter >= tableCount ? 1 : tableNumberCounter + 1;
        return result;
      }
      return m;
    });
  };

  const handleStartTournament = (tournament: Tournament) => {
    const mode = tournament.participantCountMode || 'fixed';
    const current = tournament.participants.length;
    const target = tournament.participantCount;

    if (mode === 'fixed' && current !== target) {
      addToast('error', `Для старта нужно ровно ${target} участников (сейчас ${current})`);
      return;
    }
    if (mode === 'min' && current < target) {
      addToast('error', `Для старта нужно минимум ${target} участников (сейчас ${current})`);
      return;
    }
    if (mode === 'max' && current > target) {
      addToast('error', `Превышен максимум ${target} участников`);
      return;
    }
    if (current < 2) {
      addToast('error', 'Для старта нужно минимум 2 участника');
      return;
    }

    let preparedMatches = tournament.matches.length > 0
      ? tournament.matches.map(m => ({ ...m }))
      : generateMatchesByType(tournament, buildSeedSlots(tournament));

    // Авто-продвижение bye-матчей через сетку (elimination)
    if (tournament.bracketType === 'single-elimination' || tournament.bracketType === 'double-elimination') {
      const byeIds = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of preparedMatches) {
          if (m.matchStatus === 'bye' && m.winner && !byeIds.has(m.id)) {
            byeIds.add(m.id);
            preparedMatches = advanceWinnerInBracket(preparedMatches, m, tournament.bracketType);
            changed = true;
            break;
          }
        }
      }
    }

    // Определяем стартовый раунд (первый с играбельными матчами)
    const playableRounds = Array.from(new Set(
      preparedMatches
        .filter(m => m.matchStatus !== 'bye' && m.matchStatus !== 'completed')
        .filter(m => m.participant1 && m.participant2)
        .map(m => m.round)
    )).sort((a, b) => a - b);
    const startRound = playableRounds[0] || 1;

    // Назначаем столы и запускаем матчи текущего раунда
    const tablePool = [...tournament.tableIds];
    preparedMatches = preparedMatches.map(m => {
      if (
        m.round === startRound &&
        m.participant1 && m.participant2 &&
        m.matchStatus !== 'bye' && m.matchStatus !== 'completed'
      ) {
        const tbl = tablePool.shift();
        return { ...m, matchStatus: 'in-progress' as MatchStatus, tableId: tbl, startTime: Date.now() };
      }
      return m;
    });

    // Назначаем номера столов (циклически 1, 2, 3, ..., tableCount)
    preparedMatches = assignTableNumbers(preparedMatches, tournament.tableCount || 1);

    updateTournament(tournament.id, {
      status: 'active' as TournamentStatus,
      startTime: Date.now(),
      matches: preparedMatches,
      currentRound: startRound,
    });
    addToast('success', `Турнир "${tournament.name}" начался!`);
  };

  const handleCompleteTournament = (tournament: Tournament) => {
    const freshT = tournaments.find(t => t.id === tournament.id) || tournament;
    const placements = buildTournamentPlacements(freshT, freshT.matches);
    const finalMatch = [...freshT.matches]
      .filter(m => m.matchStatus === 'completed')
      .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];

    updateTournament(freshT.id, {
      status: 'completed' as TournamentStatus,
      endTime: Date.now(),
      winnerId: placements[0]?.participantId || finalMatch?.winner?.id,
      placements,
    });
    addToast('success', `Турнир "${freshT.name}" завершён${placements[0] ? `. 🏆 Победитель: ${placements[0].participantName}` : ''}`);
  };

  /* ── Открытие модалки записи счёта ── */
  const handleOpenScoreModal = (match: TournamentMatch) => {
    if (match.matchStatus !== 'in-progress') return;
    setActiveMatch(match);
    setScore1Input(match.score1?.toString() || '');
    setScore2Input(match.score2?.toString() || '');
  };

  /* ── Запись результата матча ── */
  const handleRecordMatchResult = () => {
    if (!selectedTournament || !activeMatch) return;

    const s1 = parseInt(score1Input, 10);
    const s2 = parseInt(score2Input, 10);

    if (!Number.isFinite(s1) || !Number.isFinite(s2) || s1 < 0 || s2 < 0) {
      addToast('error', 'Введите корректный счёт');
      return;
    }
    if (s1 === s2) {
      addToast('error', 'Счёт не может быть ничейным');
      return;
    }

    const matchWinner = s1 > s2 ? activeMatch.participant1 : activeMatch.participant2;
    if (!matchWinner) return;

    let updatedMatches = selectedTournament.matches.map(m =>
      m.id === activeMatch.id
        ? { ...m, score1: s1, score2: s2, winner: matchWinner, matchStatus: 'completed' as MatchStatus, endTime: Date.now() }
        : m
    );

    // Продвигаем победителя в сетке (elimination / page-playoff)
    const completedMatch = updatedMatches.find(m => m.id === activeMatch.id)!;
    if (
      selectedTournament.bracketType === 'single-elimination' ||
      selectedTournament.bracketType === 'double-elimination' ||
      selectedTournament.bracketType === 'page-playoff'
    ) {
      updatedMatches = advanceWinnerInBracket(updatedMatches, completedMatch, selectedTournament.bracketType);
    }

    // Проверяем завершение текущего раунда
    const curRound = selectedTournament.currentRound || 1;
    const curRoundMatches = updatedMatches.filter(m => m.round === curRound);
    const allDone = curRoundMatches.every(m => m.matchStatus === 'completed' || m.matchStatus === 'bye');

    const updates: Partial<Tournament> = { matches: updatedMatches };

    if (allDone) {
      // Переходим в следующий существующий раунд (важно для swiss/group, где пары формируются после завершения тура)
      const allRounds = Array.from(new Set(updatedMatches.map((m) => m.round))).sort((a, b) => a - b);
      const nextRound = allRounds.find((r) => r > curRound);

      if (nextRound != null) {

        if (selectedTournament.bracketType === 'swiss') {
          updatedMatches = fillSwissNextRound(selectedTournament, updatedMatches, nextRound);
        }

        if (selectedTournament.bracketType === 'group-playoff') {
          const nextRoundMatches = updatedMatches.filter((m) => m.round === nextRound);
          const needsPlayoffFill = nextRoundMatches.length > 0 && nextRoundMatches.every((m) => !m.participant1 && !m.participant2);
          if (needsPlayoffFill) {
            updatedMatches = fillGroupPlayoffNextRound(selectedTournament, updatedMatches, curRound, nextRound);
          }
        }

        const tablePool = [...selectedTournament.tableIds];
        updatedMatches = updatedMatches.map(m => {
          if (
            m.round === nextRound &&
            m.participant1 && m.participant2 &&
            (m.matchStatus === 'pending' || !m.matchStatus)
          ) {
            const tbl = tablePool.shift();
            return { ...m, matchStatus: 'in-progress' as MatchStatus, tableId: tbl, startTime: Date.now() };
          }
          return m;
        });
        
        // Переназначаем номера столов
        updatedMatches = assignTableNumbers(updatedMatches, selectedTournament.tableCount || 1);
        
        updates.matches = updatedMatches;
        updates.currentRound = nextRound;
        addToast('success', `Раунд ${curRound} завершён! Переход к раунду ${nextRound}`);
      } else {
        // Проверяем — не осталось ли необработанных матчей
        const unresolved = updatedMatches.filter(
          m => m.matchStatus !== 'completed' && m.matchStatus !== 'bye'
        );
        if (unresolved.length === 0) {
          // Турнир завершён!
          const placements = buildTournamentPlacements(selectedTournament, updatedMatches);
          const finalMatch = [...updatedMatches]
            .filter(m => m.matchStatus === 'completed')
            .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];

          updates.status = 'completed' as TournamentStatus;
          updates.endTime = Date.now();
          updates.winnerId = placements[0]?.participantId || finalMatch?.winner?.id;
          updates.placements = placements;
          addToast('success', `🏆 Турнир завершён! Победитель: ${placements[0]?.participantName || getParticipantLabel(finalMatch?.winner)}`);
        }
      }
    }

    updateTournament(selectedTournament.id, updates);
    setSelectedTournament(prev => prev ? { ...prev, ...updates } : prev);
    setBracketPreviewMatches(updates.matches || updatedMatches);
    setActiveMatch(null);
    setScore1Input('');
    setScore2Input('');
  };

  const handleGenerateNextRound = () => {
    if (!selectedTournament || selectedTournament.status !== 'active') return;

    const curRound = selectedTournament.currentRound || 1;
    const curRoundMatches = selectedTournament.matches.filter((m) => m.round === curRound);
    const allDone = curRoundMatches.every((m) => m.matchStatus === 'completed' || m.matchStatus === 'bye');
    if (!allDone) {
      addToast('info', `Сначала завершите все матчи раунда ${curRound}`);
      return;
    }

    const allRounds = Array.from(new Set(selectedTournament.matches.map((m) => m.round))).sort((a, b) => a - b);
    const nextRound = allRounds.find((r) => r > curRound);
    if (nextRound == null) {
      addToast('info', 'Следующего раунда нет');
      return;
    }

    let updatedMatches = selectedTournament.matches.map((m) => ({ ...m }));

    if (selectedTournament.bracketType === 'swiss') {
      updatedMatches = fillSwissNextRound(selectedTournament, updatedMatches, nextRound);
    }

    if (selectedTournament.bracketType === 'group-playoff') {
      const nextRoundMatches = updatedMatches.filter((m) => m.round === nextRound);
      const needsPlayoffFill = nextRoundMatches.length > 0 && nextRoundMatches.every((m) => !m.participant1 && !m.participant2);
      if (needsPlayoffFill) {
        updatedMatches = fillGroupPlayoffNextRound(selectedTournament, updatedMatches, curRound, nextRound);
      }
    }

    const tablePool = [...selectedTournament.tableIds];
    updatedMatches = updatedMatches.map((m) => {
      if (
        m.round === nextRound &&
        m.participant1 && m.participant2 &&
        (m.matchStatus === 'pending' || !m.matchStatus)
      ) {
        const tbl = tablePool.shift();
        return { ...m, matchStatus: 'in-progress' as MatchStatus, tableId: tbl, startTime: Date.now() };
      }
      return m;
    });

    const updates: Partial<Tournament> = {
      matches: updatedMatches,
      currentRound: nextRound,
    };

    updateTournament(selectedTournament.id, updates);
    setSelectedTournament((prev) => (prev ? { ...prev, ...updates } : prev));
    setBracketPreviewMatches(updatedMatches);
    addToast('success', `Сформирован и запущен раунд ${nextRound}`);
  };

  const handleDeleteTournament = (tournamentId: string) => {
    if (confirm('Удалить турнир?')) {
      removeTournament(tournamentId);
      addToast('success', 'Турнир удален');
    }
  };

  const getBracketTypeName = (type: BracketType) => {
    switch (type) {
      case 'single-elimination':
        return 'Одиночная олимпийская';
      case 'double-elimination':
        return 'Двойная олимпийская';
      case 'round-robin':
        return 'Круговая';
      case 'swiss':
        return 'Швейцарская система';
      case 'group-playoff':
        return 'Группы + плей-офф';
      case 'page-playoff':
        return 'Page playoff (топ-4)';
      default:
        return type;
    }
  };

  const getStatusColor = (status: TournamentStatus) => {
    switch (status) {
      case 'draft':
        return '#94a3b8';
      case 'active':
        return '#10b981';
      case 'completed':
        return '#3b82f6';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  const getStatusName = (status: TournamentStatus) => {
    switch (status) {
      case 'draft':
        return 'Черновик';
      case 'active':
        return 'Активен';
      case 'completed':
        return 'Завершен';
      case 'cancelled':
        return 'Отменен';
      default:
        return status;
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Trophy size={28} className="text-yellow-500" />
          <div>
            <h1 className="page-title">Турниры</h1>
            <p className="page-subtitle">Управление турнирами и турнирными сетками</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus size={18} />
          Создать турнир
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '60px 20px',
          color: '#64748b',
          textAlign: 'center'
        }}>
          <Trophy size={64} style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ fontSize: 16, marginBottom: 8 }}>Нет турниров</p>
          <p style={{ fontSize: 14 }}>Создайте первый турнир для начала работы</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {tournaments.map(tournament => (
            <div
              key={tournament.id}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{tournament.name}</h3>
                  <div style={{ 
                    fontSize: 12, 
                    color: getStatusColor(tournament.status),
                    fontWeight: 500
                  }}>
                    ● {getStatusName(tournament.status)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleOpenBracket(tournament)}
                    className="btn btn-ghost"
                    style={{ padding: '6px' }}
                  >
                    <Grid size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTournament(tournament.id)}
                    className="btn btn-ghost"
                    style={{ padding: '6px', color: '#ef4444' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <Users size={14} />
                  <span>
                    Участников: {tournament.participants.length > 0
                      ? `${tournament.participants.length}/${tournament.participantCount}`
                      : tournament.participantCount}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <Users size={14} />
                  <span>
                    Режим участников: {tournament.participantCountMode === 'min'
                      ? 'минимум'
                      : tournament.participantCountMode === 'max'
                        ? 'максимум'
                        : 'фикс'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <SettingsIcon size={14} />
                  <span>Начало: {formatDateTime(tournament.scheduledStartTime)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <Grid size={14} />
                  <span>Столов: {tournament.tableIds.length}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <SettingsIcon size={14} />
                  <span>{getBracketTypeName(tournament.bracketType)}</span>
                </div>
                {tournament.entryFee && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981' }}>
                    <Award size={14} />
                    <span>Взнос: {tournament.entryFee} {settings.currency}</span>
                  </div>
                )}
                {tournament.prizeFund && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24' }}>
                    <Trophy size={14} />
                    <span>Призовой фонд: {tournament.prizeFund} {settings.currency}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => handleOpenAddParticipant(tournament)}
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: 13, padding: '8px' }}
                  disabled={
                    tournament.status === 'completed' ||
                    tournament.status === 'active' ||
                    ((tournament.participantCountMode || 'fixed') !== 'min' && tournament.participants.length >= tournament.participantCount)
                  }
                >
                  <Users size={14} />
                  Участники
                </button>
                {tournament.status === 'active' && (
                  <button
                    onClick={() => handleOpenBracket(tournament)}
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: 13, padding: '8px' }}
                  >
                    <Grid size={14} />
                    Сетка
                  </button>
                )}
                {tournament.status === 'draft' && (
                  <button
                    onClick={() => handleStartTournament(tournament)}
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: 13, padding: '8px' }}
                  >
                    <Play size={14} />
                    Начать
                  </button>
                )}
                {tournament.status === 'active' && (
                  <button
                    onClick={() => handleCompleteTournament(tournament)}
                    className="btn btn-ghost"
                    style={{ flex: 1, fontSize: 13, padding: '8px', color: '#fbbf24' }}
                  >
                    <Award size={14} />
                    Завершить
                  </button>
                )}
              </div>

              {/* Прогресс активного турнира */}
              {tournament.status === 'active' && (() => {
                const cr = tournament.currentRound || 1;
                const totalR = tournament.matches.length > 0 ? Math.max(...tournament.matches.map(m => m.round)) : 1;
                const crMatches = tournament.matches.filter(m => m.round === cr);
                const crDone = crMatches.filter(m => m.matchStatus === 'completed' || m.matchStatus === 'bye').length;
                const inProg = crMatches.filter(m => m.matchStatus === 'in-progress').length;
                return (
                  <div style={{
                    marginTop: 4,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    fontSize: 12,
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Раунд {cr}/{totalR}</span>
                    <span>⚡ {inProg}</span>
                    <span>✅ {crDone}/{crMatches.length}</span>
                  </div>
                );
              })()}

              {/* Победитель завершённого турнира */}
              {tournament.status === 'completed' && tournament.placements && tournament.placements.length > 0 && (
                <div style={{
                  marginTop: 4,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(251,191,36,0.06)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ color: '#fbbf24', fontWeight: 700 }}>🏆 Итоги турнира</div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {tournament.placements.map((p) => (
                      <div key={`${tournament.id}-${p.place}-${p.participantId}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ minWidth: 26, color: '#fbbf24', fontWeight: 700 }}>#{p.place}</span>
                        <span style={{ color: '#e2e8f0', flex: 1 }}>{p.participantName}</span>
                        {p.prize && <span style={{ color: '#fbbf24', fontSize: 11 }}>{p.prize}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно создания турнира */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 600, maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <h3>Создать турнир</h3>
              <button onClick={() => setShowCreateModal(false)} className="modal-close-btn">×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0 }}>
              <div className="settings-field">
                <label className="settings-label">Название турнира</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  className="form-input"
                  placeholder="Летний кубок 2026"
                />
              </div>

              <div className="settings-field">
                <label className="settings-label">Количество участников</label>
                <input
                  type="number"
                  value={participantCount}
                  onChange={(e) => setParticipantCount(Number(e.target.value))}
                  className="form-input"
                  min="2"
                  step="1"
                  placeholder="Например: 12"
                />
                <p className="settings-hint">Минимум 2 участника.</p>
              </div>

              <div className="settings-field">
                <label className="settings-label">Режим количества участников</label>
                <select
                  value={participantCountMode}
                  onChange={(e) => setParticipantCountMode(e.target.value as 'fixed' | 'min' | 'max')}
                  className="form-input"
                >
                  <option value="fixed">Фиксированно (ровно N)</option>
                  <option value="min">Минимум (не менее N)</option>
                  <option value="max">Максимум (не более N)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="settings-field">
                  <label className="settings-label">Дата начала турнира</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Время начала турнира</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="settings-field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <label className="settings-label" style={{ marginBottom: 0 }}>Тип турнира</label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowBracketHelp((prev) => !prev)}
                    style={{ padding: '4px 8px' }}
                  >
                    <Info size={14} />
                    Что это?
                  </button>
                </div>
                <select
                  value={bracketType}
                  onChange={(e) => setBracketType(e.target.value as BracketType)}
                  className="form-input"
                >
                  <option value="single-elimination">Одиночная олимпийская</option>
                  <option value="double-elimination">Двойная олимпийская</option>
                  <option value="round-robin">Круговая</option>
                  <option value="swiss">Швейцарская система</option>
                  <option value="group-playoff">Группы + плей-офф</option>
                  <option value="page-playoff">Page playoff (топ-4)</option>
                </select>
                {showBracketHelp && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                    <div>• <b>Одиночная олимпийская</b>: проиграл — вылетел.</div>
                    <div>• <b>Двойная олимпийская</b>: вылет после двух поражений.</div>
                    <div>• <b>Круговая</b>: каждый играет с каждым.</div>
                    <div>• <b>Швейцарская</b>: фикс. число туров, пары по текущему результату, без повторных встреч.</div>
                    <div>• <b>Группы + плей-офф</b>: сначала группы, затем лучшие выходят в олимпийку.</div>
                    <div>• <b>Page playoff (топ-4)</b>: 1–2 играют за финал, 3–4 на вылет, у топ-2 «вторая жизнь».</div>
                    <div style={{ marginTop: 6, color: '#93c5fd' }}>
                      Участники добавляются с карточки турнира кнопкой «Добавить участника».
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label className="settings-label">Столы для турнира</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {activeTables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => handleToggleTable(table.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: `2px solid ${selectedTableIds.includes(table.id) ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                        background: selectedTableIds.includes(table.id) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        color: selectedTableIds.includes(table.id) ? '#10b981' : '#94a3b8',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {table.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="settings-field">
                  <label className="settings-label">Вступительный взнос</label>
                  <input
                    type="number"
                    value={entryFee}
                    onChange={(e) => setEntryFee(Number(e.target.value))}
                    className="form-input"
                    placeholder="0"
                    min="0"
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-label">Призовой фонд</label>
                  <input
                    type="number"
                    value={prizeFund}
                    onChange={(e) => setPrizeFund(Number(e.target.value))}
                    className="form-input"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>

              <div className="settings-field" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label className="settings-label">Призовые места и призы</label>
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10 }}>
                  <input
                    type="number"
                    value={prizePlacesCount}
                    onChange={(e) => {
                      const next = Math.max(1, Math.min(16, Number(e.target.value) || 1));
                      setPrizePlacesCount(next);
                      setPrizePlaceRewards((prev) => {
                        const arr = [...prev];
                        while (arr.length < next) arr.push('');
                        return arr.slice(0, next);
                      });
                    }}
                    className="form-input"
                    min="1"
                    max="16"
                  />
                  <div className="settings-hint" style={{ margin: 0, alignSelf: 'center' }}>Сколько мест награждается</div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {Array.from({ length: prizePlacesCount }).map((_, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
                      <div className="settings-hint" style={{ margin: 0, alignSelf: 'center' }}>{idx + 1} место</div>
                      <input
                        type="text"
                        value={prizePlaceRewards[idx] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrizePlaceRewards((prev) => {
                            const arr = [...prev];
                            arr[idx] = val;
                            return arr;
                          });
                        }}
                        className="form-input"
                        placeholder={idx === 0 ? `Напр. 10 000 ${settings.currency}` : `Приз за ${idx + 1} место`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <p className="settings-hint">Участники добавляются позже из карточки турнира кнопкой «Добавить участника».</p>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="btn btn-ghost">
                Отмена
              </button>
              <button onClick={handleCreateTournament} className="btn btn-primary">
                <Plus size={16} />
                Создать турнир
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно просмотра турнирной сетки */}
      {selectedTournament && (
        <div className="modal-overlay" onClick={() => setSelectedTournament(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1060, maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ gap: 10 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Trophy size={16} color="#fff" />
                </span>
                {selectedTournament.name}
              </h3>
              <button onClick={() => setSelectedTournament(null)} className="modal-close-btn">×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', minHeight: 0 }}>
              {/* Баннер победителя */}
              {selectedTournament.status === 'completed' && selectedTournament.winnerId && (
                <div style={{
                  padding: '14px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))',
                  border: '1px solid rgba(251,191,36,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 28 }}>🏆</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Победитель турнира</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fde68a', marginTop: 2 }}>
                      {getParticipantLabel(selectedTournament.participants.find(p => p.id === selectedTournament.winnerId))}
                    </div>
                  </div>
                </div>
              )}

              {selectedTournament.status === 'completed' && selectedTournament.placements && selectedTournament.placements.length > 0 && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(251,191,36,0.2)',
                  background: 'rgba(251,191,36,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                    Итоговые места
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {selectedTournament.placements.map((p) => (
                      <div key={`${selectedTournament.id}-result-${p.place}-${p.participantId}`} style={{
                        display: 'grid',
                        gridTemplateColumns: '48px 1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        padding: '6px 8px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>#{p.place}</span>
                        <span style={{ color: '#e2e8f0' }}>{p.participantName}</span>
                        <span style={{ color: '#fbbf24', fontSize: 12 }}>{p.prize || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Статус-бар для активного турнира */}
              {selectedTournament.status === 'active' && (() => {
                const cr = selectedTournament.currentRound || 1;
                const totalRounds = Math.max(...bracketPreviewMatches.map(m => m.round), 1);
                const crMatches = bracketPreviewMatches.filter(m => m.round === cr);
                const crDone = crMatches.filter(m => m.matchStatus === 'completed' || m.matchStatus === 'bye').length;
                const crTotal = crMatches.length;
                const inProgress = crMatches.filter(m => m.matchStatus === 'in-progress').length;
                const canAdvance = crTotal > 0 && crDone === crTotal && inProgress === 0 && cr < totalRounds;
                return (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.04))',
                    border: '1px solid rgba(16,185,129,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                        boxShadow: '0 0 8px rgba(16,185,129,0.6)', animation: 'pulse 2s infinite',
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>
                        Раунд {cr} из {totalRounds}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#94a3b8' }}>
                      <span>⚡ Идёт: <b style={{ color: '#fbbf24' }}>{inProgress}</b></span>
                      <span>✅ Завершено: <b style={{ color: '#10b981' }}>{crDone}</b>/{crTotal}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Нажмите на активный матч для записи результата
                    </div>
                    {canAdvance && (
                      <button
                        onClick={handleGenerateNextRound}
                        className="btn btn-primary btn-sm"
                        style={{ marginLeft: 'auto', borderRadius: 8, fontSize: 11 }}
                      >
                        ▶ Запустить раунд {cr + 1}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Инфо-блок для черновика */}
              {selectedTournament.status === 'draft' && (
                <div style={{
                  fontSize: 12,
                  color: '#94a3b8',
                  lineHeight: 1.6,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(59,130,246,0.04))',
                  border: '1px solid rgba(99,102,241,0.1)',
                }}>
                  <span style={{ color: '#93c5fd', fontWeight: 600 }}>ℹ️ </span>
                  Сетка формируется автоматически по типу турнира и числу участников.
                </div>
              )}

              {selectedTournament.status === 'draft' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(99,102,241,0.15)', borderRadius: 14, padding: 14, background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.7))' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div className="bracket-section-title" style={{ marginBottom: 0 }}>Посев и пары (до старта)</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={handleShuffleSeeds} style={{ borderRadius: 8, fontSize: 11 }}>
                        🎲 Пересеять
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => regenerateBracket(selectedTournament, bracketSeedSlots)}
                        style={{ borderRadius: 8, fontSize: 11 }}
                      >
                        🔄 Обновить
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveBracket} style={{ borderRadius: 8, fontSize: 11 }}>
                        💾 Сохранить
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                    {Array.from({ length: Math.ceil(bracketSeedSlots.length / 2) }).map((_, pairIndex) => {
                      const i = pairIndex * 2;
                      const a = bracketSeedSlots[i] || null;
                      const b = bracketSeedSlots[i + 1] || null;
                      return (
                        <div
                          key={pairIndex}
                          style={{
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                            transition: 'border-color 0.2s',
                          }}
                        >
                          <div style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.8px',
                            color: '#64748b',
                            padding: '6px 10px 4px',
                            background: 'rgba(255,255,255,0.02)',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}>
                            Пара #{pairIndex + 1}
                          </div>
                          {[a, b].map((slot, idx) => {
                            const seedIndex = i + idx;
                            const isTbd = !slot;
                            return (
                              <div
                                key={seedIndex}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 6,
                                  padding: '5px 10px',
                                  borderTop: idx === 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flex: 1, minWidth: 0 }}>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: '#475569',
                                    background: 'rgba(255,255,255,0.04)',
                                    borderRadius: 4,
                                    minWidth: 22,
                                    height: 20,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {seedIndex + 1}
                                  </span>
                                  <span style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' as const,
                                    color: isTbd ? '#475569' : '#e2e8f0',
                                    fontStyle: isTbd ? 'italic' : 'normal',
                                    fontWeight: 500,
                                  }}>
                                    {getParticipantLabel(slot)}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleMoveSeed(seedIndex, -1)}
                                    style={{ padding: '2px 5px', fontSize: 11, borderRadius: 5, opacity: 0.6 }}
                                    title="Переместить вверх"
                                  >↑</button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleMoveSeed(seedIndex, 1)}
                                    style={{ padding: '2px 5px', fontSize: 11, borderRadius: 5, opacity: 0.6 }}
                                    title="Переместить вниз"
                                  >↓</button>
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleSwapInsidePair(pairIndex)}
                              style={{ flex: 1, borderRadius: 0, fontSize: 10, padding: '5px 6px', color: '#94a3b8' }}
                            >
                              ⇅ Обмен
                            </button>
                            <div style={{ width: 1, background: 'rgba(255,255,255,0.04)' }} />
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleSwapPairs(pairIndex)}
                              style={{ flex: 1, borderRadius: 0, fontSize: 10, padding: '5px 6px', color: '#94a3b8' }}
                            >
                              ⇄ Сменить
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="bracket-section-title">Предпросмотр сетки</div>
                {bracketPreviewMatches.length === 0 ? (
                  <div className="bracket-empty">
                    <div className="bracket-empty-icon"><Trophy size={22} /></div>
                    <div className="bracket-empty-text">Недостаточно участников для генерации сетки. Добавьте участников на карточке турнира.</div>
                  </div>
                ) : (selectedTournament.bracketType === 'single-elimination' || selectedTournament.bracketType === 'double-elimination') ? (
                  /* ── Tree-style bracket for elimination types ── */
                  (() => {
                    const rounds = Array.from(new Set(bracketPreviewMatches.map((m) => m.round))).sort((a, b) => a - b);
                    const totalRounds = rounds.length;

                    const getRoundLabel = (roundIndex: number, totalR: number) => {
                      const fromEnd = totalR - roundIndex;
                      if (fromEnd === 1) return '🏆 Финал';
                      if (fromEnd === 2) return 'Полуфинал';
                      if (fromEnd === 3) return '1/4 финала';
                      if (fromEnd === 4) return '1/8 финала';
                      if (fromEnd === 5) return '1/16 финала';
                      return `Раунд ${roundIndex + 1}`;
                    };

                    return (
                      <div className="bracket-container">
                        {rounds.map((round, roundIndex) => {
                          const roundMatches = bracketPreviewMatches.filter((m) => m.round === round);
                          const isFinal = roundIndex === totalRounds - 1;
                          const isLast = roundIndex === rounds.length - 1;

                          return (
                            <React.Fragment key={round}>
                              <div className="bracket-round">
                                <div className="bracket-round-title">
                                  {getRoundLabel(roundIndex, totalRounds)}
                                </div>
                                <div className="bracket-round-matches">
                                  {roundMatches.map((match) => {
                                    const isActive = match.matchStatus === 'in-progress';
                                    const isCompleted = match.matchStatus === 'completed';
                                    const isByeMatch = match.matchStatus === 'bye';
                                    const isClickable = isActive && selectedTournament?.status === 'active';
                                    return (
                                    <div key={match.id} className="bracket-match-wrapper">
                                      <div
                                        className={`bracket-match${isFinal ? ' is-final' : ''}${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}${isByeMatch ? ' is-bye' : ''}`}
                                        onClick={() => isClickable ? handleOpenScoreModal(match) : undefined}
                                        style={{ cursor: isClickable ? 'pointer' : 'default' }}
                                      >
                                        <div className="bracket-match-number" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span>{isFinal ? '★ Финал' : `Матч ${match.matchNumber}`}</span>
                                          {isByeMatch && <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>BYE</span>}
                                          {match.tableNumber && isActive && (
                                            <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: 4 }}>
                                              Стол #{match.tableNumber}
                                            </span>
                                          )}
                                        </div>
                                        <div className={`bracket-match-player${!match.participant1 ? ' is-tbd' : ''}${match.winner?.id === match.participant1?.id ? ' is-winner' : ''}`}>
                                          <span className="bracket-match-seed">
                                            {match.participant1 ? (roundIndex === 0 ? (bracketSeedSlots.findIndex(s => s?.id === match.participant1?.id) + 1) || '?' : '—') : '—'}
                                          </span>
                                          <span className="bracket-match-name">{getParticipantLabel(match.participant1)}</span>
                                          {isCompleted && match.score1 != null && (
                                            <span className="bracket-match-score">{match.score1}</span>
                                          )}
                                        </div>
                                        <div className="bracket-match-vs">
                                          {isActive ? '⚡ Идёт' : isCompleted && match.score1 != null ? `${match.score1} : ${match.score2}` : 'VS'}
                                        </div>
                                        <div className={`bracket-match-player${!match.participant2 ? ' is-tbd' : ''}${match.winner?.id === match.participant2?.id ? ' is-winner' : ''}`}>
                                          <span className="bracket-match-seed">
                                            {match.participant2 ? (roundIndex === 0 ? (bracketSeedSlots.findIndex(s => s?.id === match.participant2?.id) + 1) || '?' : '—') : '—'}
                                          </span>
                                          <span className="bracket-match-name">{getParticipantLabel(match.participant2)}</span>
                                          {isCompleted && match.score2 != null && (
                                            <span className="bracket-match-score">{match.score2}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>
                              {/* Connector column */}
                              {!isLast && (
                                <div style={{ width: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flexShrink: 0, position: 'relative' }}>
                                  {roundMatches.map((_, i) => {
                                    if (i % 2 !== 0) return null;
                                    return (
                                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', flex: 1, justifyContent: 'center', position: 'relative' }}>
                                        {/* Horizontal line from top match */}
                                        <div style={{ position: 'absolute', top: '25%', left: 0, width: '50%', borderTop: '1.5px solid rgba(99,102,241,0.3)' }} />
                                        {/* Horizontal line from bottom match */}
                                        <div style={{ position: 'absolute', top: '75%', left: 0, width: '50%', borderTop: '1.5px solid rgba(99,102,241,0.3)' }} />
                                        {/* Vertical line connecting them */}
                                        <div style={{ position: 'absolute', top: '25%', left: '50%', height: '50%', borderLeft: '1.5px solid rgba(99,102,241,0.3)' }} />
                                        {/* Horizontal line to next round */}
                                        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '50%', borderTop: '1.5px solid rgba(99,102,241,0.3)' }} />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  /* ── Grid-card layout for round-robin, swiss, group, page types ── */
                  <div className="bracket-grid-layout">
                    {Array.from(new Set(bracketPreviewMatches.map((m) => m.round))).sort((a, b) => a - b).map((round) => {
                      const roundMatches = bracketPreviewMatches.filter((m) => m.round === round);
                      const isPagePlayoff = selectedTournament.bracketType === 'page-playoff';
                      const roundLabel = isPagePlayoff
                        ? (round === 1 ? 'Первый раунд' : round === 2 ? 'Второй шанс' : 'Финал')
                        : selectedTournament.bracketType === 'swiss'
                          ? `Тур ${round}`
                          : `Раунд ${round}`;

                      return (
                        <div key={round} className="bracket-round-card">
                          <div className="bracket-round-card-header">
                            <span className="round-icon">{round}</span>
                            {roundLabel}
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                              {roundMatches.length} {roundMatches.length === 1 ? 'матч' : roundMatches.length < 5 ? 'матча' : 'матчей'}
                            </span>
                          </div>
                          <div className="bracket-round-card-body">
                            {roundMatches.map((match) => {
                              const isActive = match.matchStatus === 'in-progress';
                              const isCompleted = match.matchStatus === 'completed';
                              const isByeMatch = match.matchStatus === 'bye';
                              const isClickable = isActive && selectedTournament?.status === 'active';
                              return (
                              <div
                                key={match.id}
                                className={`bracket-grid-match${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}${isByeMatch ? ' is-bye' : ''}`}
                                onClick={() => isClickable ? handleOpenScoreModal(match) : undefined}
                                style={{ cursor: isClickable ? 'pointer' : 'default' }}
                              >
                                <div className="bracket-grid-match-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Матч #{match.matchNumber}</span>
                                  {isByeMatch && <span style={{ fontSize: 9, color: '#94a3b8' }}>BYE</span>}
                                  {match.tableId && isActive && (
                                    <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: 4 }}>
                                      Стол {match.tableId}
                                    </span>
                                  )}
                                  {isCompleted && match.score1 != null && (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd' }}>{match.score1} : {match.score2}</span>
                                  )}
                                </div>
                                <div className={`bracket-grid-match-player${!match.participant1 ? ' is-tbd' : ''}${match.winner?.id === match.participant1?.id ? ' is-winner' : ''}`}>
                                  <span className="bracket-match-seed">{match.participant1 ? '•' : '—'}</span>
                                  <span>{getParticipantLabel(match.participant1)}</span>
                                  {isCompleted && match.score1 != null && (
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 12, color: '#93c5fd' }}>{match.score1}</span>
                                  )}
                                </div>
                                <div className="bracket-grid-match-vs">
                                  {isActive ? '⚡' : 'VS'}
                                </div>
                                <div className={`bracket-grid-match-player${!match.participant2 ? ' is-tbd' : ''}${match.winner?.id === match.participant2?.id ? ' is-winner' : ''}`}>
                                  <span className="bracket-match-seed">{match.participant2 ? '•' : '—'}</span>
                                  <span>{getParticipantLabel(match.participant2)}</span>
                                  {isCompleted && match.score2 != null && (
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 12, color: '#93c5fd' }}>{match.score2}</span>
                                  )}
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

            <div className="modal-footer">
              {selectedTournament.status === 'draft' && (
                <button onClick={handleSaveBracket} className="btn btn-primary">
                  Сохранить перед стартом
                </button>
              )}
              {selectedTournament.status === 'active' && (
                <button
                  onClick={() => {
                    if (confirm('Вы уверены? Незавершённые матчи будут проигнорированы.')) {
                      handleCompleteTournament(selectedTournament);
                      setSelectedTournament(prev => prev ? { ...prev, status: 'completed' as TournamentStatus, endTime: Date.now() } : prev);
                    }
                  }}
                  className="btn btn-ghost"
                  style={{ color: '#fbbf24' }}
                >
                  <Award size={16} />
                  Завершить турнир
                </button>
              )}
              <button onClick={() => { setSelectedTournament(null); setActiveMatch(null); }} className="btn btn-ghost">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления участника */}
      {participantTournament && (
        <div className="modal-overlay" onClick={closeParticipantModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Добавить участника</h3>
              <button onClick={closeParticipantModal} className="modal-close-btn">×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="settings-hint" style={{ marginBottom: 4 }}>
                Турнир: <b>{participantTournament.name}</b>
              </p>
              <p className="settings-hint">
                Заполнено мест: {participantTournament.participants.length}/{participantTournament.participantCount}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '50vh', overflowY: 'auto', paddingRight: 4 }}>
                {participantDrafts.map((row, index) => (
                  <div
                    key={index}
                    style={{
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="settings-hint">Участник #{index + 1}</span>
                      {participantDrafts.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRemoveParticipantRow(index)}
                          style={{ padding: '4px 8px', color: '#ef4444' }}
                        >
                          Удалить
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input
                        type="text"
                        value={row.firstName}
                        onChange={(e) => handleParticipantFieldChange(index, 'firstName', e.target.value)}
                        className="form-input"
                        placeholder="Имя"
                      />
                      <input
                        type="text"
                        value={row.lastName}
                        onChange={(e) => handleParticipantFieldChange(index, 'lastName', e.target.value)}
                        className="form-input"
                        placeholder="Фамилия"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input
                        type="date"
                        min="1900-01-01"
                        max={dateToStr(new Date())}
                        value={row.birthDate}
                        onChange={(e) => handleParticipantFieldChange(index, 'birthDate', e.target.value)}
                        className="form-input"
                        placeholder="Дата рождения"
                      />
                      <input
                        type="tel"
                        value={row.phone}
                        onChange={(e) => handlePhoneChange(index, e.target.value)}
                        className="form-input"
                        placeholder="+7 (___) ___-__-__"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="settings-label" style={{ marginBottom: 0 }}>Фото</label>
                      <div
                        style={{
                          border: '1px dashed rgba(255,255,255,0.24)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(255,255,255,0.02)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {row.photo ? (
                            <img
                              src={row.photo}
                              alt="preview"
                              style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 62,
                                height: 62,
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                                background: 'rgba(255,255,255,0.03)',
                              }}
                            >
                              <Camera size={20} />
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13, color: '#e2e8f0' }}>Фото участника</span>
                            <span className="settings-hint" style={{ margin: 0 }}>Камера или загрузка из файла</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleOpenCamera(index)}
                            style={{ padding: '6px 10px' }}
                          >
                            <Camera size={14} />
                            Камера
                          </button>
                          <label className="btn btn-ghost btn-sm" style={{ padding: '6px 10px', cursor: 'pointer' }}>
                            <Upload size={14} />
                            Файл
                            <input
                              type="file"
                              accept="image/*"
                              capture="user"
                              style={{ display: 'none' }}
                              onChange={(e) => handleParticipantPhoto(index, e.target.files?.[0] || null)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleAddParticipantRow}
                style={{ alignSelf: 'flex-start' }}
              >
                <Plus size={14} />
                Добавить ещё участника
              </button>
            </div>

            <div className="modal-footer">
              <button onClick={closeParticipantModal} className="btn btn-ghost">
                Отмена
              </button>
              <button
                onClick={handleAddParticipant}
                className="btn btn-primary"
                disabled={
                  ((participantTournament.participantCountMode || 'fixed') !== 'min') &&
                  participantTournament.participants.length >= participantTournament.participantCount
                }
              >
                <Plus size={16} />
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraRowIndex !== null && (
        <div className="modal-overlay" onClick={stopCamera}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Сделать фото</h3>
              <button onClick={stopCamera} className="modal-close-btn">×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cameraLoading && <p className="settings-hint">Запуск камеры...</p>}
              {cameraError && (
                <div style={{ fontSize: 13, color: '#fca5a5' }}>{cameraError}</div>
              )}
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#020617' }}>
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', minHeight: 280, objectFit: 'cover', display: 'block' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={stopCamera} className="btn btn-ghost">Отмена</button>
              <button onClick={handleCaptureFromCamera} className="btn btn-primary" disabled={cameraLoading}>
                <Camera size={16} />
                Сфотографировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Модальное окно записи результата матча ── */}
      {activeMatch && selectedTournament && (
        <div className="modal-overlay" onClick={() => setActiveMatch(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={18} style={{ color: '#fbbf24' }} />
                Записать результат
              </h3>
              <button onClick={() => setActiveMatch(null)} className="modal-close-btn">×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                Матч #{activeMatch.matchNumber}
                {activeMatch.tableId ? ` • Стол ${activeMatch.tableId}` : ''}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    textAlign: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: score1Input && score2Input && parseInt(score1Input) > parseInt(score2Input)
                      ? 'rgba(16,185,129,0.12)' : 'transparent',
                    border: score1Input && score2Input && parseInt(score1Input) > parseInt(score2Input)
                      ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}>
                    {getParticipantLabel(activeMatch.participant1)}
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={score1Input}
                    onChange={e => setScore1Input(e.target.value)}
                    className="form-input"
                    style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, width: 100, padding: '10px 8px' }}
                    placeholder="0"
                    autoFocus
                  />
                </div>

                <span style={{ fontSize: 24, color: '#475569', fontWeight: 700, paddingTop: 32 }}>:</span>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    textAlign: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: score1Input && score2Input && parseInt(score2Input) > parseInt(score1Input)
                      ? 'rgba(16,185,129,0.12)' : 'transparent',
                    border: score1Input && score2Input && parseInt(score2Input) > parseInt(score1Input)
                      ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}>
                    {getParticipantLabel(activeMatch.participant2)}
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={score2Input}
                    onChange={e => setScore2Input(e.target.value)}
                    className="form-input"
                    style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, width: 100, padding: '10px 8px' }}
                    placeholder="0"
                  />
                </div>
              </div>

              {score1Input && score2Input && parseInt(score1Input) !== parseInt(score2Input) && (
                <div style={{
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#10b981',
                  padding: '8px 14px',
                  borderRadius: 10,
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}>
                  🏆 Победитель: {parseInt(score1Input) > parseInt(score2Input)
                    ? getParticipantLabel(activeMatch.participant1)
                    : getParticipantLabel(activeMatch.participant2)}
                </div>
              )}
              {score1Input && score2Input && parseInt(score1Input) === parseInt(score2Input) && (
                <div style={{ textAlign: 'center', fontSize: 12, color: '#fbbf24' }}>
                  ⚠️ Ничья не допускается
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setActiveMatch(null)} className="btn btn-ghost">Отмена</button>
              <button
                onClick={handleRecordMatchResult}
                className="btn btn-primary"
                disabled={
                  !score1Input || !score2Input ||
                  parseInt(score1Input) === parseInt(score2Input) ||
                  !Number.isFinite(parseInt(score1Input)) ||
                  !Number.isFinite(parseInt(score2Input))
                }
              >
                <Award size={16} />
                Записать результат
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentPage;
