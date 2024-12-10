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
  Joe: "en-US-Neural2-D", // A deeper male voice with natural intonation
  Sarah: "en-US-Neural2-F", // A warm female voice with clear articulation
};

const SYSTEM_PROMPT = `You are generating a natural podcast conversation between Joe and Sarah.

**Guidelines**:
1. Joe provides detailed technical insights with clear, straightforward explanations
2. Sarah asks thoughtful questions and offers her own insights, making the conversation engaging
3. Keep responses concise and focused, avoiding speaker markers in the actual content
4. Avoid meta-commentary or describing actions - focus on natural dialogue

**Output Format**:
- Always start with just the speaker's response
- Do not include speaker markers like **Joe:** or **Sarah:** in the actual dialogue
- Keep the conversation flowing naturally between speakers

**Style**:
- Use natural speech patterns and conversational tone
- Include occasional filler words ("um", "you know") for authenticity
- Keep technical explanations clear and accessible
- Focus on meaningful exchanges rather than small talk

Remember: Generate only the next speaker's response, without any formatting or meta-text.`;

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
        console.warn(
          "GOOGLE_APPLICATION_CREDENTIALS not set. Some features may be limited.",
        );
        return;
      }

      this.ttsClient = new TextToSpeechClient();
      this.initialized = true;
      logger
        .log("TTSService initialized successfully", "info")
        .catch(console.error);
    } catch (error) {
      console.error("Failed to initialize TTSService:", error);
      logger
        .log(
          `Failed to initialize TTSService: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        )
        .catch(console.error);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error("TTSService not properly initialized");
    }
  }

  private async cleanRawResponse(
    rawResponse: string,
    currentSpeaker: Speaker,
  ): Promise<{ text: string; speaker: Speaker }> {
    if (!rawResponse || typeof rawResponse !== "string") {
      await logger.log("Invalid raw response received", "error");
      throw new Error("Invalid response format");
    }

    try {
      await logger.log("\n============== CLEANING RESPONSE ==============");
      await logger.log(`Original response: ${rawResponse}`);

      // Simple speaker detection at the start
      const speakerRegex = /^(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/i;
      const speakerMatch = rawResponse.match(speakerRegex);

      // Determine speaker - prefer detected speaker, fallback to current speaker
      const speaker = (speakerMatch?.[1] as Speaker) || currentSpeaker;
      await logger.log(`Detected speaker: ${speaker}`);

      // Clean the text - remove all speaker markers and formatting
      let cleanedText = rawResponse
        // Remove speaker markers
        .replace(/^(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/i, '')
        .replace(/\*\*(Joe|Sarah)\*\*[:：]/g, '')
        .replace(/\[(Joe|Sarah)\][:：]/g, '')
        .replace(/@(Joe|Sarah)[:：]/g, '')
        .replace(/\b(Joe|Sarah)[:：]\s*/g, '')
        // Remove any remaining formatting
        .replace(/\*\*/g, '')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanedText.length === 0) {
        await logger.log("Cleaning resulted in empty text", "warn");
        throw new Error("Cleaning resulted in empty text");
      }

      await logger.log(`Final speaker: ${speaker}`);
      await logger.log(`Cleaned text: ${cleanedText}`);
      await logger.log("==================END==========================");

      return { text: cleanedText, speaker };
    } catch (error) {
      await logger.log(
        `Error cleaning response: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return {
        speaker: currentSpeaker,
        text: rawResponse.replace(/\*\*/g, "").trim(),
      };
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
    await logger.log(`Selected speaker: ${speaker}`);
    await logger.log(`Using voice ID: ${GOOGLE_VOICE_IDS[speaker]}`);
    await logger.log(`Original text sample: ${text.substring(0, 100)}...`);

    try {
      // Validate and clean input text
      if (!text || typeof text !== "string") {
        throw new Error("Invalid text input for TTS");
      }

      // Final cleanup to ensure no speaker markers remain
      text = text
        .replace(/\b(?:Joe|Sarah)\b\s*[:：]/g, "") // Remove any remaining speaker markers
        .replace(/\*\*/g, "") // Remove any markdown
        .replace(/\s+/g, " ") // Normalize spaces
        .trim();

      await logger.log(
        `Final cleaned text for TTS: ${text.substring(0, 100)}...`,
      );

      const textBytes = new TextEncoder().encode(text).length;
      if (textBytes > 4800) {
        await logger.log(`Text length warning: ${textBytes} bytes`, "warn");
        text = text.substring(0, Math.floor(4800 / 2)) + "...";
        await logger.log(`Truncated text: ${text.substring(0, 100)}...`);
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
      const chunks = await this.splitTextIntoChunks(text);
      await logger.log(`Split text into ${chunks.length} chunks`);

      const conversationParts: Buffer[] = [];
      let lastResponse = "";
      const speakers: Speaker[] = ["Joe", "Sarah"];
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

          if (!process.env.GOOGLE_CLOUD_PROJECT) {
            throw new Error(
              "GOOGLE_CLOUD_PROJECT environment variable is required",
            );
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

          // Generate conversation prompt with explicit speaker role and alternation
          const prompt = `${SYSTEM_PROMPT}\n\n${currentSpeaker}: ${chunk}\n\n${nextSpeaker}:`;
          
          // Include previous response if available
          const finalPrompt = lastResponse 
            ? `${SYSTEM_PROMPT}\nPrevious response: ${lastResponse}\n${prompt}`
            : prompt;

          await logger.log(
            "\n============== PROMPT TO VERTEX AI ==============",
          );
          await logger.log(prompt);
          await logger.log("=================END=============================");

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
          });

          if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error("Invalid response from Vertex AI");
          }

          const rawResponse =
            result.response.candidates[0].content.parts[0].text.trim();

          await logger.log(
            "\n============== VERTEX AI RESPONSE ==============",
          );
          await logger.log(`Raw response: ${rawResponse}`);
          await logger.log("==================END============================");

          // Clean the text and get the speaker
          const { text: cleanedText, speaker: detectedSpeaker } =
            await this.cleanRawResponse(rawResponse, nextSpeaker);

          // Always use the detected speaker from the response for voice selection
          const finalSpeaker = detectedSpeaker;

          // Basic length validation
          const responseBytes = new TextEncoder().encode(cleanedText).length;
          if (responseBytes > 4800) {
            lastResponse =
              cleanedText.substring(0, Math.floor(4800 / 2)) + "...";
          } else {
            lastResponse = cleanedText;
          }

          await logger.log("\n============== VOICE SELECTION ==============");
          await logger.log(`Using speaker: ${finalSpeaker}`);
          await logger.log(`Voice ID: ${GOOGLE_VOICE_IDS[finalSpeaker]}`);
          await logger.log("==================END=======================");

          // Use the final speaker's voice
          const audioBuffer = await this.synthesizeWithGoogle({
            text: lastResponse,
            speaker: finalSpeaker,
          });

          await logger.log(`Generated audio buffer for chunk ${index + 1}`);
          conversationParts.push(audioBuffer);

          // Switch speaker for next iteration
          speakerIndex = (speakerIndex + 1) % 2;
        } catch (error) {
          await logger.log(
            `Error processing chunk ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          // On error, try to generate audio with current speaker
          try {
            const errorAudio = await this.synthesizeWithGoogle({
              text: "I apologize, but I need to pass the conversation back.",
              speaker: speakers[speakerIndex],
            });
            conversationParts.push(errorAudio);
          } catch (audioError) {
            await logger.log(
              `Failed to generate error audio: ${audioError}`,
              "error",
            );
          }
          continue;
        }
      }

      if (conversationParts.length === 0) {
        throw new Error("No audio parts were generated");
      }

      const combinedBuffer = Buffer.concat(conversationParts);
      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / 7);

      await logger.log(`Combined audio buffer size: ${combinedBuffer.length}`);
      await logger.log(`Estimated duration: ${estimatedDuration} seconds`);

      this.emitProgress(100);

      return {
        audioBuffer: combinedBuffer,
        duration: estimatedDuration,
      };
    } catch (error) {
      await logger.log(
        `Error in conversation generation: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  private async splitTextIntoChunks(
    text: string,
    maxBytes: number = 4800,
  ): Promise<string[]> {
    await logger.log(
      `Starting text splitting process (text length: ${text.length} characters)`,
    );

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
            await logger.log(
              `Created chunk #${chunks.length}: ${chunk.substring(0, 50)}...`,
            );
          }
          currentChunk = [sentenceWithPunct];
        }
      }

      if (currentChunk.length > 0) {
        const finalChunk = currentChunk.join("");
        chunks.push(finalChunk);
        await logger.log(
          `Created final chunk #${chunks.length}: ${finalChunk.substring(0, 50)}...`,
        );
      }

      await logger.log(`Successfully created ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      await logger.log(
        `Error splitting text: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }
}

// Create and export singleton instance
export const ttsService = new TTSService();
