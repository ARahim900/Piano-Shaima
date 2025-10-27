import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import type { Transcription } from '../types';

// Helper functions for audio encoding/decoding as per Gemini documentation
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


export const useLiveFeedback = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const isStoppingRef = useRef(false);

  const stopListening = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    setIsListening(false);
    
    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch(e) {
            console.error("Error closing session", e);
        }
    }
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close().catch(console.error);
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close().catch(console.error);
    }

    sessionPromiseRef.current = null;
    mediaStreamRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    
    isStoppingRef.current = false;
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;
    setError(null);
    setTranscriptions([]);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsListening(true);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputAudioContext;
      
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputAudioContext;
      nextStartTimeRef.current = outputAudioContext.currentTime;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            systemInstruction: 'You are a friendly and encouraging piano teacher. The user is practicing a song. Listen to their playing and provide short, constructive feedback in real-time. If they play well, praise them. If they make a mistake, gently guide them. Keep your feedback concise.',
            inputAudioTranscription: {},
            outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            const source = inputAudioContext.createMediaStreamSource(mediaStreamRef.current!);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscriptionRef.current += text;
            }
            if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentOutputTranscriptionRef.current += text;
            }

            if (message.serverContent?.turnComplete) {
                const fullInput = currentInputTranscriptionRef.current;
                const fullOutput = currentOutputTranscriptionRef.current;
                
                setTranscriptions(prev => [...prev, { user: fullInput, assistant: fullOutput, isTurnComplete: true }]);
                
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            } else {
                 setTranscriptions(prev => {
                    const last = prev[prev.length -1];
                    if (last && !last.isTurnComplete) {
                        const newTranscriptions = [...prev];
                        newTranscriptions[newTranscriptions.length - 1] = {
                            user: currentInputTranscriptionRef.current,
                            assistant: currentOutputTranscriptionRef.current,
                            isTurnComplete: false,
                        };
                        return newTranscriptions;
                    } else {
                        return [...prev, {
                            user: currentInputTranscriptionRef.current,
                            assistant: currentOutputTranscriptionRef.current,
                            isTurnComplete: false,
                        }];
                    }
                });
            }

            // Handle audio output
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
                const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContextRef.current.destination);
                
                const currentTime = outputAudioContextRef.current.currentTime;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentTime);

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
                source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(source => source.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = outputAudioContextRef.current?.currentTime || 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e);
            setError('A connection error occurred. Please try again.');
            stopListening();
          },
          onclose: (e: CloseEvent) => {
            if (!isStoppingRef.current) {
              stopListening();
            }
          },
        },
      });
    } catch (err) {
      console.error('Failed to start listening:', err);
      setError('Could not access the microphone. Please grant permission and try again.');
      setIsListening(false);
    }
  }, [isListening, stopListening]);

  useEffect(() => {
    return () => {
        if(isListening) {
            stopListening();
        }
    };
  }, [isListening, stopListening]);

  return { isListening, transcriptions, error, startListening, stopListening };
};