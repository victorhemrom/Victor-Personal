import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const muxSubtitles = async (
  videoFile: File, 
  srtContent: string,
  onProgress?: (progress: number) => void
): Promise<{url: string, ext: string}> => {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) onProgress(progress);
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }

  const extIndex = videoFile.name.lastIndexOf('.');
  const inputExt = extIndex !== -1 ? videoFile.name.substring(extIndex) : '.mp4';
  const videoName = 'input' + inputExt;

  await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
  await ffmpeg.writeFile('subs.srt', srtContent);

  let outputName = 'output.mp4';
  let outExt = '.mp4';
  let mimeType = 'video/mp4';

  // Try MP4 first
  let ret = await ffmpeg.exec([
    '-i', videoName, 
    '-i', 'subs.srt', 
    '-c:v', 'copy', 
    '-c:a', 'copy', 
    '-c:s', 'mov_text', 
    outputName
  ]);

  if (ret !== 0) {
    console.warn('MP4 muxing failed, falling back to MKV...');
    outputName = 'output.mkv';
    outExt = '.mkv';
    mimeType = 'video/x-matroska';
    ret = await ffmpeg.exec([
      '-i', videoName, 
      '-i', 'subs.srt', 
      '-c:v', 'copy', 
      '-c:a', 'copy', 
      '-c:s', 'srt', 
      outputName
    ]);
  }

  if (ret !== 0) {
    throw new Error(`FFmpeg process failed with exit code ${ret}`);
  }

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: mimeType });
  
  // Clean up
  await ffmpeg.deleteFile(videoName);
  await ffmpeg.deleteFile('subs.srt');
  await ffmpeg.deleteFile(outputName);
  
  return { url: URL.createObjectURL(blob), ext: outExt };
};
