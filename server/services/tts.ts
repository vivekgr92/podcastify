import { VertexAI } from "@google-cloud/vertexai";
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

const SPEAKERS: Speaker[] = ["Joe", "Sarah"];

// Voice mapping for different speakers
const SPEAKER_VOICE_MAP = {
  Joe: "en-US-Wavenet-D",  // Male voice
  Sarah: "en-US-Wavenet-F" // Female voice
};

// System prompts for different stages of conversation
const SYSTEM_PROMPTS = {
  WELCOME: `Welcome to Science Odyssey, the podcast where we journey through groundbreaking scientific studies,
unraveling the mysteries behind the research that shapes our world. Thanks for tuning in!`,
  
  MAIN: `You are generating a podcast conversation between Joe and Sarah.

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

  FAREWELL: `Thank you for joining us on this episode of Science Odyssey, where we explored the groundbreaking research shaping our understanding of the world. 
If you enjoyed this journey, don't forget to subscribe, leave a review, and share the podcast with fellow science enthusiasts.
Until next time, keep exploring the wonders of science—your next discovery awaits!`
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
    Array.from(this.progressListeners).forEach(listener => {
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

  private async synthesizeSpeech(text: string, speaker: Speaker, index: number): Promise<string> {
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
      await logger.log(`Audio content written to file "${outputFile}"`);

      return outputFile;
    } catch (error) {
      throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async mergeAudioFiles(audioFolder: string, outputFile: string): Promise<void> {
    try {
      const files = await fs.readdir(audioFolder);
      const audioFiles = files
        .filter(file => file.endsWith(".mp3"))
        .sort((a, b) => {
          const aIndex = parseInt(a.match(/(\d+)/)?.[0] || "0");
          const bIndex = parseInt(b.match(/(\d+)/)?.[0] || "0");
          return aIndex - bIndex;
        });

      const filePaths = audioFiles.map(file => path.join(audioFolder, file));
      const command = `ffmpeg -i "concat:${filePaths.join("|")}" -acodec copy ${outputFile}`;
      
      execSync(command);
      await logger.log(`Merged audio saved as ${outputFile}`);
    } catch (error) {
      throw new Error(`Failed to merge audio files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private cleanGeneratedText(rawText: string): ConversationPart[] {
    try {
      const data = JSON.parse(rawText);
      const conversation: ConversationPart[] = [];
      
      if ("podcastConversation" in data) {
        for (const entry of data.podcastConversation) {
          const speaker = entry.speaker as Speaker;
          const dialogue = entry.dialogue?.trim();
          if (speaker && dialogue && SPEAKERS.includes(speaker)) {
            conversation.push({ speaker, text: dialogue });
          }
        }
      }
      
      return conversation;
    } catch (error) {
      throw new Error(`Failed to parse conversation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateConversation(text: string): Promise<{ audioBuffer: Buffer; duration: number }> {
    try {
      const chunks = this.splitTextIntoChunks(text);
      let allConversations: ConversationPart[] = [];
      let lastResponse = "";
      let speakerIndex = 0;

      // Initialize progress tracking
      this.emitProgress(0);
      await logger.log("Starting conversation generation...");

      const model = this.vertexAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const currentSpeaker = SPEAKERS[speakerIndex];
        
        try {
          // Construct prompt based on chunk position
          let prompt = "";
          if (index === 0) {
            prompt = `${SYSTEM_PROMPTS.WELCOME}\n\n${SYSTEM_PROMPTS.MAIN}\n\nJoe: ${chunk}\n\nSarah:`;
            speakerIndex = 0;
          } else if (index === chunks.length - 1) {
            prompt = `${SYSTEM_PROMPTS.MAIN}\n\n${lastResponse}\n\n${currentSpeaker}: ${chunk}\n\n${SYSTEM_PROMPTS.FAREWELL}`;
          } else {
            prompt = `${SYSTEM_PROMPTS.MAIN}\n\n${lastResponse}\n\n${currentSpeaker}: ${chunk}`;
          }

          await logger.log("\n=== PROMPT TO VERTEX AI ===\n");
          await logger.log(prompt);
          await logger.log("\n=== END PROMPT ===\n");

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 1200,
              temperature: 0.7,
              topP: 0.95,
            },
          });

          const response = result.response;
          if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error("Invalid response from Vertex AI");
          }

          const conversationParts = this.cleanGeneratedText(response.candidates[0].content.parts[0].text);
          allConversations.push(...conversationParts);

          if (conversationParts.length > 0) {
            lastResponse = conversationParts[conversationParts.length - 1].text;
            speakerIndex = (speakerIndex + 1) % 2;
          }

          // Update progress
          this.emitProgress(((index + 1) / chunks.length) * 50);
        } catch (error) {
          await logger.log(`Error processing chunk ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }

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
      const totalCharacters = allConversations.reduce((sum, part) => sum + part.text.length, 0);
      const approximateDuration = Math.ceil(totalCharacters / 20); // Rough estimate: 20 characters per second

      this.emitProgress(100);
      return { audioBuffer, duration: approximateDuration };
    } catch (error) {
      await logger.log(`Error generating conversation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

export const ttsService = new TTSService();
