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

  async log(message: string, type: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    try {
      await fs.appendFile(this.logFilePath, formattedMessage);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}

export const logger = new LoggingService();
