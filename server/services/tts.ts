import { VertexAI, GenerativeModel } from "@google-cloud/vertexai";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { logger } from "./logging";
import path from "path";
import fs from "fs/promises";
import { execSync } from "child_process";

type Speaker = "Joe" | "Sarah";
type ProgressListener = (progress: number) => void;

interface ConversationPart {
  speaker: Speaker;
  text: string;
}

interface GenerationResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GenerationResult {
  response: GenerationResponse;
}

const SPEAKERS: Speaker[] = ["Joe", "Sarah"];

// Voice mapping for different speakers
const SPEAKER_VOICE_MAP = {
  Joe: "en-US-Wavenet-D", // Male voice
  Sarah: "en-US-Wavenet-F", // Female voice
};

// System prompts for different stages of conversation
// Generation configuration
const GENERATION_CONFIG = {
  maxOutputTokens: 1200,
  temperature: 0.7,
  topP: 0.95,
};

// System prompts exactly matching Python implementation
const SYSTEM_PROMPTS = {
  WELCOME: `Speaker Joe should Start the podcast by saying this: Welcome to Science Odyssey, the podcast where we journey through groundbreaking scientific studies,
unraveling the mysteries behind the research that shapes our world. Thanks for tuning in!

**Guidelines**:
1. Joe provides detailed technical insights but avoids overusing analogies. Instead, focus on straightforward, clear explanations.
2. Sarah asks probing, thoughtful questions, occasionally offers her own insights, and challenges Joe to explain concepts simply and conversationally.
3. Both speakers use natural human speech patterns, including filler words like "um," "ah," "you know," and short pauses.

**Focus**:
- Avoid excessive use of analogies. Use one or two if necessary for clarity but prioritize clear, direct explanations.
- Include natural conversational flow with interruptions, backtracking, and filler words to make the dialogue feel authentic.
- Encourage a natural dialogue with varied contributions from both speakers.

**Tone**:
- Engaging, relatable, and spontaneous.
- Emphasize human-like emotions, with occasional humor or lighthearted moments.
- Balance technical depth with conversational relatability, avoiding overly formal language.`,

  MAIN: `You are generating a podcast conversation between Joe and Sarah.

**Guidelines**:
1. Joe provides detailed technical insights but avoids overusing analogies. Instead, focus on straightforward, clear explanations.
2. Sarah asks probing, thoughtful questions, occasionally offers her own insights, and challenges Joe to explain concepts simply and conversationally.
3. Both speakers use natural human speech patterns, including filler words like "you know," and short pauses.
4. Don't include any sound effects or background music.

**Focus**:
- Avoid excessive use of analogies. Use one or two if necessary for clarity but prioritize clear, direct explanations.
- Include natural conversational flow with interruptions, backtracking, and filler words to make the dialogue feel authentic.
- Encourage a natural dialogue with varied contributions from both speakers.

**Tone**:
- Engaging, relatable, and spontaneous.
- Emphasize human-like emotions, with occasional humor or lighthearted moments.
- Balance technical depth with conversational relatability, avoiding overly formal language.`,

  FAREWELL: `Speaker Joe should End the podcast by saying this: Thank you for joining us on this episode of Science Odyssey, where we explored the groundbreaking research shaping our understanding of the world. 
If you enjoyed this journey, don't forget to subscribe, leave a review, and share the podcast with fellow science enthusiasts.
Until next time, keep exploring the wonders of science—your next discovery awaits!`,
};

export class TTSService {
  private progressListeners: Set<ProgressListener> = new Set();
  private vertexAI: VertexAI;
  private ttsClient: TextToSpeechClient;

  constructor() {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
    }

    this.vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: "us-central1",
    });

    this.ttsClient = new TextToSpeechClient();
  }

  addProgressListener(listener: ProgressListener) {
    this.progressListeners.add(listener);
  }

  removeProgressListener(listener: ProgressListener) {
    this.progressListeners.delete(listener);
  }

  private emitProgress(progress: number) {
    Array.from(this.progressListeners).forEach((listener) => {
      listener(progress);
    });
  }

  private splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
    const sentences = text.split(". ");
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const sentence of sentences) {
      const newChunk = [...currentChunk, sentence].join(". ") + ".";
      if (newChunk.length <= maxChars) {
        currentChunk.push(sentence);
      } else {
        chunks.push(currentChunk.join(". ") + ".");
        currentChunk = [sentence];
      }
    }

    if (currentChunk.length) {
      chunks.push(currentChunk.join(". ") + ".");
    }

    return chunks;
  }

  // Function to calculate characters, words, and tokens in a text
  // Now includes detailed logging for debug purposes
  private async analyzeText(
    text: string,
  ): Promise<{ characters: number; words: number; tokens: number }> {
    // Calculate the number of characters (including spaces)
    const characters = text.length;

    // Calculate the number of words (split by spaces and filter out empty strings)
    const words = text.split(/\s+/).filter((word) => word.length > 0).length;

    // Estimate the number of tokens (using average 4 characters per token heuristic)
    const tokens = Math.ceil(characters / 4);

    // Log the analysis results
    await logger.debug(
      `Text analysis: characters=${characters}, words=${words}, tokens=${tokens}`,
    );

    return { characters, words, tokens };
  }

  private async cleanGeneratedText(
    rawText: string,
  ): Promise<ConversationPart[]> {
    try {
      const conversation: ConversationPart[] = [];
      const lines = rawText.split("\n");

      for (const line of lines) {
        // Adjust regex to handle asterisks around speaker names (e.g., **Joe:**)
        const match = line.match(/^\*?\*?(\w+)\*?\*?:\s*(.*)$/);
        if (match) {
          const [, speakerName, dialogue] = match;

          if (
            dialogue?.trim() &&
            (speakerName === "Joe" || speakerName === "Sarah")
          ) {
            const speaker = speakerName as Speaker;
            const text = dialogue.trim();

            if (text.length > 0) {
              conversation.push({ speaker, text });
            }
          }
        }
      }

      if (conversation.length === 0) {
        await logger.warn(
          "No valid conversation parts found in the generated text",
        );
      }

      return conversation;
    } catch (error) {
      await logger.error(
        `Error processing raw text: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async synthesizeSpeech(
    text: string,
    speaker: Speaker,
    index: number,
  ): Promise<string> {
    const voiceName = SPEAKER_VOICE_MAP[speaker];
    const outputFile = path.join("audio-files", `${index}.mp3`);

    try {
      const [response] = await this.ttsClient.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode: "en-US",
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      });

      await fs.mkdir("audio-files", { recursive: true });
      await fs.writeFile(outputFile, response.audioContent as Buffer);
      await logger.info(`Audio content written to file "${outputFile}"`);

      return outputFile;
    } catch (error) {
      throw new Error(
        `Failed to synthesize speech: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async mergeAudioFiles(
    audioFolder: string,
    outputFile: string,
  ): Promise<void> {
    try {
      // Initialize array to hold all file paths
      const allFilePaths: string[] = [];

      // Copy intro file to audio folder if it exists in the root
      const rootIntroPath = path.resolve("podcast.mp3");
      const audioFolderIntroPath = path.resolve(audioFolder, "podcast.mp3");
      console.log("\n\n======rootIntroPath", rootIntroPath);
      console.log("\n\n======audioFolderIntroPath", audioFolderIntroPath);
      try {
        await fs.copyFile(rootIntroPath, audioFolderIntroPath);
        allFilePaths.push(audioFolderIntroPath);
        await logger.info("Copied intro file podcast.mp3 to audio folder");
      } catch {
        await logger.warn("Intro file podcast.mp3 not found in root directory");
      }

      // Get generated audio files
      const files = await fs.readdir(audioFolder);
      const audioFiles = files
        .filter(
          (file) =>
            file.endsWith(".mp3") &&
            !file.includes("final_output") &&
            file !== "podcast.mp3",
        )
        .sort((a, b) => {
          const aNum = parseInt(a.match(/\d+/)?.[0] || "0");
          const bNum = parseInt(b.match(/\d+/)?.[0] || "0");
          return aNum - bNum;
        });

      if (audioFiles.length === 0) {
        throw new Error("No audio files found to merge");
      }

      // Add sorted audio files to the file paths array
      allFilePaths.push(
        ...audioFiles.map((file) => path.resolve(audioFolder, file)),
      );

      // Create concat list file
      const concatFilePath = path.resolve(audioFolder, "concat_list.txt");
      const concatFileContent = allFilePaths
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join("\n");

      await fs.writeFile(concatFilePath, concatFileContent, "utf8");
      await logger.info("Created concat list file with content:");
      await logger.info(concatFileContent);

      // Use FFmpeg to merge the files
      const outputFilePath = path.resolve(outputFile);
      const command = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputFilePath}"`;

      try {
        execSync(command, { stdio: "pipe" });
        await logger.info(`Successfully merged audio saved as ${outputFile}`);
      } catch (ffmpegError) {
        await logger.error(
          `FFmpeg error: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`,
        );
        throw new Error("Failed to merge audio files with FFmpeg");
      }

      // Clean up all temporary files
      try {
        // Remove concat list file
        await fs.unlink(concatFilePath);

        // Remove all intermediate audio files
        for (const file of audioFiles) {
          await fs.unlink(path.resolve(audioFolder, file));
        }

        // Remove copied intro file if it exists
        try {
          await fs.unlink(audioFolderIntroPath);
        } catch (error) {
          // Ignore error if intro file doesn't exist
        }

        await logger.info("Cleaned up temporary audio files");
      } catch (cleanupError) {
        await logger.warn(
          `Failed to clean up some temporary files: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    } catch (error) {
      await logger.error(
        `Error in mergeAudioFiles: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to merge audio files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async generateConversation(
    text: string,
  ): Promise<{ audioBuffer: Buffer; duration: number }> {
    try {
      // Ensure audio-files directory exists and is empty
      const audioDir = "audio-files";
      try {
        await fs.rm(audioDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore error if directory doesn't exist
      }
      await fs.mkdir(audioDir, { recursive: true });

      // Split text into manageable chunks
      this.analyzeText(text);
      const allConversations: ConversationPart[] = [];
      let lastResponse = "";
      let speakerIndex = 0;

      // Initialize progress tracking
      this.emitProgress(0);
      await logger.info("\n--- Starting Conversation Generation ---\n");

      const model = this.vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash-002",
      }) as GenerativeModel;

      // Count tokens using proper content format
      const tokenCount = await model.countTokens({
        contents: [{ role: "user", parts: [{ text }] }],
      });

      await logger.info(`\n--- Token Count ---\n${tokenCount}`);

      const chunks = this.splitTextIntoChunks(text);

      // Process each chunk and generate conversation
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const currentSpeaker = SPEAKERS[speakerIndex];

        try {
          // Dynamic prompting based on chunk position
          let prompt: string;

          if (index === 0) {
            prompt = `${SYSTEM_PROMPTS.WELCOME}\n\n${SYSTEM_PROMPTS.MAIN}\n\nJoe: ${chunk}\n\nSarah:`;
            speakerIndex = 0;
          } else if (index === chunks.length - 1) {
            await logger.info([
              "\n\n ==================Last Chunk===================\n",
            ]);

            prompt = `${SYSTEM_PROMPTS.MAIN}\n\n${
              lastResponse ? `**Previous Context**:\n${lastResponse}\n\n` : ""
            }${currentSpeaker}: ${chunk}\n\n${SYSTEM_PROMPTS.FAREWELL}`;
          } else {
            prompt = `${SYSTEM_PROMPTS.MAIN}\n\n${
              lastResponse ? `**Previous Context**:\n${lastResponse}\n\n` : ""
            }${currentSpeaker}: ${chunk}`;
          }

          // Log prompt for debugging
          await logger.info([
            "\n\n ------------PROMPT to VERTEX AI-----------------\n",
            prompt,
            "\n\n ------------END-----------------\n",
          ]);

          // Generate content using Vertex AI
          const result = (await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: GENERATION_CONFIG,
          })) as GenerationResult;

          // Validate and extract response
          const rawText =
            result.response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error("Invalid response from Vertex AI");
          }

          await logger.info([
            "\n\n -------RESPONSE FROM VERTEX AI---------\n",
            rawText,
            "\n\n ------------END-----------------\n",
          ]);

          // Process conversation parts
          const conversationParts = await this.cleanGeneratedText(rawText);
          await logger.info([
            `Cleaned Text (Chunk ${index + 1}):`,
            JSON.stringify(conversationParts, null, 2),
          ]);

          if (conversationParts.length > 0) {
            allConversations.push(...conversationParts);
            lastResponse = conversationParts[conversationParts.length - 1].text;
            speakerIndex = (speakerIndex + 1) % 2;
          }

          // Update progress for conversation generation (0-50%)
          this.emitProgress(((index + 1) / chunks.length) * 50);
        } catch (error) {
          await logger.error(
            `Error processing chunk ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      }

      // Print full conversation for debugging
      await logger.log("\n--- Full Generated Conversation ---");
      allConversations.forEach((part) => {
        logger.log(`${part.speaker}: ${part.text}`);
      });
      await logger.log("--- End of Conversation ---\n");

      // Generate audio for each conversation part
      await logger.log("Generating audio files...");
      const audioFiles: string[] = [];

      for (let i = 0; i < allConversations.length; i++) {
        const { speaker, text } = allConversations[i];
        const audioFile = await this.synthesizeSpeech(text, speaker, i);
        audioFiles.push(audioFile);

        // Update progress for audio generation (50-100%)
        this.emitProgress(50 + ((i + 1) / allConversations.length) * 50);
      }

      // Merge audio files
      const outputFile = path.join("audio-files", "final_output.mp3");
      await this.mergeAudioFiles("audio-files", outputFile);

      // Read the final audio file
      const audioBuffer = await fs.readFile(outputFile);

      // Calculate approximate duration (assuming average speaking rate)
      const totalCharacters = allConversations.reduce(
        (sum, part) => sum + part.text.length,
        0,
      );
      const approximateDuration = Math.ceil(totalCharacters / 20); // Rough estimate: 20 characters per second

      // Clean up the audio-files directory after getting the final buffer
      try {
        await fs.rm(audioDir, { recursive: true, force: true });
        await logger.info(
          "Cleaned up audio-files directory after successful generation",
        );
      } catch (cleanupError) {
        await logger.warn(
          `Failed to clean up audio-files directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }

      this.emitProgress(100);
      return { audioBuffer, duration: approximateDuration };
    } catch (error) {
      await logger.log(
        `Error generating conversation: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

export const ttsService = new TTSService();
