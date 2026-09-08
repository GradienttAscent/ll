import { ExtractedTopic, QuestionItem, PastPaper, StudySessionItem, PeerUser, StudyRoomMessage, LMSCourse } from '../types';

export const INITIAL_TOPICS: ExtractedTopic[] = [
  { id: 't1', name: 'Graph Algorithms & Shortest Path', weightage: 28, frequencyCount: 14, difficulty: 'Hard', highYield: true, color: '#d97706' },
  { id: 't2', name: 'Dynamic Programming & Memoization', weightage: 24, frequencyCount: 12, difficulty: 'Hard', highYield: true, color: '#ca8a04' },
  { id: 't3', name: 'Big O & Asymptotic Analysis', weightage: 18, frequencyCount: 9, difficulty: 'Medium', highYield: false, color: '#0284c7' },
  { id: 't4', name: 'Binary Search Trees & Heap Operations', weightage: 16, frequencyCount: 8, difficulty: 'Medium', highYield: false, color: '#059669' },
  { id: 't5', name: 'Sorting & Hashing Collisions', weightage: 14, frequencyCount: 7, difficulty: 'Easy', highYield: false, color: '#6b7280' },
];

export const INITIAL_QUESTIONS: QuestionItem[] = [
  {
    id: 'q1',
    subject: 'Algorithms (CS301)',
    topic: 'Graph Algorithms & Shortest Path',
    questionText: "Explain Dijkstra's algorithm for single-source shortest path on a weighted graph with non-negative edge weights. Derive its time complexity when using a Binary Min-Heap versus a Fibonacci Heap.",
    marks: 10,
    year: '2025 Final Exam Q3',
    type: 'Code/Algorithm',
    suggestedTimeMinutes: 15,
    solutionHint: 'Mention edge relaxation inequality dist[v] > dist[u] + w(u,v) and priority queue decrease-key operation complexities.',
    modelAnswer: 'Dijkstra maintains a priority queue of vertices ordered by distance. Extract min V times. Relax all E edges. With Binary Heap: O((V + E) log V). With Fibonacci Heap: O(E + V log V) because decrease-key takes amortized O(1).'
  },
  {
    id: 'q2',
    subject: 'Algorithms (CS301)',
    topic: 'Dynamic Programming & Memoization',
    questionText: 'Formulate the recurrence relation for the 0/1 Knapsack Problem with capacity W and items {w_i, v_i}. Construct the DP memoization matrix for items weights [2, 3, 4] and values [3, 4, 5] with capacity W = 5.',
    marks: 12,
    year: '2024 Midterm Q2',
    type: 'Long Proof',
    suggestedTimeMinutes: 20,
    solutionHint: 'DP state V[i, w] = max(V[i-1, w], v_i + V[i-1, w - w_i]). Compare taking vs omitting item i.',
    modelAnswer: 'Base cases: V[0, w] = 0, V[i, 0] = 0. Row 1: max value with item 1 is 3 (w=2..5). Row 2: combining item 1 and 2 gives val 7 at W=5. Max value achieved is 7.'
  },
  {
    id: 'q3',
    subject: 'Algorithms (CS301)',
    topic: 'Big O & Asymptotic Analysis',
    questionText: 'Using the Master Theorem, find the tight asymptotic bound T(n) for the recurrence T(n) = 3T(n/2) + n^2. State the values of a, b, f(n) and which case applies.',
    marks: 8,
    year: '2024 Final Exam Q1',
    type: 'Numerical',
    suggestedTimeMinutes: 10,
    solutionHint: 'Compare f(n) = n^2 with n^(log_b a) = n^(log_2 3) ≈ n^1.585.',
    modelAnswer: 'a=3, b=2, f(n) = n^2. Since n^(log_2 3) ≈ n^1.585 and f(n) = Ω(n^(log_2 3 + ε)) for ε ≈ 0.415, Case 3 applies. Check regularity condition 3*(n/2)^2 = 3/4 n^2 <= c*n^2 for c=3/4 < 1. Hence T(n) = Θ(n^2).'
  },
  {
    id: 'q4',
    subject: 'Algorithms (CS301)',
    topic: 'Binary Search Trees & Heap Operations',
    questionText: 'Demonstrate step-by-step heapify insertions for building a Max-Heap from array [4, 10, 3, 5, 1]. Draw the resulting binary tree after deleting the max root element.',
    marks: 10,
    year: '2023 Spring Final Q4',
    type: 'Short Answer',
    suggestedTimeMinutes: 12,
    solutionHint: 'Bottom-up build-heap runs in O(N). Delete root replaces root with last element then sifts down.',
    modelAnswer: 'Max heap array becomes [10, 5, 3, 4, 1]. Root is 10. Deleting 10 moves 1 to root, then sift down swaps 1 with 5 to yield [5, 4, 3, 1].'
  }
];

export const INITIAL_PAPERS: PastPaper[] = [
  {
    id: 'p1',
    title: 'CS301_Final_Exam_Spring2025.pdf',
    courseCode: 'CS301',
    semester: 'Spring 2025',
    year: '2025',
    fileSize: '2.4 MB',
    uploadDate: '3 days ago',
    topicsCount: 5,
    extractedQuestionsCount: 8,
    parsedContent: 'CS301 Final Exam Spring 2025: Graph theory, Dijkstra, DP 0/1 knapsack, Master theorem recurrences, AVL balance factors.'
  },
  {
    id: 'p2',
    title: 'Algorithms_Midterm_Autumn2024.pdf',
    courseCode: 'CS301',
    semester: 'Autumn 2024',
    year: '2024',
    fileSize: '1.8 MB',
    uploadDate: '1 week ago',
    topicsCount: 4,
    extractedQuestionsCount: 6,
    parsedContent: 'Midterm 2024: Time complexity bounds, Merge Sort vs Quick Sort, Red-Black Trees, Greedy Huffman Coding.'
  },
  {
    id: 'p3',
    title: 'Syllabus_CS301_Design_and_Analysis_of_Algorithms.pdf',
    courseCode: 'CS301',
    semester: 'Full Course',
    year: '2025',
    fileSize: '0.9 MB',
    uploadDate: '2 weeks ago',
    topicsCount: 6,
    extractedQuestionsCount: 0,
    parsedContent: 'Official Syllabus: Unit 1 Asymptotic notation, Unit 2 Divide & Conquer, Unit 3 Greedy & DP, Unit 4 Graph Algorithms, Unit 5 NP-Completeness.'
  }
];

export const INITIAL_SCHEDULE: StudySessionItem[] = [
  { id: 's1', day: 1, dateStr: 'Today (Aug 3)', topic: 'Graph Algorithms', hours: 4, focusDetail: 'Reviewing Dijkstra and A* Search. Progressing through practice set II.', completed: false, isPriority: true },
  { id: 's2', day: 2, dateStr: 'Tomorrow (Aug 4)', topic: 'Dynamic Programming', hours: 3.5, focusDetail: 'Solving Longest Common Subsequence & 0/1 Knapsack memoization tables.', completed: false, isPriority: false },
  { id: 's3', day: 3, dateStr: 'Tuesday (Aug 5)', topic: 'Big O & Recurrences', hours: 3, focusDetail: 'Master theorem practice, recursion trees, and amortized aggregate analysis.', completed: false, isPriority: false },
  { id: 's4', day: 4, dateStr: 'Wednesday (Aug 6)', topic: 'Trees & Heap Sort', hours: 3, focusDetail: 'AVL tree rotations, Max-heapify, Priority queue decrease-key proofs.', completed: false, isPriority: false },
  { id: 's5', day: 5, dateStr: 'Thursday (Aug 7)', topic: 'Timed Mock Exam #1', hours: 3.5, focusDetail: 'Simulated 3-hour closed book exam under 2025 past paper format.', completed: false, isPriority: true },
  { id: 's6', day: 6, dateStr: 'Friday (Aug 8)', topic: 'Weak Area AI Analysis', hours: 2.5, focusDetail: 'Review AI evaluation feedback on mock exam questions and fix edge cases.', completed: false, isPriority: false },
];

export const INITIAL_PEERS: PeerUser[] = [
  { id: 'u1', name: 'Sarah Chen', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80', status: 'Studying', currentTopic: 'Dijkstra proofs', focusDurationMin: 52 },
  { id: 'u2', name: 'Marcus Vance', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', status: 'In Mock Exam', currentTopic: 'CS301 Timed Mock #2', focusDurationMin: 85 },
  { id: 'u3', name: 'Elena Rostova', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', status: 'Studying', currentTopic: 'DP Matrix Memoization', focusDurationMin: 34 },
  { id: 'u4', name: 'David Kim', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', status: 'On Break', currentTopic: 'Coffee break', focusDurationMin: 12 },
];

export const INITIAL_MESSAGES: StudyRoomMessage[] = [
  {
    id: 'm1',
    senderName: 'Sarah Chen',
    senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    timestamp: '20 mins ago',
    text: 'Does anyone have a clean explanation for why Dijkstra fails with negative edge weights? Is it because greedy choice assumes visited vertices have finalized distances?',
    isQuestion: true,
    topicTag: 'Graph Algorithms',
    upvotes: 5
  },
  {
    id: 'm2',
    senderName: 'Elena Rostova',
    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    timestamp: '14 mins ago',
    text: 'Yes exactly! Once a node is popped from min-heap, Dijkstra assumes no shorter path exists. A negative weight edge later in the path can reduce the total weight, violating that assumption. Use Bellman-Ford for negative edges!',
    isQuestion: false,
    topicTag: 'Graph Algorithms',
    upvotes: 8
  },
  {
    id: 'm3',
    senderName: 'Alex (You)',
    senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    timestamp: '5 mins ago',
    text: 'Just finished the 2025 practice problem set on LCS! Happy to share my DP table diagram if anyone wants to cross-check.',
    isQuestion: false,
    topicTag: 'Dynamic Programming',
    upvotes: 3
  }
];

export const INITIAL_LMS_COURSES: LMSCourse[] = [
  {
    id: 'lms1',
    platform: 'Canvas',
    courseCode: 'CS301',
    courseName: 'Design & Analysis of Algorithms',
    instructor: 'Prof. Katherine Vance',
    syncedAt: 'Today at 08:30 AM',
    syllabiStatus: 'Synced',
    upcomingExams: [
      { title: 'Final Comprehensive Examination', date: 'Aug 24, 2026', weight: '40% of grade' },
      { title: 'Assignment 4: Dynamic Programming', date: 'Aug 10, 2026', weight: '10% of grade' }
    ]
  },
  {
    id: 'lms2',
    platform: 'Canvas',
    courseCode: 'CS305',
    courseName: 'Operating System Principles',
    instructor: 'Dr. Aris Thorne',
    syncedAt: 'Yesterday at 04:15 PM',
    syllabiStatus: 'Synced',
    upcomingExams: [
      { title: 'Midterm 2: Memory Management & Paging', date: 'Aug 18, 2026', weight: '25% of grade' }
    ]
  },
  {
    id: 'lms3',
    platform: 'Moodle',
    courseCode: 'MATH204',
    courseName: 'Linear Algebra & Optimization',
    instructor: 'Prof. David Hilbert',
    syncedAt: 'Aug 1, 2026',
    syllabiStatus: 'Needs Update',
    upcomingExams: [
      { title: 'Final Exam: Eigenvalues & SVD', date: 'Aug 28, 2026', weight: '35% of grade' }
    ]
  }
];
