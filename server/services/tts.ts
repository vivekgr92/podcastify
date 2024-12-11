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

const SYSTEM_PROMPT = `You are generating a podcast conversation between Joe and Sarah.

**Roles**:
- Joe and Sarah are podcast hosts analyzing a scientific study. They provide technical insights, offer critiques, and discuss implications, but they are not participants in the research.
- Joe asks thoughtful questions, summarizes findings, and helps make the discussion accessible for a broader audience.
- Sarah provides in-depth analysis, raises potential challenges or limitations, and highlights related research for context.

**Guidelines**:
1. Maintain a clear distinction between the hosts' commentary and the study authors' contributions. Use phrases like "the authors found," "the researchers demonstrated," or "the study highlights" to clarify roles.
2. Both speakers contribute equally, alternating between explaining concepts, analyzing findings, and discussing broader implications.
3. Avoid implying personal involvement in the research. Focus on the hosts' role as external analysts.
4. Use natural human speech patterns, including filler words like "um," "you know," and conversational transitions for authenticity.

**Focus**:
- Analyze and explain the research methods, findings, and implications clearly.
- Provide constructive critiques or raise questions about limitations, future directions, or broader impacts.
- Ensure the discussion remains engaging, relatable, and spontaneous while maintaining technical depth.

**Tone**:
- Professional yet conversational.
- Include lighthearted moments or humor to mimic a real podcast.
- Balance technical depth with accessibility for a mixed audience of experts and laypeople.
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

      // Enhanced speaker detection patterns
      const speakerPatterns = [
        /^(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/i,
        /(?:^|\n)(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/i,
        /\[(Joe|Sarah)\][:：]/,
        /@(Joe|Sarah)[:：]/,
        /\*\*(Joe|Sarah)\*\*[:：]/,
      ];

      let detectedSpeaker = currentSpeaker;
      for (const pattern of speakerPatterns) {
        const match = rawResponse.match(pattern);
        if (match) {
          detectedSpeaker = match[1] as Speaker;
          break;
        }
      }

      await logger.log(`Detected speaker: ${detectedSpeaker}`);

      // Thorough cleaning of the text
      let cleanedText = rawResponse
        // Remove all variations of speaker markers
        .replace(/^(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/i, "")
        .replace(/(?:^|\n)(?:\*\*)?(Joe|Sarah)(?:\*\*)?(?::|：|\s*[-–—]\s*)/gi, "")
        .replace(/\[(Joe|Sarah)\][:：]/g, "")
        .replace(/@(Joe|Sarah)[:：]/g, "")
        .replace(/\*\*(Joe|Sarah)\*\*[:：]/g, "")
        .replace(/\b(Joe|Sarah)[:：]\s*/g, "")
        // Clean formatting and normalize whitespace
        .replace(/\*\*/g, "")
        .replace(/[\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "")
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

          // Generate conversation prompt with proper context and handling
          let prompt;
          if (index === 0) {
            // Always start with Joe's introduction
            prompt = `${SYSTEM_PROMPT}\n\nStart with Joe welcoming the audience and introducing Sarah (keep it under 30 seconds), then have Sarah begin discussing this content:\n\n${chunk}\n\nJoe:`;
            speakerIndex = 0; // Ensure we start with Joe
          } else {
            // Subsequent chunks should continue the conversation
            prompt = `${SYSTEM_PROMPT}\n\nContinue the conversation about this content, maintaining the natural flow. Use this previous response for context, but discuss new points:\n\nPrevious response: ${lastResponse}\n\nNew content to discuss: ${chunk}\n\n${speakers[speakerIndex]}:`;
          }

          const finalPrompt = prompt;

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
          await logger.log(
            "\n==================END============================",
          );

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
          await logger.log("\n==================END=======================");

          // Use the final speaker's voice
          const audioBuffer = await this.synthesizeWithGoogle({
            text: lastResponse,
            speaker: finalSpeaker,
          });

          await logger.log(`Generated audio buffer for chunk ${index + 1}`);
          conversationParts.push(audioBuffer);

          // Switch speaker for next iteration based on detected speaker
          speakerIndex = (speakers.indexOf(finalSpeaker) + 1) % 2;
          
          // Ensure proper transition between chunks
          if (index < chunks.length - 1) {
            await logger.log("Preparing for next chunk transition");
            await logger.log(`Next speaker will be: ${speakers[speakerIndex]}`);
          }
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
