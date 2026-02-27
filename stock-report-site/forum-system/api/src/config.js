import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
