import React, { useState, useEffect } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem, StudySessionItem, PeerUser, StudyRoomMessage, LMSCourse } from './types';
import { 
  INITIAL_TOPICS, 
  INITIAL_QUESTIONS, 
  INITIAL_PAPERS, 
  INITIAL_SCHEDULE, 
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
  const [focusTimerMinutes, setFocusTimerMinutes] = useState<number>(45);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // App data state
  const [papers, setPapers] = useState<PastPaper[]>(INITIAL_PAPERS);
  const [topics, setTopics] = useState<ExtractedTopic[]>(INITIAL_TOPICS);
  const [questions, setQuestions] = useState<QuestionItem[]>(INITIAL_QUESTIONS);
  const [schedule, setSchedule] = useState<StudySessionItem[]>(INITIAL_SCHEDULE);
  const [peers, setPeers] = useState<PeerUser[]>(INITIAL_PEERS);
  const [messages, setMessages] = useState<StudyRoomMessage[]>(INITIAL_MESSAGES);
  const [lmsCourses, setLmsCourses] = useState<LMSCourse[]>(INITIAL_LMS_COURSES);

  // Deep Focus Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && focusTimerMinutes > 0) {
      interval = setInterval(() => {
        setFocusTimerMinutes((prev) => Math.max(0, prev - 1));
      }, 60000); // decrement minute
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, focusTimerMinutes]);

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

  const handleToggleScheduleComplete = (id: string) => {
    setSchedule((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
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
          focusTimerMinutes={focusTimerMinutes}
          isTimerRunning={isTimerRunning}
          toggleTimer={toggleTimer}
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
              schedule={schedule}
              onToggleComplete={handleToggleScheduleComplete}
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
      />

    </div>
  );
}
