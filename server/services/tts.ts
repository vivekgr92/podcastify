import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { VertexAI } from '@google-cloud/vertexai';

interface ElevenLabsOptions {
  text: string;
  voiceId: string;
}

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_IDS = {
  "Joe": "IKne3meq5aSn9XLyUdCD",
  "Sarah": "21m00Tcm4TlvDq8ikWAM"
};

const SYSTEM_PROMPT = `You are generating a podcast conversation between Joe and Sarah.

**Guidelines**:
1. Joe provides detailed technical insights but avoids overusing analogies. Instead, focus on straightforward, clear explanations.
2. Sarah asks probing, thoughtful questions, occasionally offers her own insights, and challenges Joe to explain concepts simply and conversationally.
3. Both speakers use natural human speech patterns, including filler words like "um," "ah," "you know," and short pauses.
4. Conclude with a visionary statement highlighting the broader impact of the discussion on science and society.

**Focus**:
- Avoid excessive use of analogies. Use one or two if necessary for clarity but prioritize clear, direct explanations.
- Include natural conversational flow with interruptions, backtracking, and filler words to make the dialogue feel authentic.
- Encourage a natural dialogue with varied contributions from both speakers.

**Tone**:
- Engaging, relatable, and spontaneous.
- Emphasize human-like emotions, with occasional humor or lighthearted moments.
- Balance technical depth with conversational relatability, avoiding overly formal language.`;

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
    let lastResponse = "";
    const speakers = ["Joe", "Sarah"];
    let speakerIndex = 0;
    
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const currentSpeaker = speakers[speakerIndex];
      const nextSpeaker = speakers[(speakerIndex + 1) % 2];
      
      console.log(`Processing chunk ${index + 1}/${chunks.length}`);
      console.log('Current speaker:', currentSpeaker);
      
      try {
        // Generate conversation prompt
        let prompt = `${SYSTEM_PROMPT}\n${currentSpeaker}: ${chunk}\n${nextSpeaker}:`;
        
        if (lastResponse) {
          prompt = `${SYSTEM_PROMPT}\nPrevious response: ${lastResponse}\n${prompt}`;
        }
        
        // Check for required environment variables
        if (!process.env.GOOGLE_CLOUD_PROJECT) {
          throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
        }

        // Initialize Vertex AI with Google Cloud project
        const vertex_ai = new VertexAI({
          project: process.env.GOOGLE_CLOUD_PROJECT,
          location: 'us-central1',
        });

        // Create Gemini model instance
        const model = vertex_ai.preview.getGenerativeModel({
          model: "gemini-1.0-pro",
          generation_config: {
            max_output_tokens: 1200,
            temperature: 0.7,
            top_p: 0.95,
          },
        });

        console.log('Initialized Vertex AI with project:', process.env.GOOGLE_CLOUD_PROJECT);

        // Generate response using Gemini
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const response = result.response.candidates[0].content.parts[0].text;
        lastResponse = response;
        
        // Generate audio for the response
        const audioBuffer = await this.synthesizeWithElevenLabs({
          text: response,
          voiceId: VOICE_IDS[currentSpeaker as keyof typeof VOICE_IDS]
        });
        
        console.log(`Successfully generated audio for chunk ${index + 1}, buffer size:`, audioBuffer.length);
        conversationParts.push(audioBuffer);
        
        // Switch speaker for next iteration
        speakerIndex = (speakerIndex + 1) % 2;
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
