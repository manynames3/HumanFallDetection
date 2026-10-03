"""Generate parity fixtures against upstream feature function bodies and NumPy LSTM.

Development-only: numpy. Never imports/runs the upstream webcam application.
This verifies mathematics/weights, not pose-estimator or real fall accuracy.
"""
import ast
import hashlib
import json
import math
import pathlib
import numpy as np
from export_browser_model import read_weights

ROOT = pathlib.Path(__file__).resolve().parents[1]
np.math = math  # Upstream uses np.math, removed in recent NumPy.
source = (ROOT / "vis/inv_pendulum.py").read_text()
names = {"get_angle", "get_angle_vertical", "get_gf", "get_rot_energy", "get_ratio_bbox", "get_ratio_derivative"}
tree = ast.parse(source)
tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
env = {"np": np}
exec(compile(tree, "upstream_feature_functions", "exec"), env)
digest, raw = read_weights()
w = {name: np.array(t["values"], dtype=np.float32).reshape(t["shape"]) for name, t in raw.items()}
h = [np.zeros(48, dtype=np.float32) for _ in range(2)]
c = [np.zeros(48, dtype=np.float32) for _ in range(2)]


def step(values):
    x = np.array(values, dtype=np.float32)
    for layer in range(2):
        suffix = f"_l{layer}"
        gates = w[f"LSTM.weight_ih{suffix}"] @ x + w[f"LSTM.weight_hh{suffix}"] @ h[layer] + w[f"LSTM.bias_ih{suffix}"] + w[f"LSTM.bias_hh{suffix}"]
        i, f, g, o = np.split(gates, 4)
        sigmoid = lambda v: 1/(1+np.exp(-v))
        c[layer] = sigmoid(f)*c[layer] + sigmoid(i)*np.tanh(g)
        h[layer] = sigmoid(o)*np.tanh(c[layer])
        x = h[layer]
    return (w["fc1.weight"] @ x + w["fc1.bias"]).tolist()


poses, ips, cases = [], [], []
for frame in range(80):
    theta = .02*frame + .12*math.sin(frame*.17)
    B = np.array([.5+.02*math.sin(frame*.03), .58+.08*math.sin(frame*.05)])
    N = B + np.array([-.2*math.sin(theta), -.2*math.cos(theta)])
    H = N + np.array([-.08*math.sin(theta+.07), -.08*math.cos(theta+.07)])
    pose = dict(H=H.tolist(), N=N.tolist(), B=B.tolist(), box=[210, 90, 410+frame*.5, 420-frame*.9], time=frame/18)
    ip = dict(keypoints=dict(H=H,N=N,B=B), box=np.array([pose["box"][:2],pose["box"][2:]]), time=pose["time"])
    ratio = env["get_ratio_bbox"](ip)
    ip["features"] = {"ratio_bbox": ratio}
    values = [ratio, math.log1p(abs(env["get_angle_vertical"](N-B))), 0, 0, 0]
    if ips:
        values[2] = env["get_rot_energy"](ips[-1],ip)
        values[3] = env["get_ratio_derivative"](ips[-1],ip)
    if len(ips)>1:
        values[4] = env["get_gf"](ips[-2],ips[-1],ip)
    cases.append(dict(pose=pose,features=values,logits=step(values)))
    ips.append(ip)
result = dict(source_sha256=digest, feature_source_sha256=hashlib.sha256(source.encode()).hexdigest(),
              reference="Unmodified upstream feature functions + independent NumPy float32 LSTM equations",cases=cases)
path = ROOT / "tests/fixtures/parity.json"
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(result,separators=(",", ":"))+"\n")
print(f"Generated {len(cases)} parity steps")
