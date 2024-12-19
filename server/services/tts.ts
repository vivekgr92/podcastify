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

  async calculatePricing(
    text: string,
    responses: string[] = [],
    conversations: ConversationPart[] = []
  ): Promise<PricingDetails> {
    // Gen AI Model
    const model = this.vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    try {
      await logger.info([
        "\n--- Starting Pricing Calculation ---",
        `Input text length: ${text.length}`,
        `Number of responses: ${responses.length}`
      ]);

      // Validate input text
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid input text: Expected non-empty string');
      }

      // Calculate initial input tokens
      let inputTokenCount;
      try {
        inputTokenCount = await model.countTokens({
          contents: [{ role: "user", parts: [{ text }] }],
        });
        if (!inputTokenCount || typeof inputTokenCount.totalTokens !== 'number') {
          throw new Error('Invalid token count response from model');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error(`Failed to count input tokens: ${errorMessage}`);
        throw new Error(`Failed to count input tokens: ${errorMessage}`);
      }

      // Calculate prompt tokens (including system prompts)
      const systemPromptsText = Object.values(SYSTEM_PROMPTS).join("\n");
      let systemTokenCount;
      try {
        systemTokenCount = await model.countTokens({
          contents: [{ role: "system", parts: [{ text: systemPromptsText }] }],
        });
        if (!systemTokenCount || typeof systemTokenCount.totalTokens !== 'number') {
          throw new Error('Invalid token count response for system prompts');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error(`Failed to count system tokens: ${errorMessage}`);
        throw new Error(`Failed to count system tokens: ${errorMessage}`);
      }

      const totalInputTokens =
        inputTokenCount.totalTokens + systemTokenCount.totalTokens;

      await logger.info(`Base input tokens calculated: ${totalInputTokens}`);

      // Process all responses to calculate total output tokens and TTS characters
      let totalOutputTokens = 0;
      let totalTtsCharacters = 0;
      
      // Validate responses array
      if (!Array.isArray(responses)) {
        throw new Error('Invalid responses data: Expected an array of response strings');
      }

      // Validate conversations array and create a deep copy if provided
      let validatedConversations: ConversationPart[] = [];
      if (conversations && Array.isArray(conversations)) {
        validatedConversations = conversations.map((conv, index) => {
          if (!conv || typeof conv !== 'object') {
            throw new Error(`Invalid conversation object at index ${index}`);
          }
          if (!conv.speaker || typeof conv.speaker !== 'string' || !['Joe', 'Sarah'].includes(conv.speaker)) {
            throw new Error(`Invalid speaker at index ${index}: ${conv.speaker}`);
          }
          if (!conv.text || typeof conv.text !== 'string' || !conv.text.trim()) {
            throw new Error(`Invalid text at index ${index}`);
          }
          return { speaker: conv.speaker as Speaker, text: conv.text };
        });

        await logger.info(`Validated ${validatedConversations.length} conversation parts`);
      }

      const validResponses = responses.filter(response => typeof response === 'string' && response.trim().length > 0);
      if (responses.length > 0 && validResponses.length === 0) {
        throw new Error('All provided responses are invalid: Expected non-empty strings');
      }

      // Log response validation details
      await logger.info([
        `Response validation results:`,
        `- Total responses provided: ${responses.length}`,
        `- Valid responses found: ${validResponses.length}`,
        `- Sample of first valid response: ${validResponses[0]?.substring(0, 100)}...`
      ]);

      await logger.debug(`Response validation details: ${JSON.stringify({
        totalResponses: responses.length,
        validResponses: validResponses.length,
        invalidResponses: responses.length - validResponses.length,
        firstValidResponseLength: validResponses[0]?.length || 0
      }, null, 2)}`);

      await logger.info(`Processing ${validResponses.length} valid responses for token counting`);

      // Validate conversations array
      if (!Array.isArray(conversations)) {
        throw new Error('Invalid conversations data: Expected an array of conversation parts');
      }
      
      // If we have pre-processed conversations, use them for TTS character calculation
      if (conversations.length > 0) {
        await logger.info(`Processing ${conversations.length} conversation parts for TTS calculation`);
        
        // Validate conversation structure before processing
        const invalidParts = conversations.filter(part => 
          !part || 
          typeof part !== 'object' || 
          !part.speaker || 
          !part.text ||
          typeof part.speaker !== 'string' ||
          typeof part.text !== 'string'
        );
        
        if (invalidParts.length > 0) {
          const error = new Error('Invalid conversation structure detected');
          await logger.error([
            'Invalid conversation parts found:',
            `Total invalid parts: ${invalidParts.length}`,
            'First invalid part:',
            JSON.stringify(invalidParts[0], null, 2)
          ]);
          throw error;
        }

        totalTtsCharacters = conversations.reduce((sum, part, index) => {
          const partCharacters = part.speaker.length + 2 + part.text.length;
          logger.debug(`Conversation part ${index}: ${partCharacters} characters (${part.speaker}: ${part.text.substring(0, 50)}...)`);
          return sum + partCharacters;
        }, 0);
        
        await logger.info(`Calculated total TTS characters from conversations: ${totalTtsCharacters}`);
      }

      // Calculate output tokens from responses if available, otherwise estimate
      if (responses.length === 0) {
        // If no responses provided, estimate output tokens based on input
        totalOutputTokens = Math.ceil(totalInputTokens * 1.5); // Estimate 1.5x input tokens for output
        await logger.info(`No responses provided. Estimating output tokens: ${totalOutputTokens}`);

        // Only estimate TTS characters if we don't have conversations
        if (totalTtsCharacters === 0) {
          totalTtsCharacters = Math.ceil(totalOutputTokens * 4); // Rough estimate: 4 characters per token
          await logger.info(`No conversations available. Estimating TTS characters: ${totalTtsCharacters}`);
        }
      } else {
        // Process actual responses
        for (let i = 0; i < validResponses.length; i++) {
          const response = validResponses[i];
          
          await logger.debug([
            `Processing response ${i + 1}/${validResponses.length}:`,
            `- Response length: ${response.length}`,
            `- Current total output tokens: ${totalOutputTokens}`,
            `- Current total TTS characters: ${totalTtsCharacters}`
          ]);

          try {
            // Calculate output tokens for this response
            let outputTokenCount;
            try {
              outputTokenCount = await model.countTokens({
                contents: [{ role: "assistant", parts: [{ text: response }] }],
              });

              if (!outputTokenCount || typeof outputTokenCount.totalTokens !== 'number') {
                throw new Error(`Invalid token count response from model for response ${i + 1}`);
              }

              totalOutputTokens += outputTokenCount.totalTokens;
              await logger.debug([
                `Response ${i + 1} token calculation:`,
                `- Response length: ${response.length}`,
                `- Output tokens: ${outputTokenCount.totalTokens}`,
                `- Running total tokens: ${totalOutputTokens}`
              ]);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await logger.error([
                `Failed to count tokens for response ${i + 1}:`,
                `- Error: ${errorMessage}`,
                `- Response sample: ${response.substring(0, 100)}...`
              ]);
              throw new Error(`Token counting failed for response ${i + 1}: ${errorMessage}`);
            }

            // Calculate TTS characters based on validated conversations if available
            if (validatedConversations.length > 0) {
              totalTtsCharacters = validatedConversations.reduce((sum, part) => {
                const partCharacters = part.speaker.length + 2 + part.text.length;
                return sum + partCharacters;
              }, 0);
              await logger.debug(`Using ${validatedConversations.length} pre-processed conversations for TTS calculation`);
            } else {
              // Fall back to calculating from response if no conversations provided
              const conversationParts = await this.cleanGeneratedText(response);
              const responseTtsCharacters = conversationParts.reduce((sum, part) => {
                return sum + part.speaker.length + 2 + part.text.length;
              }, 0);
              totalTtsCharacters += responseTtsCharacters;
              await logger.debug(`Calculated TTS characters from response ${i + 1}: ${responseTtsCharacters}`);
            }


            // Log response-specific details for debugging
            await logger.debug(
              `Response ${i + 1} details:\n` +
              `- Length: ${response.length} characters\n` +
              `- Output tokens: ${outputTokenCount.totalTokens}\n` +
              `- TTS characters: ${totalTtsCharacters}\n` +
              `- Valid conversation parts: ${conversations ? conversations.length : 0}`
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await logger.error(`Error processing response ${i + 1}: ${errorMessage}`);
            throw new Error(`Failed to process response ${i + 1}: ${errorMessage}`);
          }
        }

        await logger.info(
          `Successfully processed ${responses.length} responses:\n` +
          `- Total output tokens: ${totalOutputTokens}\n` +
          `- Total TTS characters: ${totalTtsCharacters}`
        );
      }

      // If no TTS characters calculated yet, estimate based on output tokens
      if (totalTtsCharacters === 0) {
        totalTtsCharacters = Math.ceil(totalOutputTokens * 4); // Rough estimate: 4 characters per token
        await logger.info(`Estimating TTS characters: ${totalTtsCharacters}`);
      }

      await logger.info(`Total output tokens calculated: ${totalOutputTokens}`);
      await logger.info(`Total TTS characters calculated: ${totalTtsCharacters}`);

      // Calculate costs based on total tokens and characters
      const inputCost = (totalInputTokens / 1000) * PRICING.INPUT_TOKEN_RATE;
      const outputCost = (totalOutputTokens / 1000) * PRICING.OUTPUT_TOKEN_RATE;
      const ttsCost = totalTtsCharacters * PRICING.TTS_RATE_STANDARD;

      const totalCost = inputCost + outputCost + ttsCost;

      // Detailed logging of final pricing calculation
      await logger.info(
        `\n--- Total Pricing Details ---\n` +
          `Base Input Tokens: ${inputTokenCount.totalTokens}\n` +
          `System Prompt Tokens: ${systemTokenCount.totalTokens}\n` +
          `Total Input Tokens: ${totalInputTokens}\n` +
          `Total Output Tokens: ${totalOutputTokens}\n` +
          `Total TTS Characters: ${totalTtsCharacters}\n` +
          `Input Cost: $${inputCost.toFixed(4)}\n` +
          `Output Cost: $${outputCost.toFixed(4)}\n` +
          `TTS Cost: $${ttsCost.toFixed(4)}\n` +
          `Total Cost: $${totalCost.toFixed(4)}\n`,
      );

      const pricingDetails: PricingDetails = {
        inputTokens: totalInputTokens,
        estimatedOutputTokens: totalOutputTokens,
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

          // Store and validate response for pricing calculation
          if (!rawText.trim()) {
            throw new Error(`Response ${index + 1} is empty or contains only whitespace`);
          }

          // Store response and update running totals
          responseTexts[index] = rawText;

          // Calculate token counts for this response
          const responseTokenCount = await model.countTokens({
            contents: [{ role: "assistant", parts: [{ text: rawText }] }],
          });

          if (!responseTokenCount || typeof responseTokenCount.totalTokens !== 'number') {
            throw new Error(`Invalid token count response for response ${index + 1}`);
          }

          totalOutputTokens += responseTokenCount.totalTokens;

          await logger.info([
            `Processed response ${index + 1}/${chunks.length}:`,
            `- Length: ${rawText.length} characters`,
            `- Tokens: ${responseTokenCount.totalTokens}`,
            `- Running total tokens: ${totalOutputTokens}`
          ].join('\n'));

          // Log response details for pricing calculation and token usage
          await logger.debug(`Response ${index + 1} details:\n` +
            `- Length: ${rawText.length} characters\n` +
            `- Response index: ${index}\n` +
            `- Total responses expected: ${chunks.length}\n` +
            `- Valid content: ${Boolean(rawText.trim())}\n` +
            `- Stored responses count: ${responseTexts.filter(Boolean).length}`
          );
          await logger.debug(`Response ${index + 1}/${chunks.length} text sample (first 100 chars): ${rawText.substring(0, 100)}`);
          await logger.debug(`Total responses collected so far: ${responseTexts.filter(Boolean).length}`);

          // Log response details for pricing calculation and token usage
          await logger.debug(`Response ${index + 1} details:\n` +
            `- Length: ${rawText.length} characters\n` +
            `- Response index: ${index}\n` +
            `- Total responses expected: ${chunks.length}\n` +
            `- Valid content: ${Boolean(rawText.trim())}\n` +
            `- Stored responses count: ${responseTexts.filter(Boolean).length}`
          );

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

      // Initialize variables for cost tracking and audio generation
      let pricingDetails: PricingDetails;
      let totalCost = 0;
      const useWaveNet = false; // Set to true if you are using WaveNet voices

      // Calculate pricing using all generated responses
      try {
        if (responseTexts.length === 0) {
          throw new Error("No valid responses were generated for pricing calculation");
        }

        await logger.info(`Calculating pricing using ${responseTexts.length} responses`);
        await logger.debug("Response texts available for pricing calculation");

        // Calculate pricing for all responses at once
        // Calculate pricing using both responses and conversations
        // Create a deep copy of allConversations to prevent mutation
        // Validate and create a safe copy of allConversations
        if (!Array.isArray(allConversations)) {
          throw new Error('Invalid conversations data: Expected an array of conversation parts');
        }

        // Create a deep copy with validation
        if (!Array.isArray(allConversations)) {
          throw new Error('Invalid conversations data: Expected an array of conversation parts');
        }

        // Create a deep copy with validation
        const conversationsCopy = allConversations.map((conv, index) => {
          if (!conv || typeof conv !== 'object') {
            throw new Error(`Invalid conversation object at index ${index}: Expected object, got ${typeof conv}`);
          }
          
          if (!conv.speaker || typeof conv.speaker !== 'string') {
            throw new Error(`Invalid speaker at index ${index}: Expected non-empty string, got ${typeof conv.speaker}`);
          }
          
          if (!conv.text || typeof conv.text !== 'string') {
            throw new Error(`Invalid text at index ${index}: Expected non-empty string, got ${typeof conv.text}`);
          }
          
          return {
            speaker: conv.speaker,
            text: conv.text
          };
        });

        if (conversationsCopy.length === 0) {
          throw new Error('No valid conversations found after validation');
        }

        await logger.info([
          'Conversation validation results:',
          `- Total conversations: ${allConversations.length}`,
          `- Valid conversations: ${conversationsCopy.length}`,
          `- First conversation sample: ${JSON.stringify(conversationsCopy[0], null, 2)}`
        ]);
        
        logger.info(`Successfully created safe copy of ${conversationsCopy.length} conversations for pricing calculation`);
        
        pricingDetails = await this.calculatePricing(
          text,
          responseTexts.filter(Boolean), // Filter out any empty responses
          conversationsCopy
        );
        totalCost = pricingDetails.totalCost;
        
        await logger.info(`Total pricing calculation completed: $${totalCost.toFixed(4)}`);

        // Log the breakdown of total costs
        await logger.info(
          `Total cost breakdown:\n` +
          `Total input cost: $${pricingDetails.breakdown.inputCost.toFixed(4)}\n` +
          `Total output cost: $${pricingDetails.breakdown.outputCost.toFixed(4)}\n` +
          `Total TTS cost: $${pricingDetails.breakdown.ttsCost.toFixed(4)}`
        );
      } catch (error) {
        await logger.error(`Failed to calculate total pricing: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error("Failed to calculate total pricing. Please try again.");
      }

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