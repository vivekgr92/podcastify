import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

interface ElevenLabsOptions {
  text: string;
  voiceId: string;
}

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_IDS = {
  "Joe": "IKne3meq5aSn9XLyUdCD",
  "Sarah": "21m00Tcm4TlvDq8ikWAM"
};

export class TTSService {
  constructor() {}

  async synthesizeWithElevenLabs({ text, voiceId }: ElevenLabsOptions): Promise<Buffer> {
    console.log('Making ElevenLabs API request...');
    console.log('Voice ID:', voiceId);
    console.log('Text length:', text.length);
    
    try {
      const response = await axios.post(
        `${ELEVENLABS_API_URL}/${voiceId}`,
        {
          text,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      
      console.log('ElevenLabs API response received');
      console.log('Response status:', response.status);
      console.log('Response data size:', response.data.length);
      
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('ElevenLabs API error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data ? error.response.data.toString() : null
      });
      throw error;
    }
  }

  async generateConversation(text: string): Promise<{ audioBuffer: Buffer; duration: number }> {
    console.log('Starting text-to-speech conversion...');
    console.log('Input text length:', text.length);
    
    // Split text into chunks of max 4000 chars
    const chunks = this.splitTextIntoChunks(text);
    console.log('Split text into', chunks.length, 'chunks');
    
    const conversationParts: Buffer[] = [];
    
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const speaker = index % 2 === 0 ? "Joe" : "Sarah";
      console.log(`Processing chunk ${index + 1}/${chunks.length} with speaker ${speaker}`);
      console.log('Chunk length:', chunk.length);
      
      try {
        const audioBuffer = await this.synthesizeWithElevenLabs({
          text: chunk,
          voiceId: VOICE_IDS[speaker as keyof typeof VOICE_IDS]
        });
        console.log(`Successfully generated audio for chunk ${index + 1}, buffer size:`, audioBuffer.length);
        conversationParts.push(audioBuffer);
      } catch (error) {
        console.error(`Error generating audio for chunk ${index + 1}:`, error);
        throw error;
      }
    }

    console.log('All chunks processed, combining audio parts...');
    // Combine all audio parts
    const combinedBuffer = Buffer.concat(conversationParts);
    console.log('Combined audio buffer size:', combinedBuffer.length);
    
    // Estimate duration (rough estimate: 1 second per 7 words)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 7);
    console.log('Estimated duration:', estimatedDuration, 'seconds');

    return {
      audioBuffer: combinedBuffer,
      duration: estimatedDuration
    };
  }

  private splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
    const sentences = text.split('. ');
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const sentence of sentences) {
      const newChunk = [...currentChunk, sentence].join('. ');
      if (newChunk.length <= maxChars) {
        currentChunk.push(sentence);
      } else {
        chunks.push(currentChunk.join('. ') + '.');
        currentChunk = [sentence];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('. ') + '.');
    }

    return chunks;
  }
}

export const ttsService = new TTSService();
