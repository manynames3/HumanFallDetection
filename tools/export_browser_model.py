"""Mechanical conversion of the pinned upstream tensors; no torch or pickle globals execute.

Run with Python stdlib. The checkpoint hash is mandatory, and the restricted
unpickler only builds tensor descriptors and OrderedDicts, never Python modules.
"""
import collections
import hashlib
import io
import itertools
import json
import math
import pathlib
import pickle
import struct
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def tensor(storage, offset, shape, stride, *_):
    return dict(storage=storage, offset=offset, shape=shape, stride=stride)


class MetadataReader(pickle.Unpickler):
    def find_class(self, module, name):
        allowed = {
            ("collections", "OrderedDict"): collections.OrderedDict,
            ("torch._utils", "_rebuild_tensor_v2"): tensor,
            ("torch", "FloatStorage"): "float32",
        }
        if (module, name) not in allowed:
            raise ValueError(f"Unexpected checkpoint global: {module}.{name}")
        return allowed[module, name]

    def persistent_load(self, value):
        kind, dtype, key, location, size = value
        if kind != "storage" or dtype != "float32" or not str(key).isdigit():
            raise ValueError("Unexpected storage descriptor")
        return (key, size)


def read_weights():
    source = ROOT / "model/lstm_weights.sav"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != "87bc1abd5828d8d2e0e91ef203a7f1b76df7c77c0d5fbd41bef765058221661b":
        raise ValueError("Not the reviewed upstream checkpoint")
    # Hash pinned in the manifest on first export; later exports must match.
    manifest_path = ROOT / "browser/models/lstm.json"
    if manifest_path.exists() and json.loads(manifest_path.read_text())["source_sha256"] != digest:
        raise ValueError("Checkpoint changed; review upstream provenance before re-exporting")
    with zipfile.ZipFile(source) as archive:
        metadata = MetadataReader(io.BytesIO(archive.read("archive/data.pkl"))).load()
        result = {}
        for name, info in metadata.items():
            key, size = info["storage"]
            data = archive.read(f"archive/data/{key}")
            if len(data) != size * 4:
                raise ValueError("Invalid storage length")
            storage = struct.unpack(f"<{size}f", data)
            values = [storage[info["offset"] + sum(i*s for i, s in zip(index, info["stride"]))]
                      for index in itertools.product(*(range(d) for d in info["shape"]))]
            if not all(math.isfinite(v) for v in values):
                raise ValueError("Nonfinite weights")
            result[name] = {"shape": list(info["shape"]), "values": values}
    return digest, result


def main():
    digest, weights = read_weights()
    output = ROOT / "browser/models"
    output.mkdir(parents=True, exist_ok=True)
    data = bytearray()
    tensors = {}
    for name, item in weights.items():
        tensors[name] = {"shape": item["shape"], "offset": len(data)//4, "length": len(item["values"])}
        data.extend(struct.pack(f"<{len(item['values'])}f", *item["values"]))
    (output / "lstm.bin").write_bytes(data)
    manifest = dict(upstream="taufeeque9/HumanFallDetection", commit="0f9fa0066d4305c65ef1f024d1297c7b5e35c535",
                    source_sha256=digest, binary_sha256=hashlib.sha256(data).hexdigest(),
                    feature_order=["ratio_bbox", "log_angle", "re", "ratio_derivative", "gf"],
                    hidden_size=48, layers=2, classes=7, tensors=tensors)
    (output / "lstm.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Exported {len(data):,} bytes from checkpoint {digest}")


if __name__ == "__main__":
    main()
