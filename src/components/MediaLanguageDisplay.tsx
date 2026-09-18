import React from 'react';
import { 
  Globe, 
  Loader2, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  CheckCircle2, 
  Quote, 
  AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaLanguageDetectionResult } from '../services/gemini';

interface MediaLanguageDisplayProps {
  isDetecting: boolean;
  detection: MediaLanguageDetectionResult | null;
  error: string | null;
  onRetry: () => void;
  disabled?: boolean;
}

export function MediaLanguageDisplay({
  isDetecting,
  detection,
  error,
  onRetry,
  disabled = false,
}: MediaLanguageDisplayProps) {
  // 1. Loading state while analyzing
  if (isDetecting) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-indigo-50/80 border border-indigo-100/90 shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Audio Analysis
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-800 mt-0.5">
                Detecting spoken language in media...
              </p>
            </div>
          </div>
          <span className="text-xs text-indigo-500 font-medium hidden sm:inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Powered by Gemini AI
          </span>
        </div>
      </motion.div>
    );
  }

  // 2. Error state
  if (error && !detection) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-between gap-4 text-amber-900"
      >
        <div className="flex items-center space-x-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-950">Language detection notice</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Could not auto-detect language ({error}). You can still translate or transcribe below.
            </p>
          </div>
        </div>
        <button
          onClick={onRetry}
          disabled={disabled}
          className="px-3 py-1.5 bg-white hover:bg-amber-100/50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-900 shadow-sm transition-colors cursor-pointer shrink-0"
        >
          Try Again
        </button>
      </motion.div>
    );
  }

  // 3. No detection yet
  if (!detection) {
    return null;
  }

  // 4. Case: No speech detected in media
  if (!detection.hasSpeech || !detection.detectedLanguage) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/90 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0 shadow-sm">
              <VolumeX className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Speech Detection
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200/80 text-zinc-700">
                  Ambient / Music
                </span>
              </div>
              <p className="text-base font-bold text-zinc-800 mt-0.5">
                No distinct speech detected
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-lg leading-relaxed">
                {detection.summary || 'The media may contain background music, ambient sound effects, or quiet audio. You can still proceed to generate subtitles if dialogue occurs later.'}
              </p>
            </div>
          </div>

          <button
            onClick={onRetry}
            disabled={disabled}
            title="Re-analyze media"
            className="p-2 text-zinc-400 hover:text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // 5. Case: Spoken language detected successfully
  const { detectedLanguage, confidence, snippet, snippetTranslation, summary } = detection;
  const isEnglish = detectedLanguage.code.toLowerCase() === 'en';

  const confidenceBadge = {
    high: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'High Confidence' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Good Match' },
    low: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Low Confidence' },
  }[confidence] || { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Detected' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white p-5 sm:p-6 shadow-sm space-y-4"
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start space-x-4">
          {/* Flag / Globe Icon Badge */}
          <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-indigo-100/80 flex items-center justify-center text-3xl shrink-0">
            {detectedLanguage.flagEmoji || '🌐'}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Detected Spoken Language
              </span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[11px] font-mono font-bold rounded-md uppercase">
                {detectedLanguage.code}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${confidenceBadge.bg} ${confidenceBadge.text}`}>
                {confidenceBadge.label}
              </span>
            </div>

            {/* Language Name & Endonym */}
            <div className="flex items-baseline space-x-2 mt-1">
              <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">
                {detectedLanguage.name}
              </h3>
              {detectedLanguage.nativeName && detectedLanguage.nativeName !== detectedLanguage.name && (
                <span className="text-sm font-medium text-zinc-500">
                  ({detectedLanguage.nativeName})
                </span>
              )}
            </div>

            {summary && (
              <p className="text-xs text-zinc-600 mt-1 max-w-xl">
                {summary}
              </p>
            )}
          </div>
        </div>

        {/* Refresh / Re-analyze button */}
        <button
          onClick={onRetry}
          disabled={disabled}
          title="Re-analyze audio language"
          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-all cursor-pointer shrink-0 shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
          <span className="hidden sm:inline">Re-detect</span>
        </button>
      </div>

      {/* Snippet quote preview if speech text was captured */}
      {snippet && snippet.trim().length > 0 && (
        <div className="bg-white/90 rounded-xl p-3.5 border border-indigo-100/80 text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 text-zinc-400 font-medium">
            <Quote className="w-3.5 h-3.5 text-indigo-500 rotate-180" />
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              Spoken audio sample
            </span>
          </div>
          <p className="text-zinc-900 font-medium italic pl-2 border-l-2 border-indigo-400">
            "{snippet}"
          </p>
          {!isEnglish && snippetTranslation && snippetTranslation !== snippet && (
            <div className="pl-2 border-l-2 border-indigo-200 text-indigo-950 font-normal pt-0.5">
              <span className="text-indigo-600 font-bold mr-1.5">EN:</span>
              "{snippetTranslation}"
            </div>
          )}
        </div>
      )}

      {/* Action Recommendation Banner */}
      <div className="pt-2 border-t border-indigo-100/60 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-1.5 text-zinc-600">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            {isEnglish ? (
              <>
                Spoken in <strong className="text-zinc-900">English</strong>. Choose <strong className="text-zinc-900">Transcribe Original</strong> or <strong className="text-zinc-900">Translate to English</strong> below to generate your SRT.
              </>
            ) : (
              <>
                Spoken in <strong className="text-zinc-900">{detectedLanguage.name}</strong>. Choose <strong className="text-indigo-700">Translate to English</strong> for English subtitles, or <strong className="text-zinc-900">Transcribe Original</strong> for {detectedLanguage.name} subtitles.
              </>
            )}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
