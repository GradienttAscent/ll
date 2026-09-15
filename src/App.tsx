import React, { useState, useEffect } from 'react';
import { ActiveTab, AdaptiveProposal, PastPaper, ExtractedTopic, QuestionItem, PeerUser, StudyRoomMessage, LMSCourse, ScheduleBlock, StudySession, UserAccount } from './types';
import { hasStoredSession, logout as logoutSession, restoreSession, setSessionExpiredHandler } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { UploadExtractView } from './components/UploadExtractView';
import { PracticeView } from './components/PracticeView';
import { MockExamView } from './components/MockExamView';
import { PlannerView } from './components/PlannerView';
import { StudyRoomView } from './components/StudyRoomView';
import { LMSIntegrationView } from './components/LMSIntegrationView';
import { UploadModal } from './components/UploadModal';
import { SessionFeedbackCard } from './components/SessionFeedbackCard';
import { AuthScreen } from './components/AuthScreen';

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [focusTimerSeconds, setFocusTimerSeconds] = useState<number>(45 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [activeStudyBlock, setActiveStudyBlock] = useState<ScheduleBlock | null>(null);
  const [activeStudySessionId, setActiveStudySessionId] = useState<string | null>(null);
  const [sessionActualSeconds, setSessionActualSeconds] = useState(0);
  const [activeSinceMs, setActiveSinceMs] = useState<number | null>(null);
  const [isSessionTransitioning, setIsSessionTransitioning] = useState(false);
  const [feedbackSession, setFeedbackSession] = useState<{ id: string; title: string } | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [adaptiveProposal, setAdaptiveProposal] = useState<AdaptiveProposal | null>(null);
  const [dismissedAdaptiveSessionId, setDismissedAdaptiveSessionId] = useState<string | null>(null);
  const [adaptiveMessage, setAdaptiveMessage] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // App data state
  const [papers, setPapers] = useState<PastPaper[]>([]);
  const [topics, setTopics] = useState<ExtractedTopic[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [peers, setPeers] = useState<PeerUser[]>([]);
  const [messages, setMessages] = useState<StudyRoomMessage[]>([]);
  const [lmsCourses, setLmsCourses] = useState<LMSCourse[]>([]);

  const clearUserState = () => {
    setActiveTab('dashboard');
    setFocusTimerSeconds(45 * 60);
    setIsTimerRunning(false);
    setActiveStudyBlock(null);
    setActiveStudySessionId(null);
    setSessionActualSeconds(0);
    setActiveSinceMs(null);
    setIsSessionTransitioning(false);
    setFeedbackSession(null);
    setScheduleRefreshKey((key) => key + 1);
    setAdaptiveProposal(null);
    setDismissedAdaptiveSessionId(null);
    setAdaptiveMessage('');
    setSessionMessage('');
    setIsUploadModalOpen(false);
    setPapers([]);
    setTopics([]);
    setQuestions([]);
    setPeers([]);
    setMessages([]);
    setLmsCourses([]);
  };

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearUserState();
      setUser(null);
      setAuthMessage('Your session has expired. Please log in again.');
      setAuthState('unauthenticated');
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreAuthentication = async () => {
      const hadStoredSession = hasStoredSession();
      const restoredUser = await restoreSession();
      if (cancelled) return;
      if (restoredUser) {
        setUser(restoredUser);
        setAuthState('authenticated');
      } else {
        setAuthMessage(hadStoredSession ? 'Your session has expired. Please log in again.' : '');
        setAuthState('unauthenticated');
      }
    };
    void restoreAuthentication();
    return () => { cancelled = true; };
  }, []);

  // Remaining time is derived from persisted accumulated seconds plus one active interval.
  useEffect(() => {
    const updateRemaining = () => {
      if (!activeStudyBlock) return;
      const unpersisted = isTimerRunning && activeSinceMs ? Math.max(0, Math.floor((Date.now() - activeSinceMs) / 1000)) : 0;
      setFocusTimerSeconds(Math.max(0, activeStudyBlock.durationMinutes * 60 - sessionActualSeconds - unpersisted));
    };
    updateRemaining();
    if (!isTimerRunning) return undefined;
    const interval = setInterval(updateRemaining, 500);
    return () => clearInterval(interval);
  }, [activeStudyBlock, activeSinceMs, isTimerRunning, sessionActualSeconds]);

  useEffect(() => {
    if (activeStudySessionId && isTimerRunning && focusTimerSeconds === 0 && !isSessionTransitioning) {
      void completeStudy();
    }
  }, [focusTimerSeconds, activeStudySessionId, isTimerRunning, isSessionTransitioning]);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const [sessionsResponse, blocksResponse] = await Promise.all([fetch('/api/study-sessions'), fetch('/api/schedule-blocks')]);
        const sessionsData = await sessionsResponse.json();
        const blocksData = await blocksResponse.json();
        if (!sessionsResponse.ok || !blocksResponse.ok || cancelled) return;
        const session = (sessionsData.studySessions as StudySession[]).find((item) => item.status === 'active')
          || (sessionsData.studySessions as StudySession[]).find((item) => item.status === 'paused');
        const block = (blocksData.scheduleBlocks as ScheduleBlock[]).find((item) => item.id === session?.scheduleBlockId);
        if (!session || !block) return;
        setActiveStudySessionId(session.id);
        setActiveStudyBlock(block);
        setSessionActualSeconds(session.actualDurationSeconds);
        const activeSince = session.status === 'active' && session.activeSince ? Date.parse(session.activeSince) : null;
        setActiveSinceMs(Number.isFinite(activeSince) ? activeSince : null);
        setIsTimerRunning(Boolean(activeSince));
        if (session.status === 'active' && !activeSince) setSessionMessage('Active session restored without a reliable active-time timestamp. Resume to continue timing.');
      } catch {
        // A failed restoration must not fabricate an active session in the UI.
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, [authState, user?.id]);

  const refreshAcademicData = async () => {
    const response = await fetch('/api/academic-evidence');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load academic evidence.');
    const academic = data.academic;
    setPapers(academic.documents.map((document: any) => ({
      id: document.id,
      title: document.title,
      courseCode: 'Stored document',
      semester: document.docType,
      year: new Date(document.createdAt).getFullYear().toString(),
      fileSize: document.fileSize || 'Text',
      uploadDate: new Date(document.createdAt).toLocaleDateString(),
      topicsCount: academic.ranking.filter((topic: any) => topic.syllabusEvidence).length,
      extractedQuestionsCount: academic.questions.filter((question: any) => question.documentId === document.id).length,
      parsedContent: document.content || '',
    })));
    setTopics(academic.ranking.map((topic: any) => ({
      id: topic.id,
      name: topic.name,
      priorityScore: topic.priorityScore,
      actualWeightage: topic.weightageAvailable ? topic.weightage : null,
      frequencyCount: topic.mappedQuestionCount,
      syllabusEvidence: topic.syllabusEvidence,
      sourceDocumentIds: topic.sourceDocumentIds,
      difficulty: topic.priorityScore >= 7 ? 'Hard' : topic.priorityScore >= 4 ? 'Medium' : 'Easy',
      highYield: topic.priorityScore >= 7,
      reason: topic.reason,
    })));
    setQuestions(academic.questions.map((question: any) => ({
      id: question.id,
      subject: 'Persisted academic material',
      topic: question.topicName || 'Unmatched: needs topic review',
      questionText: question.questionText,
      marks: question.marks,
      year: question.documentId ? 'Stored document' : question.source,
      type: 'Short Answer',
      suggestedTimeMinutes: question.suggestedTimeMinutes,
      documentId: question.documentId,
      mappingStatus: question.mappingStatus,
      mappingEvidence: question.mappingEvidence,
    })));
  };

  useEffect(() => {
    if (authState !== 'authenticated') return;
    void refreshAcademicData().catch(() => {
      // Empty or unavailable academic evidence should not fabricate fixture data.
    });
  }, [authState, user?.id]);

  const requestAdaptiveProposal = async (studySessionId: string) => {
    const proposalResponse = await fetch('/api/adaptive-proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studySessionId }),
    });
    const proposalData = await proposalResponse.json();
    if (!proposalResponse.ok) {
      setAdaptiveProposal(null);
      const message = proposalData.error || 'Unable to generate a revision suggestion.';
      setAdaptiveMessage(message);
      setSessionMessage(message);
      return;
    }
    setAdaptiveProposal(proposalData.proposal || null);
    if (proposalData.proposal) setDismissedAdaptiveSessionId(null);
    const message = proposalData.message || (proposalData.proposal ? 'Revision suggested.' : '');
    setAdaptiveMessage(proposalData.message || '');
    if (message) setSessionMessage(message);
  };

  const activeElapsedDelta = () => activeSinceMs ? Math.max(0, Math.floor((Date.now() - activeSinceMs) / 1000)) : 0;

  const persistSessionStatus = async (status: 'active' | 'paused' | 'completed' | 'stopped', deltaSeconds = 0): Promise<StudySession> => {
    if (!activeStudySessionId) throw new Error('No active study session.');
    const response = await fetch(`/api/study-sessions/${activeStudySessionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, actualDurationSeconds: deltaSeconds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update study session.');
    const sessionsResponse = await fetch('/api/study-sessions');
    const sessionsData = await sessionsResponse.json();
    const updated = sessionsResponse.ok && (sessionsData.studySessions as StudySession[]).find((session) => session.id === activeStudySessionId);
    if (!updated) throw new Error('Session was updated but could not be reloaded.');
    return updated;
  };

  const toggleTimer = async () => {
    if (!activeStudySessionId || !activeStudyBlock || isSessionTransitioning) return;
    setIsSessionTransitioning(true);
    try {
      if (isTimerRunning) {
        const session = await persistSessionStatus('paused', activeElapsedDelta());
        setSessionActualSeconds(session.actualDurationSeconds);
        setActiveSinceMs(null);
        setIsTimerRunning(false);
        setSessionMessage('Session paused.');
      } else {
        const session = await persistSessionStatus('active');
        setSessionActualSeconds(session.actualDurationSeconds);
        setActiveSinceMs(Date.parse(session.activeSince));
        setIsTimerRunning(true);
        setSessionMessage('Session resumed.');
      }
    } catch (error: any) {
      setSessionMessage(error.message || 'Unable to update study session.');
    } finally {
      setIsSessionTransitioning(false);
    }
  };

  const stopActiveStudy = async () => {
    if (!activeStudySessionId || !activeStudyBlock) return;
    const stoppedSessionId = activeStudySessionId;
    const stopped = await persistSessionStatus('stopped', activeElapsedDelta());
    setSessionActualSeconds(stopped.actualDurationSeconds);
    setIsTimerRunning(false);
    setActiveSinceMs(null);
    setActiveStudySessionId(null);
    setActiveStudyBlock(null);
      setFocusTimerSeconds(0);
      setSessionMessage('Session stopped.');
      setScheduleRefreshKey((key) => key + 1);
      await requestAdaptiveProposal(stoppedSessionId);
  };

  const stopStudy = async () => {
    try {
      setSessionMessage('');
      await stopActiveStudy();
    } catch (error: any) {
      setSessionMessage(error.message || 'Unable to stop study session.');
    }
  };

  const startStudy = async (block: ScheduleBlock) => {
    if (activeStudySessionId) {
      await stopActiveStudy();
    }
    const response = await fetch('/api/study-sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleBlockId: block.id, durationMinutes: block.durationMinutes }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to start study session.');
    setActiveStudyBlock(block);
    setActiveStudySessionId(data.studySession.id);
    setSessionActualSeconds(0);
    setActiveSinceMs(Date.parse(data.studySession.activeSince));
    setFocusTimerSeconds(block.durationMinutes * 60);
    setIsTimerRunning(true);
    setSessionMessage('');
  };

  const acceptAdaptiveProposal = async (proposal: AdaptiveProposal) => {
    const response = await fetch('/api/adaptive-proposals/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studySessionId: proposal.studySessionId,
        proposedDate: proposal.proposedDate,
        proposedStartTime: proposal.proposedStartTime,
        proposedDurationMinutes: proposal.proposedDurationMinutes,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to accept revision suggestion.');
    setAdaptiveProposal(null);
    setScheduleRefreshKey((key) => key + 1);
  };

  const rejectAdaptiveProposal = async (proposal: AdaptiveProposal) => {
    const response = await fetch('/api/adaptive-proposals/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studySessionId: proposal.studySessionId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to reject revision suggestion.');
    setAdaptiveProposal(null);
    setDismissedAdaptiveSessionId(proposal.studySessionId);
    setAdaptiveMessage('Suggestion dismissed. You can reconsider it against your current calendar.');
  };

  const completeStudy = async () => {
    if (!activeStudySessionId || !activeStudyBlock || isSessionTransitioning) return;
    setIsSessionTransitioning(true);
    try {
      const completedSessionId = activeStudySessionId;
      const completedBlock = activeStudyBlock;
      const completed = await persistSessionStatus('completed', activeElapsedDelta());
      setSessionActualSeconds(completed.actualDurationSeconds);
      setIsTimerRunning(false);
      setActiveSinceMs(null);
      setActiveStudySessionId(null);
      setActiveStudyBlock(null);
      setFocusTimerSeconds(0);
      setFeedbackSession({ id: completedSessionId, title: completedBlock.title });
      setScheduleRefreshKey((key) => key + 1);
      setSessionMessage('Session completed.');
    } catch (error: any) {
      setSessionMessage(error.message || 'Unable to complete study session.');
    } finally {
      setIsSessionTransitioning(false);
    }
  };

  const saveSessionFeedback = async (input: { focusRating: number; difficultyRating: number; progressRating: number; notes: string }) => {
    if (!feedbackSession) return;
    const response = await fetch(`/api/study-sessions/${feedbackSession.id}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save session feedback.');
    const sessionId = feedbackSession.id;
    setFeedbackSession(null);
    setSessionMessage('Session feedback saved.');
    setScheduleRefreshKey((key) => key + 1);
    if (data.feedback.difficultyRating >= 4) await requestAdaptiveProposal(sessionId);
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

  const handleAuthenticated = (authenticatedUser: UserAccount) => {
    clearUserState();
    setUser(authenticatedUser);
    setAuthMessage('');
    setAuthState('authenticated');
  };

  const handleLogout = () => {
    clearUserState();
    setUser(null);
    setAuthMessage('You have been logged out.');
    setAuthState('unauthenticated');
    void logoutSession();
  };

  if (authState === 'checking') {
    return <main className="min-h-screen bg-[#FDFDFC] text-[#1A1A1A] flex items-center justify-center text-xs uppercase tracking-[0.2em] font-bold">Restoring your workspace...</main>;
  }

  if (authState === 'unauthenticated' || !user) {
    return <AuthScreen initialMessage={authMessage} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div key={user.id} className="min-h-screen bg-[#FDFDFC] text-[#1A1A1A] flex flex-col font-sans selection:bg-black selection:text-white">
      
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          focusTimerSeconds={focusTimerSeconds}
          isTimerRunning={isTimerRunning}
          toggleTimer={() => void toggleTimer()}
          activeStudyBlock={activeStudyBlock}
          onCompleteStudy={() => void completeStudy()}
          onStopStudy={() => void stopStudy()}
          sessionMessage={sessionMessage}
        />

        {/* Main Sanctuary Body View */}
        <main className="flex-1 bg-[#FDFDFC] min-h-[calc(100vh-61px)] pb-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              setActiveTab={setActiveTab}
              refreshKey={scheduleRefreshKey}
            />
          )}

          {activeTab === 'upload' && (
            <UploadExtractView
              papers={papers}
              topics={topics}
              questions={questions}
              onAcademicUpdated={refreshAcademicData}
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
              adaptiveProposal={adaptiveProposal}
              dismissedAdaptiveSessionId={dismissedAdaptiveSessionId}
              adaptiveMessage={adaptiveMessage}
              onAcceptAdaptiveProposal={acceptAdaptiveProposal}
              onRejectAdaptiveProposal={rejectAdaptiveProposal}
              onReconsiderAdaptiveProposal={requestAdaptiveProposal}
            />
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
        onAcademicUpdated={refreshAcademicData}
      />
      {feedbackSession && <SessionFeedbackCard key={feedbackSession.id} sessionId={feedbackSession.id} title={feedbackSession.title} onSave={saveSessionFeedback} />}

    </div>
  );
}
