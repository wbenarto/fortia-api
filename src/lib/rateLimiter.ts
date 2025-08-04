// Simple in-memory rate limiter for user-based daily limits
interface UserUsage {
  count: number;
  date: string;
}

class RateLimiter {
  private userUsage: Map<string, UserUsage> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 20, windowMs: number = 24 * 60 * 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs; // 24 hours in milliseconds
  }

  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  private isNewDay(userId: string): boolean {
    const usage = this.userUsage.get(userId);
    if (!usage) return true;

    const currentDate = this.getCurrentDate();
    return usage.date !== currentDate;
  }

  canMakeRequest(userId: string): boolean {
    const currentDate = this.getCurrentDate();
    const usage = this.userUsage.get(userId);

    // If no usage record or new day, reset
    if (!usage || this.isNewDay(userId)) {
      this.userUsage.set(userId, { count: 0, date: currentDate });
      return true;
    }

    // Check if user has exceeded daily limit
    return usage.count < this.maxRequests;
  }

  recordRequest(userId: string): void {
    const currentDate = this.getCurrentDate();
    const usage = this.userUsage.get(userId);

    if (!usage || this.isNewDay(userId)) {
      this.userUsage.set(userId, { count: 1, date: currentDate });
    } else {
      usage.count += 1;
      this.userUsage.set(userId, usage);
    }
  }

  getRemainingRequests(userId: string): number {
    const usage = this.userUsage.get(userId);
    if (!usage || this.isNewDay(userId)) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - usage.count);
  }

  getUsageInfo(userId: string): { count: number; remaining: number; date: string } {
    const usage = this.userUsage.get(userId);
    const currentDate = this.getCurrentDate();

    if (!usage || this.isNewDay(userId)) {
      return { count: 0, remaining: this.maxRequests, date: currentDate };
    }

    return {
      count: usage.count,
      remaining: this.getRemainingRequests(userId),
      date: usage.date,
    };
  }

  // Clean up old entries (optional - for memory management)
  cleanup(): void {
    const currentDate = this.getCurrentDate();
    for (const [userId, usage] of this.userUsage.entries()) {
      if (usage.date !== currentDate) {
        this.userUsage.delete(userId);
      }
    }
  }
}

// Create a singleton instance for meal analysis rate limiting
export const mealAnalysisRateLimiter = new RateLimiter(20, 24 * 60 * 60 * 1000); // 20 requests per day

// Create a singleton instance for exercise analysis rate limiting
export const exerciseAnalysisRateLimiter = new RateLimiter(20, 24 * 60 * 60 * 1000); // 20 requests per day

// Create a singleton instance for recipe breakdown rate limiting
export const recipeBreakdownRateLimiter = new RateLimiter(20, 24 * 60 * 60 * 1000); // 20 requests per day

// Clean up old entries every hour
setInterval(
  () => {
    mealAnalysisRateLimiter.cleanup();
    exerciseAnalysisRateLimiter.cleanup();
    recipeBreakdownRateLimiter.cleanup();
  },
  60 * 60 * 1000 // 1 hour
);
