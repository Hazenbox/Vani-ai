import React from 'react';
import type { DirectorQAReport } from '../types';

interface DirectorQAPanelProps {
  qaReport: DirectorQAReport;
  onClose: () => void;
}

export const DirectorQAPanel: React.FC<DirectorQAPanelProps> = ({ qaReport, onClose }) => {
  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'low': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };
  
  const getSeverityIcon = (severity: string) => {
    switch(severity) {
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return 'ℹ️';
      default: return '📝';
    }
  };
  
  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[600px] overflow-auto bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 z-50 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <div>
            <h3 className="text-white font-bold text-lg">Director QA</h3>
            <p className="text-gray-400 text-xs">Performance Validation</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
        >
          ✕
        </button>
      </div>
      
      {/* Score */}
      <div className={`mb-6 p-4 rounded-lg border ${
        qaReport.passed 
          ? 'bg-green-500/10 border-green-500/30' 
          : 'bg-yellow-500/10 border-yellow-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold">Quality Score</span>
          <span className={`text-2xl font-bold ${
            qaReport.score >= 80 ? 'text-green-400' : 
            qaReport.score >= 60 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {qaReport.score}/100
          </span>
        </div>
        <p className="text-gray-300 text-sm mt-2">{qaReport.summary}</p>
      </div>
      
      {/* Strengths */}
      {qaReport.strengths.length > 0 && (
        <div className="mb-6">
          <h4 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
            <span>✅</span>
            <span>Strengths ({qaReport.strengths.length})</span>
          </h4>
          <ul className="space-y-2">
            {qaReport.strengths.map((strength, i) => (
              <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Issues */}
      {qaReport.issues.length > 0 && (
        <div>
          <h4 className="text-yellow-400 font-semibold mb-3 flex items-center gap-2">
            <span>⚠️</span>
            <span>Notes ({qaReport.issues.length})</span>
          </h4>
          <div className="space-y-3">
            {qaReport.issues.map((issue, i) => (
              <div 
                key={i} 
                className={`p-3 rounded-lg border ${getSeverityColor(issue.severity)}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">{getSeverityIcon(issue.severity)}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{issue.description}</p>
                    {issue.beat && (
                      <span className="text-xs opacity-60">Beat {issue.beat}</span>
                    )}
                  </div>
                </div>
                <p className="text-xs opacity-80 ml-7">
                  💡 {issue.suggestion}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <p className="text-xs text-gray-500 text-center">
          QA validates without overriding • Educational feedback only
        </p>
      </div>
    </div>
  );
};
