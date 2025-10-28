import { GoogleGenAI, Type } from "@google/genai";
import type { SongNote, Transcription } from '../types';

let ai: GoogleGenAI | null = null;

// Lazily initialize the GoogleGenAI client.
export const getAi = (): GoogleGenAI => {
  if (!ai) {
    // Per Gemini API guidelines, the API key must be sourced exclusively from process.env.API_KEY.
    // The @google/genai SDK will throw an error if the key is missing or invalid.
    // This assumes the environment is correctly configured to provide this variable.
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

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
      ? `Generate the musical notes for the song: "${prompt}". The song should be simplified for a single-hand piano player. Use only notes between C3 and B5. Provide the output as a JSON array of objects that conforms to the provided schema.`
      : `Generate a piano practice exercise based on this request: "${prompt}". For example, "C Major scale" or "arpeggios in G". The exercise should be suitable for a beginner. Use only notes between C3 and B5. Provide the output as a JSON array of objects that conforms to the provided schema.`;

    const response = await getAi().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: songNotesSchema,
      },
    });

    const responseText = response.text.trim();

    if (!responseText) {
      console.error("API returned an empty response.");
      return null;
    }

    const startIndex = responseText.indexOf('[');
    const endIndex = responseText.lastIndexOf(']');

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        console.error("Could not find a valid JSON array in the response.", responseText);
        return null;
    }
    
    const jsonString = responseText.substring(startIndex, endIndex + 1);

    try {
      const notes = JSON.parse(jsonString);

      if (!Array.isArray(notes)) {
        console.warn("Parsed JSON is not an array:", notes);
        return null;
      }

      if (notes.length === 0) {
        console.warn("API returned an empty array for the prompt:", prompt);
        return null;
      }
      
      const isValidStructure = notes.every(n =>
        typeof n === 'object' && n !== null &&
        'note' in n && typeof n.note === 'string' &&
        'duration' in n && typeof n.duration === 'number' &&
        'startTime' in n && typeof n.startTime === 'number'
      );

      if (isValidStructure) {
        return notes as SongNote[];
      } else {
        console.warn("Received array with invalid note objects:", notes);
        return null;
      }

    } catch (parseError) {
      console.error("Failed to parse extracted JSON string from API:", parseError, "Extracted string:", jsonString);
      return null;
    }
  } catch (error) {
    // Re-throw config/auth errors to be handled by the UI, otherwise treat as a generation failure.
    if (error instanceof Error && /api key|authentication|permission|not found/i.test(error.message)) {
        throw error;
    }
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
      
    const response = await getAi().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert piano teacher reviewing a practice session. Based on the following transcription of a student's playing and a tutor's real-time feedback, provide a concise, encouraging summary. The student's part is their piano playing, which is often transcribed as "non-speech" or musical sounds. Focus primarily on the tutor's feedback to understand the student's progress.\n\nYour summary should:\n1. Start with an encouraging opening statement.\n2. Briefly mention what the student did well (based on the tutor's praise).\n3. Gently point out one or two key areas for improvement (based on the tutor's corrections).\n4. Conclude with a positive and motivating closing remark for their next practice.\n\nHere is the session transcription:\n---\n${transcriptionText}\n---`,
    });

    return response.text.trim();
  } catch (error) {
    // Re-throw config/auth errors, otherwise return a generic error message.
    if (error instanceof Error && /api key|authentication|permission|not found/i.test(error.message)) {
        throw error;
    }
    console.error("Error generating practice summary:", error);
    return "Sorry, I couldn't generate a summary for this session.";
  }
};