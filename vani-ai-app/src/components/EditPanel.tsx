import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Wand2 } from 'lucide-react';
import { EditableScriptPart, ScriptPart } from '../types';
import { ScriptLine } from './ScriptLine';
import { EmotionPalette } from './EmotionPalette';

interface EditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  script: EditableScriptPart[];
  onSave: (script: EditableScriptPart[]) => void;
}

type EditMode = 'raw' | 'advanced';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export const EditPanel: React.FC<EditPanelProps> = ({
  isOpen,
  onClose,
  script,
  onSave,
}) => {
  const [editMode, setEditMode] = useState<EditMode>('raw');
  const [rawText, setRawText] = useState('');
  const [editableScript, setEditableScript] = useState<EditableScriptPart[]>(script);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Convert script to raw text format
  const scriptToRawText = (scriptData: EditableScriptPart[]): string => {
    return scriptData
      .map((line) => `${line.speaker}: ${line.text}`)
      .join('\n\n');
  };

  // Convert raw text to script format
  const rawTextToScript = (text: string): EditableScriptPart[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const result: EditableScriptPart[] = [];
    
    for (const line of lines) {
      const match = line.match(/^(Rahul|Anjali):\s*(.+)$/i);
      if (match) {
        const speaker = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        const text = match[2].trim();
        if (text) {
          result.push({
            id: generateId(),
            speaker: speaker as 'Rahul' | 'Anjali',
            text,
          });
        }
      }
    }
    
    return result.length > 0 ? result : script;
  };

  // Initialize raw text when panel opens or script changes
  useEffect(() => {
    if (isOpen) {
      setRawText(scriptToRawText(script));
      setEditableScript(script);
    }
  }, [isOpen, script]);

  // Handle mode switch
  const handleModeChange = (mode: EditMode) => {
    if (mode === 'advanced' && editMode === 'raw') {
      // Convert raw text to script before switching
      const newScript = rawTextToScript(rawText);
      setEditableScript(newScript);
    } else if (mode === 'raw' && editMode === 'advanced') {
      // Convert script to raw text before switching
      setRawText(scriptToRawText(editableScript));
    }
    setEditMode(mode);
  };

  // Handle save
  const handleSave = () => {
    if (editMode === 'raw') {
      const newScript = rawTextToScript(rawText);
      onSave(newScript);
    } else {
      onSave(editableScript);
    }
    onClose();
  };

  // Handle inserting marker in advanced mode
  const handleInsertMarker = (marker: string) => {
    if (selectedIndex < 0 || selectedIndex >= editableScript.length) return;

    const selectedLine = editableScript[selectedIndex];
    const currentText = selectedLine.text;
    
    let newText: string;
    if (cursorPosition !== null && cursorPosition <= currentText.length) {
      const before = currentText.slice(0, cursorPosition);
      const after = currentText.slice(cursorPosition);
      newText = `${before}${marker}${after}`;
      setCursorPosition(cursorPosition + marker.length);
    } else {
      newText = currentText.trim() ? `${currentText.trim()} ${marker}` : marker;
      setCursorPosition(newText.length);
    }

    setEditableScript((prev) =>
      prev.map((line, i) =>
        i === selectedIndex ? { ...line, text: newText } : line
      )
    );
  };

  // Handle updating a script line in advanced mode
  const handleUpdateLine = (index: number, updates: Partial<EditableScriptPart>) => {
    setEditableScript((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...updates } : line))
    );
  };

  // Handle deleting a script line in advanced mode
  const handleDeleteLine = (index: number) => {
    if (editableScript.length <= 1) return;
    setEditableScript((prev) => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  // Handle adding a new line in advanced mode
  const handleAddLine = () => {
    const lastLine = editableScript[editableScript.length - 1];
    const newSpeaker = lastLine?.speaker === 'Rahul' ? 'Anjali' : 'Rahul';

    const newLine: EditableScriptPart = {
      id: generateId(),
      speaker: newSpeaker,
      text: '',
    };

    setEditableScript((prev) => [...prev, newLine]);
    setSelectedIndex(editableScript.length);

    setTimeout(() => {
      editorContainerRef.current?.scrollTo({
        top: editorContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  };

  // Scroll to selected line in advanced mode
  useEffect(() => {
    if (editMode === 'advanced') {
      const selectedLine = editableScript[selectedIndex];
      if (!selectedLine) return;

      const lineElement = lineRefs.current.get(selectedLine.id);
      if (lineElement) {
        lineElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [selectedIndex, editableScript, editMode]);

  return (
    <>
      {/* Overlay */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div 
        ref={panelRef}
        className={`fixed right-0 top-0 bottom-0 w-[70vw] bg-[#171717] border-l border-white/[0.06] z-[70] flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header with Advanced Toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-white text-sm font-medium">Edit Script</h2>
          
          <div className="flex items-center gap-3">
            {/* Advanced Toggle Switch */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/50">Advanced</span>
              <button
                onClick={() => handleModeChange(editMode === 'advanced' ? 'raw' : 'advanced')}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-lime-400/50 ${
                  editMode === 'advanced' ? 'bg-lime-400' : 'bg-white/20'
                }`}
                role="switch"
                aria-checked={editMode === 'advanced'}
                title="Toggle advanced editor with markers"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform duration-200 ${
                    editMode === 'advanced' ? 'translate-x-4 bg-black' : 'translate-x-0.5 bg-white'
                  }`}
                />
              </button>
            </div>
            
            <button
              onClick={onClose}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-all"
              title="Close panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {editMode === 'raw' ? (
            /* Raw Text Mode */
            <div className="flex-1 p-4 flex flex-col">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Rahul: Your dialogue here&#10;&#10;Anjali: Response here"
                className="flex-1 w-full bg-white/[0.04] text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-white/20 placeholder:text-white/30 font-light rounded-lg p-3 border border-white/[0.06]"
              />
              <p className="text-white/40 text-[10px] mt-2">
                Format: <code className="text-white/60 bg-white/[0.08] px-1.5 py-0.5 rounded">Speaker: Text</code>
              </p>
            </div>
          ) : (
            /* Advanced Mode */
            <>
              {/* Script Lines */}
              <div
                ref={editorContainerRef}
                className="flex-1 overflow-y-auto px-4 py-4"
              >
                <div className="space-y-1">
                  {editableScript.map((line, index) => (
                    <div
                      key={line.id}
                      ref={(el) => {
                        if (el) lineRefs.current.set(line.id, el);
                      }}
                    >
                      <ScriptLine
                        line={line}
                        index={index}
                        isSelected={index === selectedIndex}
                        isLocked={false}
                        onSelect={() => setSelectedIndex(index)}
                        onUpdate={(updates) => handleUpdateLine(index, updates)}
                        onDelete={() => handleDeleteLine(index)}
                        onCursorPositionChange={(position) => setCursorPosition(position)}
                        audioReady={false}
                        showChips={true}
                      />
                    </div>
                  ))}

                  {/* Add Line Button */}
                  <button
                    onClick={handleAddLine}
                    className="w-full py-3 border border-dashed border-white/[0.08] hover:border-white/20 rounded-full text-white/30 hover:text-white/60 transition-all duration-200 flex items-center justify-center gap-2 text-xs mt-3"
                  >
                    Add dialogue line
                  </button>
                </div>
              </div>

              {/* Markers Palette */}
              <div className="w-56 border-l border-white/[0.06] flex flex-col py-2 overflow-y-auto shrink-0">
                <div className="px-2.5 pb-2">
                  <h3 className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Markers</h3>
                </div>
                <div className="px-2.5 flex-1">
                  <EmotionPalette onInsert={handleInsertMarker} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer with Compact Pill Buttons */}
        <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/[0.08] rounded-full transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-white text-black font-medium rounded-full hover:bg-white/90 transition-all"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </>
  );
};

export default EditPanel;
