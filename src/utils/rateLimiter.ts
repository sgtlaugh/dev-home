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

  handleRateLimitError(error: any): void {
    const status = error?.response?.status;
    if (status === 429 || status === 410) {
      const resetAfterMs = 60 * 60 * 1000; // 1 hour default
      const resetAt = Date.now() + resetAfterMs;

      this.state = {
        isLimited: true,
        resetAt,
        lastError: status === 429 ? "API rate limit exceeded" : "Resource temporarily unavailable",
      };

      this.notifyListeners();

      // Auto-reset after timeout
      setTimeout(() => {
        this.reset();
      }, resetAfterMs);
    }
  }

  reset(): void {
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
