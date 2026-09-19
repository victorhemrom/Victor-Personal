import React, { useState, useRef } from 'react';
import { 
  Users, 
  Upload, 
  FileAudio, 
  FileVideo, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Code, 
  ListFilter, 
  Play, 
  FileText,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DiarizationItem } from '../types';
import { generateSpeakerDiarization } from '../services/gemini';
import { srtTimeToSeconds, diarizationToSrt, getSpeakerStyle } from '../utils/diarizationUtils';

interface SpeakerDiarizationTabProps {
  sharedFile: File | null;
  onSharedFileChange: (file: File | null) => void;
}

export function SpeakerDiarizationTab({ sharedFile, onSharedFileChange }: SpeakerDiarizationTabProps) {
  const [file, setFile] = useState<File | null>(sharedFile);
  const [mediaPreview, setMediaPreview] = useState<string | null>(() => sharedFile ? URL.createObjectURL(sharedFile) : null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<DiarizationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSrt, setCopiedSrt] = useState(false);
  const [activeView, setActiveView] = useState<'json' | 'interactive'>('interactive');
  const [speakerFilter, setSpeakerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  // Sync when shared file updates from parent
  React.useEffect(() => {
    if (sharedFile && sharedFile !== file) {
      setFile(sharedFile);
      setMediaPreview(URL.createObjectURL(sharedFile));
    }
  }, [sharedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) {
        setError("File size too large. Please use a media file under 20MB.");
        return;
      }
      setFile(selectedFile);
      onSharedFileChange(selectedFile);
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }
      setMediaPreview(URL.createObjectURL(selectedFile));
      setRawJson(null);
      setParsedItems(null);
      setError(null);
      setCopied(false);
    }
  };

  const fileToBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleProcessDiarization = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setRawJson(null);
    setParsedItems(null);
    setCopied(false);

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || (file.name.endsWith('.mp3') ? 'audio/mp3' : file.name.endsWith('.wav') ? 'audio/wav' : 'video/mp4');
      const resultJson = await generateSpeakerDiarization(base64, mimeType);

      if (!resultJson || resultJson.trim() === '') {
        throw new Error("No transcription data received from the engine.");
      }

      setRawJson(resultJson);

      // Attempt to parse JSON for interactive presentation
      try {
        const parsed = JSON.parse(resultJson);
        if (Array.isArray(parsed)) {
          setParsedItems(parsed);
          setActiveView('interactive');
        } else {
          setActiveView('json');
        }
      } catch (parseErr) {
        console.warn("Could not parse as standard JSON array, displaying raw view", parseErr);
        setActiveView('json');
      }
    } catch (err: any) {
      console.error('Diarization error:', err);
      setError(err.message || "An error occurred while processing speaker diarization.");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyJsonToClipboard = () => {
    if (!rawJson) return;
    navigator.clipboard.writeText(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySrtToClipboard = () => {
    if (!parsedItems) return;
    const srt = diarizationToSrt(parsedItems);
    navigator.clipboard.writeText(srt);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  const downloadJson = () => {
    if (!rawJson) return;
    const blob = new Blob([rawJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.split('.')[0] || 'transcript'}_diarization.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDiarizedSrt = () => {
    if (!parsedItems) return;
    const srt = diarizationToSrt(parsedItems);
    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.split('.')[0] || 'transcript'}_diarized.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const seekToTimestamp = (timestamp: string) => {
    const seconds = srtTimeToSeconds(timestamp);
    if (mediaRef.current) {
      mediaRef.current.currentTime = Math.max(0, seconds);
      mediaRef.current.play().catch(() => {
        // Autoplay may be restricted
      });
    }
  };

  // Distinct speakers list
  const uniqueSpeakers: string[] = parsedItems ? Array.from(new Set(parsedItems.map(item => item.speaker))) : [];

  // Filtered items
  const filteredItems = (parsedItems || []).filter(item => {
    const matchesSpeaker = speakerFilter === 'all' || item.speaker === speakerFilter;
    const matchesSearch = !searchQuery || item.text.toLowerCase().includes(searchQuery.toLowerCase()) || item.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSpeaker && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Upload or Active Media Section */}
      {!file ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          id="diarization-dropzone"
          className="border-2 border-dashed border-zinc-300 rounded-2xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*,audio/*"
            className="hidden"
          />
          <Upload className="w-12 h-12 text-zinc-400 mx-auto mb-4 group-hover:text-indigo-500 transition-colors" />
          <p className="text-zinc-700 font-medium text-base">Click to upload media or drag and drop</p>
          <p className="text-zinc-400 text-sm mt-1">MP4, MOV, MP3, WAV, WebM (max 20MB)</p>
          <div className="mt-4 inline-flex items-center space-x-2 text-xs text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-full">
            <Users className="w-3.5 h-3.5" />
            <span>Ready to detect multi-speaker dialogue</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* File Information Card */}
          <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-xl border border-zinc-200/80">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                {file.type.startsWith('audio/') ? (
                  <FileAudio className="w-6 h-6 text-indigo-600" />
                ) : (
                  <FileVideo className="w-6 h-6 text-indigo-600" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 truncate max-w-[200px] sm:max-w-md">
                  {file.name}
                </p>
                <div className="flex items-center space-x-2 text-xs text-zinc-500 mt-0.5">
                  <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>•</span>
                  <span className="capitalize">{file.type.split('/')[0] || 'Media'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                id="btn-change-media"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                Change File
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="video/*,audio/*"
                className="hidden"
              />
              <button 
                onClick={() => {
                  setFile(null);
                  onSharedFileChange(null);
                  setMediaPreview(null);
                  setRawJson(null);
                  setParsedItems(null);
                  setError(null);
                }}
                id="btn-remove-media"
                className="text-xs text-zinc-500 hover:text-red-600 font-medium p-1.5 transition-colors"
                title="Remove file"
              >
                Remove
              </button>
            </div>
          </div>

          {/* Media Player Preview with Seekability */}
          {mediaPreview && (
            <div className={`rounded-xl overflow-hidden bg-black border border-zinc-200 shadow-inner flex items-center justify-center ${file.type.startsWith('audio/') ? 'p-6 bg-zinc-900' : 'aspect-video max-h-[360px]'}`}>
              {file.type.startsWith('audio/') ? (
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                    <span>Audio Player</span>
                    <span className="italic">Click any timestamp below to seek</span>
                  </div>
                  <audio 
                    ref={mediaRef as React.RefObject<HTMLAudioElement>}
                    src={mediaPreview} 
                    controls 
                    className="w-full"
                  />
                </div>
              ) : (
                <video 
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  src={mediaPreview} 
                  controls 
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          )}

          {/* Diarization Action Button */}
          <div className="flex justify-center pt-2">
            <button
              onClick={handleProcessDiarization}
              disabled={isProcessing}
              id="btn-start-diarization"
              className={`
                flex items-center justify-center space-x-2.5 px-8 py-3.5 rounded-xl font-semibold transition-all
                ${isProcessing 
                  ? 'bg-indigo-400 text-white cursor-not-allowed shadow-md shadow-indigo-200' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'}
              `}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating Subtitles...</span>
                </>
              ) : (
                <>
                  <Users className="w-5 h-5" />
                  <span>generate Subtitles</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Diarization Error</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Container */}
      <AnimatePresence>
        {rawJson && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 space-y-6"
          >
            {/* Success and Overview Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
              <div className="flex items-center space-x-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <span className="font-semibold text-zinc-900">Speaker Diarization Complete</span>
                  {parsedItems && (
                    <span className="text-xs text-zinc-500 block">
                      {uniqueSpeakers.length} unique {uniqueSpeakers.length === 1 ? 'speaker' : 'speakers'} detected • {parsedItems.length} segments
                    </span>
                  )}
                </div>
              </div>

              {/* View Switcher & Action Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
                  <button
                    onClick={() => setActiveView('interactive')}
                    id="btn-view-interactive"
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeView === 'interactive' 
                        ? 'bg-white text-zinc-900 shadow-sm' 
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>Timeline View</span>
                  </button>
                  <button
                    onClick={() => setActiveView('json')}
                    id="btn-view-json"
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeView === 'json' 
                        ? 'bg-white text-zinc-900 shadow-sm' 
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Raw JSON</span>
                  </button>
                </div>

                {/* Copy JSON Button */}
                <button 
                  onClick={copyJsonToClipboard}
                  id="btn-copy-json"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors border border-zinc-200/80"
                  title="Copy strict JSON array"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'JSON Copied!' : 'Copy JSON'}</span>
                </button>

                {/* Download JSON Button */}
                <button 
                  onClick={downloadJson}
                  id="btn-download-json"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
                  title="Download .json file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>

                {/* Export SRT option */}
                {parsedItems && (
                  <button 
                    onClick={downloadDiarizedSrt}
                    id="btn-download-diarized-srt"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-900 text-white transition-colors shadow-sm"
                    title="Export as SubRip .srt with speaker tags"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Export .srt</span>
                  </button>
                )}
              </div>
            </div>

            {/* View 1: Raw Strict JSON View */}
            {activeView === 'json' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
                  <span>Strict JSON Array Structure (Matches prompt requirement)</span>
                  <button 
                    onClick={copyJsonToClipboard}
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {copied ? 'Copied to clipboard' : 'Click to copy all'}
                  </button>
                </div>
                <div className="srt-container max-h-[500px] overflow-auto bg-zinc-900 text-zinc-100 p-4 rounded-xl font-mono text-xs leading-relaxed border border-zinc-800">
                  <pre className="whitespace-pre-wrap">{rawJson}</pre>
                </div>
              </motion.div>
            )}

            {/* View 2: Interactive Timeline View */}
            {activeView === 'interactive' && parsedItems && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200/80">
                  {/* Speaker Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-500 mr-1">Speaker:</span>
                    <button
                      onClick={() => setSpeakerFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        speakerFilter === 'all'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-zinc-600 hover:bg-zinc-200 border border-zinc-200'
                      }`}
                    >
                      All ({parsedItems.length})
                    </button>
                    {uniqueSpeakers.map((spk) => {
                      const style = getSpeakerStyle(spk);
                      const isSelected = speakerFilter === spk;
                      const count = parsedItems.filter(i => i.speaker === spk).length;
                      return (
                        <button
                          key={spk}
                          onClick={() => setSpeakerFilter(isSelected ? 'all' : spk)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                            isSelected 
                              ? 'bg-indigo-600 text-white border-indigo-600' 
                              : `${style.badge} hover:brightness-95`
                          }`}
                        >
                          {spk} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Dialogue Search */}
                  <div className="relative min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search spoken text..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Dialogue Items List */}
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-sm bg-zinc-50 rounded-xl border border-zinc-200/60">
                      No dialogue segments match the selected speaker or search filter.
                    </div>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const style = getSpeakerStyle(item.speaker);
                      return (
                        <div 
                          key={idx}
                          className={`p-4 rounded-xl border transition-all hover:shadow-sm ${style.bubble}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center space-x-2">
                              {/* Speaker Badge */}
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${style.dot}`} />
                                {item.speaker}
                              </span>
                            </div>

                            {/* Clickable Synchronized Timestamp */}
                            <button
                              onClick={() => seekToTimestamp(item.start)}
                              className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs font-mono bg-white/80 hover:bg-white text-zinc-600 hover:text-indigo-600 border border-zinc-200/80 transition-colors shadow-2xs group"
                              title="Click to jump to this point in media"
                            >
                              <Play className="w-2.5 h-2.5 fill-current opacity-70 group-hover:opacity-100 group-hover:text-indigo-600" />
                              <span>{item.start} → {item.end}</span>
                            </button>
                          </div>

                          {/* Spoken Dialogue Text */}
                          <p className="text-sm text-zinc-900 leading-relaxed pl-1 font-normal select-text">
                            {item.text}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer helpers */}
                <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 pt-2 border-t border-zinc-100 px-1">
                  <span>💡 Tip: Click on any timestamp chip to jump playback to that spoken turn.</span>
                  <button 
                    onClick={copySrtToClipboard}
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {copiedSrt ? 'Copied SRT with speaker tags!' : 'Copy as Diarized .srt'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
