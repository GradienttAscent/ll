import React, { useState, useEffect } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem, PeerUser, StudyRoomMessage, LMSCourse, PersistedTopic, ScheduleBlock } from './types';
import { 
  INITIAL_TOPICS, 
  INITIAL_QUESTIONS, 
  INITIAL_PAPERS, 
  INITIAL_PEERS, 
  INITIAL_MESSAGES, 
  INITIAL_LMS_COURSES 
} from './data/initialData';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [focusTimerSeconds, setFocusTimerSeconds] = useState<number>(45 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [activeStudyBlock, setActiveStudyBlock] = useState<ScheduleBlock | null>(null);
  const [activeStudySessionId, setActiveStudySessionId] = useState<string | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // App data state
  const [papers, setPapers] = useState<PastPaper[]>(INITIAL_PAPERS);
  const [topics, setTopics] = useState<ExtractedTopic[]>(INITIAL_TOPICS);
  const [questions, setQuestions] = useState<QuestionItem[]>(INITIAL_QUESTIONS);
  const [peers, setPeers] = useState<PeerUser[]>(INITIAL_PEERS);
  const [messages, setMessages] = useState<StudyRoomMessage[]>(INITIAL_MESSAGES);
  const [lmsCourses, setLmsCourses] = useState<LMSCourse[]>(INITIAL_LMS_COURSES);

  // The timer represents the currently selected persisted schedule block.
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && focusTimerSeconds > 0) {
      interval = setInterval(() => {
        setFocusTimerSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, focusTimerSeconds]);

  useEffect(() => {
    if (activeStudySessionId && focusTimerSeconds === 0) {
      void completeStudy();
    }
  }, [focusTimerSeconds, activeStudySessionId]);

  const toggleTimer = () => {
    setIsTimerRunning(!isTimerRunning);
  };

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

  const startStudy = async (block: ScheduleBlock) => {
    if (activeStudySessionId) {
      await fetch(`/api/study-sessions/${activeStudySessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'stopped' }),
      });
    }
    const response = await fetch('/api/study-sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleBlockId: block.id, durationMinutes: block.durationMinutes }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to start study session.');
    setActiveStudyBlock(block);
    setActiveStudySessionId(data.studySession.id);
    setFocusTimerSeconds(block.durationMinutes * 60);
    setIsTimerRunning(true);
  };

  const completeStudy = async () => {
    if (activeStudySessionId) {
      await fetch(`/api/study-sessions/${activeStudySessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }),
      });
    }
    if (activeStudyBlock) {
      await fetch(`/api/schedule-blocks/${activeStudyBlock.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }),
      });
    }
    setIsTimerRunning(false);
    setActiveStudySessionId(null);
    setActiveStudyBlock(null);
    setScheduleRefreshKey((key) => key + 1);
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

  return (
    <div className="min-h-screen bg-[#FDFDFC] text-[#1A1A1A] flex flex-col font-sans selection:bg-black selection:text-white">
      
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
          focusTimerSeconds={focusTimerSeconds}
          isTimerRunning={isTimerRunning}
          toggleTimer={toggleTimer}
          activeStudyBlock={activeStudyBlock}
          onCompleteStudy={() => void completeStudy()}
        />

        {/* Main Sanctuary Body View */}
        <main className="flex-1 bg-[#FDFDFC] min-h-[calc(100vh-61px)] pb-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              setActiveTab={setActiveTab}
              onOpenUpload={() => setIsUploadModalOpen(true)}
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
