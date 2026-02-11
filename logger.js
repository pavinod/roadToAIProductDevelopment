const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data
  };

  // Console output with colors
  const colors = {
    INFO: '\x1b[36m',    // Cyan
    SUCCESS: '\x1b[32m', // Green
    WARNING: '\x1b[33m', // Yellow
    ERROR: '\x1b[31m',   // Red
    RESET: '\x1b[0m'
  };

  console.log(
    `${colors[level] || ''}[${level}] ${timestamp} - ${message}${colors.RESET}`,
    Object.keys(data).length > 0 ? data : ''
  );

  // Write to file
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

module.exports = {
  info: (message, data) => log('INFO', message, data),
  success: (message, data) => log('SUCCESS', message, data),
  warning: (message, data) => log('WARNING', message, data),
  error: (message, data) => log('ERROR', message, data)
};