// Session state for the dedicated browser agent. No gateway or filesystem access.
// Callers supply browser operations and must enforce their existing policy first.
export class BrowserSession {
  constructor({ objective, execute, capture, now = Date.now, maxPending = 20 }) {
    if (typeof objective !== 'string' || !objective.trim() || objective.length > 300 ||
        typeof execute !== 'function' || typeof capture !== 'function' ||
        !Number.isInteger(maxPending) || maxPending < 1 || maxPending > 100)
      throw Error('Invalid browser session');
    this.objective = objective;
    this.execute = execute;
    this.capture = capture;
    this.now = now;
    this.maxPending = maxPending;
    this.startedAt = now();
    this.state = 'running';
    this.events = [];
    this.totalEvents = 0;
    this.queue = [];
    this.active = false;
    this.externalKind = null;
    this.controller = new AbortController();
    this.lastCaptureAt = -Infinity;
    this.capturePending = null;
  }

  record(label, status) {
    this.events.push({ sequence: ++this.totalEvents, at: this.now(), label, status });
    if (this.events.length > 100) this.events.shift();
  }

  snapshot() {
    return {
      objective: this.objective,
      state: this.state,
      elapsedMs: Math.max(0, this.now() - this.startedAt),
      active: this.active,
      pending: this.queue.length,
      omittedEvents: this.totalEvents - this.events.length,
      events: this.events.map(event => ({ ...event }))
    };
  }

  pause() {
    if (this.state === 'stopped') return;
    this.state = 'paused';
    // An active call finishes normally. Queued calls wait for resume.
  }

  resume() {
    if (this.state === 'stopped') throw Error('Session stopped');
    if (this.externalKind === 'human') throw Error('Human action still active');
    this.state = 'running';
    void this.drain();
  }

  stop() {
    this.state = 'stopped';
    this.controller.abort();
    for (const task of this.queue.splice(0)) task.reject(Error('Session stopped'));
  }

  run(label, args) {
    if (this.state === 'stopped') return Promise.reject(Error('Session stopped'));
    if (typeof label !== 'string' || !/^[a-z_]{1,60}$/.test(label))
      return Promise.reject(Error('Invalid operation'));
    if (this.queue.length >= this.maxPending)
      return Promise.reject(Error('Browser queue full'));
    return new Promise((resolve, reject) => {
      this.queue.push({ label, args, resolve, reject });
      void this.drain();
    });
  }

  // Observers and people share the same execution lock as automated actions.
  // Human actions are possible only after the active automated call has finished.
  async external(kind, execute) {
    if (this.state === 'stopped') throw Error('Session stopped');
    if (this.active) throw Error('Browser busy');
    if (kind === 'human' && this.state !== 'paused') throw Error('Pause required');
    this.active = true;
    this.externalKind = kind;
    if (kind === 'human') this.record('human_action', 'running');
    try {
      const result = await execute();
      if (this.state === 'stopped') throw Error('Session stopped');
      if (kind === 'human') this.record('human_action', result?.isError ? 'failed' : 'completed');
      return result;
    } catch {
      if (kind === 'human') this.record('human_action', this.state === 'stopped' ? 'stopped' : 'failed');
      throw Error('Browser operation unavailable');
    } finally {
      this.externalKind = null;
      this.active = false;
      void this.drain();
    }
  }

  async drain() {
    if (this.active || this.state !== 'running') return;
    const task = this.queue.shift();
    if (!task) return;
    this.active = true;
    this.record(task.label, 'running');
    try {
      const result = await this.execute(task.label, task.args, this.controller.signal);
      if (this.state === 'stopped') throw Error('Session stopped');
      this.record(task.label, result?.isError ? 'failed' : 'completed');
      task.resolve(result);
    } catch {
      this.record(task.label, this.state === 'stopped' ? 'stopped' : 'failed');
      task.reject(Error(this.state === 'stopped' ? 'Session stopped' : 'Browser operation failed'));
    } finally {
      this.active = false;
      void this.drain();
    }
  }

  // A viewer requests a frame explicitly. No polling timer and no idle stream.
  // Callers authenticate the viewer before using this method.
  frame() {
    if (this.state === 'stopped') return Promise.reject(Error('Session stopped'));
    if (this.capturePending) return this.capturePending;
    if (this.now() - this.lastCaptureAt < 1000) return Promise.resolve(null);
    this.lastCaptureAt = this.now();
    this.capturePending = Promise.resolve()
      .then(() => this.capture(this.controller.signal))
      .then(frame => {
        if (this.state === 'stopped') throw Error('Session stopped');
        if (!Buffer.isBuffer(frame) || frame.length > 2_000_000)
          throw Error('Invalid frame');
        return frame;
      })
      .catch(() => { throw Error('Browser capture unavailable'); })
      .finally(() => { this.capturePending = null; });
    return this.capturePending;
  }
}
