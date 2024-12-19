import { VertexAI, GenerativeModel } from "@google-cloud/vertexai";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
import { promisify } from "util";
import { logger } from "./logging";
import path from "path";
import fs from "fs/promises";
import * as util from "util";
import { execSync } from "child_process";

export type Speaker = "Joe" | "Sarah";
type ProgressListener = (progress: number) => void;

export interface ConversationPart {
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

interface PricingDetails {
  inputTokens: number;
  outputTokens: number;
  estimatedOutputTokens: number;
  ttsCharacters: number;
  totalCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    ttsCost: number;
  };
}

export type { PricingDetails };

const PRICING = {
  INPUT_TOKEN_RATE: 0.0005 / 1000, // $0.0005 per 1K tokens
  OUTPUT_TOKEN_RATE: 0.0005 / 1000, // $0.0005 per 1K tokens
  TTS_RATE_STANDARD: 4.0 / 1000000, // $4 per 1M characters
  TTS_RATE_WAVENET: 16.0 / 1000000, // $16 per 1M characters
};

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
    try {
      const model = this.vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash-002",
      });

      // Get actual token count from Vertex AI
      const tokenCount = await model.countTokens({
        contents: [{ role: "user", parts: [{ text }] }],
      });

      const characters = text.length;
      const words = text.split(/\s+/).filter((word) => word.length > 0).length;

      await logger.debug(
        `Text analysis: characters=${characters}, words=${words}, tokens=${tokenCount.totalTokens}`,
      );

      return {
        characters,
        words,
        tokens: tokenCount.totalTokens,
      };
    } catch (error) {
      // Fallback to estimation if token counting fails
      const characters = text.length;
      const words = text.split(/\s+/).filter((word) => word.length > 0).length;
      const tokens = Math.ceil(characters / 4);

      await logger.warn(
        `Failed to get exact token count, using estimation: ${error instanceof Error ? error.message : String(error)}`,
      );

      return { characters, words, tokens };
    }
  }

  private calculateTtsCost(characters: number, useWaveNet: boolean): number {
    const charactersPerMillion = 1000000;
    const standardRate = 4.0 / charactersPerMillion; // $4 per 1 million characters for Standard voices
    const wavenetRate = 16.0 / charactersPerMillion; // $16 per 1 million characters for WaveNet voices

    const costPerCharacter = useWaveNet ? wavenetRate : standardRate;
    return characters * costPerCharacter;
  }

  async calculatePricing(
    text: string,
    responses: string[] = [],
    conversations?: ConversationPart[],
  ): Promise<PricingDetails> {
    // Initialize the Gen AI Model
    const model = this.vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    try {
      // Validate inputs
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Invalid input text: Expected a non-empty string.");
      }

      if (!Array.isArray(responses)) {
        throw new Error(
          "Invalid responses data: Expected an array of response strings.",
        );
      }

      if (conversations && !Array.isArray(conversations)) {
        throw new Error(
          "Invalid conversations data: Expected an array of conversation parts.",
        );
      }

      await logger.info([
        "\n\n======= Starting Pricing Calculation =======",
        `Input text length: ${text.length}`,
        `Number of responses: ${responses.length}`,
      ]);

      // Calculate input tokens
      const inputTokenCount = await model.countTokens({
        contents: [{ role: "user", parts: [{ text }] }],
      });
      if (!inputTokenCount || typeof inputTokenCount.totalTokens !== "number") {
        throw new Error("Invalid token count response for input text.");
      }

      // Calculate system prompt tokens
      const systemPromptsText = Object.values(SYSTEM_PROMPTS).join("\n");
      const systemTokenCount = await model.countTokens({
        contents: [{ role: "system", parts: [{ text: systemPromptsText }] }],
      });
      if (
        !systemTokenCount ||
        typeof systemTokenCount.totalTokens !== "number"
      ) {
        throw new Error("Invalid token count response for system prompts.");
      }

      const totalInputTokens =
        inputTokenCount.totalTokens + systemTokenCount.totalTokens;

      await logger.debug(`
        Input text length: ${text.length}
        Input token count: ${inputTokenCount.totalTokens}
        System prompt length: ${systemPromptsText.length}
        System token count: ${systemTokenCount.totalTokens}
        Total input tokens: ${totalInputTokens}
      `);

      // Process responses for output tokens
      let totalOutputTokens = 0;

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];

        if (
          !response ||
          typeof response !== "string" ||
          response.trim().length === 0
        ) {
          throw new Error(
            `Invalid response at index ${i}: Expected a non-empty string.`,
          );
        }

        const outputTokenCount = await model.countTokens({
          contents: [{ role: "assistant", parts: [{ text: response }] }],
        });

        if (
          !outputTokenCount ||
          typeof outputTokenCount.totalTokens !== "number"
        ) {
          throw new Error(`Invalid token count for response ${i + 1}.`);
        }

        totalOutputTokens += outputTokenCount.totalTokens;

        await logger.debug(
          `Response ${i + 1} details:\n` +
            `- Length: ${response.length} characters\n` +
            `- Output tokens: ${outputTokenCount.totalTokens}`,
        );
      }

      // Calculate total TTS characters based on conversations
      const totalTtsCharacters = conversations
        ? conversations.reduce(
            (sum, part) => sum + part.speaker.length + 2 + part.text.length,
            0,
          )
        : 0;

      await logger.debug(
        `Total TTS characters calculated: ${totalTtsCharacters}`,
      );

      // Calculate costs
      const inputCost = (totalInputTokens / 1000) * PRICING.INPUT_TOKEN_RATE;
      const outputCost = (totalOutputTokens / 1000) * PRICING.OUTPUT_TOKEN_RATE;
      const ttsCost = totalTtsCharacters * PRICING.TTS_RATE_WAVENET;

      const totalCost = inputCost + outputCost + ttsCost;

      await logger.info(
        `\n--- Pricing Calculation Summary ---\n` +
          `Total Input Tokens: ${totalInputTokens}\n` +
          `Total Output Tokens: ${totalOutputTokens}\n` +
          `Total TTS Characters: ${totalTtsCharacters}\n` +
          `Vertex AI Input Cost: $${inputCost.toFixed(6)}\n` +
          `Vertex AI Output Cost: $${outputCost.toFixed(6)}\n` +
          `TTS Cost: $${ttsCost.toFixed(4)}\n` +
          `Total Cost: $${totalCost.toFixed(4)}`,
      );

      return {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedOutputTokens: totalOutputTokens, // For backwards compatibility
        ttsCharacters: totalTtsCharacters,
        totalCost: totalCost,
        breakdown: {
          inputCost,
          outputCost,
          ttsCost,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.error(`Error calculating pricing: ${errorMessage}`);
      throw new Error(`Pricing calculation failed: ${errorMessage}`);
    }
  }

  private async cleanGeneratedText(
    rawText: string,
  ): Promise<ConversationPart[]> {
    if (!rawText || typeof rawText !== "string") {
      throw new Error("Invalid input: rawText must be a non-empty string");
    }

    try {
      const conversation: ConversationPart[] = [];
      const lines = rawText
        .split("\n")
        .filter((line) => line.trim().length > 0);

      await logger.debug(`Processing ${lines.length} lines of text`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Enhanced regex to handle various markdown formats
        const match = line.match(
          /^(?:\*?\*?|\*\*)?([A-Za-z]+)(?:\*?\*?|\*\*)?\s*:\s*(.+)$/,
        );

        if (match) {
          const [, speakerName, dialogue] = match;
          const trimmedSpeaker = speakerName.trim();
          const trimmedDialogue = dialogue.trim();

          if (!trimmedDialogue) {
            await logger.debug(`Empty dialogue found at line ${i + 1}`);
            continue;
          }

          if (trimmedSpeaker !== "Joe" && trimmedSpeaker !== "Sarah") {
            await logger.debug(
              `Invalid speaker "${trimmedSpeaker}" at line ${i + 1}`,
            );
            continue;
          }

          conversation.push({
            speaker: trimmedSpeaker as Speaker,
            text: trimmedDialogue,
          });

          await logger.debug(
            `Added conversation part: ${trimmedSpeaker} with ${trimmedDialogue.substring(0, 50)}...`,
          );
        } else {
          await logger.debug(
            `No speaker pattern match found at line ${i + 1}: "${line.substring(0, 50)}..."`,
          );
        }
      }

      if (conversation.length === 0) {
        throw new Error(
          "No valid conversation parts found in the generated text",
        );
      }

      await logger.info(
        `Successfully extracted ${conversation.length} conversation parts`,
      );
      return conversation;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.error(
        `Failed to process conversation text: ${errorMessage}`,
      );
      throw new Error(`Failed to process conversation text: ${errorMessage}`);
    }
  }

  private async synthesizeSpeechMultiSpeaker(
    turns: Array<{ text: string; speaker: string }>,
    index: number,
  ): Promise<string> {
    const outputFile = path.join("audio-files", `${index}.mp3`);

    try {
      const request = {
        input: {
          ssml: `<speak>${turns
            .map(
              (turn) =>
                `<voice name="${turn.speaker === "Joe" ? SPEAKER_VOICE_MAP.Joe : SPEAKER_VOICE_MAP.Sarah}">
              ${turn.text}
            </voice>`,
            )
            .join("\n")}</speak>`,
        },
        voice: {
          languageCode: "en-US",
        },
        audioConfig: {
          audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
        },
      };

      // Perform the text-to-speech request
      const [response] = await this.ttsClient.synthesizeSpeech(request);

      // Ensure the directory exists
      await fs.mkdir("audio-files", { recursive: true });

      if (!response.audioContent) {
        throw new Error("No audio content received from Text-to-Speech API");
      }

      // Write the synthesized audio to the specified file
      await fs.writeFile(outputFile, response.audioContent);
      await logger.info(`Audio content written to file "${outputFile}"`);

      // Return the file path of the generated speech
      return outputFile;
    } catch (error) {
      throw new Error(
        `Failed to synthesize speech: ${error instanceof Error ? error.message : String(error)}`,
      );
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
      const allFilePaths: string[] = [];
      const rootIntroPath = path.resolve("podcast.mp3");
      const audioFolderIntroPath = path.resolve(audioFolder, "podcast.mp3");

      // Add intro file if it exists
      try {
        await fs.copyFile(rootIntroPath, audioFolderIntroPath);
        allFilePaths.push(audioFolderIntroPath);
        await logger.info("Copied intro file podcast.mp3 to audio folder");
      } catch {
        await logger.warn("Intro file podcast.mp3 not found in root directory");
      }

      // Read and sort audio files based on their numeric order
      const files = await fs.readdir(audioFolder);
      const audioFiles = files
        .filter(
          (file) =>
            file.endsWith(".mp3") &&
            !file.includes("final_output") &&
            file !== "podcast.mp3",
        )
        .sort((a, b) => {
          // Extract numeric order for sorting
          const aMatch = a.match(/_(\d+)\.mp3$/);
          const bMatch = b.match(/_(\d+)\.mp3$/);
          const aNum = aMatch ? parseInt(aMatch[1], 10) : 0;
          const bNum = bMatch ? parseInt(bMatch[1], 10) : 0;
          return aNum - bNum;
        });

      if (audioFiles.length === 0) {
        throw new Error("No audio files found to merge");
      }

      // Log sorted file order for debugging
      await logger.info("Merging the following files in order:");
      audioFiles.forEach((file) => logger.info(file));

      // Add sorted audio files to the file paths array
      allFilePaths.push(
        ...audioFiles.map((file) => path.resolve(audioFolder, file)),
      );

      // Re-encode all files to ensure compatibility (constant bitrates, same sample rate)
      const reencodedFiles = [];
      for (let i = 0; i < allFilePaths.length; i++) {
        const inputFilePath = allFilePaths[i];
        const reencodedFilePath = path.resolve(audioFolder, `temp_${i}.mp3`);

        execSync(
          `ffmpeg -y -i "${inputFilePath}" -acodec libmp3lame -ar 44100 -b:a 192k "${reencodedFilePath}"`,
        );
        reencodedFiles.push(reencodedFilePath);
      }

      // Create a concat list file for FFmpeg
      const concatFilePath = path.resolve(audioFolder, "concat_list.txt");
      const concatFileContent = reencodedFiles
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fs.writeFile(concatFilePath, concatFileContent, "utf8");

      // Merge all audio files using FFmpeg
      const outputFilePath = path.resolve(outputFile);
      const command = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputFilePath}"`;

      execSync(command, { stdio: "pipe" });
      await logger.info(`Successfully merged audio saved as ${outputFile}`);

      // Clean up temporary files
      try {
        await fs.unlink(concatFilePath);
        for (const file of reencodedFiles) {
          await fs.unlink(file);
        }
      } catch (cleanupError) {
        await logger.warn(
          `Failed to clean up temporary files: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
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

  async generateConversation(text: string): Promise<{
    audioBuffer: Buffer;
    duration: number;
    usage: PricingDetails;
  }> {
    try {
      // Ensure audio-files directory exists and is empty
      const audioDir = "audio-files";
      try {
        await fs.rm(audioDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore error if directory doesn't exist
      }
      await fs.mkdir(audioDir, { recursive: true });

      // Initialize conversation tracking
      const allConversations: ConversationPart[] = [];
      let lastResponse = "";
      let speakerIndex = 0;

      // Initialize progress tracking
      this.emitProgress(0);
      await logger.info("\n--- Starting Conversation Generation ---\n");

      const model = this.vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash-002",
      }) as GenerativeModel;

      const chunks = this.splitTextIntoChunks(text);
      let responseTexts: string[] = []; // Moved initialization here

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

          // add the response to the array
          responseTexts.push(rawText);

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

      // Calculate pricing using all generated responses
      const usage = await this.calculatePricing(
        text, //text extracted from the article
        responseTexts, // response text array for each chunk
        allConversations, // cleaned out conversation array for each chunk
      );

      if (!usage) {
        throw new Error('Failed to calculate final usage details');
      }

      await logger.info(
        `Final usage calculation completed: $${usage.totalCost.toFixed(4)}`,
      );

        // Log the breakdown of total costs
      await logger.info(
        `Total cost breakdown:\n` +
          `Total input cost: $${usage.breakdown.inputCost.toFixed(4)}\n` +
          `Total output cost: $${usage.breakdown.outputCost.toFixed(4)}\n` +
          `Total TTS cost: $${usage.breakdown.ttsCost.toFixed(4)}`,
      );

      // Generate audio for each conversation part
      await logger.log("Generating audio files...");
      const audioFiles: string[] = [];

      for (let i = 0; i < allConversations.length; i++) {
        const { speaker, text } = allConversations[i];

        // Generate the MultiSpeak
        const audioFile = await this.synthesizeSpeech(text, speaker, i);

        audioFiles.push(audioFile);

        // Update progress for audio generation (50-100%)
        this.emitProgress(50 + ((i + 1) / allConversations.length) * 50);
      }

      //Merge audio files
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

      return {
        audioBuffer,
        duration: approximateDuration,
        usage,
      };
    } catch (error) {
      await logger.log(
        `Error generating conversation: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

export const ttsService = new TTSService();