interface RateLimitState {
  isLimited: boolean;
  resetAt: number | null;
  lastError: string | null;
}

class RateLimiter {
  private state: RateLimitState = {
    isLimited: false,
    resetAt: null,
    lastError: null,
  };
  private listeners: Array<(state: RateLimitState) => void> = [];
  private resetTimer: NodeJS.Timeout | null = null;

  handleRateLimitError(error: any): void {
    const status = error?.response?.status;
    const headers = error?.response?.headers || {};
    const url = error?.config?.url || "unknown";
    const method = error?.config?.method?.toUpperCase() || "?";

    if (status === 429) {
      const retryAfter = headers["retry-after"];
      const rateLimitReset = headers["x-ratelimit-reset"];

      let resetAt: number;
      if (rateLimitReset) {
        resetAt = parseInt(rateLimitReset, 10) * 1000;
      } else if (retryAfter) {
        resetAt = Date.now() + parseInt(retryAfter, 10) * 1000;
      } else {
        resetAt = Date.now() + 60 * 60 * 1000;
      }

      console.warn(
        `[RateLimit] 429 from ${method} ${url}, reset at ${new Date(resetAt).toLocaleTimeString()}`,
      );

      this.state = {
        isLimited: true,
        resetAt,
        lastError: "API rate limit exceeded",
      };

      this.notifyListeners();

      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.reset();
      }, resetAt - Date.now());
    } else if (status === 410) {
      const resetAt = Date.now() + 5 * 60 * 1000;
      console.warn(
        `[RateLimit] 410 from ${method} ${url}, retry at ${new Date(resetAt).toLocaleTimeString()}`,
      );

      this.state = {
        isLimited: true,
        resetAt,
        lastError: "API endpoint deprecated. Retrying in 5 minutes.",
      };

      this.notifyListeners();

      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(
        () => {
          this.reset();
        },
        5 * 60 * 1000,
      );
    }
  }

  reset(): void {
    console.log("[RateLimit] Reset - API calls enabled");
    this.state = {
      isLimited: false,
      resetAt: null,
      lastError: null,
    };
    this.notifyListeners();
  }

  getState(): RateLimitState {
    return { ...this.state };
  }

  subscribe(listener: (state: RateLimitState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.getState()));
  }
}

export const rateLimiter = new RateLimiter();
