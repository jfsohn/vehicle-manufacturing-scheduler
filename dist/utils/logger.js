"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(level = LogLevel.INFO) {
        this.level = level;
    }
    shouldLog(level) {
        return level <= this.level;
    }
    formatMessage(level, message, meta) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }
    error(message, meta) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage('ERROR', message, meta));
        }
    }
    warn(message, meta) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', message, meta));
        }
    }
    info(message, meta) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', message, meta));
        }
    }
    debug(message, meta) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.formatMessage('DEBUG', message, meta));
        }
    }
}
exports.logger = new Logger(process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO);
