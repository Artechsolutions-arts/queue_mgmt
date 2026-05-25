import time
from pathlib import Path

import numpy as np
import pytest

from frame_store import FrameStore


@pytest.fixture
def store(tmp_path: Path):
    return FrameStore(
        root=tmp_path,
        zone_id="testzone",
        interval_seconds=1.0,
        window_seconds=2.0,
    )


def _fake_frame():
    return np.zeros((4, 4, 3), dtype=np.uint8)


class TestFrameStoreWrite:
    def test_first_write_succeeds(self, store):
        assert store.maybe_write(_fake_frame(), now=100.0) is True

    def test_throttles_to_interval(self, store):
        assert store.maybe_write(_fake_frame(), now=100.0) is True
        # 0.5s later — under the 1.0s interval — should skip.
        assert store.maybe_write(_fake_frame(), now=100.5) is False
        # 1.1s after the first write — should fire again.
        assert store.maybe_write(_fake_frame(), now=101.1) is True

    def test_files_are_jpeg(self, store, tmp_path):
        store.maybe_write(_fake_frame(), now=100.0)
        files = list((tmp_path / "testzone").glob("*.jpg"))
        assert len(files) == 1
        with open(files[0], "rb") as fh:
            magic = fh.read(3)
        # JPEG SOI marker.
        assert magic[:2] == b"\xff\xd8"


class TestFrameStorePrune:
    def test_removes_old_frames(self, store, tmp_path):
        # Two old frames + one fresh one (relative to "now").
        store.maybe_write(_fake_frame(), now=100.0)
        store.maybe_write(_fake_frame(), now=101.5)
        store.maybe_write(_fake_frame(), now=200.0)

        removed = store.prune(now=200.5)
        # Window is 2.0s, so cutoff = 198.5. The 200.0 frame survives.
        assert removed == 2
        survivors = sorted(p.name for p in (tmp_path / "testzone").glob("*.jpg"))
        assert survivors == ["200.jpg"]

    def test_no_op_on_empty_dir(self, tmp_path):
        # Construct with a directory that hasn't been written to yet.
        s = FrameStore(root=tmp_path / "elsewhere", zone_id="z", interval_seconds=1, window_seconds=10)
        assert s.prune(now=time.time()) == 0

    def test_ignores_non_jpg_files(self, store, tmp_path):
        zone_dir = tmp_path / "testzone"
        zone_dir.mkdir(exist_ok=True)
        (zone_dir / "notes.txt").write_text("hello")
        (zone_dir / "garbage.jpg.tmp").write_bytes(b"x")  # half-written sentinel
        store.maybe_write(_fake_frame(), now=100.0)

        store.prune(now=200.0)
        assert (zone_dir / "notes.txt").exists()
        assert (zone_dir / "garbage.jpg.tmp").exists()
