import React, { useRef, useEffect, useMemo } from 'react';
import type { SongNote, AppState } from '../types';

interface SheetMusicProps {
  song: SongNote[];
  highlightedNoteInfo: { note: string | null; startTime: number | null };
  appState: AppState;
  playbackProgress: number;
}

// --- Component Constants ---
const STAFF_TOP_MARGIN = 40;
const LINE_SPACING = 12;
const STAFF_HEIGHT = LINE_SPACING * 4;
const NOTE_HEAD_RX = 6;
const NOTE_HEAD_RY = 4.5;
const STEM_HEIGHT = 35;
const NOTE_SPACING = 45;
const BAR_LINE_SPACING = 20;
const STAFF_PADDING = 20;
const CLEF_FONT_SIZE = '68px';
const ACCIDENTAL_FONT_SIZE = '24px';
const REST_FONT_SIZE = '32px';
const QUARTER_NOTE_DURATION = 500; // From Gemini prompt: 120bpm = 500ms quarter note
const MEASURE_DURATION = QUARTER_NOTE_DURATION * 4; // Assuming 4/4 time

// --- Note to Staff Position Mapping ---
const NOTE_TO_STAFF_STEP: { [key: string]: number } = {
  C3: -9, 'C#3': -9, D3: -8, 'D#3': -8, E3: -7, F3: -6, 'F#3': -6, G3: -5, 'G#3': -5, A3: -4, 'A#3': -4, B3: -3,
  C4: -2, 'C#4': -2, D4: -1, 'D#4': -1, E4: 0, F4: 1, 'F#4': 1, G4: 2, 'G#4': 2, A4: 3, 'A#4': 3, B4: 4,
  C5: 5, 'C#5': 5, D5: 6, 'D#5': 6, E5: 7, F5: 8, 'F#5': 8, G5: 9, 'G#5': 9, A5: 10, 'A#5': 10, B5: 11,
};

const getNoteYPosition = (note: string): number => {
    const step = NOTE_TO_STAFF_STEP[note] ?? 0;
    return (STAFF_TOP_MARGIN + STAFF_HEIGHT) - (step * LINE_SPACING / 2);
};

const SheetMusic: React.FC<SheetMusicProps> = ({ song, highlightedNoteInfo, appState, playbackProgress }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const noteRefs = useRef<Map<number, SVGGElement>>(new Map());

    const layout = useMemo(() => {
        const elements: ({ type: 'note', data: SongNote, x: number } | { type: 'bar', x: number, isFinal?: boolean })[] = [];
        const noteTimeMap = new Map<number, number>();

        let x = STAFF_PADDING + 60; // Start after clef
        let lastMeasure = -1;

        song.forEach((note) => {
            const measure = Math.floor(note.startTime / MEASURE_DURATION);
            if (measure > lastMeasure) {
                if (lastMeasure !== -1) { // Don't draw bar before first measure
                    x += BAR_LINE_SPACING / 2;
                    elements.push({ type: 'bar', x });
                    x += BAR_LINE_SPACING / 2;
                }
                lastMeasure = measure;
            }
            
            elements.push({ type: 'note', data: note, x });
            noteTimeMap.set(note.startTime, x);

            x += NOTE_SPACING;
        });
        
        x += BAR_LINE_SPACING / 2;
        elements.push({ type: 'bar', x });
        x += 4;
        elements.push({ type: 'bar', x, isFinal: true });

        const totalWidth = x + STAFF_PADDING;
        const timepoints = Array.from(noteTimeMap.entries()).sort((a, b) => a[0] - b[0]);
        return { elements, totalWidth, timepoints };
    }, [song]);

    const playheadX = useMemo(() => {
        if (appState !== 'PLAYING' || layout.timepoints.length < 1) return null;
        
        const timepoints = layout.timepoints;
        
        let nextPointIndex = timepoints.findIndex(([time]) => time > playbackProgress);

        if (playbackProgress < timepoints[0][0]) {
             return timepoints[0][1];
        }
        if (nextPointIndex === -1) {
            return timepoints[timepoints.length - 1][1];
        }
        
        const prevPoint = timepoints[nextPointIndex - 1];
        const nextPoint = timepoints[nextPointIndex];

        const [prevTime, prevX] = prevPoint;
        const [nextTime, nextX] = nextPoint;

        const segmentDuration = nextTime - prevTime;
        if (segmentDuration <= 0) return prevX;

        const progressInSegment = playbackProgress - prevTime;
        const interpolationFactor = progressInSegment / segmentDuration;

        return prevX + (nextX - prevX) * interpolationFactor;
    }, [playbackProgress, appState, layout.timepoints]);

    useEffect(() => {
        if (highlightedNoteInfo.startTime !== null && (appState === 'PLAYING' || appState === 'PAUSED' || appState === 'LEARNING')) {
            const noteElement = noteRefs.current.get(highlightedNoteInfo.startTime);
            if (noteElement && scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const elementLeft = noteElement.getBoundingClientRect().left;
                const containerLeft = container.getBoundingClientRect().left;
                
                const scrollLeft = (elementLeft - containerLeft) + container.scrollLeft - (container.clientWidth / 2) + (NOTE_SPACING / 2);

                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [highlightedNoteInfo, appState]);

    const renderLedgerLines = (note: string, x: number) => {
        const step = NOTE_TO_STAFF_STEP[note];
        if (step === undefined) return null;
        const lines = [];
        // Lines above the staff
        if (step >= 5) { // A5 is on the top line, C5 is step 5
             for (let i = 6; i <= step; i += 1) { // Starting from ledger line for C5
                 if (i % 2 === 0) { // Only draw lines for C, E, G, etc.
                    const y = getNoteYPosition('B4') - ((i - 4) / 2) * LINE_SPACING;
                    lines.push(<line key={`ledger-above-${note}-${i}`} x1={x-10} y1={y} x2={x+10} y2={y} stroke="black" strokeWidth="1.5" />);
                 }
            }
        }
        // Lines below the staff
        if (step <= -3) { // B3 is on the line below, C4 is step -2
            for (let i = -3; i >= step; i -= 1) {
                if (i % 2 !== 0) {
                    const y = getNoteYPosition('D4') - ((i + 1) / 2) * LINE_SPACING;
                    lines.push(<line key={`ledger-below-${note}-${i}`} x1={x-10} y1={y} x2={x+10} y2={y} stroke="black" strokeWidth="1.5" />);
                }
            }
        }
        return lines;
    };

    return (
        <div ref={scrollContainerRef} className="w-full bg-white border-2 border-gray-200 rounded-lg overflow-x-auto mb-4 relative" style={{minHeight: '150px'}}>
            <svg width={layout.totalWidth} height="150" className="relative">
                {/* Staff lines */}
                {Array.from({ length: 5 }).map((_, i) => (
                    <line key={i} x1="0" y1={STAFF_TOP_MARGIN + i * LINE_SPACING} x2={layout.totalWidth} y2={STAFF_TOP_MARGIN + i * LINE_SPACING} stroke="#9ca3af" strokeWidth="1.5" />
                ))}

                {/* Treble Clef */}
                <text x="10" y={STAFF_TOP_MARGIN + STAFF_HEIGHT - 3} fontFamily="Arial" fontSize={CLEF_FONT_SIZE} fill="black">𝄞</text>

                {/* Render Notes and Bars */}
                {layout.elements.map((el, index) => {
                    if (el.type === 'bar') {
                        return <line key={`bar-${index}`} x1={el.x} y1={STAFF_TOP_MARGIN} x2={el.x} y2={STAFF_TOP_MARGIN + STAFF_HEIGHT} stroke="black" strokeWidth={el.isFinal ? "4" : "1.5"} />;
                    }

                    const { data: songNote, x } = el;
                    const y = getNoteYPosition(songNote.note);
                    const isHighlighted = songNote.startTime === highlightedNoteInfo.startTime;
                    const step = NOTE_TO_STAFF_STEP[songNote.note];
                    const stemUp = step ? step < 2 : true; // Notes G4 and above have stem down
                    
                    if (songNote.note === 'Rest') {
                       return (
                           <g key={songNote.startTime} ref={elem => { if (elem) noteRefs.current.set(songNote.startTime, elem); else noteRefs.current.delete(songNote.startTime); }}>
                               <text x={x - 10} y={STAFF_TOP_MARGIN + STAFF_HEIGHT/2 + 10} fontFamily="Arial" fontSize={REST_FONT_SIZE} fill={isHighlighted ? '#3b82f6' : 'black'}>𝄽</text>
                           </g>
                       );
                    }

                    const hasAccidental = songNote.note.includes('#');
                    const accidentalX = x - NOTE_HEAD_RX - 12;

                    return (
                        <g key={songNote.startTime} ref={elem => { if (elem) noteRefs.current.set(songNote.startTime, elem); else noteRefs.current.delete(songNote.startTime); }} className="transition-all duration-150">
                            {renderLedgerLines(songNote.note, x)}
                            {hasAccidental && <text x={accidentalX} y={y + 8} fontFamily="Arial" fontSize={ACCIDENTAL_FONT_SIZE} fill="black">♯</text>}
                            <line
                                x1={x + (stemUp ? -NOTE_HEAD_RX : NOTE_HEAD_RX)}
                                y1={y}
                                x2={x + (stemUp ? -NOTE_HEAD_RX : NOTE_HEAD_RX)}
                                y2={y + (stemUp ? -STEM_HEIGHT : STEM_HEIGHT)}
                                stroke={isHighlighted ? '#3b82f6' : 'black'}
                                strokeWidth="2"
                            />
                            <ellipse
                                cx={x}
                                cy={y}
                                rx={NOTE_HEAD_RX}
                                ry={NOTE_HEAD_RY}
                                fill={isHighlighted ? '#3b82f6' : 'black'}
                            />
                        </g>
                    );
                })}
                 {playheadX !== null && (
                    <line
                        x1={playheadX}
                        y1={STAFF_TOP_MARGIN - 10}
                        x2={playheadX}
                        y2={STAFF_TOP_MARGIN + STAFF_HEIGHT + 10}
                        stroke="#ef4444" // red-500
                        strokeWidth="2"
                        className="transition-transform duration-75 ease-linear"
                    />
                )}
            </svg>
        </div>
    );
};

export default SheetMusic;
