export type ActiveTab = 'dashboard' | 'upload' | 'practice' | 'mock' | 'planner' | 'room' | 'lms';

export interface ExtractedTopic {
  id: string;
  name: string;
  weightage: number; // percentage e.g. 28
  frequencyCount: number; // e.g. 14 times in past 5 years
  difficulty: 'Easy' | 'Medium' | 'Hard';
  highYield: boolean;
  color?: string;
}

export interface QuestionItem {
  id: string;
  subject: string;
  topic: string;
  questionText: string;
  marks: number;
  year?: string;
  type: 'Short Answer' | 'Long Proof' | 'Code/Algorithm' | 'Numerical';
  suggestedTimeMinutes: number;
  solutionHint?: string;
  modelAnswer?: string;
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

export interface LMSCourse {
  id: string;
  platform: 'Canvas' | 'Moodle' | 'Blackboard' | 'Google Classroom';
  courseCode: string;
  courseName: string;
  instructor: string;
  syncedAt: string;
  syllabiStatus: 'Synced' | 'Pending' | 'Needs Update';
  upcomingExams: {
    title: string;
    date: string;
    weight: string;
  }[];
}
