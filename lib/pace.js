function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultDelay() {
  return process.env.NCBI_API_KEY ? 120 : 400;
}

class Pace {
  constructor(delayMs) {
    this.delayMs = Math.max(100, Number(delayMs) || defaultDelay());
    this.nextAt = 0;
  }

  async wait() {
    const now = Date.now();
    const wait = this.nextAt - now;
    if (wait > 0) {
      await sleep(wait);
    }
    this.nextAt = Date.now() + this.delayMs;
  }

  setDelay(delayMs) {
    this.delayMs = Math.max(100, Number(delayMs) || this.delayMs);
  }

  async backoff(attempt) {
    const ms = Math.min(60000, 4000 * Math.pow(2, attempt));
    await sleep(ms);
  }
}

module.exports = { Pace, sleep, defaultDelay };
