const fs = require('fs');
const path = require('path');

// Logging levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

// Current log level (default: INFO for console, VERBOSE for file)
let consoleLogLevel = process.env.CONSOLE_LOG_LEVEL || 'INFO';
let fileLogLevel = process.env.FILE_LOG_LEVEL || 'VERBOSE';
let logFilePath = process.env.LOG_FILE_PATH || path.join(__dirname, '..', 'logs', 'app.log');

// Ensure logs directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Format log message with timestamp and level
 */
function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Write to log file
 */
function writeToFile(message) {
  const formattedMessage = formatMessage('LOG', message);
  fs.appendFile(logFilePath, formattedMessage + '\n', (err) => {
    if (err) console.error('Error writing to log file:', err);
  });
}

/**
 * Main logger class
 */
class Logger {
  constructor() {
    this.consoleLevel = LOG_LEVELS[consoleLogLevel] || LOG_LEVELS.INFO;
    this.fileLevel = LOG_LEVELS[fileLogLevel] || LOG_LEVELS.VERBOSE;
  }

  error(message) {
    this._log(LOG_LEVELS.ERROR, message, 'ERROR');
  }

  warn(message) {
    this._log(LOG_LEVELS.WARN, message, 'WARN');
  }

  info(message) {
    this._log(LOG_LEVELS.INFO, message, 'INFO');
  }

  debug(message) {
    this._log(LOG_LEVELS.DEBUG, message, 'DEBUG');
  }

  verbose(message) {
    this._log(LOG_LEVELS.VERBOSE, message, 'VERBOSE');
  }

  _log(level, message, levelName) {
    // Console logging
    if (level <= this.consoleLevel) {
      const formattedMessage = formatMessage(levelName, message);
      if (level === LOG_LEVELS.ERROR) {
        console.error(formattedMessage);
      } else if (level === LOG_LEVELS.WARN) {
        console.warn(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
    }

    // File logging
    if (level <= this.fileLevel) {
      writeToFile(message);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Export for use in other modules
module.exports = {
  logger,
  LOG_LEVELS,
  setConsoleLevel: (level) => {
    logger.consoleLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    consoleLogLevel = level;
  },
  setFileLevel: (level) => {
    logger.fileLevel = LOG_LEVELS[level] || LOG_LEVELS.VERBOSE;
    fileLogLevel = level;
  },
  setLogFile: (filePath) => {
    logFilePath = filePath;
    const logDir = path.dirname(filePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
};
