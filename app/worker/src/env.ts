export interface Env {
  DB: D1Database;
  PRIVATE_FILES: R2Bucket;
  EXPORT_FILES: R2Bucket;
  IMAGES: ImagesBinding;
  AUTH_LIMITER: DurableObjectNamespace;
  API_RATE_LIMITER: RateLimit;
  JOBS_QUEUE: Queue<{ jobId: string }>;
  ASSETS?: Fetcher;
  APP_ENV: "local" | "test" | "staging" | "production";
  APP_ORIGIN: string;
  SESSION_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
}
