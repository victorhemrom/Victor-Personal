export const encodeVideoWithSubtitles = async (
  videoFile: File,
  srtContent: string,
  onProgress: (progress: number) => void,
  onStatus: (status: string) => void
): Promise<{url: string, ext: string}> => {
  return new Promise((resolve, reject) => {
    onStatus('Preparing video...');
    
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    
    const subtitles = parseSRT(srtContent);
    
    video.onloadedmetadata = () => {
      onStatus('Setting up encoder...');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      
      let audioTrack: MediaStreamTrack | null = null;
      let audioCtx: AudioContext | null = null;
      
      try {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);
        // Do not connect to audioCtx.destination to keep it silent for the user
        const audioTracks = destination.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTrack = audioTracks[0];
        }
      } catch (e) {
        console.warn('Could not capture audio via AudioContext', e);
        // Fallback to captureStream
        const videoStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
        if (videoStream) {
          const tracks = videoStream.getAudioTracks();
          if (tracks.length > 0) audioTrack = tracks[0];
        }
      }
      
      const canvasStream = canvas.captureStream(30);
      const tracks = [...canvasStream.getVideoTracks()];
      if (audioTrack) {
        tracks.push(audioTrack);
      }
      
      const combinedStream = new MediaStream(tracks);
      
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }
      
      if (!selectedMimeType) {
        reject(new Error('No supported video encoding format found in this browser.'));
        return;
      }
      
      const recorder = new MediaRecorder(combinedStream, { 
        mimeType: selectedMimeType,
        videoBitsPerSecond: 5000000 // 5 Mbps for decent quality
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        onStatus('Finalizing video...');
        if (audioCtx) {
          audioCtx.close().catch(console.error);
        }
        const blob = new Blob(chunks, { type: selectedMimeType });
        const ext = selectedMimeType.includes('mp4') ? '.mp4' : '.webm';
        resolve({ url: URL.createObjectURL(blob), ext });
      };
      
      let animationFrameId: number;
      
      const drawFrame = () => {
        if (video.paused || video.ended) return;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const currentTime = video.currentTime;
        const currentSub = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);
        
        if (currentSub) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          const fontSize = Math.max(24, Math.floor(canvas.height * 0.05));
          ctx.font = `bold ${fontSize}px Arial`;
          
          const x = canvas.width / 2;
          const y = canvas.height - (canvas.height * 0.08);
          
          const lines = currentSub.text.split('\n');
          const wrappedLines: string[] = [];
          const maxWidth = canvas.width * 0.9; // Max 90% of video width

          for (const line of lines) {
            const words = line.split(' ');
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
              const testLine = currentLine + words[i] + ' ';
              const metrics = ctx.measureText(testLine);
              const testWidth = metrics.width;

              if (testWidth > maxWidth && i > 0) {
                wrappedLines.push(currentLine.trim());
                currentLine = words[i] + ' ';
              } else {
                currentLine = testLine;
              }
            }
            wrappedLines.push(currentLine.trim());
          }

          for (let i = 0; i < wrappedLines.length; i++) {
            const lineY = y - ((wrappedLines.length - 1 - i) * (fontSize * 1.2));
            
            ctx.strokeStyle = 'black';
            ctx.lineWidth = fontSize * 0.15;
            ctx.strokeText(wrappedLines[i], x, lineY);
            
            ctx.fillStyle = 'white';
            ctx.fillText(wrappedLines[i], x, lineY);
          }
        }
        
        onProgress(video.currentTime / video.duration);
        animationFrameId = requestAnimationFrame(drawFrame);
      };
      
      video.onplay = () => {
        onStatus('Encoding video (real-time)...');
        recorder.start(1000); // collect data every second
        drawFrame();
      };
      
      video.onended = () => {
        cancelAnimationFrame(animationFrameId);
        recorder.stop();
      };
      
      video.play().catch(err => {
        reject(new Error('Failed to play video for encoding. ' + err.message));
      });
    };
    
    video.onerror = () => {
      reject(new Error('Error loading video for encoding.'));
    };
  });
};

function parseSRT(srt: string) {
  const blocks = srt.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n');
    if (lines.length < 3) return null;
    const timeLine = lines[1];
    const text = lines.slice(2).join('\n');
    
    const [startStr, endStr] = timeLine.split(' --> ');
    if (!startStr || !endStr) return null;
    
    return {
      start: timeToSeconds(startStr),
      end: timeToSeconds(endStr),
      text
    };
  }).filter(Boolean) as {start: number, end: number, text: string}[];
}

function timeToSeconds(timeStr: string) {
  const [hours, minutes, seconds] = timeStr.split(':');
  const [sec, ms] = seconds.split(',');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(sec) + (parseInt(ms) || 0) / 1000;
}
