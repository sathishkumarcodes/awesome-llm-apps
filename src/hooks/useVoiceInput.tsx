import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceInputHook {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  isSupported: boolean;
  permissionDenied: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export const useVoiceInput = (): VoiceInputHook => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) return;

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setIsProcessing(false);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptSegment + ' ';
        } else {
          interimTranscript += transcriptSegment;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => (prev + ' ' + finalTranscript).trim());
        
        // Reset silence timer on new speech
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        // Auto-stop after 3 seconds of silence
        silenceTimerRef.current = setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }, 3000);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setPermissionDenied(true);
        setError('Microphone permission is required for voice input.');
      } else if (event.error === 'no-speech') {
        setError("Couldn't hear you — try again?");
      } else if (event.error === 'network') {
        setError('Network error. Please check your connection.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      
      setIsListening(false);
      setIsProcessing(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (transcript) {
        setIsProcessing(true);
        // Brief processing state before finalizing
        setTimeout(() => {
          setIsProcessing(false);
        }, 500);
      }
      
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [isSupported, transcript]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    if (permissionDenied) {
      setError('Microphone permission is required. Please enable it in your browser settings.');
      return;
    }

    setError(null);
    setTranscript('');
    
    try {
      recognitionRef.current?.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      setError('Failed to start voice input. Please try again.');
    }
  }, [isSupported, permissionDenied]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    isProcessing,
    transcript,
    isSupported,
    permissionDenied,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
};
