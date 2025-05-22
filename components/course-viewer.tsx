import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { supabase } from "@/config/supabase";

import ReadingView from "./reading-view";
import QuizView from "./quiz-view";

interface Segment {
  id: string;
  title: string;
  text: string;
  order_index: number;
  section_id: string;
  slide_type: 'section' | 'text';
  audio_url?: string | null;
  alignment_data?: {
    segments: {
      start: number;
      end: number;
      text: string;
      words: {
        start: number;
        end: number;
        word: string;
        score: number;
      }[];
    }[];
    detected_language: string;
  } | null;
}

interface UserProgress {
  segment_id: string;
  completed: boolean;
  last_watched_at: string;
}

interface MultipleChoiceQuiz {
  id: number;
  question_text: string;
  correct_answer: string;
  incorrect_answers: string[];
  explanation: string;
}

interface CourseViewerProps {
  segment: Segment;
  onNavigate: (direction: 'up' | 'down', autoPlay?: boolean) => void;
  isFirst: boolean;
  isLast: boolean;
  totalSegments: number;
  currentIndex: number;
  bookId: string;
  progress?: UserProgress;
  getSignedUrl?: (storagePath: string) => Promise<string | null>;
  enableAudio: boolean;
  enableHighlighting: boolean;
  enableDarkMode: boolean;
  onUpdateSetting: (
    settingName: 'enable_audio' | 'enable_highlighting' | 'enable_dark_mode',
    value: boolean
  ) => void;
  userId?: string | null;
  generateNotes: (pageContent: string) => void;
  notesContent: string | null;
  showNotesPopup: boolean;
  closeNotesPopup: () => void;
  isGeneratingNotes: boolean;
  onQuizVisibilityChange?: (isVisible: boolean) => void;
}

export default function CourseViewer({
  segment,
  onNavigate,
  isFirst,
  isLast,
  totalSegments,
  currentIndex,
  bookId,
  progress,
  getSignedUrl,
  enableAudio,
  enableHighlighting,
  enableDarkMode,
  onUpdateSetting,
  userId = null,
  generateNotes,
  notesContent,
  showNotesPopup,
  closeNotesPopup,
  isGeneratingNotes,
  onQuizVisibilityChange
}: CourseViewerProps) {
  // Content pagination state
  const [subPageIndex, setSubPageIndex] = useState(0);
  const [totalSubPages, setTotalSubPages] = useState(1);
  
  // Quiz-related state
  const [quizzes, setQuizzes] = useState<MultipleChoiceQuiz[]>([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState<boolean>(false);
  const [quizExerciseIds, setQuizExerciseIds] = useState<number[]>([]);
  
  // Calculate if we should show quizzes based on subPageIndex and content pages
  const isShowingQuiz = subPageIndex >= totalSubPages && quizzes.length > 0;
  // Quiz index is the current index minus the content pages length
  const currentQuizIndex = isShowingQuiz ? subPageIndex - totalSubPages : 0;

  // Load quizzes when segment changes
  useEffect(() => {
    const loadQuizzes = async () => {
      if (segment.slide_type !== 'text' || !userId) {
        setQuizzes([]);
        return;
      }

      setIsLoadingQuizzes(true);
      try {
        // Look for existing quizzes
        const { data: exercises } = await supabase
          .from('exercises')
          .select('id')
          .eq('page_id', segment.id);

        if (!exercises || exercises.length === 0) {
          console.log('No quizzes found for page', segment.id);
          // In a real implementation, you'd generate quizzes here
          setIsLoadingQuizzes(false);
          return;
        }
        
        // Load the quizzes
        const exerciseIds = exercises.map(ex => ex.id);
        setQuizExerciseIds(exerciseIds);

        const { data: quizzesData } = await supabase
          .from('multiple_choice_quizzes')
          .select('*')
          .in('id', exerciseIds);

        if (quizzesData && quizzesData.length > 0) {
          setQuizzes(quizzesData as MultipleChoiceQuiz[]);
        }
      } catch (error) {
        console.error('Error loading quizzes:', error);
      } finally {
        setIsLoadingQuizzes(false);
      }
    };

    // Log whether segment has audio
    console.log(`[CourseViewer] Segment ${segment.id} - Has audio: ${!!segment.audio_url}`);
    
    loadQuizzes();
    // Reset subpage index when segment changes
    setSubPageIndex(0);
  }, [segment.id, segment.slide_type, userId, segment.audio_url]);

  // Handle quiz submission
  const handleQuizSubmit = useCallback(async (selectedAnswer: string, isCorrect: boolean, quizId: number) => {
    if (!userId) return;
    
    try {
      // Record the quiz attempt
      await supabase.from('user_quiz_attempts').insert({
        user_id: userId,
        exercise_id: quizId,
        is_correct: isCorrect,
        selected_answer: selectedAnswer
      });
    } catch (error) {
      console.error('Error recording quiz attempt:', error);
    }
  }, [userId]);

  // Update quiz visibility when showing/hiding quiz
  useEffect(() => {
    if (onQuizVisibilityChange) {
      onQuizVisibilityChange(isShowingQuiz);
    }
  }, [isShowingQuiz, onQuizVisibilityChange]);

  // Handle navigation within the segment (including quizzes)
  const handleInternalNavigate = useCallback((direction: 'up' | 'down', autoPlay?: boolean) => {
    if (direction === 'up') {
      // Going forward
      if (isShowingQuiz) {
        // In quiz mode
        if (currentQuizIndex < quizzes.length - 1) {
          // More quiz questions, go to next quiz
          setSubPageIndex(prev => prev + 1);
        } else {
          // No more quizzes, go to next segment
          onNavigate('up', false);
        }
      } else {
        // In reading mode
        if (subPageIndex < totalSubPages - 1) {
          // More content pages, go to next page
          setSubPageIndex(prev => prev + 1);
        } else if (quizzes.length > 0) {
          // No more content, but have quizzes, go to first quiz
          setSubPageIndex(totalSubPages);
        } else {
          // No quizzes, go to next segment
          onNavigate('up', false);
        }
      }
    } else {
      // Going backward
      if (isShowingQuiz) {
        // In quiz mode
        if (currentQuizIndex > 0) {
          // Not first quiz, go to previous quiz
          setSubPageIndex(prev => prev - 1);
        } else {
          // First quiz, go back to last content page
          setSubPageIndex(totalSubPages - 1);
        }
      } else {
        // In reading mode
        if (subPageIndex > 0) {
          // Not first content page, go to previous page
          setSubPageIndex(prev => prev - 1);
        } else {
          // First content page, go to previous segment
          onNavigate('down', false);
        }
      }
    }
  }, [isShowingQuiz, currentQuizIndex, quizzes.length, subPageIndex, totalSubPages, onNavigate]);

  // Custom isLast calculation that considers if we're on the last quiz
  const isLastPage = isLast && (
    (isShowingQuiz && currentQuizIndex === quizzes.length - 1) || 
    (!isShowingQuiz && subPageIndex === totalSubPages - 1 && quizzes.length === 0)
  );
  
  // Custom isFirst calculation that considers if we're on the first content page
  const isFirstPage = isFirst && subPageIndex === 0;

  return (
    <View style={styles.container}>
      {!isShowingQuiz ? (
        <ReadingView
          segment={segment}
          onNavigate={handleInternalNavigate}
          isFirst={isFirstPage}
          isLast={isLastPage}
          totalSegments={totalSegments}
          currentIndex={currentIndex}
          bookId={bookId}
          getSignedUrl={getSignedUrl}
          enableAudio={enableAudio}
          enableHighlighting={enableHighlighting}
          enableDarkMode={enableDarkMode}
          onUpdateSetting={onUpdateSetting}
          userId={userId}
          generateNotes={generateNotes}
          notesContent={notesContent}
          showNotesPopup={showNotesPopup}
          closeNotesPopup={closeNotesPopup}
          isGeneratingNotes={isGeneratingNotes}
          onSwitchToQuiz={() => setSubPageIndex(totalSubPages)}
          onSubPageChanged={(newSubPageIndex: number, newTotalSubPages: number) => {
            setSubPageIndex(newSubPageIndex);
            setTotalSubPages(newTotalSubPages);
          }}
        />
      ) : (
        <QuizView
          quizzes={quizzes}
          onComplete={() => {
            // Force a direct call to the parent navigation to ensure we move to the next section
            onNavigate('up');
          }}
          onSubmit={handleQuizSubmit}
          bookTitle={segment.title}
          sectionNumber={currentIndex + 1}
          totalSegments={totalSegments}
          currentIndex={currentIndex}
          onNavigate={handleInternalNavigate}
          isFirst={isFirstPage}
          isLast={isLastPage}
          subPageIndex={currentQuizIndex}
          totalSubPages={quizzes.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  }
}); 