// انواع دادهٔ رد و بدل شده بین سرور و مینی‌اپ
import type { LifelineId } from './constants.ts';

export interface PlayerDTO {
  id: number;
  name: string;
  avatar: number;
  photo: string | null;
  level: number;
  isBot: boolean;
}

export interface AchievementDTO {
  key: string;
  at: number;
}

export interface MeDTO extends PlayerDTO {
  username: string | null;
  title: string;
  coins: number;
  xp: number;
  levelInto: number;
  levelNeed: number;
  trophies: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  correct: number;
  answered: number;
  winStreak: number;
  bestWinStreak: number;
  survivalBest: number;
  notify: boolean;
  isAdmin: boolean;
  dailyBonus: { available: boolean; day: number; amount: number; streak: number };
}

export interface AppConfigDTO {
  botUsername: string;
  inviteLink: string | null;
  starsShop: boolean;
}

export type Outcome = 'win' | 'loss' | 'draw';
export type Phase = 'choose' | 'play' | 'wait' | 'done';

export interface MatchResultDTO {
  outcome: Outcome;
  coins: number;
  xp: number;
  trophies: number;
  perfect: boolean;
}

export interface MatchSummaryDTO {
  id: number;
  code: string;
  mode: 'random' | 'friend';
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  opponent: PlayerDTO | null;
  myScore: number;
  oppScore: number;
  turn: 'me' | 'opp' | null;
  outcome: Outcome | null;
  updatedAt: number;
}

export interface RoundDTO {
  idx: number;
  category: string | null;
  chooser: 'me' | 'opp';
  mine: (boolean | null)[];
  theirs: (boolean | null)[];
  canReview: boolean;
}

export interface MatchDTO extends MatchSummaryDTO {
  phase: Phase;
  rounds: RoundDTO[];
  endReason: 'normal' | 'timeout' | 'resign' | null;
  result: MatchResultDTO | null;
  deadline: number | null;
  shareLink: string | null;
}

export interface QuestionDTO {
  instanceId: number;
  ctx: 'duel' | 'daily' | 'survival';
  text: string;
  options: string[];
  category: string;
  difficulty: number;
  limitMs: number;
  remainingMs: number;
  removed: number[];
  used: LifelineId[];
  /** شمارهٔ سوال (از ۱) */
  index: number;
  /** تعداد کل سوالات این دور؛ در حالت بقا null */
  total: number | null;
  round: number | null;
  lives: number | null;
  score: number | null;
}

export type NextDTO =
  | { state: 'question'; question: QuestionDTO }
  | { state: 'choose'; round: number; options: string[] }
  | { state: 'wait' }
  | { state: 'finished' };

export interface AnswerDTO {
  correct: boolean;
  correctIndex: number;
  choice: number;
  timedOut: boolean;
  /** فقط در حالت بقا */
  lives?: number;
  score?: number;
  finished?: boolean;
}

export interface LifelineDTO {
  type: LifelineId;
  coins: number;
  removed?: number[];
  remainingMs?: number;
  limitMs?: number;
  audience?: number[];
}

export interface ReviewQuestionDTO {
  id: number;
  text: string;
  options: string[];
  correct: number;
  mine: number | null;
  theirs: number | null;
}

export interface LeaderRowDTO {
  rank: number;
  player: PlayerDTO;
  value: number;
  sub?: string;
}

export interface LeaderboardDTO {
  rows: LeaderRowDTO[];
  me: LeaderRowDTO | null;
}

export interface DailyDTO {
  day: string;
  played: boolean;
  finished: boolean;
  score: number;
  timeMs: number;
  total: number;
  reward: { coins: number; xp: number } | null;
  board: LeaderboardDTO;
}

export interface SurvivalDTO {
  best: number;
  active: { score: number; lives: number } | null;
  last: { score: number; coins: number; xp: number; record: boolean } | null;
  board: LeaderboardDTO;
}

export interface HomeDTO {
  me: MeDTO;
  config: AppConfigDTO;
  matches: MatchSummaryDTO[];
  dailyPlayed: boolean;
  newAchievements: string[];
  pendingQuestions: number;
}

export interface ProfileDTO {
  player: PlayerDTO;
  title: string;
  trophies: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  correct: number;
  answered: number;
  bestWinStreak: number;
  survivalBest: number;
  rank: number;
  achievements: AchievementDTO[];
  categories: { category: string; answered: number; correct: number }[];
  joinedAt: number;
}

export interface SubmittedQuestionDTO {
  id: number;
  category: string;
  text: string;
  options: string[];
  correct: number;
  status: 'approved' | 'pending' | 'rejected';
  author?: PlayerDTO | null;
  reports?: number;
  createdAt: number;
}

export interface AdminStatsDTO {
  users: number;
  activeToday: number;
  matches: number;
  activeMatches: number;
  questions: number;
  pending: number;
  reported: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
