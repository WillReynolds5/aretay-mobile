import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { H1, P, Muted } from "@/components/ui/typography";

interface MultipleChoiceQuiz {
  id: number;
  question_text: string;
  correct_answer: string;
  incorrect_answers: string[];
  explanation: string;
}

interface QuizViewProps {
  quizzes: MultipleChoiceQuiz[];
  onComplete: () => void;
  onSubmit: (selectedAnswer: string, isCorrect: boolean, quizId: number) => void;
  bookTitle?: string;
  sectionNumber?: number;
  totalSegments: number;
  currentIndex: number;
  onNavigate: (direction: 'up' | 'down') => void;
  isFirst: boolean;
  isLast: boolean;
  subPageIndex: number;
  totalSubPages: number;
}

export default function QuizView({
  quizzes,
  onComplete,
  onSubmit,
  bookTitle,
  sectionNumber = 1,
  totalSegments,
  currentIndex,
  onNavigate,
  isFirst,
  isLast,
  subPageIndex = 0,
  totalSubPages = 1
}: QuizViewProps) {
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(null);
  
  const currentQuiz = quizzes[currentQuizIndex];
  
  // Reset state when moving to a new question
  useEffect(() => {
    setSelectedAnswer(null);
    setHasSubmitted(false);
    setIsCorrect(false);
    
    // Clear any existing timer
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
  }, [currentQuizIndex]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
    };
  }, [autoCloseTimer]);
  
  // Combine all answers and shuffle them
  const allAnswers = currentQuiz 
    ? [currentQuiz.correct_answer, ...currentQuiz.incorrect_answers]
    : [];
  
  // Fisher-Yates shuffle algorithm with deterministic seed based on quiz ID
  const shuffleArray = (array: string[]) => {
    if (!currentQuiz) return array;
    
    const newArray = [...array];
    
    // Create a seeded random function using the quiz ID as seed
    const seededRandom = () => {
      const x = Math.sin(currentQuiz.id) * 10000;
      return x - Math.floor(x);
    };
    
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    
    return newArray;
  };
  
  const shuffledAnswers = shuffleArray(allAnswers);
  
  // Handle answer selection
  const handleAnswerSelect = (answer: string) => {
    if (hasSubmitted) return;
    
    setSelectedAnswer(answer);
    
    // Auto-submit answer when clicked
    const correct = answer === currentQuiz.correct_answer;
    setIsCorrect(correct);
    setHasSubmitted(true);
    onSubmit(answer, correct, currentQuiz.id);
    
    if (correct) {
      // For correct answers, move to the next question after a short delay
      setTimeout(() => {
        if (currentQuizIndex === quizzes.length - 1) {
          // If this is the last quiz, notify completion
          onComplete();
        } else {
          setCurrentQuizIndex(prev => prev + 1);
        }
      }, 800); // Short delay to show the correct answer feedback
    } else {
      // If answer is incorrect, set auto-continue timer
      const timer = setTimeout(() => {
        // If this is the last quiz, notify completion
        if (currentQuizIndex === quizzes.length - 1) {
          onComplete();
        } else {
          // Otherwise move to the next quiz
          setCurrentQuizIndex(prev => prev + 1);
        }
      }, 10000);
      
      setAutoCloseTimer(timer as unknown as NodeJS.Timeout);
    }
  };
  
  // Handle navigation button clicks
  const handleNavButtonClick = (direction: 'up' | 'down') => {
    if (direction === 'up') {
      // If there are more quiz questions, go to the next one
      if (currentQuizIndex < quizzes.length - 1) {
        setCurrentQuizIndex(prev => prev + 1);
      } else {
        // If at the last quiz question, use onComplete to navigate to the next section
        onComplete();
      }
    } else if (direction === 'down') {
      // If not at the first quiz question, go to previous question
      if (currentQuizIndex > 0) {
        setCurrentQuizIndex(prev => prev - 1);
      } else {
        // If at the first quiz question, navigate to the previous section
        onNavigate('down');
      }
    }
  };

  if (!currentQuiz) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <P className="mt-4">Loading quiz...</P>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <P className="text-center font-semibold">
            {bookTitle || `Section ${sectionNumber} Quiz`}
          </P>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.questionContainer}>
          <P className="text-lg mb-6">{currentQuiz.question_text}</P>
          
          <View style={styles.answersContainer}>
            {shuffledAnswers.map((answer, index) => {
              const isSelected = selectedAnswer === answer;
              const isCorrectAnswer = answer === currentQuiz.correct_answer;
              
              return (
                <TouchableOpacity 
                  key={index}
                  style={[
                    styles.answerButton,
                    isSelected && styles.selectedAnswerButton,
                    hasSubmitted && isCorrectAnswer && styles.correctAnswerButton,
                    hasSubmitted && isSelected && !isCorrectAnswer && styles.incorrectAnswerButton,
                    hasSubmitted && !isSelected && !isCorrectAnswer && styles.disabledAnswerButton
                  ]}
                  onPress={() => handleAnswerSelect(answer)}
                  disabled={hasSubmitted}
                >
                  <View style={styles.answerIndicator}>
                    {hasSubmitted && isCorrectAnswer && (
                      <Feather name="check" size={16} color="#10b981" />
                    )}
                    {hasSubmitted && isSelected && !isCorrectAnswer && (
                      <Feather name="x" size={16} color="#ef4444" />
                    )}
                  </View>
                  <Text style={styles.answerText}>{answer}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          {hasSubmitted && !isCorrect && (
            <View style={styles.explanationContainer}>
              <P className="font-semibold mb-2 text-red-400">Incorrect</P>
              <P className="text-white">{currentQuiz.explanation}</P>
              {autoCloseTimer && (
                <P className="mt-3 text-sm text-gray-400">
                  Continuing in a few seconds...
                </P>
              )}
            </View>
          )}
          
          {hasSubmitted && isCorrect && (
            <View style={styles.explanationContainer}>
              <P className="font-semibold mb-2 text-green-400">Great job!</P>
              <P className="text-white">{currentQuiz.explanation}</P>
            </View>
          )}
        </View>
      </ScrollView>
      
      <View style={styles.navigationContainer}>
        <View style={styles.navigationControls}>
          {/* Previous button */}
          <TouchableOpacity
            onPress={() => handleNavButtonClick('down')}
            disabled={isFirst && currentQuizIndex === 0}
            style={[
              styles.navButton,
              (isFirst && currentQuizIndex === 0) && styles.disabledButton
            ]}
          >
            <Feather name="chevron-up" size={24} color="#fff" />
          </TouchableOpacity>
          
          {/* Center spacer */}
          <View style={styles.centerControls} />
          
          {/* Next button */}
          <TouchableOpacity
            onPress={() => handleNavButtonClick('up')}
            style={styles.navButton}
          >
            <Feather name="chevron-down" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {/* Pagination indicator */}
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationText}>
            {`Quiz ${currentIndex + 1} (${currentQuizIndex + 1}/${quizzes.length})`}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: 50,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  questionContainer: {
    paddingVertical: 16,
  },
  answersContainer: {
    marginBottom: 24,
  },
  answerButton: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  selectedAnswerButton: {
    borderColor: "#3f51b5",
    backgroundColor: "rgba(63, 81, 181, 0.1)",
  },
  correctAnswerButton: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  incorrectAnswerButton: {
    borderColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  disabledAnswerButton: {
    opacity: 0.6,
  },
  answerText: {
    color: "#fff",
    fontSize: 16,
    flex: 1,
  },
  answerIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  explanationContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  navigationContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  navigationControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  centerControls: {
    width: 48,
    height: 48,
  },
  paginationContainer: {
    alignItems: "center",
  },
  paginationText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
}); 