import { VertexAI, GenerativeModel } from "@google-cloud/vertexai";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
import { promisify } from "util";
import { logger } from "./logging";
import path from "path";
import fs from "fs/promises";
import * as util from "util";
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

interface PricingDetails {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    ttsCost: number;
  };
}

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

  async calculatePricing(text: string): Promise<PricingDetails> {
    // Gen AI Model
    const model = this.vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    try {
      await logger.info("Starting pricing calculation");

      // Calculate initial input tokens
      const inputTokenCount = await model.countTokens({
        contents: [{ role: "user", parts: [{ text }] }],
      }).catch(error => {
        throw new Error(`Failed to count input tokens: ${error.message}`);
      });

      // Calculate prompt tokens (including system prompts)
      const systemPromptsText = Object.values(SYSTEM_PROMPTS).join("\n");
      const systemTokenCount = await model.countTokens({
        contents: [{ role: "system", parts: [{ text: systemPromptsText }] }],
      }).catch(error => {
        throw new Error(`Failed to count system tokens: ${error.message}`);
      });

      const totalInputTokens =
        inputTokenCount.totalTokens + systemTokenCount.totalTokens;

      await logger.info(`Input tokens calculated: ${totalInputTokens}`);

      // Generate a sample response with a smaller context for pricing estimation
      const maxSampleLength = 1000;
      const samplePrompt = `${SYSTEM_PROMPTS.MAIN}\n\n${text.slice(0, maxSampleLength)}`;
      
      await logger.info("Generating sample response for estimation");
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: samplePrompt }] }],
        generationConfig: {
          ...GENERATION_CONFIG,
          maxOutputTokens: 300, // Limit output for estimation
        },
      }).catch(error => {
        throw new Error(`Failed to generate sample response: ${error.message}`);
      });

      const rawText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("No valid response content received from model");
      }

      await logger.info("Sample response generated successfully");

      // Calculate output tokens from the sample response
      const outputTokenCount = await model.countTokens({
        contents: [{ role: "assistant", parts: [{ text: rawText }] }],
      }).catch(error => {
        throw new Error(`Failed to count output tokens: ${error.message}`);
      });

      // Calculate sampling ratio based on input text length
      const samplingRatio = Math.max(1, text.length / maxSampleLength);
      const estimatedTotalOutputTokens = Math.ceil(outputTokenCount.totalTokens * samplingRatio);

      await logger.info(`Output tokens estimated: ${estimatedTotalOutputTokens}`);

      // Process sample conversation parts to estimate TTS characters
      const sampleConversationParts = await this.cleanGeneratedText(rawText);
      if (sampleConversationParts.length === 0) {
        throw new Error("Failed to parse conversation parts from sample response");
      }

      const totalSampleChars = sampleConversationParts.reduce((sum, part) => {
        // Count speaker prefix (e.g., "Joe: " or "Sarah: ") plus the text
        return sum + part.speaker.length + 2 + part.text.length;
      }, 0);

      const avgCharsPerTurn = totalSampleChars / sampleConversationParts.length;
      const estimatedTurns = Math.ceil((text.length / maxSampleLength) * sampleConversationParts.length);
      const ttsCharacters = Math.ceil(avgCharsPerTurn * estimatedTurns);

      await logger.info(`TTS characters estimated: ${ttsCharacters}`);

      // Calculate costs with rate limiting protection
      const inputCost = (totalInputTokens / 1000) * PRICING.INPUT_TOKEN_RATE;
      const outputCost = (estimatedTotalOutputTokens / 1000) * PRICING.OUTPUT_TOKEN_RATE;
      const ttsCost = ttsCharacters * PRICING.TTS_RATE_STANDARD;

      const totalCost = inputCost + outputCost + ttsCost;

      // Detailed logging of pricing calculation results
      await logger.info(
        `\n--- Pricing Details ---\n` +
          `Base Input Tokens: ${inputTokenCount.totalTokens}\n` +
          `System Prompt Tokens: ${systemTokenCount.totalTokens}\n` +
          `Total Input Tokens: ${totalInputTokens}\n` +
          `Sample Output Tokens: ${outputTokenCount.totalTokens}\n` +
          `Estimated Total Output Tokens: ${estimatedTotalOutputTokens}\n` +
          `Estimated TTS Characters: ${ttsCharacters}\n` +
          `Input Cost: $${inputCost.toFixed(4)}\n` +
          `Output Cost: $${outputCost.toFixed(4)}\n` +
          `TTS Cost: $${ttsCost.toFixed(4)}\n` +
          `Total Cost: $${totalCost.toFixed(4)}\n`,
      );

      const pricingDetails: PricingDetails = {
        inputTokens: totalInputTokens,
        estimatedOutputTokens: estimatedTotalOutputTokens,
        totalCost,
        breakdown: {
          inputCost,
          outputCost,
          ttsCost,
        },
      };

      await logger.info("Pricing calculation completed successfully");
      return pricingDetails;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logger.error(`Error calculating pricing: ${errorMessage}`);
      
      // Add additional context to the error
      throw new Error(`Failed to calculate pricing: ${errorMessage}`);
    }
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
    usage: { inputTokens: number; outputTokens: number; ttsCharacters: number };
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

      // Split text into manageable chunks
      this.analyzeText(text);
      const allConversations: ConversationPart[] = [];
      let lastResponse = "";
      let speakerIndex = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTtsCharacters = 0;

      // Initialize progress tracking
      this.emitProgress(0);
      await logger.info("\n--- Starting Conversation Generation ---\n");

      const model = this.vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash-002",
      }) as GenerativeModel;

      // Calculate the cost estimation for this conversation
      const pricingDetails = await this.calculatePricing(text);
      const ttsCost = pricingDetails.totalCost;

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

          // Calculate input tokens
          const promptTokenCount = await model.countTokens({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          });
          totalInputTokens += promptTokenCount.totalTokens;

          // Generate content using Vertex AI
          const result = (await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: GENERATION_CONFIG,
          })) as GenerationResult;

          // Calculate output tokens if response exists
          if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const outputTokenCount = await model.countTokens({
              contents: [
                {
                  role: "assistant",
                  parts: [
                    {
                      text: result.response.candidates[0].content.parts[0].text,
                    },
                  ],
                },
              ],
            });
            totalOutputTokens += outputTokenCount.totalTokens;
          }

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

      // Variables to track the total cost
      let totalCost = 0;
      const useWaveNet = false; // Set to true if you are using WaveNet voices

      // Generate audio for each conversation part
      await logger.log("Generating audio files...");
      const audioFiles: string[] = [];

      for (let i = 0; i < allConversations.length; i++) {
        const { speaker, text } = allConversations[i];

        // Calculate the number of characters in the text
        const numCharacters = text.length;
        totalTtsCharacters += numCharacters;

        // Calculate the cost for generating this audio
        const cost = this.calculateTtsCost(numCharacters, useWaveNet);

        // Add to the total cost
        totalCost += cost;

        // Log the cost for each part (optional)
        await logger.log(
          `Cost for part ${i + 1} (Speaker: ${speaker}): $${cost.toFixed(4)}`,
        );

        // Generate the MultiSpeak
        const audioFile = await this.synthesizeSpeech(text, speaker, i);

        audioFiles.push(audioFile);

        // Update progress for audio generation (50-100%)
        this.emitProgress(50 + ((i + 1) / allConversations.length) * 50);
      }

      //Log the total cost after all conversations are processed
      await logger.log(`\n--- Total TTS Cost ---`);
      await logger.log(
        `Total cost for audio generation: $${totalCost.toFixed(4)}`,
      );

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

      await logger.info(`\n--- Usage Statistics ---
        Input Tokens: ${totalInputTokens}
        Output Tokens: ${totalOutputTokens}
        TTS Characters: ${totalTtsCharacters}
        Total Cost: $${totalCost.toFixed(4)}\n`);

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
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          ttsCharacters: totalTtsCharacters,
        },
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