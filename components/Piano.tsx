import React from 'react';

const PIANO_KEYS = [
  { note: 'C3', type: 'white' }, { note: 'C#3', type: 'black' }, { note: 'D3', type: 'white' }, { note: 'D#3', type: 'black' }, { note: 'E3', type: 'white' }, { note: 'F3', type: 'white' }, { note: 'F#3', type: 'black' }, { note: 'G3', type: 'white' }, { note: 'G#3', type: 'black' }, { note: 'A3', type: 'white' }, { note: 'A#3', type: 'black' }, { note: 'B3', type: 'white' },
  { note: 'C4', type: 'white' }, { note: 'C#4', type: 'black' }, { note: 'D4', type: 'white' }, { note: 'D#4', type: 'black' }, { note: 'E4', type: 'white' }, { note: 'F4', type: 'white' }, { note: 'F#4', type: 'black' }, { note: 'G4', type: 'white' }, { note: 'G#4', type: 'black' }, { note: 'A4', type: 'white' }, { note: 'A#4', type: 'black' }, { note: 'B4', type: 'white' },
  { note: 'C5', type: 'white' }, { note: 'C#5', type: 'black' }, { note: 'D5', type: 'white' }, { note: 'D#5', type: 'black' }, { note: 'E5', type: 'white' }, { note: 'F5', type: 'white' }, { note: 'F#5', type: 'black' }, { note: 'G5', type: 'white' }, { note: 'G#5', type: 'black' }, { note: 'A5', type: 'white' }, { note: 'A#5', type: 'black' }, { note: 'B5', type: 'white' },
];

const PianoKey: React.FC<{
  note: string;
  type: 'white' | 'black';
  isHighlighted: boolean;
  isActive: boolean;
  feedback?: 'correct' | 'incorrect';
  onNoteDown: (note: string) => void;
  onNoteUp: (note: string) => void;
}> = ({ note, type, isHighlighted, isActive, feedback, onNoteDown, onNoteUp }) => {
  const baseWhiteStyle = "h-48 w-10 sm:w-12 md:w-14 border-2 border-gray-300 bg-white rounded-b-lg transition-all duration-150 ease-in-out cursor-pointer relative shadow";
  const baseBlackStyle = "h-28 w-6 sm:w-7 md:w-8 border-2 border-gray-900 bg-gray-700 rounded-b-md transition-all duration-150 ease-in-out cursor-pointer absolute z-10 -ml-3 sm:-ml-3.5 md:-ml-4 shadow-lg";

  const highlightStyle = "ring-4 ring-offset-2 ring-blue-500";
  const correctPressStyle = "ring-4 ring-offset-2 ring-green-500";
  const incorrectPressStyle = "ring-4 ring-offset-2 ring-red-500";
  const activeStyle = type === 'white' ? "bg-gray-200 scale-[0.98]" : "bg-gray-500 scale-[0.97]";

  const isBOrE = note.includes('B') || note.includes('E');

  return (
    <div
      onMouseDown={() => onNoteDown(note)}
      onMouseUp={() => onNoteUp(note)}
      onMouseLeave={() => onNoteUp(note)}
      className={`
        ${type === 'white' ? baseWhiteStyle : baseBlackStyle} 
        ${isHighlighted ? highlightStyle : ''} 
        ${feedback === 'correct' ? correctPressStyle : ''}
        ${feedback === 'incorrect' ? incorrectPressStyle : ''}
        ${isActive ? activeStyle : ''}
        ${isBOrE && type === 'white' ? 'mr-0' : ''}
      `}
    >
      <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-semibold ${type === 'white' ? 'text-gray-500' : 'text-gray-200'}`}>{note}</span>
    </div>
  );
};

export const Piano: React.FC<{
  highlightedNote: string | null;
  activeNotes: Set<string>;
  correctPressNote: string | null;
  incorrectPressNote: string | null;
  onNoteDown: (note: string) => void;
  onNoteUp: (note: string) => void;
}> = ({ highlightedNote, activeNotes, correctPressNote, incorrectPressNote, onNoteDown, onNoteUp }) => {
  const getFeedback = (note: string): 'correct' | 'incorrect' | undefined => {
    if (note === correctPressNote) return 'correct';
    if (note === incorrectPressNote) return 'incorrect';
    return undefined;
  };

  return (
    <div className="flex justify-center p-4 bg-gray-200 rounded-lg shadow-inner">
      <div className="flex relative">
        {PIANO_KEYS.filter(k => k.type === 'white').map((keyInfo) => (
          <PianoKey
            key={keyInfo.note}
            note={keyInfo.note}
            type="white"
            isHighlighted={highlightedNote === keyInfo.note}
            isActive={activeNotes.has(keyInfo.note)}
            feedback={getFeedback(keyInfo.note)}
            onNoteDown={onNoteDown}
            onNoteUp={onNoteUp}
          />
        ))}
        <div className="absolute top-0 left-0 flex h-full pointer-events-none">
          {PIANO_KEYS.map((keyInfo, index) => {
            if (keyInfo.type === 'white') {
              const nextKey = PIANO_KEYS[index + 1];
              const isFollowedByBlack = nextKey && nextKey.type === 'black';
              const isE = keyInfo.note.startsWith('E');
              const isB = keyInfo.note.startsWith('B');

              if (!isE && !isB) {
                return <div key={keyInfo.note} className="w-10 sm:w-12 md:w-14 relative" />;
              }
              // Adjust spacing around E and B keys
              return <div key={keyInfo.note} className="w-10 sm:w-12 md:w-14" />;
            }
            if (keyInfo.type === 'black') {
                return (
                    <div key={keyInfo.note} className="pointer-events-auto -ml-3 sm:-ml-3.5 md:-ml-4 mr-3 sm:mr-3.5 md:mr-4">
                        <PianoKey
                            note={keyInfo.note}
                            type="black"
                            isHighlighted={highlightedNote === keyInfo.note}
                            isActive={activeNotes.has(keyInfo.note)}
                            feedback={getFeedback(keyInfo.note)}
                            onNoteDown={onNoteDown}
                            onNoteUp={onNoteUp}
                        />
                    </div>
                );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};

export default Piano;