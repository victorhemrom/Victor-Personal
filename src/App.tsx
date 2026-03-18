/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileVideo, FileAudio, Languages, Download, Loader2, AlertCircle, CheckCircle2, Copy, Check, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSRT, ProcessMode } from './services/gemini';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [processingMode, setProcessingMode] = useState<ProcessMode | null>(null);
  const [srtContent, setSrtContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) { // 20MB limit for demo
        setError("File size too large. Please use a file under 20MB.");
        return;
      }
      setFile(selectedFile);
      setMediaPreview(URL.createObjectURL(selectedFile));
      setSrtContent(null);
      setError(null);
      setCopied(false);
    }
  };

  const copyToClipboard = () => {
    if (!srtContent) return;
    navigator.clipboard.writeText(srtContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const processMedia = async (mode: ProcessMode) => {
    if (!file) return;

    setProcessingMode(mode);
    setError(null);
    setSrtContent(null);

    try {
      const base64 = await fileToBase64(file);
      const result = await generateSRT(base64, file.type, mode);
      if (result) {
        setSrtContent(result);
      } else {
        throw new Error("Failed to generate SRT content.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the file.");
    } finally {
      setProcessingMode(null);
    }
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

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full space-y-8"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
            <Languages className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            Media Translator
          </h1>
          <p className="mt-4 text-lg text-zinc-600">
            Upload a video or audio file to transcribe original speech or translate it to English SRT.
          </p>
        </div>

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
              <p className="text-zinc-600 font-medium">Click to upload or drag and drop</p>
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
                  }}
                  className="text-sm text-zinc-500 hover:text-red-500 font-medium"
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
                    />
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => processMedia('translate')}
                  disabled={processingMode !== null}
                  className={`
                    flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all
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
                    flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all
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

            {srtContent && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold">SRT Generated Successfully</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center space-x-2 text-zinc-600 hover:text-zinc-900 font-medium text-sm transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button 
                      onClick={downloadSRT}
                      className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .srt</span>
                    </button>
                  </div>
                </div>
                <div className="srt-container max-h-[400px]">
                  <pre className="whitespace-pre-wrap">{srtContent}</pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center text-zinc-400 text-sm">
          <p>Powered by Gemini 3 Flash • Accurate Timestamps • Multi-language Support</p>
        </div>
      </motion.div>
    </div>
  );
}
