#!/usr/bin/env python3
import os
import sys


EXTRACTOR_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if EXTRACTOR_ROOT not in sys.path:
    sys.path.insert(0, EXTRACTOR_ROOT)

from workflow_extractor.cli_demo_video import main


if __name__ == "__main__":
    raise SystemExit(main())
