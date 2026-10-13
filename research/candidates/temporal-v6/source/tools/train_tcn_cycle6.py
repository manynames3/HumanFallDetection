"""Small causal TCN, existing bundled NumPy only. Local research, no deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import numpy as np

PARAMS = ("w1", "b1", "w2", "b2", "wo", "bo")


def initialize(rng, dim, hidden, kernel):
    return dict(w1=rng.normal(0, 1 / np.sqrt(kernel * dim), (kernel, dim, hidden)),
                b1=np.zeros(hidden), w2=rng.normal(0, 1 / np.sqrt(kernel * hidden), (kernel, hidden, hidden)),
                b2=np.zeros(hidden), wo=rng.normal(0, 1 / np.sqrt(hidden), hidden), bo=np.zeros(1))


def forward(p, x, dilation):
    batch, steps, _ = x.shape
    first = np.broadcast_to(p["b1"], (batch, steps, len(p["b1"]))).copy()
    for k, weight in enumerate(p["w1"]):
        first[:, k:, :] += x[:, :steps-k, :] @ weight
    first = np.tanh(first)
    indices = [steps - 1 - k * dilation for k in range(len(p["w2"]))]
    if min(indices) < 0:
        raise ValueError("Invalid causal receptive field")
    second = np.broadcast_to(p["b2"], (batch, len(p["b2"]))).copy()
    for index, weight in zip(indices, p["w2"]):
        second += first[:, index, :] @ weight
    second = np.tanh(second)
    logits = second @ p["wo"] + p["bo"][0]
    return logits, (first, second, indices)


def loss_grad(p, x, y, weights, dilation):
    z, (first, second, indices) = forward(p, x, dilation)
    loss = float(np.sum(weights * (np.logaddexp(0, z) - y*z)) / weights.sum())
    delta = weights * (1 / (1 + np.exp(-np.clip(z, -30, 30))) - y) / weights.sum()
    g = dict(wo=second.T @ delta, bo=np.array([delta.sum()]))
    dsecond = delta[:, None] * p["wo"] * (1-second**2)
    g["b2"] = dsecond.sum(axis=0)
    g["w2"] = np.stack([first[:, index, :].T @ dsecond for index in indices])
    dfirst = np.zeros_like(first)
    for index, weight in zip(indices, p["w2"]):
        dfirst[:, index, :] += dsecond @ weight.T
    dfirst *= 1-first**2
    g["b1"] = dfirst.sum(axis=(0, 1))
    steps = x.shape[1]
    g["w1"] = np.stack([np.einsum("btd,bth->dh", x[:, :steps-k, :], dfirst[:, k:, :]) for k in range(len(p["w1"]))])
    return loss, g


def self_test():
    rng = np.random.default_rng(61)
    p = initialize(rng, 4, 3, 3)
    x = rng.normal(size=(3, 18, 4)); y = np.array([0, 1, 0]); w = np.array([1., 2., .7])
    _, gradients = loss_grad(p, x, y, w, 3)
    maximum = 0.
    for key in PARAMS:
        for index in rng.choice(p[key].size, min(5, p[key].size), replace=False):
            old = p[key].flat[index]; eps = 1e-5
            p[key].flat[index] = old+eps; plus = loss_grad(p, x, y, w, 3)[0]
            p[key].flat[index] = old-eps; minus = loss_grad(p, x, y, w, 3)[0]
            p[key].flat[index] = old
            maximum = max(maximum, abs((plus-minus)/(2*eps) - gradients[key].flat[index]))
    assert maximum < 1e-6, maximum
    p_before = {k:v.copy() for k,v in p.items()}
    for key in PARAMS:
        p[key] -= .02 * gradients[key]
    assert loss_grad(p, x, y, w, 3)[0] < loss_grad(p_before, x, y, w, 3)[0]
    print(json.dumps({"gradientMaxAbsoluteError": maximum, "lossDecreaseCheck": True}), flush=True)


def masks(x):
    active = np.ones_like(x, dtype=bool)
    for j in range(13):
        active[:, :, j*4:j*4+3] = x[:, :, j*4+3:j*4+4] > 0
    active[:, :, 53:] = x[:, :, 52:53] > 0
    return active


def normalize(x, mean, scale):
    active = masks(x)
    result = np.clip((x-mean)/scale, -6, 6)
    result[~active] = 0
    result[:, :, 3:52:4] = x[:, :, 3:52:4]
    result[:, :, 52] = x[:, :, 52]
    return result


def dataset(directory, name, recipe):
    meta = json.loads((directory / f"{name}-data.json").read_text())
    for suffix, expected in meta["files"].items():
        data = (directory / f"{name}-{suffix}").read_bytes()
        if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
            raise ValueError("Dataset integrity mismatch")
    x = np.fromfile(directory / f"{name}-x.f32", dtype="<f4").reshape(meta["shape"])
    y = np.fromfile(directory / f"{name}-y.u8", dtype="u1").astype(float)
    w = np.fromfile(directory / f"{name}-w.f32", dtype="<f4").astype(float)
    if x.shape[1:] != (recipe["steps"], recipe["dim"]) or not np.isfinite(x).all():
        raise ValueError("Dataset shape/values mismatch")
    if not len(x) or not all(np.any(y == c) for c in [0, 1]):
        raise ValueError("Both classes required")
    for c in [0, 1]:
        w[y == c] /= 2*w[y == c].sum()
    return x, y, w, meta


def atomic_json(file, value):
    data = json.dumps(value, indent=2, allow_nan=False) + "\n"
    temp = file.with_suffix(file.suffix+".partial")
    temp.write_text(data); os.replace(temp, file)


def train(directory):
    recipe = json.loads((directory / "recipe.json").read_text())
    root = Path(__file__).resolve().parents[1]
    for file, expected in recipe["codeHashes"].items():
        if hashlib.sha256((root / file).read_bytes()).hexdigest() != expected:
            raise ValueError("Source changed after recipe freeze")
    x, y, w, train_meta = dataset(directory, "train", recipe)
    vx, vy, vw, val_meta = dataset(directory, "selection", recipe)
    contract = hashlib.sha256(json.dumps([recipe, train_meta["files"], val_meta["files"]], sort_keys=True).encode()).hexdigest()
    rng = np.random.default_rng(recipe["seed"])
    active = masks(x); mean = np.zeros(recipe["dim"]); scale = np.ones(recipe["dim"])
    for d in range(recipe["dim"]):
        if d < 52 and d % 4 == 3 or d == 52:
            continue
        values = x[:, :, d][active[:, :, d]]
        if len(values):
            mean[d], scale[d] = values.mean(), max(.05, values.std())
    nx = normalize(x, mean, scale); nv = normalize(vx, mean, scale)
    p = initialize(rng, recipe["dim"], recipe["hidden"], recipe["kernel"])
    m = {k: np.zeros_like(v) for k,v in p.items()}; v = {k: np.zeros_like(a) for k,a in p.items()}
    start, step, best_loss, best_epoch, curve, best = 0, 0, float("inf"), None, [], None
    checkpoint = directory / "training-checkpoint.npz"
    if checkpoint.exists():
        with np.load(checkpoint, allow_pickle=False) as saved:
            info = json.loads(str(saved["info"]))
            if info["contract"] != contract:
                raise ValueError("Training checkpoint contract changed")
            p = {k:saved[k].copy() for k in PARAMS}; m = {k:saved["m_"+k].copy() for k in PARAMS}; v = {k:saved["v_"+k].copy() for k in PARAMS}
            start, step = info["epoch"], info["step"]; rng.bit_generator.state = info["rng"]
            best_loss, best_epoch, curve = info["best_loss"], info["best_epoch"], info["curve"]
            if best_epoch is not None: best = {k:saved["best_"+k].copy() for k in PARAMS}
        print(f"Resumed epoch {start}", flush=True)
    for epoch in range(start+1, recipe["epochs"]+1):
        order = rng.permutation(len(nx))
        for i in range(0, len(order), recipe["batchSize"]):
            indices = order[i:i+recipe["batchSize"]]
            _, gradients = loss_grad(p, nx[indices], y[indices], w[indices], recipe["dilation"])
            norm = np.sqrt(sum(np.sum(g*g) for g in gradients.values()))
            if norm > 5: gradients = {k:g*(5/norm) for k,g in gradients.items()}
            step += 1
            for key in PARAMS:
                m[key] = .9*m[key] + .1*gradients[key]; v[key] = .999*v[key] + .001*gradients[key]**2
                p[key] -= recipe["rate"] * (m[key]/(1-.9**step)) / (np.sqrt(v[key]/(1-.999**step)) + 1e-8)
        if epoch in [20, 40]:
            z = forward(p, nv, recipe["dilation"])[0]
            loss = float(np.sum(vw * (np.logaddexp(0, z)-vy*z))/vw.sum())
            curve.append({"epoch":epoch, "selectionLoss":loss})
            if loss < best_loss: best_loss, best_epoch, best = loss, epoch, {k:a.copy() for k,a in p.items()}
        if epoch % 5 == 0:
            info = dict(contract=contract, epoch=epoch, step=step, rng=rng.bit_generator.state,
                        best_loss=best_loss if np.isfinite(best_loss) else None, best_epoch=best_epoch, curve=curve)
            if info["best_loss"] is None: info["best_loss"] = 1e100
            temp = checkpoint.with_suffix(".partial")
            arrays = {**p, **{"m_"+k:a for k,a in m.items()}, **{"v_"+k:a for k,a in v.items()}, "info":np.array(json.dumps(info))}
            if best is not None: arrays.update({"best_"+k:a for k,a in best.items()})
            with temp.open("wb") as handle: np.savez(handle, **arrays)
            os.replace(temp, checkpoint)
            print(json.dumps({"epoch":epoch, "selectionLoss":best_loss if np.isfinite(best_loss) else None, "samples":len(nx)}), flush=True)
    if best is None: raise ValueError("No prespecified selection checkpoint")
    model = {k:recipe[k] for k in ["steps","dim","hidden","kernel","dilation","threshold"]}
    model.update(mean=mean.tolist(), scale=scale.tolist(), **{k:(float(a[0]) if k=="bo" else a.reshape(-1).tolist()) for k,a in best.items()})
    model.update(featureVersion="masked-estimated-3d-causal-tcn-v6", selectedEpoch=best_epoch, trainingContract=contract)
    atomic_json(directory / "model.json", model)
    atomic_json(directory / "training-report.json", dict(contract=contract, selectedEpoch=best_epoch, selectionCurve=curve,
        trainingSamples=len(nx), selectionSamples=len(nv), parameters=sum(a.size for a in best.values()), deploy=False))
    z = forward(best, nv[:32], recipe["dilation"])[0]
    atomic_json(directory / "reference.json", dict(inputs=vx[:32].tolist(), predictions=(1/(1+np.exp(-np.clip(z,-30,30)))).tolist()))
    print(json.dumps({"finished":True,"selectedEpoch":best_epoch,"selectionLoss":best_loss,"deploy":False}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--data", type=Path)
    args = parser.parse_args()
    if args.self_test: self_test()
    elif args.data: train(args.data.resolve())
    else: parser.error("Use --self-test or --data DIRECTORY")
