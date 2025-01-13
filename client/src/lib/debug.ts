type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class DebugLogger {
  private static instance: DebugLogger;
  private enabled: boolean = false;
  private groupLevel: number = 0;

  private constructor() {}

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  enable() {
    this.enabled = true;
    this.log('debug', 'Debug logging enabled');
  }

  disable() {
    this.log('debug', 'Debug logging disabled');
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  startGroup(label: string) {
    if (!this.enabled) return;
    console.group(label);
    this.groupLevel++;
  }

  endGroup() {
    if (!this.enabled || this.groupLevel === 0) return;
    console.groupEnd();
    this.groupLevel--;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toLocaleTimeString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (!this.enabled) return;

    const formattedMessage = this.formatMessage(level, message);

    switch (level) {
      case 'debug':
        data ? console.debug(formattedMessage, data) : console.debug(formattedMessage);
        break;
      case 'info':
        data ? console.info(formattedMessage, data) : console.info(formattedMessage);
        break;
      case 'warn':
        data ? console.warn(formattedMessage, data) : console.warn(formattedMessage);
        break;
      case 'error':
        data ? console.error(formattedMessage, data) : console.error(formattedMessage);
        break;
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }
}

export const debugLogger = DebugLogger.getInstance();