from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.benchmarks.korean_region_detection import (
    run_local_tesseract_benchmark,
    run_synthetic_benchmark,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Benchmark Korean comic text-region detection separately from OCR.",
    )
    parser.add_argument(
        "--fixture-dir",
        type=Path,
        help="Local-only fixture directory containing manifest.json and private page images.",
    )
    parser.add_argument(
        "--source-language",
        default="ko",
        help="Tesseract source language for local-only fixtures. Defaults to ko.",
    )
    args = parser.parse_args()

    report = (
        asyncio.run(
            run_local_tesseract_benchmark(
                args.fixture_dir,
                source_language=args.source_language,
            )
        )
        if args.fixture_dir
        else run_synthetic_benchmark()
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
