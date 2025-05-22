import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/config/supabase";

import { H1, P, Muted } from "@/components/ui/typography";
import ReadingView from "@/components/reading-view";
import QuizView from "@/components/quiz-view";

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

export default function BookPage() {
  const { id, userId } = useLocalSearchParams();
  const bookId = typeof id === 'string' ? id : '';
  const userIdParam = typeof userId === 'string' ? userId : null;
  
  const [bookTitle, setBookTitle] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<Segment | null>(null);
  
  // User settings
  const [enableAudio, setEnableAudio] = useState(true);
  const [enableHighlighting, setEnableHighlighting] = useState(true);
  const [enableDarkMode, setEnableDarkMode] = useState(false);
  
  // Notes state
  const [notesContent, setNotesContent] = useState<string | null>(null);
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);

  // Quiz state
  const [showingQuiz, setShowingQuiz] = useState(false);
  const [quizzes, setQuizzes] = useState<MultipleChoiceQuiz[]>([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState<boolean>(false);
  const [subPageIndex, setSubPageIndex] = useState(0);
  const [totalSubPages, setTotalSubPages] = useState(1);

  // Define isFirst and isLast based on current index
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === segments.length - 1;

  // State to manage autoplay for the next segment
  const [triggerAutoplayForCurrentSegment, setTriggerAutoplayForCurrentSegment] = useState(false);

  // Calculate if we should show quizzes based on subPageIndex and content pages
  const isShowingQuiz = subPageIndex >= totalSubPages && quizzes.length > 0;
  // Quiz index is the current index minus the content pages length
  const currentQuizIndex = isShowingQuiz ? subPageIndex - totalSubPages : 0;

  // Update the variable references
  // Custom isLast calculation that considers if we're on the last quiz
  const isLastPage = isLast && (
    (isShowingQuiz && currentQuizIndex === quizzes.length - 1) || 
    (!isShowingQuiz && subPageIndex === totalSubPages - 1 && quizzes.length === 0)
  );

  // Custom isFirst calculation that considers if we're on the first content page
  const isFirstPage = isFirst && subPageIndex === 0;

  useEffect(() => {
    const fetchBook = async () => {
      if (!bookId) return;

      try {
        setLoading(true);
        
        // Fetch book details
        const { data: bookData, error: bookError } = await supabase
          .from("books")
          .select("name")
          .eq("id", bookId)
          .single();

        if (bookError || !bookData) {
          console.error("Error fetching book:", bookError);
          throw new Error("Book not found");
        }

        setBookTitle(bookData.name);

        // Fetch all pages for this book
        const { data: pagesData, error: pagesError } = await supabase
          .from("pages")
          .select("*")
          .eq("book_id", bookId)
          .order("page_index", { ascending: true });

        if (pagesError) {
          console.error("Error fetching pages:", pagesError);
          throw pagesError;
        }

        if (!pagesData || pagesData.length === 0) {
          console.log("No pages found");
          setSegments([]);
          return;
        }

        // Collect all audio_ids to fetch audio data
        const audioIds = pagesData
          .filter(page => page.audio_id)
          .map(page => page.audio_id);
        
        // Fetch audio data if there are any audio IDs
        let audioData = [];
        if (audioIds.length > 0) {
          const { data: fetchedAudioData, error: audioError } = await supabase
            .from("audio")
            .select("*")
            .in("id", audioIds);
            
          if (audioError) {
            console.error("Error fetching audio data:", audioError);
          } else if (fetchedAudioData) {
            audioData = fetchedAudioData;
          }
        }

        // Define our type casting function to handle the slide_type properly
        const mapPageToSegment = (page: any): Segment => {
          // Handle audio URL and alignment data
          let audioUrl = null;
          let alignmentData = null;
          
          if (page.audio_id) {
            // Look for matching audio data
            const audio = audioData.find(a => a.id === page.audio_id);
            
            if (audio) {
              // Use the URL from the audio record
              audioUrl = audio.url;
              alignmentData = audio.alignment_data;
            } else {
              // If no matching audio record, store the ID to be used with getSignedUrl
              audioUrl = `${page.audio_id}`;
            }
          }
          
          return {
            id: page.id.toString(),
            title: page.title || '',
            text: page.text || '',
            order_index: page.page_index,
            section_id: page.book_id.toString(),
            slide_type: page.type === 'chapter_title' ? 'section' : 'text',
            audio_url: audioUrl,
            alignment_data: alignmentData || page.alignment_data
          };
        };

        const processedSegments = pagesData.map(mapPageToSegment);

        setSegments(processedSegments);
        
        if (processedSegments.length > 0) {
          setCurrentSegment(processedSegments[0]);
        }

        // Fetch user progress to set initial page
        if (userIdParam) {
          const { data: progressData } = await supabase
            .from("book_progress")
            .select("current_page_id")
            .eq("user_id", userIdParam)
            .eq("book_id", bookId)
            .single();

          if (progressData && progressData.current_page_id) {
            // Find the index of the page in segments
            const pageIndex = processedSegments.findIndex(s => s.id === progressData.current_page_id.toString());
            if (pageIndex !== -1) {
              setCurrentIndex(pageIndex);
              setCurrentSegment(processedSegments[pageIndex]);
            }
          }
        }
      } catch (error) {
        console.error("Error in initialization:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId, userIdParam]);

  // Update current segment when index changes
  useEffect(() => {
    if (segments.length > currentIndex) {
      setCurrentSegment(segments[currentIndex]);
    }
    // If we navigated to a new segment and autoplay was triggered, reset the flag
    // This ensures autoplay is a one-shot for the segment that just became current.
    if (triggerAutoplayForCurrentSegment) {
      // No, this reset should happen *after* ReadingView has a chance to consume it.
      // Let's manage this reset in a separate effect that runs after render.
    }
  }, [currentIndex, segments]);

  // Effect to reset the autoplay trigger *after* it has been passed down and potentially consumed
  useEffect(() => {
    if (triggerAutoplayForCurrentSegment) {
      // Using a timeout to ensure the prop has been processed by child components
      const timer = setTimeout(() => {
        console.log('[BookPage] Resetting triggerAutoplayForCurrentSegment after it has been consumed.');
        setTriggerAutoplayForCurrentSegment(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [triggerAutoplayForCurrentSegment]);

  // Navigation handler
  const handleNavigation = (direction: 'up' | 'down', autoPlayNewSegment?: boolean) => {
    console.log(`[BookPage] handleNavigation called. Direction: ${direction}, autoPlayNewSegment: ${autoPlayNewSegment}`);
    setCurrentIndex(prev => {
      const newIndex = direction === 'up' ? prev + 1 : prev - 1;
      if (newIndex >= 0 && newIndex < segments.length) {
        if (autoPlayNewSegment) {
          console.log('[BookPage] Setting triggerAutoplayForCurrentSegment to true for next segment');
          setTriggerAutoplayForCurrentSegment(true);
        }
        return newIndex;
      }
      return prev;
    });
  };

  // Handle settings updates
  const handleUpdateSetting = (
    settingName: 'enable_audio' | 'enable_highlighting' | 'enable_dark_mode', 
    value: boolean
  ) => {
    switch(settingName) {
      case 'enable_audio':
        setEnableAudio(value);
        break;
      case 'enable_highlighting':
        setEnableHighlighting(value);
        break;
      case 'enable_dark_mode':
        setEnableDarkMode(value);
        break;
    }
  };

  // Load quizzes when segment changes
  useEffect(() => {
    const loadQuizzes = async () => {
      if (!currentSegment || currentSegment.slide_type !== 'text' || !userIdParam) {
        setQuizzes([]);
        return;
      }

      setIsLoadingQuizzes(true);
      try {
        // Look for existing quizzes
        const { data: exercises } = await supabase
          .from('exercises')
          .select('id')
          .eq('page_id', currentSegment.id);

        if (!exercises || exercises.length === 0) {
          console.log('No quizzes found for page', currentSegment.id);
          setIsLoadingQuizzes(false);
          return;
        }
        
        // Load the quizzes
        const exerciseIds = exercises.map(ex => ex.id);
        
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

    loadQuizzes();
    // Reset subpage index when segment changes
    setSubPageIndex(0);
  }, [currentSegment, userIdParam]);

  // Generate notes
  const handleGenerateNotes = async (pageContent: string) => {
    if (isGeneratingNotes) return;
    
    setIsGeneratingNotes(true);
    setShowNotesPopup(true);
    
    try {
      // Mock notes generation for now - would connect to API
      setTimeout(() => {
        setNotesContent("These are sample notes for the current page. In a real implementation, this would call your AI service to generate actual study notes based on the content.");
        setIsGeneratingNotes(false);
      }, 2000);
    } catch (error) {
      console.error("Error generating notes:", error);
      setNotesContent("Failed to generate notes. Please try again.");
      setIsGeneratingNotes(false);
    }
  };

  // Handle quiz submission
  const handleQuizSubmit = async (selectedAnswer: string, isCorrect: boolean, quizId: number) => {
    if (!userIdParam) return;
    
    try {
      // Record the quiz attempt
      await supabase.from('user_quiz_attempts').insert({
        user_id: userIdParam,
        exercise_id: quizId,
        is_correct: isCorrect,
        selected_answer: selectedAnswer
      });
    } catch (error) {
      console.error('Error recording quiz attempt:', error);
    }
  };

  // Signed URL getter - memoized with useCallback
  const getSignedUrl = useCallback(async (storagePath: string) => {
    if (!storagePath) return null;
    
    try {
      // Check if the URL is already a full URL
      if (storagePath.startsWith('http')) {
        return storagePath;
      }
      
      // Get public URL from Supabase storage
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mhumhqcypmzccukfqqgr.supabase.co';
      
      // Build the direct public URL
      const directPublicUrl = `${supabaseUrl}/storage/v1/object/public/audio/${storagePath}`;
      return directPublicUrl;
    } catch (error) {
      console.log("Error getting audio URL:", error);
      return null;
    }
  }, []); // Empty dependency array as it doesn't rely on component state/props

  // Handle navigation within the segment (including quizzes)
  const handleInternalNavigate = (direction: 'up' | 'down', options?: { autoPlayNextSegment?: boolean }) => {
    console.log('[BookPage] Internal navigation called:', { 
      direction, 
      subPageIndex, 
      totalSubPages,
      isShowingQuiz,
      currentQuizIndex,
      quizzes: quizzes.length,
      autoPlayNextSegment: options?.autoPlayNextSegment
    });
    
    if (direction === 'up') {
      // Going forward
      if (isShowingQuiz) {
        // In quiz mode
        if (currentQuizIndex < quizzes.length - 1) {
          // More quiz questions, go to next quiz
          console.log('[BookPage] Moving to next quiz question');
          setSubPageIndex(prev => prev + 1);
        } else {
          // No more quizzes, go to next segment
          console.log('[BookPage] No more quiz questions, moving to next segment');
          handleNavigation('up', options?.autoPlayNextSegment ?? false);
        }
      } else {
        // In reading mode
        if (subPageIndex < totalSubPages - 1) {
          // More content pages, go to next page
          console.log('[BookPage] Moving to next content part:', subPageIndex + 1);
          setSubPageIndex(prev => {
            console.log('[BookPage] Current subPageIndex:', prev, 'Setting to:', prev + 1);
            return prev + 1;
          });
        } else if (quizzes.length > 0) {
          // No more content, but have quizzes, go to first quiz
          console.log('[BookPage] No more content parts, moving to quiz');
          setSubPageIndex(totalSubPages);
        } else {
          // No quizzes, go to next segment
          console.log('[BookPage] No more content parts or quizzes, moving to next segment');
          handleNavigation('up', options?.autoPlayNextSegment ?? false);
        }
      }
    } else {
      // Going backward
      if (isShowingQuiz) {
        // In quiz mode
        if (currentQuizIndex > 0) {
          // Not first quiz, go to previous quiz
          console.log('[BookPage] Moving to previous quiz question');
          setSubPageIndex(prev => prev - 1);
        } else {
          // First quiz, go back to last content page
          console.log('[BookPage] At first quiz, moving back to content');
          setSubPageIndex(totalSubPages - 1);
        }
      } else {
        // In reading mode
        if (subPageIndex > 0) {
          // Not first content page, go to previous page
          console.log('[BookPage] Moving to previous content part:', subPageIndex - 1);
          setSubPageIndex(prev => {
            console.log('[BookPage] Current subPageIndex:', prev, 'Setting to:', prev - 1);
            return prev - 1;
          });
        } else {
          // First content page, go to previous segment
          console.log('[BookPage] At first content part, moving to previous segment');
          // Autoplay is typically false when going back to a previous segment
          handleNavigation('down', false); 
        }
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <P className="mt-4">Loading book...</P>
      </SafeAreaView>
    );
  }

  if (segments.length === 0 || !currentSegment) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <H1 className="text-center">No Content</H1>
        <Muted className="text-center mt-2">
          This book doesn't have any content yet.
        </Muted>
        <View className="mt-6">
          <P onPress={() => router.back()} className="text-primary text-center">
            Go Back
          </P>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          headerTitle: bookTitle,
          headerShown: true,
          headerLeft: () => (
            <Feather
              name="chevron-left"
              size={24}
              color="#fff"
              style={styles.backButton}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      
      {!isShowingQuiz ? (
        <ReadingView
          segment={currentSegment}
          onNavigate={handleInternalNavigate}
          isFirst={isFirstPage}
          isLast={isLastPage}
          totalSegments={segments.length}
          currentIndex={currentIndex}
          bookId={bookId}
          getSignedUrl={getSignedUrl}
          enableAudio={enableAudio}
          autoPlay={triggerAutoplayForCurrentSegment}
          enableHighlighting={enableHighlighting}
          enableDarkMode={enableDarkMode}
          onUpdateSetting={handleUpdateSetting}
          userId={userIdParam}
          generateNotes={handleGenerateNotes}
          notesContent={notesContent}
          showNotesPopup={showNotesPopup}
          closeNotesPopup={() => setShowNotesPopup(false)}
          isGeneratingNotes={isGeneratingNotes}
          onSwitchToQuiz={() => setSubPageIndex(totalSubPages)}
          onSubPageChanged={(newSubPageIndex: number, newTotalSubPages: number) => {
            console.log('[BookPage] onSubPageChanged called with:', { 
              newSubPageIndex, 
              newTotalSubPages, 
              currentSubPageIndex: subPageIndex, 
              currentTotalSubPages: totalSubPages 
            });
            
            setSubPageIndex(newSubPageIndex);
            setTotalSubPages(newTotalSubPages);
            
            console.log('[BookPage] After state updates:', { 
              subPageIndex: newSubPageIndex, 
              totalSubPages: newTotalSubPages 
            });
          }}
        />
      ) : (
        <QuizView
          quizzes={quizzes}
          onComplete={() => {
            // Force a direct call to the parent navigation to ensure we move to the next section
            handleNavigation('up');
          }}
          onSubmit={handleQuizSubmit}
          bookTitle={currentSegment.title}
          sectionNumber={currentIndex + 1}
          totalSegments={segments.length}
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  backButton: {
    padding: 8,
  }
}); 