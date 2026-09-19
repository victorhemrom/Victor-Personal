/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Languages, Users, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SrtGeneratorTab } from './components/SrtGeneratorTab';
import { SpeakerDiarizationTab } from './components/SpeakerDiarizationTab';
import { ActiveTab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('diarization'); // Open the newly requested tab or allow switching
  const [sharedFile, setSharedFile] = useState<File | null>(null);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full space-y-6"
      >
        {/* App Branding & Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100/80 rounded-2xl">
            {activeTab === 'diarization' ? (
              <Users className="w-7 h-7 text-indigo-600" />
            ) : (
              <Languages className="w-7 h-7 text-indigo-600" />
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            {activeTab === 'diarization' ? 'Generate Subtitles' : 'Translate/Transcribe'}
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 max-w-xl mx-auto">
            {activeTab === 'diarization' 
              ? 'Detect, separate, and label distinct speakers with synchronized subtitles and start/end timestamps.'
              : 'Upload a video or audio file to transcribe original speech or translate it into English SRT subtitles.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center">
          <div className="inline-flex p-1.5 bg-zinc-200/70 rounded-2xl border border-zinc-200 shadow-2xs">
            <button
              onClick={() => setActiveTab('diarization')}
              id="tab-speaker-diarization"
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'diarization'
                  ? 'bg-white text-zinc-900 shadow-sm font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Generate Subtitles</span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-indigo-100 text-indigo-700 rounded-md">
                New
              </span>
            </button>

            <button
              onClick={() => setActiveTab('srt')}
              id="tab-srt-generator"
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'srt'
                  ? 'bg-white text-zinc-900 shadow-sm font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Languages className="w-4 h-4 text-indigo-600" />
              <span>Translate/Transcribe</span>
            </button>
          </div>
        </div>

        {/* Main Tab Content Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-200/90">
          <AnimatePresence mode="wait">
            {activeTab === 'diarization' ? (
              <motion.div
                key="tab-diarization"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <SpeakerDiarizationTab 
                  sharedFile={sharedFile} 
                  onSharedFileChange={setSharedFile} 
                />
              </motion.div>
            ) : (
              <motion.div
                key="tab-srt"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <SrtGeneratorTab 
                  sharedFile={sharedFile} 
                  onSharedFileChange={setSharedFile} 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info */}
        <div className="text-center text-zinc-400 text-xs sm:text-sm space-y-1">
          <p className="flex items-center justify-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Powered by Gemini AI • Diarization & Synchronization Engine • Strict JSON Output</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
