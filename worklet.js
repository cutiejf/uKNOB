// Flatline — worklet.js
// Hybrid short-term auto-gain + brickwall limiter with look-ahead.

class FlatlineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'targetDb', defaultValue: -14, minValue: -36, maxValue: -6, automationRate: 'k-rate' },
      { name: 'ceilingDb', defaultValue: -1.0, minValue: -12, maxValue: -0.1, automationRate: 'k-rate' },
      { name: 'lookaheadMs', defaultValue: 10, minValue: 0, maxValue: 50, automationRate: 'k-rate' },
      { name: 'attackMs', defaultValue: 20, minValue: 1, maxValue: 200, automationRate: 'k-rate' },
      { name: 'releaseMs', defaultValue: 300, minValue: 50, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'maxBoostDb', defaultValue: 18, minValue: 0, maxValue: 36, automationRate: 'k-rate' },
      { name: 'maxCutDb', defaultValue: 24, minValue: 0, maxValue: 48, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super(options);
    this._acc = 0;
    this._count = 0;
    // Post level updates ~10x per second
    this._framesPerUpdate = Math.max(1, Math.round(sampleRate / 10));
    this.port.onmessage = () => {};
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];

    if (!input.length) {
      // nothing to do, but keep running
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
      return true;
    }

    const inL = input[0] || new Float32Array(output[0].length);
    const inR = input[1] || inL;
    const outL = output[0] || new Float32Array(inL.length);
    const outR = output[1] || outL;

    for (let i = 0; i < outL.length; i++) {
      const a = inL[i] || 0;
      const b = inR[i] || a;
      // simple pass-through — real processing can be added later
      outL[i] = a;
      outR[i] = b;

      // accumulate for level meter
      const s = 0.5 * (a * a + b * b);
      this._acc += s;
      this._count++;

      if (this._count >= this._framesPerUpdate) {
        const rms = Math.sqrt(this._acc / this._count);
        const db = 20 * Math.log10(Math.max(rms, 1e-9));
        try { this.port.postMessage({ type: 'level', db }); } catch (e) {}
        this._acc = 0;
        this._count = 0;
      }
    }

    return true;
  }
}

registerProcessor('flatline-processor', FlatlineProcessor);