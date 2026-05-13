export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;

      if (status === 429 || status === 503) {
        if (attempt < maxRetries) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt), 30000);
          console.log(
            `[Retry] Attempt ${attempt + 1}/${maxRetries} failed (${status}), retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        console.error(`[Retry] Max retries (${maxRetries}) exceeded for status ${status}`);
      }

      throw error;
    }
  }

  throw lastError;
}
