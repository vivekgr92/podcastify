import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LoggingService {
  private logFilePath: string;

  constructor() {
    const logsDir = path.join(__dirname, '../../logs');
    this.logFilePath = path.join(logsDir, 'tts-service.log');
    this.initializeLogDirectory();
  }

  private async initializeLogDirectory() {
    try {
      const logsDir = path.dirname(this.logFilePath);
      await fs.mkdir(logsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating logs directory:', error);
    }
  }

  async log(message: string | string[], type: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    try {
      const messages = Array.isArray(message) ? message : [message];
      const formattedMessage = `[${type.toUpperCase()}] ${messages.join(' ')}\n`;
      
      await fs.appendFile(this.logFilePath, formattedMessage);
      // Also log to console for development
      console.log(formattedMessage.trim());
    } catch (error) {
      console.error('Error writing to log file:', error instanceof Error ? error.message : String(error));
    }
  }

  async debug(message: string | string[]): Promise<void> {
    return this.log(message, 'info');
  }

  async info(message: string | string[]): Promise<void> {
    return this.log(message, 'info');
  }

  async warn(message: string | string[]): Promise<void> {
    return this.log(message, 'warn');
  }

  async error(message: string | string[]): Promise<void> {
    return this.log(message, 'error');
  }
}

export const logger = new LoggingService();
