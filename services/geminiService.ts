import { GoogleGenAI, Type } from "@google/genai";
import type { SongNote, Transcription } from '../types';

// Assume API_KEY is set in the environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const songNotesSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      note: {
        type: Type.STRING,
        description: 'A single musical note, e.g., "C4", "G#5". Use "Rest" for a pause.',
      },
      duration: {
        type: Type.INTEGER,
        description: 'The duration of the note in milliseconds. A quarter note at 120bpm is 500ms.',
      },
      startTime: {
        type: Type.INTEGER,
        description: 'The time in milliseconds from the beginning of the song when the note should start playing.',
      },
    },
    required: ['note', 'duration', 'startTime'],
  },
};

export const getSongNotes = async (prompt: string, type: 'song' | 'exercise'): Promise<SongNote[] | null> => {
  try {
     const contents = type === 'song' 
      ? `Generate the musical notes for the song: "${prompt}". The song should be simplified for a single-hand piano player. Use only notes between C3 and B5. Provide the output as an array of objects.`
      : `Generate a piano practice exercise based on this request: "${prompt}". For example, "C Major scale" or "arpeggios in G". The exercise should be suitable for a beginner. Use only notes between C3 and B5. Provide the output as an array of objects.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: songNotesSchema,
      },
    });

    let jsonString = response.text.trim();
    
    // First, try to parse directly, assuming the API returned clean JSON
    try {
        const notes = JSON.parse(jsonString);
        if (Array.isArray(notes) && notes.length > 0 && 'note' in notes[0]) {
            return notes as SongNote[];
        }
    } catch (e) {
        // If direct parsing fails, try to extract from markdown
        console.warn("Direct JSON parsing failed, attempting to extract from markdown.", e);
    }
    
    const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    }

    const startIndex = jsonString.indexOf('[');
    const endIndex = jsonString.lastIndexOf(']');

    if (startIndex === -1 || endIndex === -1) {
        console.warn("Could not find a JSON array in the API response:", jsonString);
        return null;
    }

    jsonString = jsonString.substring(startIndex, endIndex + 1);

    const notes = JSON.parse(jsonString);

    if (Array.isArray(notes)) {
       if (notes.length > 0 && notes.every(n => typeof n === 'object' && n !== null && 'note' in n && 'duration' in n && 'startTime' in n)) {
        return notes as SongNote[];
      }
    }
    console.warn("Received invalid or malformed song data from API:", notes);
    return null;
  } catch (error)
 {
    console.error("Error generating or parsing song notes:", error);
    return null;
  }
};


export const getPracticeSummary = async (transcriptions: Transcription[]): Promise<string | null> => {
  if (transcriptions.length === 0) return null;

  try {
    const transcriptionText = transcriptions
      .map(t => `Student played (transcribed as): "${t.user || '[music]'}"\nTutor said: "${t.assistant}"`)
      .join('\n---\n');
      
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert piano teacher reviewing a practice session. Based on the following transcription of a student's playing and a tutor's real-time feedback, provide a concise, encouraging summary. The student's part is their piano playing, which is often transcribed as "non-speech" or musical sounds. Focus primarily on the tutor's feedback to understand the student's progress.\n\nYour summary should:\n1. Start with an encouraging opening statement.\n2. Briefly mention what the student did well (based on the tutor's praise).\n3. Gently point out one or two key areas for improvement (based on the tutor's corrections).\n4. Conclude with a positive and motivating closing remark for their next practice.\n\nHere is the session transcription:\n---\n${transcriptionText}\n---`,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Error generating practice summary:", error);
    return "Sorry, I couldn't generate a summary for this session.";
  }
};