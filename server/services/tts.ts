import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { VertexAI } from "@google-cloud/vertexai";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
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

// Moved cleanGeneratedText inside TTSService class

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_IDS: Record<Speaker, string> = {
  Joe: "IKne3meq5aSn9XLyUdCD",
  Sarah: "21m00Tcm4TlvDq8ikWAM",
};

const GOOGLE_VOICE_IDS: Record<Speaker, string> = {
  Joe: "en-US-Neural2-D",
  Sarah: "en-US-Neural2-F",
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
  private ttsClient: TextToSpeechClient;
  private progressListeners: Set<(progress: number) => void>;

  constructor() {
    this.ttsClient = new TextToSpeechClient();
    this.progressListeners = new Set();
  }

  /**
   * Processes the raw text from Vertex AI response and converts it into structured conversation entries.
   * This method handles the parsing of the conversation between Joe and Sarah, maintaining the 
   * proper speaker attribution and text content.
   * 
   * @param rawText - The unprocessed text response from Vertex AI containing the conversation
   * @returns Array of ConversationEntry objects, each containing a speaker and their dialogue
   * 
   * Key features:
   * - Splits text into lines and processes each line individually
   * - Identifies speaker changes using "Joe:" or "Sarah:" markers
   * - Combines multi-line dialogue for the same speaker
   * - Skips special markers and empty lines
   * - Handles error cases gracefully
   */
  private cleanGeneratedText(rawText: string): ConversationEntry[] {
    try {
      const lines = rawText.split('\n');
      const conversation: ConversationEntry[] = [];
      let currentSpeaker = '';
      let currentText = '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines and special markers
        if (!trimmedLine || trimmedLine.startsWith('**') || trimmedLine.startsWith('--')) {
          continue;
        }

        // Check for speaker markers
        const speakerMatch = trimmedLine.match(/^(Joe|Sarah):/);
        if (speakerMatch && speakerMatch[1]) {
          // If we have previous content, save it
          if (currentSpeaker && currentText) {
            conversation.push({
              speaker: currentSpeaker as "Joe" | "Sarah",
              text: currentText.trim()
            });
          }
          
          // Start new speaker section
          currentSpeaker = speakerMatch[1] as "Joe" | "Sarah";
          currentText = trimmedLine.substring(speakerMatch[0].length).trim();
        } else if (currentSpeaker) {
          // Append to current text if we have a speaker
          currentText += ' ' + trimmedLine;
        }
      }

      // Add the last entry if exists
      if (currentSpeaker && currentText) {
        conversation.push({
          speaker: currentSpeaker as "Joe" | "Sarah",
          text: currentText.trim()
        });
      }

      return conversation;
    } catch (error) {
      console.error('Error parsing text:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  addProgressListener(listener: (progress: number) => void) {
    this.progressListeners.add(listener);
  }

  removeProgressListener(listener: (progress: number) => void) {
    this.progressListeners.delete(listener);
  }

  private emitProgress(progress: number) {
    this.progressListeners.forEach(listener => listener(progress));
  }

  async synthesizeWithGoogle({
    text,
    speaker,
  }: {
    text: string;
    speaker: Speaker;
  }): Promise<Buffer> {
    console.log("Making Google TTS API request...");
    console.log("Speaker:", speaker);
    console.log("Text length:", text.length);

    try {
      // Validate text length before making the request
      const textBytes = new TextEncoder().encode(text).length;
      if (textBytes > 4800) {
        console.warn(`Text too long (${textBytes} bytes), truncating...`);
        text = text.substring(0, Math.floor(4800 / 2)) + "...";
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
      console.log("Google TTS API response received");

      if (!response.audioContent) {
        throw new Error("No audio content received from Google TTS");
      }

      return Buffer.from(response.audioContent);
    } catch (error) {
      console.error("Google TTS API error:", error);
      if (error instanceof Error && error.message.includes("longer than the limit")) {
        throw new Error("Text chunk too long for TTS. Please try with a shorter text.");
      }
      throw new Error(error instanceof Error ? error.message : "Failed to synthesize speech");
    }
  }

  async synthesizeWithElevenLabs({
    text,
    voiceId,
  }: ElevenLabsOptions): Promise<Buffer> {
    console.log("Making ElevenLabs API request...");
    console.log("Voice ID:", voiceId);
    console.log("Text length:", text.length);

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

      console.log("ElevenLabs API response received");
      console.log("Response status:", response.status);
      console.log("Response data size:", response.data.length);

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error("ElevenLabs API error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data ? error.response.data.toString() : null,
      });
      throw error;
    }
  }

  async generateConversation(
    text: string,
  ): Promise<{ audioBuffer: Buffer; duration: number }> {
    console.log("Starting text-to-speech conversion...");
    console.log("Input text length:", text.length);

    // Split text into smaller chunks to stay within token limits
    const chunks = this.splitTextIntoChunks(text);
    console.log("Split text into", chunks.length, "chunks");


    const conversationParts: Buffer[] = [];
    let lastResponse = "";
    const speakers = ["Joe", "Sarah"];
    let speakerIndex = 0;

    // Emit initial progress
    this.emitProgress(0);

    for (let index = 0; index < chunks.length; index++) {
      // Calculate and emit progress for chunk processing
      const chunkProgress = ((index + 0.5) / chunks.length) * 100;
      this.emitProgress(Math.min(chunkProgress, 99)); // Keep progress under 100% until complete

      const chunk = chunks[index];
      const currentSpeaker = speakers[speakerIndex];
      const nextSpeaker = speakers[(speakerIndex + 1) % 2];


      try {
        // Generate conversation prompt
        let prompt = `${SYSTEM_PROMPT}\n${currentSpeaker}: ${chunk}\n${nextSpeaker}:`;

        if (lastResponse) {
          prompt = `${SYSTEM_PROMPT}\nPrevious response: ${lastResponse}\n${prompt}`;
        }


        // Check for required environment variables
        if (!process.env.GOOGLE_CLOUD_PROJECT) {
          throw new Error(
            "GOOGLE_CLOUD_PROJECT environment variable is required",
          );
        }

        // Initialize Vertex AI with Google Cloud project
        const vertex_ai = new VertexAI({
          project: process.env.GOOGLE_CLOUD_PROJECT,
          location: "us-central1",
        });

        // Create Gemini model instance
        const model = vertex_ai.preview.getGenerativeModel({
          model: "gemini-1.0-pro",
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.7,
            topP: 0.95,
          },
        });

        console.log('\n============== PROMPT TO VERTEX AI ==============\n');
        console.log(prompt);
        console.log('\n==============================================\n');

        // Generate response using Gemini
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error("Invalid response from Vertex AI");
        }

        const rawResponse = result.response.candidates[0].content.parts[0].text;
        console.log('\n============== RAW VERTEX AI RESPONSE ==============\n');
        console.log(rawResponse);
        console.log('\n==============================================\n');
        
        // Clean and structure the response text
        const cleanedEntries = this.cleanGeneratedText(rawResponse);
        console.log('\n============== CLEANED CONVERSATION ENTRIES ==============\n');
        // Format each entry with line breaks between speakers
        cleanedEntries.forEach(entry => {
          console.log(`\n${entry.speaker}:\n${entry.text}\n`);
        });
        console.log('\n==============================================\n');
        
        // Combine all entries for the current speaker
        lastResponse = cleanedEntries
          .filter(entry => entry.speaker === currentSpeaker)
          .map(entry => entry.text)
          .join(' ');
        
        // Validate response length before proceeding
        const responseBytes = new TextEncoder().encode(lastResponse).length;
        if (responseBytes > 4800) {
          console.warn(`Response too long (${responseBytes} bytes), truncating...`);
          lastResponse = lastResponse.substring(0, Math.floor(4800 / 2)) + "...";
        }

        // Use Google TTS for synthesis
        const audioBuffer = await this.synthesizeWithGoogle({
          text: lastResponse,
          speaker: currentSpeaker as keyof typeof GOOGLE_VOICE_IDS,
        });

        console.log(`Generated audio buffer for chunk ${index + 1}`);
        conversationParts.push(audioBuffer);

        // Switch speaker for next iteration
        speakerIndex = (speakerIndex + 1) % 2;
      } catch (error) {
        console.error(`Error generating audio for chunk ${index + 1}:`, error);
        throw error;
      }
    }

    console.log("All chunks processed, combining audio parts...");
    // Combine all audio parts
    const combinedBuffer = Buffer.concat(conversationParts);
    console.log("Combined audio buffer size:", combinedBuffer.length);

    // Estimate duration (rough estimate: 1 second per 7 words)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 7);
    console.log("Estimated duration:", estimatedDuration, "seconds");

    return {
      audioBuffer: combinedBuffer,
      duration: estimatedDuration,
    };
  }

  /**
   * Splits input text into smaller chunks that can be processed by the TTS service.
   * This method ensures that each chunk stays within the byte limit while maintaining
   * sentence integrity where possible.
   * 
   * @param text - The input text to be split into chunks
   * @param maxBytes - Maximum size of each chunk in bytes (default: 4800)
   * @returns Array of text chunks, each within the specified byte limit
   * 
   * Key features:
   * - Splits text at sentence boundaries (.!?)
   * - Handles long sentences by breaking them into smaller parts
   * - Maintains word boundaries when splitting
   * - Ensures no chunk exceeds the byte limit
   * - Provides fallback truncation for extremely long segments
   */
  private splitTextIntoChunks(text: string, maxBytes: number = 4800): string[] {
    const sentences = text.split(/[.!?]+\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    const getByteLength = (str: string): number => {
      return new TextEncoder().encode(str).length;
    };

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const sentenceWithPunct = trimmedSentence + ". ";
      const sentenceLength = getByteLength(sentenceWithPunct);

      // If a single sentence is too long, split it into smaller parts
      if (sentenceLength > maxBytes) {
        // If we have accumulated content, save it first
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join(" "));
          currentChunk = [];
          currentLength = 0;
        }
        
        // Split the long sentence into smaller parts
        const words = sentenceWithPunct.split(/\s+/);
        let tempChunk: string[] = [];
        let tempLength = 0;
        
        for (const word of words) {
          const wordLength = getByteLength(word + " ");
          if (tempLength + wordLength > maxBytes) {
            if (tempChunk.length > 0) {
              chunks.push(tempChunk.join(" "));
              tempChunk = [];
              tempLength = 0;
            }
          }
          tempChunk.push(word);
          tempLength += wordLength;
        }
        
        if (tempChunk.length > 0) {
          chunks.push(tempChunk.join(" "));
        }
        continue;
      }

      // Normal case: add sentence to current chunk if it fits
      if (currentLength + sentenceLength > maxBytes && currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentLength = 0;
      }

      currentChunk.push(sentenceWithPunct);
      currentLength += sentenceLength;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    // Final validation to ensure no chunk exceeds the limit
    return chunks
      .filter(chunk => chunk.trim().length > 0)
      .map(chunk => {
        const trimmed = chunk.trim();
        const byteLength = getByteLength(trimmed);
        if (byteLength > maxBytes) {
          console.warn(`Chunk still exceeds ${maxBytes} bytes (${byteLength} bytes)`);
          return trimmed.substring(0, Math.floor(maxBytes / 2)) + "...";
        }
        return trimmed;
      });
  }
}

// Create and export singleton instance
export const ttsService = new TTSService();