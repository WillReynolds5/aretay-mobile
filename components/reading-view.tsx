import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions, LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { H1, P, Muted } from "@/components/ui/typography";
import AudioPlayer, { AudioPlayerRef } from "./audio-player";

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

// New interface for page parts with audio timing
interface PagePart {
  text: string;
  audioStart: number | null;  // Start time in seconds
  audioEnd: number | null;    // End time in seconds
}

interface ReadingViewProps {
  segment: Segment;
  onNavigate: (direction: 'up' | 'down', options?: { autoPlayNextSegment?: boolean }) => void;
  isFirst: boolean;
  isLast: boolean;
  totalSegments: number;
  currentIndex: number;
  bookId: string;
  getSignedUrl?: (storagePath: string) => Promise<string | null>;
  enableAudio: boolean;
  enableHighlighting: boolean;
  enableDarkMode: boolean;
  autoPlay?: boolean; // Added for triggering autoplay for the current segment
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
  onSwitchToQuiz: () => void;
  onSubPageChanged?: (subPageIndex: number, totalSubPages: number) => void;
}

// Split content into pages based on sentences, 5 sentences per page
function createPageParts(
  text: string, 
  alignmentData?: Segment['alignment_data']
): PagePart[] {
  if (!text) return [{ text: '', audioStart: null, audioEnd: null }];
  
  console.log('Creating page parts from text length:', text.length);
  
  // Split by sentences - looking for periods, question marks, or exclamation marks followed by a space or newline
  const sentenceRegex = /[.!?]+[\s\n]+/;
  const sentences = text.split(sentenceRegex).filter(sentence => sentence.trim().length > 0);
  
  // Add the sentence terminators back to each sentence
  const processedSentences = [];
  let currentIndex = 0;
  for (const sentence of sentences) {
    if (sentence.trim().length === 0) continue;
    
    // Find the end of this sentence in the original text
    const sentenceEndIndex = text.indexOf(sentence, currentIndex) + sentence.length;
    const terminator = text.substring(sentenceEndIndex, sentenceEndIndex + 2).trim();
    
    // Add the sentence with its terminator
    const fullSentence = sentence + (terminator.match(/[.!?]/) ? terminator : '.');
    processedSentences.push(fullSentence);
    
    // Update current index for next search
    currentIndex = sentenceEndIndex;
  }
  
  console.log('Found sentences:', processedSentences.length);
  
  const pageParts: PagePart[] = [];
  const SENTENCES_PER_PAGE = 3;
  
  // Group sentences into pages - 5 sentences per page
  for (let i = 0; i < processedSentences.length; i += SENTENCES_PER_PAGE) {
    const pageContent = processedSentences
      .slice(i, i + SENTENCES_PER_PAGE)
      .join('\n\n'); // Join with double newlines for better readability
    
    // Find audio timing for this group of sentences
    const timing = findAudioTimingForText(pageContent, alignmentData);
    
    pageParts.push({
      text: pageContent,
      audioStart: timing?.start ?? null,
      audioEnd: timing?.end ?? null
    });
  }
  
  console.log('Created page parts:', pageParts.length);
  if (pageParts.length === 0) {
    // If we couldn't create any parts, create at least one part with the whole text
    pageParts.push({
      text: text,
      audioStart: null,
      audioEnd: null
    });
    console.log('No parts created, using whole text as fallback');
  }
  
  // Debug log the first few chars of each part
  pageParts.forEach((part, idx) => {
    console.log(`Part ${idx+1}: ${part.text.substring(0, 20)}... (${part.text.length} chars)`);
    if (part.audioStart === null || part.audioEnd === null) {
      console.warn(`  WARN: Part ${idx+1} has null audio timing. Start: ${part.audioStart}, End: ${part.audioEnd}`);
    }
  });
  
  return pageParts;
}

// Find the audio timing for a given text from alignment data
function findAudioTimingForText(
  text: string, 
  alignmentData?: Segment['alignment_data']
): { start: number; end: number } | null {
  if (!alignmentData || !alignmentData.segments || alignmentData.segments.length === 0) {
    return null;
  }
  
  // Normalize text for comparison (remove extra spaces, lowercase)
  const normalizedText = text.replace(/\s+/g, ' ').trim().toLowerCase();
  
  // Try to find matching segments
  let start: number | null = null;
  let end: number | null = null;
  
  // First words in our text
  const firstWords = normalizedText.split(' ').slice(0, 5).join(' ');
  // Last words in our text
  const lastWords = normalizedText.split(' ').slice(-5).join(' ');
  
  for (const segment of alignmentData.segments) {
    const segmentText = segment.text.toLowerCase();
    
    // Check if this segment contains our first words
    if (segmentText.includes(firstWords) && start === null) {
      start = segment.start;
    }
    
    // Check if this segment contains our last words
    if (segmentText.includes(lastWords)) {
      end = segment.end;
      // If we've found both start and end, break
      if (start !== null) break;
    }
  }
  
  if (start !== null && end !== null) {
    return { start, end };
  }
  
  // If we couldn't match specific text, use the first and last segments
  if (alignmentData.segments.length > 0) {
    return {
      start: alignmentData.segments[0].start,
      end: alignmentData.segments[alignmentData.segments.length - 1].end
    };
  }
  
  return null;
}

export default function ReadingView({
  segment,
  onNavigate,
  isFirst,
  isLast,
  totalSegments,
  currentIndex,
  bookId,
  getSignedUrl,
  enableAudio,
  enableHighlighting,
  enableDarkMode,
  autoPlay,
  onUpdateSetting,
  userId = null,
  generateNotes,
  notesContent,
  showNotesPopup,
  closeNotesPopup,
  isGeneratingNotes,
  onSwitchToQuiz,
  onSubPageChanged
}: ReadingViewProps) {
  // Create ref for audio player
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  
  // Track page view
  const [hasTrackedPageView, setHasTrackedPageView] = useState(false);
  
  // Pagination states
  const [partIndex, setPartIndex] = useState(0);
  const [pageParts, setPageParts] = useState<PagePart[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track last segment ID to detect actual changes
  const previousSegmentIdRef = useRef<string | null>(null);

  // Initialize page parts when segment changes
  useEffect(() => {
    if (!segment) return;
    
    // Pause any playing audio when segment changes explicitly (not from autoPlay of new segment)
    // This ensures audio from a *previous* segment stops.
    // The autoPlay useEffect will handle starting audio for the *new* segment if needed.
    if (previousSegmentIdRef.current && previousSegmentIdRef.current !== segment.id) {
      audioPlayerRef.current?.pause().catch(err => console.log('ReadingView: Error pausing audio on segment change:', err));
    }
    
    const segmentChanged = previousSegmentIdRef.current !== segment.id;
    console.log('Segment change check:', { 
      current: segment.id, 
      previous: previousSegmentIdRef.current, 
      changed: segmentChanged 
    });
    
    previousSegmentIdRef.current = segment.id;
    
    // If we're just re-rendering with the same segment, don't reset everything
    if (!segmentChanged && pageParts.length > 0) {
      console.log('Same segment, skipping reinitialization');
      return;
    }
    
    console.log('New segment or first load, initializing page parts');
    setIsLoading(true);
    let parts: PagePart[] = [];
    
    if (segment.slide_type === 'section') {
      // For section slides, just use the title as a single part
      parts = [{
        text: segment.title,
        audioStart: null,
        audioEnd: null
      }];
    } else if (segment.text) {
      // For text slides, split by sentences
      parts = createPageParts(segment.text, segment.alignment_data);
    }
    
    console.log('Initialized page parts:', { 
      segmentId: segment.id,
      segmentTitle: segment.title,
      total: parts.length
    });
    
    setPageParts(parts);
    
    // Only reset to first part on a new segment
    if (segmentChanged) {
      console.log('New segment, resetting to part 0');
      setPartIndex(0);
    }
    
    setIsLoading(false);
    
    // Notify parent of part count (only if segment changed or parts count changed)
    if (segmentChanged || parts.length !== pageParts.length) {
      onSubPageChanged?.(segmentChanged ? 0 : partIndex, parts.length);
    }
  }, [segment, onSubPageChanged]);

  // Effect to handle autoPlay prop
  useEffect(() => {
    if (autoPlay && enableAudio && !isLoading && audioPlayerRef.current && pageParts.length > 0 && segment.audio_url) {
      console.log(`ReadingView: autoPlay prop is true for segment ${segment.id}, part ${partIndex}. Attempting to play.`);
      const timer = setTimeout(() => {
        const currentPart = pageParts[partIndex];
        // Ensure current part has audio timing if it's a text slide, or allow play for section slides (which might have full audio)
        if (segment.slide_type === 'section' || (currentPart && currentPart.audioStart !== null)) {
          audioPlayerRef.current?.play().catch(err => console.log('ReadingView: Error auto-playing audio:', err));
        } else {
          console.log('ReadingView: autoPlay skipped for part without audioStart or non-section slide.');
        }
      }, 200); // Delay to allow AudioPlayer to initialize with new audioUrl/positions
      return () => clearTimeout(timer);
    }
  }, [autoPlay, segment.id, segment.audio_url, segment.slide_type, partIndex, pageParts, enableAudio, isLoading]);

  // Track page view
  useEffect(() => {
    const trackPageView = async () => {
      if (hasTrackedPageView || !userId) return;
      
      try {
        // In a real implementation, you'd call an analytics service
        setHasTrackedPageView(true);
      } catch (error) {
        console.error('Error tracking page view:', error);
      }
    };
    
    trackPageView();
  }, [segment.id, bookId, userId, hasTrackedPageView]);

  // Simple navigation handler
  const handleNavigation = useCallback((direction: 'up' | 'down', navOptions?: { keepAudioPlaying?: boolean }) => {
    const shouldPauseAudio = !(navOptions?.keepAudioPlaying && enableAudio);

    if (shouldPauseAudio) {
      audioPlayerRef.current?.pause().catch(err => console.log('ReadingView: Error pausing audio on manual navigation:', err));
    }
    
    console.log('ReadingView: Navigation triggered:', { 
      direction, 
      currentPartIndex: partIndex, 
      totalParts: pageParts.length,
      isFirst,
      isLast,
      keepAudioPlaying: navOptions?.keepAudioPlaying,
      shouldPauseAudio
    });
    
    let newIndex = partIndex;
    
    if (direction === 'up') {
      if (partIndex < pageParts.length - 1) {
        newIndex = partIndex + 1;
        console.log('ReadingView: Moving to next part:', newIndex);
        setPartIndex(newIndex);
        onSubPageChanged?.(newIndex, pageParts.length);
        if (navOptions?.keepAudioPlaying && enableAudio && segment.audio_url) {
          // AudioPlayer props (start/end pos) will update. Tell it to play.
          // Small delay for prop propagation and for AudioPlayer to pick up new startPosition.
          setTimeout(() => {
            console.log('ReadingView: Attempting to play next part (up)');
            audioPlayerRef.current?.play().catch(err => console.log('Error playing next part (up):', err));
          }, 100);
        }
      } else {
        console.log('ReadingView: At last part, moving to next segment (up)');
        onNavigate('up', { autoPlayNextSegment: navOptions?.keepAudioPlaying ?? false });
      }
    } else { // direction 'down'
      if (partIndex > 0) {
        newIndex = partIndex - 1;
        console.log('ReadingView: Moving to previous part:', newIndex);
        setPartIndex(newIndex);
        onSubPageChanged?.(newIndex, pageParts.length);
        // Typically, navigating 'down' (back) manually wouldn't auto-play the previous part,
        // but if keepAudioPlaying was true (e.g. hypothetical programmatic 'rewind and play'), it could.
        // For now, manual 'down' will have keepAudioPlaying: false from UI.
        if (navOptions?.keepAudioPlaying && enableAudio && segment.audio_url) {
           setTimeout(() => {
            console.log('ReadingView: Attempting to play previous part (down)');
            audioPlayerRef.current?.play().catch(err => console.log('Error playing previous part (down):', err));
          }, 100);
        }
      } else {
        console.log('ReadingView: At first part, moving to previous segment (down)');
        // autoPlayNextSegment for 'down' (previous segment) is typically false.
        onNavigate('down', { autoPlayNextSegment: navOptions?.keepAudioPlaying ?? false });
      }
    }
  }, [partIndex, pageParts.length, isFirst, isLast, onNavigate, onSubPageChanged, audioPlayerRef, enableAudio, segment.audio_url]);

  // Get current page part
  const getCurrentPart = (): PagePart => {
    if (pageParts.length === 0 || partIndex >= pageParts.length) {
      return { text: '', audioStart: null, audioEnd: null };
    }
    return pageParts[partIndex];
  };

  // Render content
  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <P className="mt-4">Loading content...</P>
        </View>
      );
    }

    const currentPart = getCurrentPart();
    
    if (segment.slide_type === 'section') {
      return (
        <View style={styles.sectionContainer}>
          <H1 className="text-center">{currentPart.text}</H1>
        </View>
      );
    }
    
    // Regular text part - with larger text size
    return (
      <View style={styles.textContainer}>
        <P style={styles.largeText}>{currentPart.text}</P>
      </View>
    );
  };

  // Add debug log for button rendering
  const renderNavigationButtons = () => {
    const isFirstPart = isFirst && partIndex === 0;
    const isLastPart = isLast && partIndex === pageParts.length - 1;
    
    console.log('Rendering navigation buttons:', { 
      isFirstPart, 
      isLastPart, 
      partIndex, 
      totalParts: pageParts.length 
    });
    
    return (
      <View style={styles.navigationControls}>
        {/* Previous button */}
        <TouchableOpacity
          onPress={() => {
            console.log('DOWN button pressed');
            handleNavigation('down');
          }}
          disabled={isFirstPart}
          style={[
            styles.navButton,
            isFirstPart && styles.disabledButton
          ]}
        >
          <Feather name="chevron-up" size={24} color="#fff" />
        </TouchableOpacity>
        
        {/* Center area - audio controls */}
        <View style={styles.centerControls}>
          {segment.audio_url && (
            <AudioPlayer 
              audioUrl={segment.audio_url}
              enabled={enableAudio}
              getSignedUrl={getSignedUrl}
              ref={audioPlayerRef}
              startPosition={getCurrentPart().audioStart}
              endPosition={getCurrentPart().audioEnd}
              onFinish={handleAudioFinish}
            />
          )}
        </View>
        
        {/* Next button */}
        <TouchableOpacity
          onPress={() => {
            console.log('UP button pressed');
            handleNavigation('up');
          }}
          disabled={isLastPart}
          style={[
            styles.navButton,
            isLastPart && styles.disabledButton
          ]}
        >
          <Feather name="chevron-down" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  // Effect to pause audio when part index changes
  useEffect(() => {
    // This effect is largely superseded by the more nuanced pausing in handleNavigation
    // and the segment change useEffect.
    // Keeping it commented out for now unless specific scenarios require it.
    // if (!navOptions?.keepAudioPlaying) { // This condition isn't available here
    //   audioPlayerRef.current?.pause().catch(err => console.log('Error pausing audio on partIndex change:', err));
    // }
  }, [partIndex]);

  // Add a handler for auto-navigation when audio finishes a page part
  const handleAudioFinish = useCallback(() => {
    console.log('ReadingView: Audio finished for current page part, auto-navigating to next part with keepAudioPlaying=true');
    handleNavigation('up', { keepAudioPlaying: true });
  }, [handleNavigation]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          {segment.slide_type !== 'section' && (
            <P className="text-center font-semibold">{segment.title}</P>
          )}
        </View>
      </View>
      
      <View style={styles.contentArea}>
        {renderContent()}
      </View>
      
      <View style={styles.navigationContainer}>
        {renderNavigationButtons()}
        
        {/* Pagination indicator */}
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationText}>
            {pageParts.length > 1 
              ? `Section ${currentIndex + 1}/${totalSegments} • Page ${partIndex + 1}/${pageParts.length}` 
              : `Section ${currentIndex + 1}/${totalSegments}`}
          </Text>
        </View>
      </View>
      
      {/* Notes popup */}
      {showNotesPopup && (
        <View style={styles.notesPopup}>
          {isGeneratingNotes ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <P className="mb-4">Notes</P>
              <P>{notesContent}</P>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={closeNotesPopup}
              >
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
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
  contentArea: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sectionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 300,
  },
  textContainer: {
    paddingVertical: 16,
  },
  largeText: {
    fontSize: 20,
    lineHeight: 32,
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
    justifyContent: "center",
    alignItems: "center",
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
  notesPopup: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
}); 