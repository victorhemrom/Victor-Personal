import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const muxSubtitles = async (
  videoFile: File, 
  srtContent: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) onProgress(progress);
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }

  const videoName = 'input' + videoFile.name.substring(videoFile.name.lastIndexOf('.'));
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
  await ffmpeg.writeFile('subs.srt', srtContent);

  // Multiplexing subtitles into mp4 container (soft subtitles)
  await ffmpeg.exec(['-i', videoName, '-i', 'subs.srt', '-c', 'copy', '-c:s', 'mov_text', outputName]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: 'video/mp4' });
  
  // Clean up
  await ffmpeg.deleteFile(videoName);
  await ffmpeg.deleteFile('subs.srt');
  await ffmpeg.deleteFile(outputName);
  
  return URL.createObjectURL(blob);
};
