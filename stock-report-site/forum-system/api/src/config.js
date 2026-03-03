import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:3001',
  email: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
    defaultTo: process.env.MAIL_TO_DEFAULT,
    fromName: process.env.MAIL_FROM_NAME || 'OpenClaw'
  }
};
