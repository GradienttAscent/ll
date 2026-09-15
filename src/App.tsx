import React, { useState, useEffect, useCallback } from 'react';
import { 
  ActiveTab, 
  PastPaper, 
  ExtractedTopic, 
  QuestionItem, 
  PeerUser, 
  StudyRoomMessage, 
  LMSCourse, 
  PersistedTopic, 
  ScheduleBlock,
  ActiveSessionState,
  SessionFeedbackPayload
} from './types';
import { 
  INITIAL_TOPICS, 
  INITIAL_QUESTIONS, 
  INITIAL_PAPERS, 
  INITIAL_PEERS, 
  INITIAL_MESSAGES, 
  INITIAL_LMS_COURSES 
} from './data/initialData';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { UploadExtractView } from './components/UploadExtractView';
import { PracticeView } from './components/PracticeView';
import { MockExamView } from './components/MockExamView';
import { PlannerView } from './components/PlannerView';
import { CalendarView } from './components/CalendarView';
import { StudySessionView } from './components/StudySessionView';
import { FeedbackForm } from './components/FeedbackForm';
import { InsightsView } from './components/InsightsView';
import { HistoryView } from './components/HistoryView';
import { StudyRoomView } from './components/StudyRoomView';
import { LMSIntegrationView } from './components/LMSIntegrationView';
import { UploadModal } from './components/UploadModal';
import { RefreshCw } from 'lucide-react';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState<number>(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // Active Session State Machine
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);

  // App data state
  const [papers, setPapers] = useState<PastPaper[]>(INITIAL_PAPERS);
  const [topics, setTopics] = useState<ExtractedTopic[]>(INITIAL_TOPICS);
  const [questions, setQuestions] = useState<QuestionItem[]>(INITIAL_QUESTIONS);
  const [peers, setPeers] = useState<PeerUser[]>(INITIAL_PEERS);
  const [messages, setMessages] = useState<StudyRoomMessage[]>(INITIAL_MESSAGES);
  const [lmsCourses, setLmsCourses] = useState<LMSCourse[]>(INITIAL_LMS_COURSES);

  // Fetch schedule blocks when user is logged in
  const fetchScheduleBlocks = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/schedule-blocks');
      if (res.ok) {
        const data = await res.json();
        setScheduleBlocks(data.scheduleBlocks || []);
      }
    } catch (err) {
      console.error('Failed to fetch schedule blocks:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchScheduleBlocks();
  }, [fetchScheduleBlocks, scheduleRefreshKey]);

  // Sidebar Focus Timer state (synced with active session if running)
  const [sidebarSeconds, setSidebarSeconds] = useState<number>(45 * 60);
  const [isSidebarTimerRunning, setIsSidebarTimerRunning] = useState<boolean>(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSidebarTimerRunning && sidebarSeconds > 0) {
      interval = setInterval(() => {
        setSidebarSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSidebarTimerRunning, sidebarSeconds]);

  const handleAddPaper = (newPaper: PastPaper) => {
    setPapers([newPaper, ...papers]);
  };

  const handleQuestionsExtracted = (newQuestions: QuestionItem[], newTopics: ExtractedTopic[]) => {
    if (newQuestions.length > 0) {
      setQuestions([...newQuestions, ...questions]);
    }
    if (newTopics.length > 0) {
      setTopics(newTopics);
    }
  };

  const handleTopicsSaved = (storedTopics: PersistedTopic[]) => {
    setTopics(storedTopics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      weightage: topic.weightage,
      frequencyCount: topic.priority,
      difficulty: topic.priority >= 8 ? 'Hard' : topic.priority >= 5 ? 'Medium' : 'Easy',
      highYield: topic.priority >= 8,
    })));
  };

  // Start Study Session
  const startStudy = async (block: ScheduleBlock) => {
    try {
      if (activeSession) {
        await fetch(`/api/study-sessions/${activeSession.sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'stopped' })
        });
      }

      const res = await fetch('/api/study-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleBlockId: block.id, durationMinutes: block.durationMinutes })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start study session');

      const newSession: ActiveSessionState = {
        phase: 'active',
        block,
        sessionId: data.studySession.id,
        startedAt: Date.now(),
        accumulatedMs: 0,
        pausedAt: null
      };

      setActiveSession(newSession);
      setSidebarSeconds(block.durationMinutes * 60);
      setIsSidebarTimerRunning(true);
      setActiveTab('session');
    } catch (err: any) {
      alert(err.message || 'Error starting study session');
    }
  };

  // Pause Active Session
  const handlePauseSession = () => {
    if (!activeSession || activeSession.phase !== 'active') return;
    const now = Date.now();
    const currentSegment = now - activeSession.startedAt;
    setActiveSession({
      ...activeSession,
      phase: 'paused',
      accumulatedMs: activeSession.accumulatedMs + currentSegment,
      pausedAt: now
    });
    setIsSidebarTimerRunning(false);

    fetch(`/api/study-sessions/${activeSession.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' })
    }).catch(console.error);
  };

  // Resume Active Session
  const handleResumeSession = () => {
    if (!activeSession || activeSession.phase !== 'paused') return;
    setActiveSession({
      ...activeSession,
      phase: 'active',
      startedAt: Date.now(),
      pausedAt: null
    });
    setIsSidebarTimerRunning(true);

    fetch(`/api/study-sessions/${activeSession.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' })
    }).catch(console.error);
  };

  // Complete Session (transitions to feedback step)
  const handleCompleteSession = (actualSeconds: number) => {
    if (!activeSession) return;
    setActiveSession({
      ...activeSession,
      phase: 'feedback',
      accumulatedMs: actualSeconds * 1000
    });
    setIsSidebarTimerRunning(false);
  };

  // Stop / Abandon Session
  const handleStopSession = async (actualSeconds: number) => {
    if (!activeSession) return;
    try {
      await fetch(`/api/study-sessions/${activeSession.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'stopped',
          actualDurationSeconds: actualSeconds,
          endedAt: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error('Failed to patch stopped session:', err);
    } finally {
      setActiveSession(null);
      setIsSidebarTimerRunning(false);
      setActiveTab('calendar');
    }
  };

  // Submit Feedback payload
  const handleSubmitFeedback = async (payload: SessionFeedbackPayload) => {
    if (!activeSession) return;
    const actualSeconds = Math.round(activeSession.accumulatedMs / 1000);

    const fbRes = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!fbRes.ok) {
      const fbData = await fbRes.json();
      throw new Error(fbData.error || 'Failed to record feedback');
    }

    await fetch(`/api/study-sessions/${activeSession.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        actualDurationSeconds: actualSeconds,
        endedAt: new Date().toISOString()
      })
    });

    await fetch(`/api/schedule-blocks/${activeSession.block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });

    setActiveSession(null);
    setIsSidebarTimerRunning(false);
    setScheduleRefreshKey((k) => k + 1);
    setActiveTab('insights');
  };

  const handleSkipFeedback = async () => {
    if (!activeSession) return;
    const actualSeconds = Math.round(activeSession.accumulatedMs / 1000);

    await fetch(`/api/study-sessions/${activeSession.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        actualDurationSeconds: actualSeconds,
        endedAt: new Date().toISOString()
      })
    });

    await fetch(`/api/schedule-blocks/${activeSession.block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });

    setActiveSession(null);
    setIsSidebarTimerRunning(false);
    setScheduleRefreshKey((k) => k + 1);
    setActiveTab('calendar');
  };

  const handleSendMessage = (msg: StudyRoomMessage) => {
    setMessages([msg, ...messages]);
  };

  const handleLMSSync = () => {
    setLmsCourses((prev) =>
      prev.map((c) => ({
        ...c,
        syncedAt: 'Just now',
        syllabiStatus: 'Synced',
      }))
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center space-y-4 text-neutral-600">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="text-sm font-medium">Restoring academic sanctuary session...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717] flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadModalOpen(true)}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          focusTimerSeconds={sidebarSeconds}
          isTimerRunning={isSidebarTimerRunning}
          toggleTimer={() => setIsSidebarTimerRunning(!isSidebarTimerRunning)}
          activeStudyBlock={activeSession?.block || null}
          onCompleteStudy={() => activeSession && handleCompleteSession(Math.round(activeSession.accumulatedMs / 1000))}
        />

        {/* Main Sanctuary Body View */}
        <main className="flex-1 bg-[#FAFAFA] min-h-[calc(100vh-61px)] pb-12 px-4 sm:px-8 py-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              setActiveTab={setActiveTab}
              onOpenUpload={() => setIsUploadModalOpen(true)}
              onStartStudy={startStudy}
            />
          )}

          {activeTab === 'upload' && (
            <UploadExtractView
              papers={papers}
              topics={topics}
              questions={questions}
              onAddPaper={handleAddPaper}
              onQuestionsExtracted={handleQuestionsExtracted}
              onTopicsSaved={handleTopicsSaved}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'practice' && (
            <PracticeView questions={questions} />
          )}

          {activeTab === 'mock' && (
            <MockExamView questions={questions} />
          )}

          {activeTab === 'planner' && (
            <PlannerView
              onStartStudy={startStudy}
              refreshKey={scheduleRefreshKey}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              scheduleBlocks={scheduleBlocks}
              onStartStudy={startStudy}
              onRefresh={fetchScheduleBlocks}
            />
          )}

          {activeTab === 'session' && (
            <div>
              {!activeSession ? (
                <div className="max-w-xl mx-auto p-12 text-center bg-white rounded-2xl border border-neutral-200 shadow-xs space-y-4">
                  <h2 className="text-xl font-serif font-bold text-neutral-900">No Active Study Session</h2>
                  <p className="text-sm text-neutral-600">
                    Select a study block from your Calendar or Planner and click "Start Study" to launch an active count-up session.
                  </p>
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-colors shadow-xs"
                  >
                    Go to Calendar
                  </button>
                </div>
              ) : activeSession.phase === 'feedback' ? (
                <FeedbackForm
                  sessionId={activeSession.sessionId}
                  topicName={activeSession.block.topicName}
                  blockTitle={activeSession.block.title}
                  onSubmit={handleSubmitFeedback}
                  onSkip={handleSkipFeedback}
                />
              ) : (
                <StudySessionView
                  sessionState={activeSession}
                  onPause={handlePauseSession}
                  onResume={handleResumeSession}
                  onComplete={handleCompleteSession}
                  onStop={handleStopSession}
                />
              )}
            </div>
          )}

          {activeTab === 'insights' && (
            <InsightsView
              scheduleBlocks={scheduleBlocks}
              onRefreshSchedule={fetchScheduleBlocks}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView />
          )}

          {activeTab === 'room' && (
            <StudyRoomView
              peers={peers}
              messages={messages}
              onSendMessage={handleSendMessage}
            />
          )}

          {activeTab === 'lms' && (
            <LMSIntegrationView
              courses={lmsCourses}
              onSync={handleLMSSync}
            />
          )}
        </main>
      </div>

      {/* Quick Upload Paper Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onPaperUploaded={handleAddPaper}
        onTopicsSaved={handleTopicsSaved}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
