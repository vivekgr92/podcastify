import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { VertexAI } from "@google-cloud/vertexai";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
import { logger } from "./logging";
const { AudioEncoding } = protos.google.cloud.texttospeech.v1;

type Speaker = "Joe" | "Sarah";

interface ConversationEntry {
  speaker: Speaker;
  text: string;
}

interface ElevenLabsOptions {
  text: string;
  voiceId: string;
}

interface RawResponse {
  text: string;
  speaker: Speaker;
}

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_IDS: Record<Speaker, string> = {
  Joe: "IKne3meq5aSn9XLyUdCD",
  Sarah: "21m00Tcm4TlvDq8ikWAM",
};

const GOOGLE_VOICE_IDS: Record<Speaker, string> = {
  Joe: "en-US-Neural2-D",    // A deeper male voice with natural intonation
  Sarah: "en-US-Neural2-F",  // A warm female voice with clear articulation
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
- Balance technical depth with conversational relatability, avoiding overly formal language.
`;

export class TTSService {
  private ttsClient!: TextToSpeechClient;
  private progressListeners!: Set<(progress: number) => void>;
  private initialized: boolean = false;

  constructor() {
    this.progressListeners = new Set();
    this.initialized = false;
    
    // Attempt to initialize the TTS client
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn("GOOGLE_APPLICATION_CREDENTIALS not set. Some features may be limited.");
        return;
      }
      
      this.ttsClient = new TextToSpeechClient();
      this.initialized = true;
      logger.log("TTSService initialized successfully", "info").catch(console.error);
    } catch (error) {
      console.error("Failed to initialize TTSService:", error);
      logger.log(`Failed to initialize TTSService: ${error instanceof Error ? error.message : String(error)}`, "error").catch(console.error);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error("TTSService not properly initialized");
    }
  }

  private async cleanRawResponse(rawResponse: string, currentSpeaker: Speaker): Promise<{ text: string; speaker: Speaker }> {
    if (!rawResponse || typeof rawResponse !== 'string') {
      await logger.log('Invalid raw response received', 'error');
      throw new Error('Invalid response format');
    }

    try {
      await logger.log("\n============== CLEANING RESPONSE ==============");
      await logger.log(`Processing text with current speaker: ${currentSpeaker}`);
      
      // First, detect the speaker from the markers at the start of the text
      const speakerPattern = /^(?:\*\*)?(Joe|Sarah)(?:\*\*)?:/;
      const speakerMatch = rawResponse.match(speakerPattern);
      
      // Always use the provided currentSpeaker instead of detecting from text
      const detectedSpeaker = currentSpeaker;
      
      // Remove all speaker markers and their associated text patterns
      let cleanedText = rawResponse
        // Remove all speaker prefixes (at start and inline)
        .replace(/(?:^|\s)(?:\*\*)?(Joe|Sarah)(?:\*\*)?:/g, '')
        // Remove any speaker references and their actions
        .replace(/\b(?:Joe|Sarah)\b\s*(?:says|said|asks|asked|continues|continued|replies|responded|interjected|explained|noted|added|pointed out|mentioned|suggested)[\s,:]*/g, '')
        // Remove any remaining markdown and normalize whitespace
        .replace(/\*\*/g, '')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanedText.length === 0) {
        await logger.log('Cleaning resulted in empty text', 'warn');
        throw new Error('Cleaning resulted in empty text');
      }
      
      await logger.log(`Using speaker: ${detectedSpeaker}`);
      await logger.log(`Cleaned text sample: ${cleanedText.substring(0, 100)}...`);
      await logger.log("==================END==========================");
      
      return {
        text: cleanedText,
        speaker: detectedSpeaker
      };
    } catch (error) {
      await logger.log(
        `Error cleaning response: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      throw error;
    }
  }

  addProgressListener(listener: (progress: number) => void) {
    this.progressListeners.add(listener);
  }

  removeProgressListener(listener: (progress: number) => void) {
    this.progressListeners.delete(listener);
  }

  private emitProgress(progress: number) {
    this.progressListeners.forEach((listener) => listener(progress));
  }

  async synthesizeWithGoogle({
    text,
    speaker,
  }: {
    text: string;
    speaker: Speaker;
  }): Promise<Buffer> {
    this.ensureInitialized();
    
    if (!GOOGLE_VOICE_IDS[speaker]) {
      throw new Error(`Invalid speaker: ${speaker}. Expected 'Joe' or 'Sarah'`);
    }

    await logger.log("\n============== GOOGLE TTS REQUEST ==============");
    await logger.log(`Speaker: ${speaker}`);
    await logger.log(`Voice ID: ${GOOGLE_VOICE_IDS[speaker]}`);
    await logger.log(`Text sample: ${text.substring(0, 100)}...`);

    try {
      // Validate and clean input text
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid text input for TTS');
      }

      // Remove any remaining speaker markers or formatting
      text = text
        .replace(/\b(?:Joe|Sarah)\b\s*[:]/g, '')
        .replace(/\*\*/g, '')
        .trim();

      const textBytes = new TextEncoder().encode(text).length;
      if (textBytes > 4800) {
        await logger.log(`Text length warning: ${textBytes} bytes`, "warn");
        text = text.substring(0, Math.floor(4800 / 2)) + "...";
        await logger.log(`Truncated text sample: ${text.substring(0, 100)}...`);
      }

      const request = {
        input: { text },
        voice: {
          languageCode: "en-US",
          name: GOOGLE_VOICE_IDS[speaker],
        },
        audioConfig: {
          audioEncoding: AudioEncoding.MP3,
          speakingRate: 1.0,
          pitch: 0.0,
        },
      } satisfies protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest;

      const [response] = await this.ttsClient.synthesizeSpeech(request);
      await logger.log("TTS API response received successfully");

      if (!response.audioContent) {
        throw new Error("No audio content received from Google TTS");
      }

      return Buffer.from(response.audioContent);
    } catch (error) {
      await logger.log(
        `TTS API error: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  async synthesizeWithElevenLabs({
    text,
    voiceId,
  }: ElevenLabsOptions): Promise<Buffer> {
    await logger.log("Making ElevenLabs API request...");
    await logger.log(`Voice ID: ${voiceId}`);
    await logger.log(`Text length: ${text.length}`);

    try {
      const response = await axios.post(
        `${ELEVENLABS_API_URL}/${voiceId}`,
        {
          text,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            Accept: "audio/mpeg",
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );

      await logger.log("ElevenLabs API response received");
      await logger.log(`Response status: ${response.status}`);
      await logger.log(`Response data size: ${response.data.length}`);

      return Buffer.from(response.data);
    } catch (error: any) {
      await logger.log(
        `ElevenLabs API error: 
        Status: ${error.response?.status}
        Status Text: ${error.response?.statusText}
        Data: ${error.response?.data ? error.response.data.toString() : "null"}`,
        "error",
      );
      throw error;
    }
  }

  async generateConversation(
    text: string,
  ): Promise<{ audioBuffer: Buffer; duration: number }> {
    try {
      await logger.log("Starting text-to-speech conversion...");
      await logger.log(`Input text length: ${text.length}`);

      // Split text into smaller chunks to stay within token limits
      await logger.log("Starting text splitting process...");
      const chunks = await this.splitTextIntoChunks(text);
      await logger.log(`Finished splitting text into ${chunks.length} chunks`);

      const conversationParts: Buffer[] = [];
      let lastResponse = "";
      const speakers = ["Joe", "Sarah"] as const;
      let speakerIndex = 0;

      // Emit initial progress
      this.emitProgress(0);

      for (let index = 0; index < chunks.length; index++) {
        try {
          const chunkProgress = ((index + 0.5) / chunks.length) * 100;
          this.emitProgress(Math.min(chunkProgress, 99));

          const chunk = chunks[index];
          const currentSpeaker = speakers[speakerIndex];
          const nextSpeaker = speakers[(speakerIndex + 1) % 2];

          // Generate conversation prompt with explicit speaker markers
          let prompt = `${SYSTEM_PROMPT}\n\nPrevious Response: ${lastResponse ? `${lastResponse}\n\n` : ''}Current chunk: ${chunk}\n\nNow ${nextSpeaker} should respond:`;

          if (!process.env.GOOGLE_CLOUD_PROJECT) {
            throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
          }

          const vertex_ai = new VertexAI({
            project: process.env.GOOGLE_CLOUD_PROJECT,
            location: "us-central1",
          });

          const model = vertex_ai.preview.getGenerativeModel({
            model: "gemini-1.0-pro",
            generationConfig: {
              maxOutputTokens: 1200,
              temperature: 0.7,
              topP: 0.95,
            },
          });

          await logger.log("\n============== PROMPT TO VERTEX AI ==============");
          await logger.log(prompt);
          await logger.log("=================END=============================");

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          });

          if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error("Invalid response from Vertex AI");
          }

          const rawResponse = result.response.candidates[0].content.parts[0].text.trim();
          
          // Force the next speaker marker at the start of the response if it's not present
          const formattedResponse = rawResponse.startsWith(`${nextSpeaker}:`) 
            ? rawResponse 
            : `${nextSpeaker}: ${rawResponse}`;

          await logger.log("\n============== VERTEX AI RESPONSE ==============");
          await logger.log(`Raw response: ${formattedResponse}`);
          await logger.log("==================END============================");

          // Clean the response text and ensure proper speaker handling
          const cleanedResponse = await this.cleanRawResponse(formattedResponse, nextSpeaker);
          
          // Basic length validation
          const responseBytes = new TextEncoder().encode(cleanedResponse.text).length;
          if (responseBytes > 4800) {
            await logger.log(`Response too long (${responseBytes} bytes), truncating...`, "warn");
            lastResponse = cleanedResponse.text.substring(0, Math.floor(4800 / 2)) + "...";
          } else {
            lastResponse = cleanedResponse.text;
          }

          // Log voice selection details
          await logger.log("\n============== VOICE SELECTION ==============");
          await logger.log(`Next speaker: ${nextSpeaker}`);
          await logger.log(`Voice ID being used: ${GOOGLE_VOICE_IDS[nextSpeaker]}`);
          await logger.log("==================END=======================");
          
          // Always use the next speaker's voice for consistent alternation
          const audioBuffer = await this.synthesizeWithGoogle({
            text: lastResponse,
            speaker: nextSpeaker
          });

          await logger.log(`Generated audio buffer for chunk ${index + 1}`);
          conversationParts.push(audioBuffer);

          // Switch speaker for next iteration
          speakerIndex = (speakerIndex + 1) % 2;

        } catch (error) {
          await logger.log(
            `Error processing chunk ${index + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
            "error"
          );
          continue; // Skip this chunk and continue with the next one
        }
      }

      if (conversationParts.length === 0) {
        throw new Error("No audio parts were generated");
      }

      const combinedBuffer = Buffer.concat(conversationParts);
      await logger.log(`Combined audio buffer size: ${combinedBuffer.length}`);

      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / 7);
      await logger.log(`Estimated duration: ${estimatedDuration} seconds`);

      return {
        audioBuffer: combinedBuffer,
        duration: estimatedDuration,
      };

    } catch (error) {
      await logger.log(
        `Error in conversation generation: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
      throw error;
    }
  }

  private async splitTextIntoChunks(text: string, maxBytes: number = 4800): Promise<string[]> {
    await logger.log(`Starting text splitting process (text length: ${text.length} characters)`);

    const getByteLength = (str: string): number => {
      return new TextEncoder().encode(str).length;
    };

    try {
      const sentences = text.split(/[.!?]+\s*/);
      const chunks: string[] = [];
      let currentChunk: string[] = [];

      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;

        const sentenceWithPunct = trimmedSentence + ". ";
        const newChunk = [...currentChunk, sentenceWithPunct].join("");

        if (getByteLength(newChunk) <= maxBytes) {
          currentChunk.push(sentenceWithPunct);
        } else {
          if (currentChunk.length > 0) {
            const chunk = currentChunk.join("");
            chunks.push(chunk);
            await logger.log(`Created chunk #${chunks.length}: ${chunk.substring(0, 50)}...`);
          }
          currentChunk = [sentenceWithPunct];
        }
      }

      if (currentChunk.length > 0) {
        const finalChunk = currentChunk.join("");
        chunks.push(finalChunk);
        await logger.log(`Created final chunk #${chunks.length}: ${finalChunk.substring(0, 50)}...`);
      }

      await logger.log(`Successfully created ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      await logger.log(`Error splitting text: ${error instanceof Error ? error.message : String(error)}`, "error");
      throw error;
    }
  }
}

// Create and export singleton instance
export const ttsService = new TTSService();