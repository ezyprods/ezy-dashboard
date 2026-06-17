import lamejs from 'lamejs';

/**
 * Convierte un archivo WAV en un archivo MP3 utilizando lamejs en el navegador.
 * Para no congelar completamente la interfaz gráfica, procesa por chunks y cede el hilo de ejecución.
 *
 * @param file El archivo WAV original.
 * @param onProgress Callback opcional para reportar el progreso (0 a 100).
 * @returns El nuevo archivo MP3.
 */
export async function convertWavToMp3(file: File, onProgress?: (percent: number) => void): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Decodificar el audio a PCM flotante usando la API web nativa
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Obtener los datos PCM y normalizarlos
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
  
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels > 1 ? 2 : 1;
  const totalLength = leftChannel.length;
  
  // Convertir Float32 a Int16 (formato esperado por lamejs)
  const leftInt16 = new Int16Array(totalLength);
  const rightInt16 = new Int16Array(totalLength);
  
  for (let i = 0; i < totalLength; i++) {
    leftInt16[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32768));
    if (channels === 2) {
      rightInt16[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32768));
    }
  }
  
  // Inicializar lamejs. Configuraremos a 192 kbps para buen balance entre calidad y tamaño en Bounces.
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 192);
  const mp3Data: Int8Array[] = [];
  
  // Procesar en chunks de 115200 samples (~2.6 segundos de audio a 44.1kHz) para no saturar el hilo principal
  const sampleBlockSize = 115200; 
  let offset = 0;
  
  return new Promise((resolve) => {
    let lastPercent = -1;

    function processChunk() {
      if (offset < totalLength) {
        let blockSize = sampleBlockSize;
        if (offset + blockSize > totalLength) {
          blockSize = totalLength - offset;
        }
        
        const leftChunk = leftInt16.subarray(offset, offset + blockSize);
        const rightChunk = channels === 2 ? rightInt16.subarray(offset, offset + blockSize) : leftChunk;
        
        const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }
        
        offset += blockSize;
        
        if (onProgress) {
          const percent = Math.floor((offset / totalLength) * 100);
          if (percent !== lastPercent) {
             onProgress(percent);
             lastPercent = percent;
          }
        }
        
        // Ceder el hilo principal para permitir repintados en la UI (animaciones, barra de progreso)
        setTimeout(processChunk, 10);
      } else {
        // Finalizar y vaciar el buffer interno del encoder
        const mp3buf = encoder.flush();
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }
        
        const blob = new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mpeg' });
        const newName = file.name.replace(/\.[^/.]+$/, "") + ".mp3";
        const mp3File = new File([blob], newName, { type: 'audio/mpeg' });
        
        resolve(mp3File);
      }
    }
    
    processChunk();
  });
}
