"""Exercise a real interrupted optimizer run using synthetic, non-video data."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TRAINER = ROOT / "tools/train_tcn_cycle6.py"


class TrainingResumeTest(unittest.TestCase):
    def test_interruption_preserves_optimizer_rng_and_export(self):
        with tempfile.TemporaryDirectory(prefix="carewatch-tcn-resume-") as temporary:
            base = Path(temporary)
            rng = np.random.default_rng(6201)
            x = rng.normal(size=(128, 18, 56)).astype("<f4")
            x[:, :, 3:52:4] = 1
            x[:, :, 52] = 1
            y = np.arange(128, dtype="u1") % 2
            w = np.ones(128, dtype="<f4")
            recipe = dict(steps=18, dim=56, hidden=4, kernel=5, dilation=3,
                          seed=61107, epochs=40, batchSize=16, rate=.001,
                          threshold=.98,
                          codeHashes={"tools/train_tcn_cycle6.py": hashlib.sha256(TRAINER.read_bytes()).hexdigest()})
            for name in ("full", "resumed"):
                directory = base / name
                directory.mkdir()
                (directory / "recipe.json").write_text(json.dumps(recipe))
                for split in ("train", "selection"):
                    files = {}
                    for suffix, value in (("x.f32", x), ("y.u8", y), ("w.f32", w)):
                        data = value.tobytes()
                        (directory / f"{split}-{suffix}").write_bytes(data)
                        files[suffix] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                    (directory / f"{split}-data.json").write_text(json.dumps(dict(shape=list(x.shape), files=files)))
            command = [sys.executable, str(TRAINER), "--data"]
            subprocess.run(command + [str(base / "full")], check=True, capture_output=True, text=True)
            process = subprocess.Popen(command + [str(base / "resumed")], stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True)
            try:
                for line in process.stdout:
                    if '"epoch": 5,' in line:
                        process.terminate()
                        break
                process.wait(timeout=30)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                process.stdout.close()
            with np.load(base / "resumed/training-checkpoint.npz", allow_pickle=False) as saved:
                info = json.loads(str(saved["info"]))
                self.assertGreaterEqual(info["epoch"], 5)
                self.assertLess(info["epoch"], 40, "Run must really be interrupted")
                self.assertIn("rng", info)
                self.assertIn("m_w1", saved.files)
                self.assertIn("v_w1", saved.files)
            result = subprocess.run(command + [str(base / "resumed")], check=True, capture_output=True, text=True)
            self.assertIn("Resumed epoch", result.stdout)
            for name in ("model.json", "training-report.json", "reference.json"):
                self.assertEqual((base / "full" / name).read_bytes(), (base / "resumed" / name).read_bytes(), name)
            with np.load(base / "full/training-checkpoint.npz", allow_pickle=False) as full, \
                    np.load(base / "resumed/training-checkpoint.npz", allow_pickle=False) as resumed:
                self.assertEqual(full.files, resumed.files)
                for key in full.files:
                    np.testing.assert_array_equal(full[key], resumed[key], err_msg=key)


if __name__ == "__main__":
    unittest.main()
