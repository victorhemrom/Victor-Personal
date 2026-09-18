import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Globe, 
  Copy, 
  Check, 
  Download, 
  RotateCcw, 
  FileText, 
  AlertCircle, 
  Radio, 
  Volume2, 
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { transcribeLiveAudio, DetectedLanguage, LiveTranscriptionResult } from '../services/gemini';

export interface TranscriptItem {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  timestampStr: string;
  detectedLanguage: DetectedLanguage | null;
  transcript: string;
  translation: string;
}

export function LiveTranscribe() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translateToEnglish, setTranslateToEnglish] = useState(true);
  const [chunkIntervalSec, setChunkIntervalSec] = useState<number>(4);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Transcription state
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<DetectedLanguage | null>(null);
  const [sessionLanguages, setSessionLanguages] = useState<DetectedLanguage[]>([]);
  const [copied, setCopied] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);

  // Audio refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkStartTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const currentMimeTypeRef = useRef<string>('audio/webm');

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Convert seconds to SRT timestamp format (00:00:00,000)
  const formatSrtTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
  };

  // Audio visualizer drawing loop
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!isRecordingRef.current) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setAudioVolume(Math.min(100, Math.round((avg / 128) * 100)));

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 1.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * height * 0.9 + 4;

              // Indigo to violet visualizer bars
              ctx.fillStyle = isPausedRef.current 
                ? 'rgba(161, 161, 170, 0.6)' 
                : `rgba(99, 102, 241, ${0.4 + (dataArray[i] / 255) * 0.6})`;
              
              const y = (height - barHeight) / 2;
              ctx.beginPath();
              ctx.roundRect(x, y, barWidth - 2, barHeight, 4);
              ctx.fill();

              x += barWidth;
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (e) {
      console.error('Failed to setup audio visualizer:', e);
    }
  };

  const stopVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioVolume(0);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Convert Blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Process recorded chunk
  const processChunk = async (blob: Blob, startSec: number, endSec: number) => {
    if (blob.size < 500) return; // Ignore empty/tiny noise chunks

    setIsProcessing(true);
    try {
      const base64 = await blobToBase64(blob);
      const result: LiveTranscriptionResult = await transcribeLiveAudio(
        base64,
        currentMimeTypeRef.current,
        translateToEnglish
      );

      if (result.hasSpeech && result.transcript.trim()) {
        const newItem: TranscriptItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          startTime: startSec,
          endTime: endSec,
          timestampStr: `${formatTime(startSec)} - ${formatTime(endSec)}`,
          detectedLanguage: result.detectedLanguage,
          transcript: result.transcript.trim(),
          translation: result.translation.trim(),
        };

        setTranscriptItems((prev) => [...prev, newItem]);

        if (result.detectedLanguage) {
          setCurrentLanguage(result.detectedLanguage);
          setSessionLanguages((prev) => {
            if (!prev.some((lang) => lang.code.toLowerCase() === result.detectedLanguage!.code.toLowerCase())) {
              return [...prev, result.detectedLanguage!];
            }
            return prev;
          });
        }
      }
    } catch (err: any) {
      console.warn('Transcription chunk error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Start continuous recording session
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;

      // Select mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : MediaRecorder.isTypeSupported('audio/mp4') 
            ? 'audio/mp4' 
            : '';
      }
      currentMimeTypeRef.current = mimeType || 'audio/webm';

      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      isRecordingRef.current = true;
      isPausedRef.current = false;
      setIsRecording(true);
      setIsPaused(false);
      chunkStartTimeRef.current = elapsedSeconds;

      let recordedChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (recordedChunks.length > 0) {
          const blob = new Blob(recordedChunks, { type: currentMimeTypeRef.current });
          const start = chunkStartTimeRef.current;
          const end = elapsedSeconds;
          processChunk(blob, start, end);
          recordedChunks = [];
        }

        // If user didn't stop completely, immediately start next chunk
        if (isRecordingRef.current && !isPausedRef.current) {
          chunkStartTimeRef.current = elapsedSeconds;
          try {
            recorder.start();
          } catch (e) {
            console.error('Error restarting recorder chunk:', e);
          }
        }
      };

      // Start initial chunk
      recorder.start();

      // Setup chunk interval slicing
      const chunkIntervalMs = chunkIntervalSec * 1000;
      const chunkTimer = setInterval(() => {
        if (isRecordingRef.current && !isPausedRef.current && recorder.state === 'recording') {
          recorder.stop();
        }
      }, chunkIntervalMs);

      // Session elapsed seconds timer
      timerIntervalRef.current = setInterval(() => {
        if (isRecordingRef.current && !isPausedRef.current) {
          setElapsedSeconds((prev) => prev + 1);
        }
      }, 1000);

      // Save chunk timer cleanup
      (recorder as any)._chunkTimer = chunkTimer;

      startVisualizer(stream);
    } catch (err: any) {
      console.error('Microphone access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access was denied. Please allow microphone permissions in your browser to transcribe live audio.');
      } else {
        setError(`Unable to start microphone recording: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      if ((mediaRecorderRef.current as any)._chunkTimer) {
        clearInterval((mediaRecorderRef.current as any)._chunkTimer);
      }
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    stopVisualizer();
  };

  const togglePause = () => {
    if (!isRecording) return;
    if (isPaused) {
      // Resume
      isPausedRef.current = false;
      setIsPaused(false);
      chunkStartTimeRef.current = elapsedSeconds;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
        mediaRecorderRef.current.start();
      }
    } else {
      // Pause
      isPausedRef.current = true;
      setIsPaused(true);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
  };

  const clearSession = () => {
    setTranscriptItems([]);
    setCurrentLanguage(null);
    setSessionLanguages([]);
    setElapsedSeconds(0);
    setError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  // Copy transcript to clipboard
  const copyTranscript = (includeTranslation: boolean = true) => {
    if (transcriptItems.length === 0) return;
    const text = transcriptItems.map((item) => {
      const langHeader = item.detectedLanguage ? `[${item.detectedLanguage.name}] ` : '';
      if (includeTranslation && item.translation && item.translation !== item.transcript) {
        return `[${item.timestampStr}] ${langHeader}${item.transcript}\n  -> (EN): ${item.translation}`;
      }
      return `[${item.timestampStr}] ${langHeader}${item.transcript}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download transcript as .SRT file
  const downloadSrt = () => {
    if (transcriptItems.length === 0) return;
    let srt = '';
    transcriptItems.forEach((item, index) => {
      const idx = index + 1;
      const start = formatSrtTime(item.startTime);
      const end = formatSrtTime(Math.max(item.endTime, item.startTime + 1));
      const text = translateToEnglish && item.translation 
        ? `${item.transcript}\n${item.translation}` 
        : item.transcript;
      srt += `${idx}\n${start} --> ${end}\n${text}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live_transcription_${new Date().toISOString().slice(0, 10)}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download transcript as .TXT file
  const downloadTxt = () => {
    if (transcriptItems.length === 0) return;
    let content = `LIVE AUDIO TRANSCRIPTION REPORT\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Total Duration: ${formatTime(elapsedSeconds)}\n`;
    if (sessionLanguages.length > 0) {
      content += `Detected Languages: ${sessionLanguages.map(l => `${l.flagEmoji || '🌐'} ${l.name} (${l.nativeName})`).join(', ')}\n`;
    }
    content += `==========================================\n\n`;

    transcriptItems.forEach((item) => {
      const lang = item.detectedLanguage ? `[${item.detectedLanguage.flagEmoji || ''} ${item.detectedLanguage.name}] ` : '';
      content += `[${item.timestampStr}] ${lang}${item.transcript}\n`;
      if (item.translation && item.translation !== item.transcript) {
        content += `    English: ${item.translation}\n`;
      }
      content += `\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live_transcription_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Live Recording Control Center */}
      <div className="bg-zinc-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-zinc-800 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Status & Timer */}
          <div className="flex items-center space-x-4">
            <div className={`p-4 rounded-2xl flex items-center justify-center transition-all ${
              isRecording 
                ? isPaused 
                  ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40' 
                  : 'bg-red-500/20 text-red-400 ring-4 ring-red-500/30 animate-pulse' 
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {isRecording ? (
                isPaused ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 text-red-500" />
              ) : (
                <Radio className="w-8 h-8 text-indigo-400" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                  isRecording 
                    ? isPaused 
                      ? 'bg-amber-400' 
                      : 'bg-red-500 animate-ping' 
                    : 'bg-zinc-500'
                }`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {isRecording 
                    ? isPaused 
                      ? 'Paused' 
                      : 'Live Listening' 
                    : 'Microphone Standby'}
                </span>
                {isProcessing && (
                  <span className="inline-flex items-center text-xs text-indigo-400 ml-2 animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Detecting...
                  </span>
                )}
              </div>
              <div className="text-3xl font-mono font-bold tracking-tight text-white mt-1">
                {formatTime(elapsedSeconds)}
              </div>
            </div>
          </div>

          {/* Real-time Waveform Canvas */}
          <div className="flex-1 w-full max-w-xs h-16 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 p-2 flex flex-col justify-center items-center relative overflow-hidden">
            <canvas 
              ref={canvasRef} 
              width={260} 
              height={50} 
              className="w-full h-full object-contain"
            />
            {!isRecording && (
              <span className="absolute text-xs text-zinc-500 select-none">
                Audio wave appears when listening
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2.5 px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <Mic className="w-5 h-5" />
                <span>Start Listening</span>
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  className={`px-4 py-3.5 rounded-2xl font-semibold border transition-all text-sm cursor-pointer ${
                    isPaused 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                      : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                  }`}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-6 py-3.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-semibold rounded-2xl shadow-lg shadow-red-600/30 transition-all cursor-pointer text-sm"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Stop</span>
                </button>
              </>
            )}

            {transcriptItems.length > 0 && (
              <button
                onClick={clearSession}
                title="Reset session"
                className="p-3.5 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-2xl transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Options Row */}
        <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center space-x-6">
            <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={translateToEnglish}
                onChange={(e) => setTranslateToEnglish(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-800 border-zinc-700 cursor-pointer"
              />
              <span className="text-zinc-300 font-medium">Auto-Translate to English</span>
            </label>

            <div className="flex items-center space-x-2">
              <span>Segment interval:</span>
              <select
                value={chunkIntervalSec}
                onChange={(e) => setChunkIntervalSec(Number(e.target.value))}
                disabled={isRecording}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value={3}>3 seconds (faster)</option>
                <option value={4}>4 seconds (balanced)</option>
                <option value={6}>6 seconds (longer phrases)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Understands & detects 100+ languages automatically</span>
          </div>
        </div>
      </div>

      {/* Error alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Microphone Notice</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Language Detection Spotlight Banner */}
      {currentLanguage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 border border-indigo-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center text-2xl">
              {currentLanguage.flagEmoji || '🌐'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Detected Language
                </span>
                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded uppercase">
                  {currentLanguage.code}
                </span>
              </div>
              <p className="text-lg font-bold text-zinc-900">
                {currentLanguage.name}{' '}
                <span className="text-sm font-medium text-zinc-500">
                  • {currentLanguage.nativeName}
                </span>
              </p>
            </div>
          </div>

          {/* Session languages list if multi-lingual */}
          {sessionLanguages.length > 1 && (
            <div className="flex items-center space-x-2 bg-white/80 backdrop-blur px-3 py-2 rounded-xl border border-zinc-200/60">
              <span className="text-xs text-zinc-500 font-medium">Spoken in session:</span>
              <div className="flex items-center gap-1.5">
                {sessionLanguages.map((lang) => (
                  <span
                    key={lang.code}
                    title={`${lang.name} (${lang.nativeName})`}
                    className="inline-flex items-center px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-800"
                  >
                    <span className="mr-1">{lang.flagEmoji || '🌐'}</span> {lang.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Live Transcript Stream Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
        {/* Transcript Toolbar Header */}
        <div className="p-4 sm:px-6 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-zinc-900 text-base sm:text-lg">
              Live Transcript Stream
            </h2>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
              {transcriptItems.length} {transcriptItems.length === 1 ? 'phrase' : 'phrases'}
            </span>
          </div>

          {transcriptItems.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => copyTranscript(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 shadow-sm transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy All'}</span>
              </button>

              <button
                onClick={downloadSrt}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-semibold text-indigo-600 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .SRT</span>
              </button>

              <button
                onClick={downloadTxt}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .TXT</span>
              </button>
            </div>
          )}
        </div>

        {/* Transcript Content List */}
        <div className="p-6 min-h-[300px] max-h-[550px] overflow-y-auto space-y-4">
          {transcriptItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 mb-3">
                <Globe className="w-8 h-8" />
              </div>
              <p className="text-zinc-700 font-semibold text-base">
                Ready to transcribe from any language
              </p>
              <p className="text-zinc-400 text-sm max-w-md mt-1">
                Click <span className="font-semibold text-indigo-600">Start Listening</span> above and speak in English, Spanish, Japanese, French, Hindi, German, Arabic, or any language of your choice.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcriptItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-zinc-50/80 hover:bg-zinc-50 border border-zinc-200/80 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-zinc-500 font-medium">
                        [{item.timestampStr}]
                      </span>
                      {item.detectedLanguage && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-zinc-200 font-semibold text-zinc-700 text-[11px]">
                          <span className="mr-1">{item.detectedLanguage.flagEmoji || '🌐'}</span>
                          {item.detectedLanguage.name} ({item.detectedLanguage.code})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">#{index + 1}</span>
                  </div>

                  {/* Original Transcript */}
                  <p className="text-zinc-900 font-medium text-base leading-relaxed">
                    {item.transcript}
                  </p>

                  {/* English Translation (if applicable) */}
                  {translateToEnglish && item.translation && item.translation.toLowerCase() !== item.transcript.toLowerCase() && (
                    <div className="mt-2 pt-2 border-t border-zinc-200/60 flex items-start space-x-2 text-indigo-900">
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider shrink-0 mt-0.5">
                        EN:
                      </span>
                      <p className="text-sm text-indigo-950 font-normal leading-relaxed">
                        {item.translation}
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}

              {isRecording && !isPaused && (
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-dashed border-indigo-200 flex items-center space-x-3 text-indigo-600 text-xs animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Listening for speech... next segment transcribing soon</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
