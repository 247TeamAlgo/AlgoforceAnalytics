// algoforce-analytics\lib\db\redis.ts
import Redis from "ioredis";

/* ---------------------------------------------------------------
   A SINGLE process-wide Redis connection that survives hot reload > 
---------------------------------------------------------------- */
declare global {
  var _afRedis: Redis | undefined;
}

export function redis(): Redis {
  if (!global._afRedis) {
    global._afRedis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // never reject pending commands
      reconnectOnError: () => true, // auto-retry on ECONNRESET & friends
      enableReadyCheck: true,
      keepAlive: 10_000,
    });
  }
  return global._afRedis;
}