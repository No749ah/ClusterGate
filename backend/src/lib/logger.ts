import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from '../config'

const { combine, timestamp, printf, colorize, errors, json } = winston.format

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} [${level}]: ${message}${metaStr}${stack ? `\n${stack}` : ''}`
  })
)

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
)

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.isDev ? devFormat : prodFormat,
  }),
]

if (!config.isDev) {
  transports.push(
    new DailyRotateFile({
      dirname: config.LOG_DIR,
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: prodFormat,
    }),
    new DailyRotateFile({
      dirname: config.LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: prodFormat,
    })
  )
}

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  transports,
  exitOnError: false,
})
