export type ActiveTab = 'dashboard' | 'upload' | 'practice' | 'mock' | 'planner' | 'room' | 'calendar' | 'session' | 'insights' | 'history' | 'memory';

export interface ExtractedTopic {
  id: string;
  name: string;
  priorityScore?: number;
  actualWeightage?: number | null;
  weightage?: number;
  frequencyCount: number;
  syllabusEvidence?: boolean;
  source?: string;
  sourceDocumentIds?: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  highYield: boolean;
  reason?: string;
  color?: string;
}

export interface QuestionItem {
  id: string;
  subject: string;
  topic: string;
  questionText: string;
  questionNumber?: string | null;
  subpart?: string | null;
  context?: string | null;
  marks: number;
  source?: string;
  year?: string;
  type: 'Short Answer' | 'Long Proof' | 'Code/Algorithm' | 'Numerical';
  suggestedTimeMinutes: number;
  solutionHint?: string;
  modelAnswer?: string;
  documentId?: string | null;
  mappingStatus?: 'mapped' | 'unmatched';
  mappingEvidence?: string[];
}

export interface PastPaper {
  id: string;
  title: string;
  courseCode: string;
  semester: string;
  year: string;
  fileSize: string;
  uploadDate: string;
  topicsCount: number;
  extractedQuestionsCount: number;
  parsedContent?: string;
}

export interface AnswerEvaluation {
  score: number;
  maxMarks: number;
  strengths: string[];
  improvements: string[];
  feedbackText: string;
  modelAnswerSnippet: string;
}

export interface MockExamQuestionResult {
  id: string;
  position: number;
  questionText: string;
  topicName: string;
  answer: string;
  score: number;
  maxMarks: number;
  strengths: string[];
  improvements: string[];
  feedback: string;
  createdAt: string;
}

export interface MockExamTopicScore {
  topic: string;
  score: number;
  maxMarks: number;
  mastery: string;
}

export interface MockExamRecord {
  id: string;
  examName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  totalScore: number;
  totalMax: number;
  percentage: number;
  grade: string;
  advice: string | null;
  questionCount: number;
  createdAt: string;
  perQuestion: MockExamQuestionResult[];
  topicBreakdown: MockExamTopicScore[];
  answeredCount: number;
}

export interface StudySessionItem {
  id: string;
  day: number;
  dateStr: string;
  topic: string;
  hours: number;
  focusDetail: string;
  completed: boolean;
  isPriority?: boolean;
}

export interface PersistedTopic {
  id: string;
  courseId: string;
  name: string;
  priority: number;
  weightage: number;
  hasWeightage?: boolean;
  source: string;
  createdAt: string;
}

export interface ScheduleBlock {
  id: string;
  topicId: string;
  topicName: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  completed: boolean;
  missed?: boolean;
  blockType: 'study' | 'revision';
  createdAt: string;
}

export interface PeerUser {
  id: string;
  name: string;
  avatarUrl: string;
  status: 'Studying' | 'In Mock Exam' | 'On Break' | 'Offline';
  currentTopic: string;
  focusDurationMin: number;
}

export interface StudyRoomMessage {
  id: string;
  senderName: string;
  senderAvatar: string;
  timestamp: string;
  text: string;
  isQuestion?: boolean;
  topicTag?: string;
  upvotes?: number;
}

export interface StudyRoom {
  id: string;
  name: string;
  topic: string;
  description: string;
  subject: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  maxParticipants: number;
  status: 'ACTIVE' | 'CLOSED';
  expiresAt: string | null;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  joined: boolean;
  createdAt: string;
}

export type FocusPhase = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';

/** `FOCUSING`/`ON_BREAK` follow the active session phase; `IN_ROOM` means not in the session. */
export type FocusPresence = 'FOCUSING' | 'ON_BREAK' | 'IN_ROOM';

export interface StudyRoomMember {
  id: string;
  displayName: string;
  joinedAt: string;
  isHost: boolean;
  isSessionParticipant: boolean;
  state: FocusPresence;
}

/**
 * The countdown is derived, never stored: `remaining = endsAt - (serverNow + elapsedSinceFetch)`.
 * `serverNow` lets the client correct for clock skew between browser and server.
 */
export interface FocusSession {
  id: string;
  roomId: string;
  startedByUserId: string;
  startedByName: string;
  phase: FocusPhase;
  durationSeconds: number;
  startedAt: string;
  endsAt: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  serverNow: string;
  participantCount: number;
  currentParticipantCount: number;
  focusingCount: number;
  onBreakCount: number;
  isParticipant: boolean;
  participants: Array<{ userId: string; displayName: string; joinedAt: string; state: FocusPresence }>;
}

export interface StudyDoubtAnswer {
  id: string;
  userId: string;
  authorName: string;
  content: string;
  isAccepted: boolean;
  createdAt: string;
}

export interface StudyDoubt {
  id: string;
  roomId: string;
  userId: string;
  authorName: string;
  title: string;
  content: string;
  status: 'OPEN' | 'RESOLVED';
  acceptedAnswerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  answerCount: number;
  answers: StudyDoubtAnswer[];
}

export interface StudyRoomDetail {
  room: StudyRoom;
  members: StudyRoomMember[];
  focusSession: FocusSession | null;
  doubts: StudyDoubt[];
}

export interface StudyRoomSession {
  startedBy: string;
  startedByName: string;
  startedAt: string;
  durationMinutes: number;
  status: 'active' | 'paused' | 'stopped';
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: UserAccount;
}

export type AuthUser = UserAccount;

export interface DocumentRecord {
  id: string;
  title: string;
  docType: string;
  content?: string | null;
  fileSize?: string;
  createdAt: string;
}

export interface PersistedDocument {
  documents: DocumentRecord[];
}

export interface PersistedQuestion extends QuestionItem {
  id: string;
  topicId?: string | null;
  topicName?: string | null;
  source?: string;
  createdAt?: string;
}

export interface FeedbackEntry {
  id: string;
  questionId: string | null;
  sessionId: string | null;
  questionText: string | null;
  score: number;
  maxMarks: number;
  source: string;
  strengths: string[];
  improvements: string[];
  feedbackText: string | null;
  modelAnswerSnippet: string | null;
  focus: number | null;
  difficulty: string | null;
  perceivedProgress: number | null;
  notes: string | null;
  createdAt: string;
}

export interface ScheduleChange {
  id: string;
  blockId: string;
  field: 'created' | 'rescheduled' | 'completed' | string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

export interface StudySession {
  id: string;
  scheduleBlockId: string;
  startedAt: string;
  createdAt: string;
  durationMinutes: number;
  actualDurationSeconds: number;
  status: 'active' | 'paused' | 'completed' | 'stopped';
  endedAt: string | null;
  activeSince: string | null;
}

export interface AdaptiveProposal {
  studySessionId: string;
  originalBlockId: string;
  topicId: string;
  topicName: string;
  proposedDate: string;
  proposedStartTime: string;
  proposedEndTime: string;
  proposedDurationMinutes: number;
  reason: string;
  actionType: 'create_revision';
  trigger: 'stopped' | 'high_difficulty';
}

export interface SessionFeedback {
  id: string;
  studySessionId: string;
  focusRating: number;
  difficultyRating: number;
  progressRating: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardAnalytics {
  summary: {
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
    completionRate: number;
    upcomingBlocks: number;
    upcomingMinutes: number;
  };
  sevenDay: {
    startDate: string;
    endDate: string;
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
    completionRate: number;
  };
  feedback: {
    averageFocus: number | null;
    averageDifficulty: number | null;
    averageProgress: number | null;
    responseCount: number;
  };
  topics: Array<{
    topicId: string;
    topicName: string;
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
  }>;
}

export interface SchedulingAssistantChange {
  blockId: string;
  topicId: string;
  topicName: string;
  original: Pick<ScheduleBlock, 'title' | 'date' | 'startTime' | 'durationMinutes'>;
  proposed: Pick<ScheduleBlock, 'date' | 'startTime' | 'durationMinutes'>;
  operation?: 'move' | 'shorten' | 'cancel' | 'swap' | 'shift';
}

export interface SchedulingAssistantPreview {
  assistantMessage: string;
  changes: SchedulingAssistantChange[];
  matches?: Array<Pick<ScheduleBlock, 'topicName' | 'title' | 'date' | 'startTime' | 'durationMinutes'> & { blockId: string }>;
}

// --- Analytics (matches GET /api/analytics response) ---

export interface TopicProgressEntry {
  topicId: string;
  topicName: string;
  totalBlocks: number;
  completedBlocks: number;
  completionRate: number;
}

export interface AnalyticsSnapshot {
  plannedMinutes: number;
  completedMinutes: number;
  completedCount: number;
  missedCount: number;
  completionRate: number;
  upcomingWorkloadMinutes: number;
  topicProgress: TopicProgressEntry[];
  today: string;
}

// --- Study streak (matches GET /api/study-streak response) ---

export interface StudyStreak {
  current: number;
  longest: number;
}

// --- Adaptive proposals (matches POST /api/adaptive/proposals response) ---

export interface LegacyAdaptiveProposal {
  sourceBlockId: string;
  reason: string;
  topicId: string;
  topicName: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}

// --- Session feedback payload (sent to POST /api/feedback) ---

export interface SessionFeedbackPayload {
  sessionId: string;
  score: number;
  maxMarks: number;
  source: 'manual';
  difficulty: 'easy' | 'medium' | 'hard';
  focus: number;
  perceivedProgress: number;
  notes?: string;
}

export type MemoryStatus = 'stable' | 'fading' | 'due';

export interface MemoryTopicState {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  lastStudiedAt: string;
  qualifyingSessionCount: number;
  totalActualStudySeconds: number;
  memoryStrengthDays: number;
  predictedRetention: number;
  status: MemoryStatus;
  dueAt: string;
  nextRevisionAt: string;
  daysUntilDue: number;
  priority: number;
  weightage: number;
  hasWeightage: boolean;
}

export interface MemorySummary {
  studiedTopicCount: number;
  stableCount: number;
  fadingCount: number;
  dueCount: number;
  unexploredCount: number;
}

export interface CourseMemorySummary {
  courseId: string;
  courseName: string;
  studiedTopicCount: number;
  predictedRetention: number;
  stableCount: number;
  fadingCount: number;
  dueCount: number;
}

export interface MemoryAtlasData {
  forecastDays: number;
  evaluatedAt: string;
  topics: MemoryTopicState[];
  summary: MemorySummary;
  courses: CourseMemorySummary[];
}

export interface RefreshPlanItem {
  topicId: string;
  topicName: string;
  courseName: string;
  predictedRetention: number;
  dueAt: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  reason: string;
}

export interface RefreshPlan {
  items: RefreshPlanItem[];
  totalMinutes: number;
  message?: string;
}

// --- Active study session state (frontend-only state machine) ---

export type SessionPhase = 'idle' | 'active' | 'paused' | 'feedback' | 'done';

export interface ActiveSessionState {
  phase: SessionPhase;
  block: ScheduleBlock;
  sessionId: string;
  startedAt: number;        // Date.now() when session started or last resumed
  accumulatedMs: number;    // total accumulated milliseconds of actual study time
  pausedAt: number | null;  // Date.now() when last paused, null if not paused
}

// --- YOUR ASCENT Progression System ---

export type AscentStage = 'STARTING' | 'BUILDING' | 'CONSISTENT' | 'MOMENTUM' | 'MASTERY';

export interface AscentStageInfo {
  stage: AscentStage;
  label: string;
  elevation: string;
  description: string;
  minProgress: number;
  maxProgress: number;
}

export interface TomorrowCommitmentSummary {
  id: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  topicId: string;
  topicName?: string;
}

export interface AscentState {
  progress: number;
  stage: AscentStage;
  previousStage?: AscentStage;
  elevationMeters: number;
  totalCompleted: number;
  totalMissed: number;
  todayScheduledCount?: number;
  todayCompletedCount?: number;
  todayMissedCount?: number;
  todayPendingCount?: number;
  weekCompleted: number;
  weekMissed: number;
  followThroughRate: number;
  momentumDays: number;
  todayBlocks: ScheduleBlock[];
  tomorrowCommitment: TomorrowCommitmentSummary | null;
  lastAction?: 'completed' | 'missed' | 'recovered' | 'committed' | 'idle';
  statusMessage?: string;
}

// --- Teacher's Exam Intelligence ("What to Study") ---

export interface WhatToStudyOccurrence {
  paperTitle: string;
  examYear: string;
  questionNumber: string;
  subpart?: string;
  label: string;
  marks: number;
  questionText: string;
}

export interface WhatToStudySourceMapping {
  mapped: boolean;
  documentId?: string;
  documentTitle?: string;
  slideRange?: string;
  startSlide?: number;
  endSlide?: number;
  sectionTitle?: string;
  slideSnippet?: string;
  unmappedReason?: string;
}

export interface WhatToStudyItem {
  id: string;
  conceptTitle: string;
  priorityTag: 'HIGH PRIORITY' | 'REPEATED FREQUENTLY' | 'APPEARED ACROSS MULTIPLE YEARS' | 'STRONG PAST-PAPER EVIDENCE';
  appearanceCount: number;
  distinctYearsCount: number;
  occurrences: WhatToStudyOccurrence[];
  unitTopic: string;
  topicId?: string;
  lectureSource: WhatToStudySourceMapping;
  averageMarks: number;
}

