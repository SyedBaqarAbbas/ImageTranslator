from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

DEFAULT_MODELS = {
    "ko-en": "Helsinki-NLP/opus-mt-ko-en",
    "ja-en": "Helsinki-NLP/opus-mt-ja-en",
}
REQUIRED_MODEL_FILES = ("model.bin", "config.json", "source.spm", "target.spm")
BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_ROOT = BACKEND_ROOT / "models" / "opus-mt"


@dataclass(frozen=True)
class ModelStatus:
    pair: str
    model: str
    output_dir: str
    present: bool
    missing_files: list[str]
    command: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare local CTranslate2 OPUS-MT models for the prototype backend."
    )
    parser.add_argument(
        "--model-root",
        type=Path,
        default=DEFAULT_MODEL_ROOT,
        help=(
            "Directory where converted language-pair model folders are stored. "
            f"Defaults to {DEFAULT_MODEL_ROOT}."
        ),
    )
    parser.add_argument(
        "--pairs",
        nargs="+",
        default=list(DEFAULT_MODELS),
        choices=sorted(DEFAULT_MODELS),
        help="Language pairs to prepare.",
    )
    parser.add_argument(
        "--quantization",
        default="int8",
        help="CTranslate2 quantization mode. Keep int8 for the low-memory prototype.",
    )
    parser.add_argument(
        "--converter",
        default=shutil.which("ct2-transformers-converter") or "ct2-transformers-converter",
        help="Path to ct2-transformers-converter.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-convert even when a model directory already looks complete.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print and record commands without executing conversion.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only validate expected model files. Does not run conversion.",
    )
    return parser.parse_args()


def conversion_command(
    converter: str,
    model: str,
    output_dir: Path,
    quantization: str,
    force: bool,
) -> list[str]:
    command = [
        converter,
        "--model",
        model,
        "--output_dir",
        str(output_dir),
        "--quantization",
        quantization,
        "--copy_files",
        "source.spm",
        "target.spm",
        "--low_cpu_mem_usage",
    ]
    if force:
        command.append("--force")
    return command


def model_status(
    pair: str,
    model: str,
    model_root: Path,
    converter: str,
    quantization: str,
    force: bool,
) -> ModelStatus:
    output_dir = model_root / pair
    missing_files = [
        filename for filename in REQUIRED_MODEL_FILES if not (output_dir / filename).exists()
    ]
    return ModelStatus(
        pair=pair,
        model=model,
        output_dir=str(output_dir),
        present=not missing_files,
        missing_files=missing_files,
        command=conversion_command(converter, model, output_dir, quantization, force),
    )


def write_manifest(model_root: Path, statuses: list[ModelStatus], dry_run: bool) -> None:
    model_root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated_at": datetime.now(UTC).isoformat(),
        "dry_run": dry_run,
        "required_files": list(REQUIRED_MODEL_FILES),
        "models": [asdict(status) for status in statuses],
    }
    (model_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def run_conversion(status: ModelStatus) -> None:
    print(f"Converting {status.pair}: {status.model} -> {status.output_dir}")
    subprocess.run(status.command, check=True)


def main() -> int:
    args = parse_args()
    model_root = args.model_root
    statuses = [
        model_status(
            pair=pair,
            model=DEFAULT_MODELS[pair],
            model_root=model_root,
            converter=args.converter,
            quantization=args.quantization,
            force=args.force,
        )
        for pair in args.pairs
    ]

    for status in statuses:
        if status.present:
            print(f"{status.pair}: ready at {status.output_dir}")
        else:
            print(f"{status.pair}: missing {', '.join(status.missing_files)}")
            print("  " + " ".join(status.command))

    write_manifest(model_root, statuses, args.dry_run)

    if args.check_only:
        return 0 if all(status.present for status in statuses) else 1
    if args.dry_run:
        return 0

    for status in statuses:
        if status.present and not args.force:
            continue
        run_conversion(status)

    final_statuses = [
        model_status(
            pair=pair,
            model=DEFAULT_MODELS[pair],
            model_root=model_root,
            converter=args.converter,
            quantization=args.quantization,
            force=args.force,
        )
        for pair in args.pairs
    ]
    write_manifest(model_root, final_statuses, dry_run=False)
    missing = [status for status in final_statuses if not status.present]
    if missing:
        for status in missing:
            missing_files = ", ".join(status.missing_files)
            print(f"{status.pair}: still missing {missing_files}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
