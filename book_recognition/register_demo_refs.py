#!/usr/bin/env python3
"""시나리오 데모 책 4권 refs 등록 — Node 스크립트로 위임.

리포 루트에서:
  npm run refs:demo
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm, "run", "refs:demo"], cwd=root, check=True)


if __name__ == "__main__":
    main()
