
export interface ScriptPart {
  speaker: 'Rahul' | 'Anjali';
  text: string;
  cleanedText?: string;  // What's actually spoken (for display sync)
}

export interface EditableScriptPart extends ScriptPart {
  id: string;  // Unique ID for drag-and-drop and selection
}

export interface SegmentTiming {
  index: number;
  start: number;   // Start time in seconds
  end: number;     // End time in seconds
  speaker: 'Rahul' | 'Anjali';
}

export interface DirectorQAIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  beat?: number;
  lineIndex?: number;
  description: string;
  suggestion: string;
}

export interface DirectorQAReport {
  passed: boolean;
  score: number;
  issues: DirectorQAIssue[];
  strengths: string[];
  summary: string;
}

export interface ConversationData {
  title: string;
  script: ScriptPart[];
  sourceUrl?: string;
  modelUsed?: 'gemini' | 'groq';  // Which LLM generated the script
  directorQA?: DirectorQAReport;  // Director Layer QA report
}

export interface AudioResult {
  audioBase64: string;
  segmentTimings: SegmentTiming[];
  cleanedScript: ScriptPart[];  // Script with cleaned text for display
}

export interface LibraryItem {
  id: string;
  data: ConversationData;
  audioBase64?: string;  // Optional - may not have audio initially
  timestamp: number;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  EDITING = 'EDITING',           // Script editing before audio synthesis
  SYNTHESIZING = 'SYNTHESIZING', // Audio generation in progress
  PLAYING = 'PLAYING',
  LIBRARY = 'LIBRARY',
  ERROR = 'ERROR'
}

export type PipelineStepStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';

export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
}
