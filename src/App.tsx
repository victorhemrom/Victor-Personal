/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileVideo, FileAudio, Languages, Download, Loader2, AlertCircle, CheckCircle2, Copy, Check, FileText, Film, FileArchive, Mic, Users, FileJson, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSRT, ProcessMode, DiarizedSegment } from './services/gemini';
import { encodeVideoWithSubtitles } from './services/mediaEncoder';
import { LiveTranscribe } from './components/LiveTranscribe';
import JSZip from 'jszip';

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'live'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [processingMode, setProcessingMode] = useState<ProcessMode | null>(null);
  const [srtContent, setSrtContent] = useState<string | null>(null);
  const [diarization, setDiarization] = useState<DiarizedSegment[]>([]);
  const [resultTab, setResultTab] = useState<'diarization' | 'srt' | 'json'>('diarization');
  const [error, setError] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMuxing, setIsMuxing] = useState(false);
  const [muxProgress, setMuxProgress] = useState(0);
  const [muxStatus, setMuxStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUploadedFile = (selectedFile: File) => {
    if (selectedFile.size > 20 * 1024 * 1024) { // 20MB limit
      setError("File size too large. Please use a file under 20MB.");
      return;
    }
    setFile(selectedFile);
    setMediaPreview(URL.createObjectURL(selectedFile));
    setSrtContent(null);
    setDiarization([]);
    if (vttUrl) {
      URL.revokeObjectURL(vttUrl);
      setVttUrl(null);
    }
    setError(null);
    setCopied(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processUploadedFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processUploadedFile(droppedFile);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const srtToVtt = (srt: string) => {
    let vtt = 'WEBVTT\n\n';
    vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
  };

  const processMedia = async (mode: ProcessMode) => {
    if (!file) return;

    setProcessingMode(mode);
    setError(null);
    setSrtContent(null);
    setDiarization([]);
    if (vttUrl) {
      URL.revokeObjectURL(vttUrl);
      setVttUrl(null);
    }

    try {
      const base64 = await fileToBase64(file);
      const result = await generateSRT(base64, file.type, mode);
      if (result && (result.srt || result.diarization?.length)) {
        setSrtContent(result.srt);
        setDiarization(result.diarization || []);
        const vttContent = srtToVtt(result.srt);
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        setVttUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("Failed to generate speaker diarization and subtitles.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the file.");
    } finally {
      setProcessingMode(null);
    }
  };

  const getDiarizationJsonString = () => {
    return JSON.stringify(diarization, null, 2);
  };

  const downloadSRT = () => {
    if (!srtContent) return;
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.split('.')[0] || 'subtitles'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!diarization || diarization.length === 0) return;
    const jsonStr = getDiarizationJsonString();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.split('.')[0] || 'subtitles'}_diarization.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    let textToCopy = '';
    if (resultTab === 'json') {
      textToCopy = getDiarizationJsonString();
    } else if (resultTab === 'srt') {
      textToCopy = srtContent || '';
    } else {
      textToCopy = diarization
        .map((seg) => `[${seg.start} --> ${seg.end}] ${seg.speaker ? `[${seg.speaker}]: ` : ''}${seg.text}`)
        .join('\n\n');
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSpeakerStyle = (speakerName: string) => {
    const s = (speakerName || '').toLowerCase();
    if (s.includes('1') || s.endsWith('a')) {
      return {
        badge: 'bg-indigo-600 text-white',
        border: 'border-indigo-200 bg-indigo-50/40',
        text: 'text-indigo-950',
        avatarBg: 'bg-indigo-100 text-indigo-700',
      };
    }
    if (s.includes('2') || s.endsWith('b')) {
      return {
        badge: 'bg-emerald-600 text-white',
        border: 'border-emerald-200 bg-emerald-50/40',
        text: 'text-emerald-950',
        avatarBg: 'bg-emerald-100 text-emerald-700',
      };
    }
    if (s.includes('3') || s.endsWith('c')) {
      return {
        badge: 'bg-amber-600 text-white',
        border: 'border-amber-200 bg-amber-50/40',
        text: 'text-amber-950',
        avatarBg: 'bg-amber-100 text-amber-700',
      };
    }
    if (s.includes('4') || s.endsWith('d')) {
      return {
        badge: 'bg-rose-600 text-white',
        border: 'border-rose-200 bg-rose-50/40',
        text: 'text-rose-950',
        avatarBg: 'bg-rose-100 text-rose-700',
      };
    }
    if (s.includes('5') || s.endsWith('e')) {
      return {
        badge: 'bg-purple-600 text-white',
        border: 'border-purple-200 bg-purple-50/40',
        text: 'text-purple-950',
        avatarBg: 'bg-purple-100 text-purple-700',
      };
    }
    return {
      badge: 'bg-cyan-600 text-white',
      border: 'border-cyan-200 bg-cyan-50/40',
      text: 'text-cyan-950',
      avatarBg: 'bg-cyan-100 text-cyan-700',
    };
  };

  const downloadVideoWithSubs = async () => {
    if (!file || !srtContent || !file.type.startsWith('video/')) return;
    
    setIsMuxing(true);
    setMuxProgress(0);
    setMuxStatus('Starting...');
    try {
      const { url, ext } = await encodeVideoWithSubtitles(
        file, 
        srtContent, 
        (progress) => {
          setMuxProgress(Math.round(progress * 100));
        },
        (status) => {
          setMuxStatus(status);
        }
      );
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.split('.')[0]}_subtitled${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to mux subtitles:', err);
      setError(`Failed to embed subtitles: ${err.message || 'Unknown error'}. Please check the console for details.`);
    } finally {
      setIsMuxing(false);
      setMuxProgress(0);
      setMuxStatus(null);
    }
  };

  const downloadZip = async () => {
    if (!file || !srtContent) return;
    
    try {
      const zip = new JSZip();
      
      // Add the original media file
      zip.file(file.name, file);
      
      // Add the SRT file
      const baseName = file.name.split('.')[0];
      zip.file(`${baseName}.srt`, srtContent);
      
      // Add the Diarization JSON file
      if (diarization && diarization.length > 0) {
        zip.file(`${baseName}_diarization.json`, getDiarizationJsonString());
      }

      // Generate the zip
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_with_subtitles.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create ZIP:', err);
      setError('Failed to create ZIP file.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full space-y-8"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
            <Languages className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            TranSubs
          </h1>
          <p className="mt-4 text-lg text-zinc-600">
            Upload media or transcribe live audio from any language with automatic language detection.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-center">
          <div className="bg-zinc-200/80 p-1.5 rounded-2xl flex items-center space-x-1.5 shadow-inner">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Upload className="w-4 h-4 text-indigo-600" />
              <span>Upload Media</span>
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer relative ${
                activeTab === 'live'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Mic className="w-4 h-4 text-indigo-600" />
              <span>Live Audio Transcribe</span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Live
              </span>
            </button>
          </div>
        </div>

        {activeTab === 'live' ? (
          <LiveTranscribe />
        ) : (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200">
            <div className="mb-8 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-sm text-indigo-900">
                <p className="font-semibold">How to use with Google Drive links:</p>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>Download the media from your Google Drive link.</li>
                  <li>Upload the file below (max 20MB).</li>
                  <li>Choose to Transcribe (original language) or Translate to English.</li>
                </ol>
              </div>
            </div>

            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all group ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                    : 'border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50/30'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*,audio/*"
                  className="hidden"
                />
                <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${isDragging ? 'text-indigo-600' : 'text-zinc-400 group-hover:text-indigo-500'}`} />
                <p className="text-zinc-700 font-medium">
                  {isDragging ? 'Drop your media file here' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-zinc-400 text-sm mt-1">MP4, MOV, AVI, MP3, WAV (max 20MB)</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      {file.type.startsWith('audio/') ? (
                        <FileAudio className="w-6 h-6 text-indigo-600" />
                      ) : (
                        <FileVideo className="w-6 h-6 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 truncate max-w-[200px] sm:max-w-md">
                        {file.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setFile(null);
                      setMediaPreview(null);
                      setSrtContent(null);
                      if (vttUrl) {
                        URL.revokeObjectURL(vttUrl);
                        setVttUrl(null);
                      }
                    }}
                    className="text-sm text-zinc-500 hover:text-red-500 font-medium cursor-pointer"
                  >
                    Remove
                  </button>
                </div>

                {mediaPreview && (
                  <div className={`rounded-xl overflow-hidden bg-black border border-zinc-200 shadow-inner flex items-center justify-center ${file.type.startsWith('audio/') ? 'p-8' : 'aspect-video'}`}>
                    {file.type.startsWith('audio/') ? (
                      <audio 
                        src={mediaPreview} 
                        controls 
                        className="w-full"
                      />
                    ) : (
                      <video 
                        src={mediaPreview} 
                        controls 
                        className="w-full h-full object-contain"
                      >
                        {vttUrl && (
                          <track 
                            src={vttUrl} 
                            kind="subtitles" 
                            srcLang="en" 
                            label="Subtitles" 
                            default 
                          />
                        )}
                      </video>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button
                    onClick={() => processMedia('translate')}
                    disabled={processingMode !== null}
                    className={`
                      flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all cursor-pointer
                      ${processingMode === 'translate' 
                        ? 'bg-indigo-400 text-white cursor-not-allowed shadow-lg shadow-indigo-200' 
                        : processingMode !== null
                          ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'}
                    `}
                  >
                    {processingMode === 'translate' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Translating...</span>
                      </>
                    ) : (
                      <>
                        <Languages className="w-5 h-5" />
                        <span>Translate to English</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => processMedia('transcribe')}
                    disabled={processingMode !== null}
                    className={`
                      flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all cursor-pointer
                      ${processingMode === 'transcribe' 
                        ? 'bg-zinc-400 text-white cursor-not-allowed shadow-lg shadow-zinc-200' 
                        : processingMode !== null
                          ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                          : 'bg-zinc-800 text-white hover:bg-zinc-900 shadow-lg shadow-zinc-200 active:scale-95'}
                    `}
                  >
                    {processingMode === 'transcribe' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Transcribing...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        <span>Transcribe Original</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-3"
                >
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </motion.div>
              )}

              {(srtContent || diarization.length > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 space-y-5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-zinc-100">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center space-x-2 text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-semibold text-zinc-900">Transcription & Diarization Complete</span>
                      </div>
                      {diarization.length > 0 && (
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {Array.from(new Set(diarization.map(d => d.speaker).filter(Boolean))).length || 1} Distinct Speakers
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700">
                            {diarization.length} Dialogue Turns
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={copyToClipboard}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium text-xs transition-colors cursor-pointer"
                        title="Copy current tab view to clipboard"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                      </button>

                      {diarization.length > 0 && (
                        <button 
                          onClick={downloadJSON}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium text-xs transition-colors cursor-pointer"
                          title="Download strict JSON array with speaker diarization"
                        >
                          <FileJson className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Diarization JSON</span>
                        </button>
                      )}

                      <button 
                        onClick={downloadSRT}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 font-medium text-xs transition-colors cursor-pointer"
                        title="Download standard SubRip .SRT subtitle file"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Download .srt</span>
                      </button>

                      {file?.type.startsWith('video/') && (
                        <button 
                          onClick={downloadVideoWithSubs}
                          disabled={isMuxing}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-white hover:bg-zinc-900 font-medium text-xs transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isMuxing ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>{muxStatus || 'Encoding...'}</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3.5 h-3.5" />
                              <span>Burn Video Subs</span>
                            </>
                          )}
                        </button>
                      )}

                      {file?.type.startsWith('video/') && (
                        <button 
                          onClick={downloadZip}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium text-xs transition-colors cursor-pointer"
                        >
                          <FileArchive className="w-3.5 h-3.5" />
                          <span>ZIP</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Format Navigation Tabs */}
                  <div className="flex items-center space-x-2 border-b border-zinc-200">
                    {diarization.length > 0 && (
                      <button
                        onClick={() => setResultTab('diarization')}
                        className={`flex items-center space-x-2 px-4 py-2.5 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
                          resultTab === 'diarization'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800'
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>Speaker Timeline</span>
                      </button>
                    )}

                    <button
                      onClick={() => setResultTab('srt')}
                      className={`flex items-center space-x-2 px-4 py-2.5 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
                        resultTab === 'srt'
                          ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                          : 'border-transparent text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>SubRip (.SRT)</span>
                    </button>

                    {diarization.length > 0 && (
                      <button
                        onClick={() => setResultTab('json')}
                        className={`flex items-center space-x-2 px-4 py-2.5 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
                          resultTab === 'json'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800'
                        }`}
                      >
                        <FileJson className="w-4 h-4" />
                        <span>JSON Array (Strict Structure)</span>
                      </button>
                    )}
                  </div>

                  {/* Tab 1: Speaker Diarization Timeline */}
                  {resultTab === 'diarization' && diarization.length > 0 && (
                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      {diarization.map((seg, idx) => {
                        const style = getSpeakerStyle(seg.speaker);
                        return (
                          <div 
                            key={idx}
                            className={`p-4 rounded-2xl border transition-all hover:shadow-xs ${style.border}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex items-center space-x-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${style.avatarBg}`}>
                                  {seg.speaker ? seg.speaker.replace(/speaker\s*/i, 'S').slice(0, 3) : 'S'}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
                                  {seg.speaker || 'Speaker'}
                                </span>
                              </div>
                              <span className="font-mono text-xs text-zinc-500 bg-white/80 px-2 py-0.5 rounded-md border border-zinc-200">
                                {seg.start} ➔ {seg.end}
                              </span>
                            </div>
                            <p className={`text-sm leading-relaxed pl-8 ${style.text}`}>
                              {seg.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 2: SRT Subtitle Text */}
                  {resultTab === 'srt' && (
                    <div className="srt-container max-h-[460px]">
                      <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-800">{srtContent}</pre>
                    </div>
                  )}

                  {/* Tab 3: Strict JSON Array */}
                  {resultTab === 'json' && diarization.length > 0 && (
                    <div className="relative">
                      <div className="srt-container max-h-[460px] bg-zinc-950 text-zinc-200 p-4 rounded-2xl border border-zinc-800 font-mono text-xs overflow-auto">
                        <pre>{getDiarizationJsonString()}</pre>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="text-center text-zinc-400 text-sm">
          <p>Powered by Gemini AI • Multilingual Speech Recognition • Accurate Timestamps</p>
        </div>
      </motion.div>
    </div>
  );
}
