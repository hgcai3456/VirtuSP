"use strict";

const PCM_SAMPLE_RATE = 24000;
const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2;

function pronounce(text) {
  const original = String(text || "");
  let spoken = original;
  // Keep the left-hand number first. 155/110 is "155 over 110".
  spoken = spoken.replace(
    /(\d+)\s*\/\s*(\d+)/g,
    (_, left, right) => `${left} over ${right}`,
  );
  const units = [
    [/\bmcg\b/gi, "micrograms"],
    [/\bmg\b/gi, "milligrams"],
    [/\bml\b/gi, "milliliters"],
    [/\bkg\b/gi, "kilograms"],
    [/\bbpm\b/gi, "beats per minute"],
  ];
  for (const [pattern, word] of units) spoken = spoken.replace(pattern, word);
  if (/\b(?:do|does) not\b|\bdon't\b|\bdoesn't\b/i.test(original)) {
    if (!/\b(?:do|does) not\b|\bdon't\b|\bdoesn't\b/i.test(spoken)) {
      const error = new Error("Pronunciation dropped a negation.");
      error.code = "pronunciation";
      throw error;
    }
  }
  return spoken;
}

class PcmPump {
  constructor({ chunkBytes = PCM_BYTES_PER_SECOND, maxBytes = PCM_BYTES_PER_SECOND * 4 } = {}) {
    if (chunkBytes < 2 || chunkBytes % 2 !== 0)
      throw new Error("PCM chunk size must contain whole samples.");
    this.chunkBytes = chunkBytes;
    this.maxBytes = Math.max(chunkBytes, maxBytes);
    this.pending = Buffer.alloc(0);
    this.queue = [];
    this.generation = 1;
    this.ended = false;
    this.failed = null;
    this.waiters = [];
  }

  buffered() {
    return (
      this.pending.length +
      this.queue.reduce((total, frame) => total + frame.length, 0)
    );
  }

  space() {
    return Math.max(0, this.maxBytes - this.buffered());
  }

  cancel() {
    this.generation += 1;
    this.pending = Buffer.alloc(0);
    this.queue = [];
    this.ended = false;
    this.failed = null;
    this._wake();
    return this.generation;
  }

  push(chunk, generation = this.generation) {
    if (generation !== this.generation)
      return { ignored: true, buffered: this.buffered() };
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || []);
    if (!bytes.length) return { ok: true, buffered: this.buffered() };
    if (this.buffered() + bytes.length > this.maxBytes)
      return { ok: false, reason: "backpressure", buffered: this.buffered() };
    this.pending = Buffer.concat([this.pending, bytes]);
    this._emitReady();
    return { ok: true, buffered: this.buffered() };
  }

  finish(generation = this.generation) {
    if (generation !== this.generation) return { ignored: true };
    if (this.pending.length % 2 !== 0) {
      const error = new Error("Incomplete PCM sample.");
      error.code = "incomplete-audio";
      this.failed = error;
      this.ended = true;
      this._wake();
      throw error;
    }
    if (this.pending.length) {
      this.queue.push(Buffer.from(this.pending));
      this.pending = Buffer.alloc(0);
    }
    this.ended = true;
    this._wake();
    return { ok: true };
  }

  takeReady(generation = this.generation) {
    if (generation !== this.generation) return { ignored: true };
    if (this.queue.length === 0) return { empty: true };
    return { frame: this.queue.shift() };
  }

  _emitReady() {
    while (this.pending.length >= this.chunkBytes) {
      this.queue.push(Buffer.from(this.pending.subarray(0, this.chunkBytes)));
      this.pending = Buffer.from(this.pending.subarray(this.chunkBytes));
    }
    this._wake();
  }

  _wake() {
    const waiters = this.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}

async function pumpStream({
  stream,
  pump,
  generation,
  onFrame,
  signal,
  maxBytes,
}) {
  const reader =
    stream && typeof stream.getReader === "function"
      ? stream.getReader()
      : null;
  const iterable = reader ? null : stream;
  let sent = 0;
  const pushPiece = async (piece) => {
    let offset = 0;
    const bytes = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
    while (offset < bytes.length) {
      if (signal?.aborted || generation !== pump.generation)
        return { aborted: true, sent };
      if (maxBytes != null && sent + pump.buffered() >= maxBytes) {
        const error = new Error("Utterance audio exceeded the configured limit.");
        error.code = "utterance-limit";
        throw error;
      }
      const room = pump.space();
      if (room <= 0) {
        const ready = pump.takeReady(generation);
        if (ready.frame) {
          await onFrame(ready.frame);
          sent += ready.frame.length;
        } else {
          await new Promise((resolve) => pump.waiters.push(resolve));
        }
        continue;
      }
      const slice = bytes.subarray(offset, offset + Math.min(room, bytes.length - offset));
      const result = pump.push(slice, generation);
      if (result.ignored) return { aborted: true, sent };
      if (!result.ok) continue;
      offset += slice.length;
      let ready = pump.takeReady(generation);
      while (ready.frame) {
        await onFrame(ready.frame);
        sent += ready.frame.length;
        ready = pump.takeReady(generation);
      }
    }
    return { aborted: false, sent };
  };
  if (Buffer.isBuffer(stream) || stream instanceof Uint8Array) {
    const only = await pushPiece(Buffer.from(stream));
    if (only?.aborted) return { aborted: true, sent };
    if (generation !== pump.generation) return { aborted: true, sent };
    pump.finish(generation);
    let ready = pump.takeReady(generation);
    while (ready.frame) {
      await onFrame(ready.frame);
      sent += ready.frame.length;
      ready = pump.takeReady(generation);
    }
    return { aborted: false, sent, completed: true };
  }
  try {
    if (reader) {
      while (true) {
        if (signal?.aborted || generation !== pump.generation) {
          await reader.cancel().catch(() => {});
          return { aborted: true, sent };
        }
        const next = await reader.read();
        if (next.done) break;
        const step = await pushPiece(next.value);
        if (step.aborted) {
          await reader.cancel().catch(() => {});
          return step;
        }
      }
    } else {
      for await (const piece of iterable) {
        const step = await pushPiece(piece);
        if (step.aborted) return step;
      }
    }
  } catch (error) {
    if (signal?.aborted || error?.code === "aborted" || error?.name === "AbortError")
      return { aborted: true, sent };
    throw error;
  }
  if (generation !== pump.generation) return { aborted: true, sent };
  pump.finish(generation);
  let ready = pump.takeReady(generation);
  while (ready.frame) {
    await onFrame(ready.frame);
    sent += ready.frame.length;
    ready = pump.takeReady(generation);
  }
  return { aborted: false, sent, completed: true };
}

module.exports = {
  PCM_SAMPLE_RATE,
  PCM_BYTES_PER_SECOND,
  pronounce,
  PcmPump,
  pumpStream,
};
