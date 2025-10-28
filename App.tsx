
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSongNotes, getPracticeSummary } from './services/geminiService';
import { Piano } from './components/Piano';
import SheetMusic from './components/SheetMusic';
import { useLiveFeedback } from './hooks/useLiveFeedback';
import type { SongNote, AppState, Transcription } from './types';
import { HeroHeader } from './components/ui/HeroHeader';
import { GlowingEffect } from './components/ui/glowing-effect';
import { cn } from './lib/utils';
import { Music, Keyboard, User, Bot, ClipboardCheck } from 'lucide-react';
import { GradualSpacing } from './components/ui/gradual-spacing';
import { Alert } from './components/ui/Alert';
import { AnimatePresence, motion } from 'framer-motion';

// Note frequencies from C3 to B5
const noteFrequencies: { [key: string]: number } = {
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
};

type AudioNodes = { oscillator: OscillatorNode; gainNode: GainNode; };

interface GeneratorCardProps {
  icon: React.ReactNode;
  description: string;
  promptValue: string;
  onPromptChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onButtonClick: () => void;
  buttonText: string;
  isLoading: boolean;
  isInteractionDisabled: boolean;
  placeholder: string;
  theme: 'blue' | 'green';
}

const GeneratorCard: React.FC<GeneratorCardProps> = ({
  icon, description, promptValue, onPromptChange, onButtonClick, buttonText, isLoading, isInteractionDisabled, placeholder, theme
}) => {
  const buttonBaseStyle = "font-semibold py-3 px-5 rounded-lg active:scale-[0.98] transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed shadow hover:-translate-y-0.5 hover:shadow-md active:translate-y-0";
  const themeStyles = {
    blue: {
      button: "bg-blue-600 text-white hover:bg-blue-700",
      focus: "focus:ring-blue-500 focus:border-blue-500",
    },
    green: {
      button: "bg-green-600 text-white hover:bg-green-700",
      focus: "focus:ring-green-500 focus:border-green-500",
    },
  };

  const renderLoadingSpinner = () => (
    <div className="flex items-center justify-center">
      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Loading...
    </div>
  );

  return (
    <div>
      <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-gray-300/60 p-2 md:rounded-[1.5rem] md:p-3 bg-white/50">
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={2}
        />
        <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] border-gray-300/80 bg-white p-6 shadow-sm">
          <div className="relative flex flex-1 flex-col justify-start gap-3">
            <div className="w-fit rounded-lg border-[0.75px] border-gray-200 bg-gray-100 p-2 text-gray-700">
              {icon}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              {description}
            </p>
             <div className="mt-auto flex flex-col gap-3 pt-4">
                <input
                  type="text"
                  value={promptValue}
                  onChange={onPromptChange}
                  placeholder={placeholder}
                  className={`w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 ${themeStyles[theme].focus} transition-all duration-200`}
                  disabled={isInteractionDisabled}
                />
                <button
                  onClick={onButtonClick}
                  className={`${buttonBaseStyle} w-full ${themeStyles[theme].button}`}
                  disabled={!promptValue.trim() || isInteractionDisabled}
                >
                  {isLoading ? renderLoadingSpinner() : buttonText}
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [song, setSong] = useState<SongNote[] | null>(null);
  const [songPrompt, setSongPrompt] = useState<string>('Twinkle Twinkle Little Star');
  const [exercisePrompt, setExercisePrompt] = useState<string>('C Major scale, two octaves');
  const [highlightedNoteInfo, setHighlightedNoteInfo] = useState<{ note: string | null; startTime: number | null }>({ note: null, startTime: null });
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string } | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  
  const [learningNoteIndex, setLearningNoteIndex] = useState<number>(0);
  const [correctPressNote, setCorrectPressNote] = useState<string | null>(null);
  const [incorrectPressNote, setIncorrectPressNote] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  const [practiceSummary, setPracticeSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
  const [activeGenerator, setActiveGenerator] = useState<'song' | 'exercise' | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  // --- Audio Engine Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const manualNodesRef = useRef<Map<string, AudioNodes>>(new Map());
  const scheduledNodesRef = useRef<AudioNodes[]>([]);
  const scheduledUiCallbacksRef = useRef<number[]>([]);
  
  const playbackStartTimeRef = useRef<number>(0); // performance.now()
  const playbackProgressRef = useRef<number>(0); // in milliseconds
  const animationFrameRef = useRef<number | null>(null);

  const appStateRef = useRef(appState);
  useEffect(() => { appStateRef.current = appState }, [appState]);
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed }, [playbackSpeed]);

  const transcriptionContainerRef = useRef<HTMLDivElement>(null);

  const { isListening, transcriptions, error: liveError, startListening, stopListening } = useLiveFeedback();
  
  const animationLoop = useCallback(() => {
    if (appStateRef.current !== 'PLAYING') return;

    const elapsedTime = (performance.now() - playbackStartTimeRef.current) * playbackSpeedRef.current;
    const currentProgress = playbackProgressRef.current + elapsedTime;
    setPlaybackProgress(currentProgress);
    
    animationFrameRef.current = requestAnimationFrame(animationLoop);
  }, []);

  useEffect(() => {
    if (appState === 'PLAYING') {
      animationFrameRef.current = requestAnimationFrame(animationLoop);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [appState, animationLoop]);

  useEffect(() => {
    if (transcriptionContainerRef.current) {
        const container = transcriptionContainerRef.current;
        container.scrollTop = container.scrollHeight;
    }
  }, [transcriptions]);


  const initializeAudio = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;
      } catch (e) {
        setErrorInfo({ title: "Audio Error", message: "Web Audio API is not supported in this browser." });
        console.error("Could not create AudioContext", e);
        return false;
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return true;
  }, []);

  const stopAllSounds = useCallback(() => {
    scheduledNodesRef.current.forEach(({ oscillator, gainNode }) => {
      try {
        if (audioContextRef.current) {
          gainNode.gain.cancelScheduledValues(audioContextRef.current.currentTime);
          gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + 0.05);
          oscillator.stop(audioContextRef.current.currentTime + 0.05);
        }
      } catch (e) { /* Ignore errors from stopping already stopped nodes */ }
    });
    scheduledNodesRef.current = [];

    scheduledUiCallbacksRef.current.forEach(clearTimeout);
    scheduledUiCallbacksRef.current = [];
    
    manualNodesRef.current.forEach(({ oscillator, gainNode }, note) => {
      if (audioContextRef.current) {
        gainNode.gain.cancelScheduledValues(audioContextRef.current.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + 0.05);
        oscillator.stop(audioContextRef.current.currentTime + 0.05);
      }
    });
    manualNodesRef.current.clear();
    setActiveNotes(new Set());
  }, []);

  const playNote = useCallback((note: string) => {
    if (!initializeAudio() || note === 'Rest' || manualNodesRef.current.has(note)) return;

    const audioContext = audioContextRef.current!;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(noteFrequencies[note] || 440, audioContext.currentTime);
    gainNode.connect(audioContext.destination);
    oscillator.connect(gainNode);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01);
    
    oscillator.start();
    
    manualNodesRef.current.set(note, { oscillator, gainNode });
    setActiveNotes(prev => new Set(prev).add(note));
  }, [initializeAudio]);

  const stopNote = useCallback((note: string) => {
    const nodePair = manualNodesRef.current.get(note);
    if (!audioContextRef.current || !nodePair) return;

    const audioContext = audioContextRef.current;
    const { oscillator, gainNode } = nodePair;

    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
    
    oscillator.onended = () => { manualNodesRef.current.delete(note); };
    oscillator.stop(audioContext.currentTime + 0.1);
    
    setActiveNotes(prev => {
        const newSet = new Set(prev);
        newSet.delete(note);
        return newSet;
    });
  }, []);
  
  const scheduleSong = useCallback((startOffsetMs: number) => {
    if (!song || !initializeAudio()) return;
    
    stopAllSounds();

    const audioContext = audioContextRef.current!;
    const playbackStartTime = audioContext.currentTime;
    
    const scheduledNodes: AudioNodes[] = [];
    const uiTimeouts: number[] = [];

    song.forEach(note => {
        if (note.startTime < startOffsetMs) return;

        const startTimeSec = (note.startTime - startOffsetMs) / (1000 * playbackSpeed);
        const durationSec = note.duration / (1000 * playbackSpeed);

        const uiTimeout = window.setTimeout(() => {
            setHighlightedNoteInfo({ note: note.note, startTime: note.startTime });
        }, startTimeSec * 1000);
        uiTimeouts.push(uiTimeout);
        
        if (note.note !== 'Rest') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(noteFrequencies[note.note] || 440, 0);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            const notePlaybackStartTime = playbackStartTime + startTimeSec;
            gainNode.gain.setValueAtTime(0, notePlaybackStartTime);
            gainNode.gain.linearRampToValueAtTime(0.5, notePlaybackStartTime + 0.01);
            gainNode.gain.setValueAtTime(0.5, notePlaybackStartTime + durationSec - 0.05);
            gainNode.gain.linearRampToValueAtTime(0, notePlaybackStartTime + durationSec);

            oscillator.start(notePlaybackStartTime);
            oscillator.stop(notePlaybackStartTime + durationSec);
            scheduledNodes.push({ oscillator, gainNode });
        }
    });
    
    scheduledNodesRef.current = scheduledNodes;
    scheduledUiCallbacksRef.current = uiTimeouts;

    const lastNote = song[song.length - 1];
    if (lastNote) {
        const songDurationMs = (lastNote.startTime + lastNote.duration - startOffsetMs) / playbackSpeed;
        const endTimeout = window.setTimeout(() => {
            setAppState('LOADED');
            setHighlightedNoteInfo({ note: null, startTime: null });
            playbackProgressRef.current = 0;
            setPlaybackProgress(0);
        }, songDurationMs + 100);
        scheduledUiCallbacksRef.current.push(endTimeout);
    } else {
        setAppState('LOADED');
    }
  }, [song, playbackSpeed, initializeAudio, stopAllSounds]);

  const onNoteDown = useCallback((note: string) => {
    initializeAudio();
    if (appState === 'LEARNING' && song) {
      const currentNoteToPlay = song[learningNoteIndex];
      if (currentNoteToPlay && note === currentNoteToPlay.note) {
        playNote(note);
        setCorrectPressNote(note);
        setTimeout(() => setCorrectPressNote(null), 300);

        let nextIndex = learningNoteIndex + 1;
        while (song[nextIndex] && song[nextIndex].note === 'Rest') { nextIndex++; }

        if (nextIndex >= song.length) {
          setCompletionMessage("Congratulations! You've finished the song!");
          setTimeout(() => {
            setAppState('LOADED');
            setLearningNoteIndex(0);
            setCompletionMessage(null);
          }, 2000);
        } else {
          setLearningNoteIndex(nextIndex);
        }
      } else {
        setIncorrectPressNote(note);
        setTimeout(() => setIncorrectPressNote(null), 300);
      }
    } else {
      playNote(note);
    }
  }, [appState, song, learningNoteIndex, playNote, initializeAudio]);

  const onNoteUp = useCallback((note: string) => { stopNote(note); }, [stopNote]);

  const resetPlayback = useCallback(() => {
    stopAllSounds();
    setHighlightedNoteInfo({ note: null, startTime: null });
    playbackProgressRef.current = 0;
    setPlaybackProgress(0);
    if (appState === 'PLAYING' || appState === 'PAUSED') {
      setAppState('LOADED');
    }
  }, [stopAllSounds, appState]);

  const handlePlayPause = useCallback(() => {
    if (appState === 'PLAYING') { // Pause
        const elapsedTime = (performance.now() - playbackStartTimeRef.current) * playbackSpeed;
        playbackProgressRef.current += elapsedTime;
        stopAllSounds();
        setAppState('PAUSED');
    } else { // Play or Resume
        playbackStartTimeRef.current = performance.now();
        scheduleSong(appState === 'PAUSED' ? playbackProgressRef.current : 0);
        setAppState('PLAYING');
    }
  }, [appState, playbackSpeed, stopAllSounds, scheduleSong]);
  
  const handleToggleLearning = () => {
    if (appState === 'LEARNING') {
        setAppState('LOADED');
        setLearningNoteIndex(0);
        setHighlightedNoteInfo({ note: null, startTime: null });
    } else if (song) {
        if (!initializeAudio()) return;
        resetPlayback();
        setCompletionMessage(null);
        let firstNoteIndex = 0;
        while (song[firstNoteIndex] && song[firstNoteIndex].note === 'Rest') { firstNoteIndex++; }
        setLearningNoteIndex(firstNoteIndex);
        setAppState('LEARNING');
    }
  }
  
  const handleLoad = async (type: 'song' | 'exercise', promptText: string) => {
    setAppState('LOADING');
    setActiveGenerator(type);
    setSong(null);
    setErrorInfo(null);
    resetPlayback();
    setPracticeSummary(null);
    setCompletionMessage(null);

    try {
      const notes = await getSongNotes(promptText, type);
      if (notes) {
        setSong(notes);
        setAppState('LOADED');
      } else {
        setErrorInfo({ title: "Generation Failed", message: `Could not generate the ${type}. Please try a different prompt.`});
        setAppState('ERROR');
      }
    } catch (error) {
        console.error("Configuration error during generation:", error);
        let message = "The AI service is not set up correctly. Please ensure the API key is provided in the environment settings.";
        // Provide more specific advice for users on deployed platforms.
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '') {
            message += " If you are deploying this to a service like Netlify or Vercel, you must set the API_KEY as an environment variable in your project's settings on that platform for it to work correctly.";
        }
        setErrorInfo({ title: "Configuration Error", message });
        setAppState('ERROR');
    }

    setActiveGenerator(null);
  };

  const handleGetSummary = async () => {
    setIsSummaryLoading(true);
    setPracticeSummary(null);
    setErrorInfo(null);
    try {
      const summary = await getPracticeSummary(transcriptions);
      setPracticeSummary(summary);
    } catch (error) {
      console.error("Configuration error during summary generation:", error);
      let message = "The AI service is not set up correctly. Please ensure the API key is provided in the environment settings.";
      // Provide more specific advice for users on deployed platforms.
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '') {
          message += " If you are deploying this to a service like Netlify or Vercel, you must set the API_KEY as an environment variable in your project's settings on that platform for it to work correctly.";
      }
      setErrorInfo({ title: "Configuration Error", message });
    }
    setIsSummaryLoading(false);
  };
  
  useEffect(() => {
    if (appState === 'PLAYING') {
        const elapsedTime = (performance.now() - playbackStartTimeRef.current);
        const currentProgress = playbackProgressRef.current + (elapsedTime * playbackSpeed);
        
        playbackStartTimeRef.current = performance.now();
        playbackProgressRef.current = currentProgress;
        scheduleSong(currentProgress);
    }
  }, [playbackSpeed, appState, scheduleSong]);

  useEffect(() => {
    if (appState === 'LEARNING' && song && learningNoteIndex < song.length) {
      const currentNote = song[learningNoteIndex];
      setHighlightedNoteInfo({ note: currentNote.note, startTime: currentNote.startTime });
    } else if (appState !== 'PLAYING' && appState !== 'PAUSED' && appState !== 'LEARNING') {
       if (highlightedNoteInfo.note !== null || highlightedNoteInfo.startTime !== null) {
         setHighlightedNoteInfo({ note: null, startTime: null });
       }
    }
  }, [appState, learningNoteIndex, song, highlightedNoteInfo]);

  useEffect(() => {
    return () => {
      stopAllSounds();
      stopListening();
    };
  }, [stopAllSounds, stopListening]);

  const isInteractionDisabled = appState === 'LOADING' || appState === 'PLAYING' || isListening;
  const buttonBaseStyle = "font-semibold py-2 px-5 rounded-lg active:scale-[0.98] transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed shadow hover:-translate-y-0.5 hover:shadow-md active:translate-y-0";

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
      <HeroHeader
        title="AI Piano Teacher"
        subtitle="Generate a song or exercise with AI and practice with live feedback."
      />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        <main className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">1. Generate a Song</h2>
                <GeneratorCard
                    icon={<Music className="h-5 w-5" />}
                    description="Enter the name of a popular song."
                    promptValue={songPrompt}
                    onPromptChange={(e) => setSongPrompt(e.target.value)}
                    onButtonClick={() => handleLoad('song', songPrompt)}
                    buttonText="Get Song"
                    isLoading={appState === 'LOADING' && activeGenerator === 'song'}
                    isInteractionDisabled={isInteractionDisabled}
                    placeholder="e.g., Ode to Joy"
                    theme="blue"
                  />
            </div>
             <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">2. Generate an Exercise</h2>
                   <GeneratorCard
                    icon={<Keyboard className="h-5 w-5" />}
                    description="Describe a technical exercise."
                    promptValue={exercisePrompt}
                    onPromptChange={(e) => setExercisePrompt(e.target.value)}
                    onButtonClick={() => handleLoad('exercise', exercisePrompt)}
                    buttonText="Get Exercise"
                    isLoading={appState === 'LOADING' && activeGenerator === 'exercise'}
                    isInteractionDisabled={isInteractionDisabled}
                    placeholder="e.g., C Major scale"
                    theme="green"
                  />
            </div>
          </div>
          
          {errorInfo && (
            <Alert
                title={errorInfo.title}
                message={errorInfo.message}
                onDismiss={() => setErrorInfo(null)}
            />
          )}

          {song && (
            <div className="space-y-8 animate-fade-in-up">
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">3. View & Play</h2>
                <SheetMusic 
                  song={song} 
                  highlightedNoteInfo={highlightedNoteInfo} 
                  appState={appState}
                  playbackProgress={playbackProgress}
                />
                <div className="flex flex-wrap gap-4 items-center justify-center">
                  <button onClick={handlePlayPause} className={`${buttonBaseStyle} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={appState === 'LOADING' || appState === 'LEARNING'}>
                    {appState === 'PLAYING' ? 'Pause' : (appState === 'PAUSED' ? 'Resume' : 'Play Song')}
                  </button>
                  <button onClick={resetPlayback} className={`${buttonBaseStyle} bg-gray-500 text-white hover:bg-gray-600`} disabled={appState !== 'PLAYING' && appState !== 'PAUSED'}>
                    Stop
                  </button>
                  <button onClick={handleToggleLearning} className={`${buttonBaseStyle} bg-yellow-500 text-white hover:bg-yellow-600`} disabled={isInteractionDisabled || appState === 'PAUSED'}>
                    {appState === 'LEARNING' ? 'Exit Learn Mode' : 'Learn Mode'}
                  </button>
                  <div className="flex items-center gap-2">
                    <label htmlFor="speed" className="font-medium">Speed:</label>
                    <select
                      id="speed"
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                      className="p-2 border-2 border-gray-300 rounded-lg"
                      disabled={appState === 'PLAYING'}
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={0.75}>0.75x</option>
                      <option value={1.0}>1.0x (Normal)</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">4. Practice</h2>
                <Piano
                    highlightedNote={appState === 'LEARNING' || appState === 'PLAYING' || appState === 'PAUSED' ? highlightedNoteInfo.note : null}
                    activeNotes={activeNotes}
                    correctPressNote={correctPressNote}
                    incorrectPressNote={incorrectPressNote}
                    onNoteDown={onNoteDown}
                    onNoteUp={onNoteUp}
                />
                {completionMessage && <p className="text-green-600 text-center font-semibold mt-4">{completionMessage}</p>}
              </div>

               <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold">5. Get Live Feedback</h2>
                  {!isListening && transcriptions.length > 0 && (
                     <button
                        onClick={handleGetSummary}
                        className={`${buttonBaseStyle} bg-purple-600 text-white hover:bg-purple-700`}
                        disabled={isSummaryLoading}
                      >
                       {isSummaryLoading ? 'Analyzing...' : 'Get Practice Summary'}
                      </button>
                  )}
                </div>
                
                 <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="w-full sm:w-1/3">
                      <button onClick={isListening ? stopListening : startListening} className={`${buttonBaseStyle} w-full ${isListening ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-500 hover:bg-teal-600'} text-white`} disabled={!(appState === 'LOADED' || appState === 'LEARNING')}>
                        {isListening ? 'Stop Feedback Session' : 'Start Live Feedback'}
                      </button>
                       {liveError && <p className="text-red-500 mt-2">{liveError}</p>}
                       {isListening && <p className="text-gray-500 mt-2 text-center animate-pulse">Listening...</p>}
                       {appState !== 'LOADED' && appState !== 'LEARNING' && !isListening && (
                          <p className="text-gray-500 mt-2 text-sm">You must have a song loaded to start a feedback session.</p>
                       )}
                    </div>

                    <div className="w-full sm:w-2/3 min-h-[150px] bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col">
                        {isSummaryLoading ? (
                           <div className="flex flex-col items-center justify-center flex-1 animate-fade-in">
                              <svg className="animate-spin h-8 w-8 text-purple-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <p className="text-purple-700 font-semibold">Generating your summary...</p>
                            </div>
                        ) : practiceSummary ? (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-purple-50 p-4 rounded-lg border border-purple-200"
                          >
                            <div className="flex items-start gap-3">
                              <div className="bg-purple-100 p-2 rounded-full mt-1">
                                <ClipboardCheck className="h-5 w-5 text-purple-600" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-purple-800">Practice Summary</h3>
                                <p className="text-gray-700 whitespace-pre-wrap">{practiceSummary}</p>
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <div ref={transcriptionContainerRef} className="space-y-4 overflow-y-auto flex-1 pr-2">
                             <AnimatePresence>
                                {transcriptions.map((t, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        layout
                                        className={`flex flex-col gap-2 transition-opacity duration-300 ${!t.isTurnComplete ? 'opacity-70' : 'opacity-100'}`}
                                    >
                                        {t.user && (
                                            <div className="flex items-end gap-2 self-start max-w-md">
                                                <div className="bg-gray-200 p-2 rounded-full"><User className="w-4 h-4 text-gray-600"/></div>
                                                <div className="bg-gray-200 rounded-lg p-3 break-words">
                                                    <p className="text-gray-700 italic">{t.user}</p>
                                                </div>
                                            </div>
                                        )}
                                        {t.assistant && (
                                            <div className="flex items-end gap-2 self-end max-w-md">
                                                 <div className="bg-blue-500 text-white rounded-lg p-3 order-1 break-words">
                                                    <p>{t.assistant}</p>
                                                </div>
                                                <div className="bg-blue-100 p-2 rounded-full order-2"><Bot className="w-4 h-4 text-blue-600"/></div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                             {transcriptions.length === 0 && (
                                <div className="flex items-center justify-center h-full">
                                   <p className="text-gray-500 text-center">Your conversation with the AI tutor will appear here.</p>
                                </div>
                             )}
                          </div>
                        )}
                    </div>
                </div>
              </div>
            </div>
          )}
        </main>
        
        <footer className="text-center mt-10 py-4 border-t border-gray-200 space-y-2">
          <GradualSpacing
            text="A University Project by Shima Ibrahim Al Balushi"
            className="text-base text-gray-700 font-semibold tracking-[-0.02em]"
            delayMultiple={0.02}
            duration={0.2}
          />
           <GradualSpacing
            text="Suhar University"
            className="text-base text-gray-700 font-semibold tracking-[-0.02em]"
            delayMultiple={0.03}
            duration={0.2}
          />
        </footer>

      </div>
    </div>
  );
};

export default App;
