import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;

const SUPPORTED_CONVERSION_TYPES = [
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
];

const NATIVE_SUPPORTED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
];

export function needsConversion(file: File): boolean {
  // Check by MIME type
  if (NATIVE_SUPPORTED_TYPES.includes(file.type)) {
    return false;
  }
  
  // Check by extension for files with generic/missing MIME types
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['mp3', 'wav'].includes(extension)) {
    return false;
  }
  
  return true;
}

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  
  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    ffmpegInstance = ffmpeg;
    isLoading = false;
    return ffmpeg;
  })();

  return loadPromise;
}

export async function convertToMp3(
  file: File, 
  onProgress?: (message: string) => void
): Promise<File> {
  onProgress?.('Carregando conversor de áudio...');
  
  const ffmpeg = await loadFFmpeg();
  
  // Get file extension for input format detection
  const extension = file.name.split('.').pop()?.toLowerCase() || 'audio';
  const inputFileName = `input.${extension}`;
  const outputFileName = 'output.mp3';
  
  onProgress?.('Processando arquivo...');
  
  // Write input file to FFmpeg virtual filesystem
  await ffmpeg.writeFile(inputFileName, await fetchFile(file));
  
  onProgress?.('Convertendo para MP3...');
  
  // Convert to MP3 with high quality settings
  await ffmpeg.exec([
    '-i', inputFileName,
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    outputFileName
  ]);
  
  onProgress?.('Finalizando...');
  
  // Read the output file
  const data = await ffmpeg.readFile(outputFileName);
  
  // Clean up files from virtual filesystem
  await ffmpeg.deleteFile(inputFileName);
  await ffmpeg.deleteFile(outputFileName);
  
  // Handle the data - readFile returns Uint8Array or string
  // For binary files it returns Uint8Array
  let blobData: BlobPart;
  if (typeof data === 'string') {
    // If string, encode to Uint8Array
    const encoder = new TextEncoder();
    blobData = encoder.encode(data);
  } else {
    // data is Uint8Array - create a copy to ensure it's a plain ArrayBuffer
    blobData = new Uint8Array(data);
  }
  
  const mp3Blob = new Blob([blobData], { type: 'audio/mpeg' });
  const mp3FileName = file.name.replace(/\.[^/.]+$/, '.mp3');
  
  return new File([mp3Blob], mp3FileName, { type: 'audio/mpeg' });
}

export function getConversionInfo(): string {
  return 'Formatos aceitos: MP3, WAV, OPUS, OGG, M4A, WEBM, AAC, FLAC. Arquivos incompatíveis serão convertidos automaticamente para MP3.';
}
