// Browser port of model/model.py. Copyright (c) 2020 Mohammad Taufeeque
// and Samad Koita. MIT; see LICENSE.txt. PyTorch gate order: i, f, g, o.
export class LSTM {
  constructor(manifest, buffer) {
    this.weights = {};
    const data = new Float32Array(buffer);
    for (const [name, tensor] of Object.entries(manifest.tensors)) {
      this.weights[name] = data.slice(tensor.offset, tensor.offset + tensor.length);
    }
    this.reset();
  }
  reset() {
    this.h = [new Float32Array(48), new Float32Array(48)];
    this.c = [new Float32Array(48), new Float32Array(48)];
  }
  step(features) {
    if (features.length !== 5 || !features.every(Number.isFinite)) throw new Error('Invalid model features');
    let input = Float32Array.from(features);
    for (let layer = 0; layer < 2; layer++) {
      const w = this.weights, suffix = `_l${layer}`, gates = new Float32Array(192);
      const wi = w[`LSTM.weight_ih${suffix}`], wh = w[`LSTM.weight_hh${suffix}`];
      const bi = w[`LSTM.bias_ih${suffix}`], bh = w[`LSTM.bias_hh${suffix}`];
      for (let row = 0; row < 192; row++) {
        let value = bi[row] + bh[row];
        for (let k = 0; k < input.length; k++) value += wi[row * input.length + k] * input[k];
        for (let k = 0; k < 48; k++) value += wh[row * 48 + k] * this.h[layer][k];
        gates[row] = value;
      }
      const sigmoid = x => 1 / (1 + Math.exp(-x));
      for (let k = 0; k < 48; k++) {
        this.c[layer][k] = sigmoid(gates[48+k]) * this.c[layer][k] + sigmoid(gates[k]) * Math.tanh(gates[96+k]);
        this.h[layer][k] = sigmoid(gates[144+k]) * Math.tanh(this.c[layer][k]);
      }
      input = this.h[layer];
    }
    const logits = Array.from(this.weights['fc1.bias']);
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k < 48; k++) logits[row] += this.weights['fc1.weight'][row * 48 + k] * input[k];
    }
    return {logits, prediction: logits.indexOf(Math.max(...logits)), score: Math.max(...logits)};
  }
}
