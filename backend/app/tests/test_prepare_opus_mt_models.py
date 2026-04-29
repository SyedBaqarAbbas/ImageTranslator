from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = BACKEND_ROOT / "scripts" / "prepare_opus_mt_models.py"

spec = importlib.util.spec_from_file_location("prepare_opus_mt_models", SCRIPT_PATH)
assert spec is not None
prepare_opus_mt_models = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = prepare_opus_mt_models
spec.loader.exec_module(prepare_opus_mt_models)


def test_default_model_root_points_to_backend_models() -> None:
    assert prepare_opus_mt_models.DEFAULT_MODEL_ROOT == BACKEND_ROOT / "models" / "opus-mt"


def test_model_status_reports_missing_files_and_conversion_command(tmp_path: Path) -> None:
    status = prepare_opus_mt_models.model_status(
        pair="ja-en",
        model="Helsinki-NLP/opus-mt-ja-en",
        model_root=tmp_path,
        converter="ct2-transformers-converter",
        quantization="int8",
        force=True,
    )

    assert status.present is False
    assert status.missing_files == ["model.bin", "config.json", "source.spm", "target.spm"]
    assert status.command == [
        "ct2-transformers-converter",
        "--model",
        "Helsinki-NLP/opus-mt-ja-en",
        "--output_dir",
        str(tmp_path / "ja-en"),
        "--quantization",
        "int8",
        "--copy_files",
        "source.spm",
        "target.spm",
        "--low_cpu_mem_usage",
        "--force",
    ]


def test_model_status_ready_when_required_files_exist(tmp_path: Path) -> None:
    model_dir = tmp_path / "ko-en"
    model_dir.mkdir()
    for filename in prepare_opus_mt_models.REQUIRED_MODEL_FILES:
        (model_dir / filename).write_text("", encoding="utf-8")

    status = prepare_opus_mt_models.model_status(
        pair="ko-en",
        model="Helsinki-NLP/opus-mt-ko-en",
        model_root=tmp_path,
        converter="ct2-transformers-converter",
        quantization="int8",
        force=False,
    )

    assert status.present is True
    assert status.missing_files == []


def test_write_manifest_records_statuses(tmp_path: Path) -> None:
    status = prepare_opus_mt_models.model_status(
        pair="ja-en",
        model="Helsinki-NLP/opus-mt-ja-en",
        model_root=tmp_path,
        converter="ct2-transformers-converter",
        quantization="int8",
        force=False,
    )

    prepare_opus_mt_models.write_manifest(tmp_path, [status], dry_run=True)

    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["dry_run"] is True
    assert manifest["required_files"] == ["model.bin", "config.json", "source.spm", "target.spm"]
    assert manifest["models"][0]["pair"] == "ja-en"
    assert manifest["models"][0]["present"] is False


def test_main_check_only_returns_nonzero_when_models_are_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_opus_mt_models.py",
            "--model-root",
            str(tmp_path),
            "--pairs",
            "ja-en",
            "--check-only",
            "--converter",
            "ct2-fake",
        ],
    )

    assert prepare_opus_mt_models.main() == 1


def test_main_dry_run_skips_conversion(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def fail_run(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("dry-run should not execute conversion")

    monkeypatch.setattr(subprocess, "run", fail_run)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_opus_mt_models.py",
            "--model-root",
            str(tmp_path),
            "--pairs",
            "ja-en",
            "--dry-run",
            "--converter",
            "ct2-fake",
        ],
    )

    assert prepare_opus_mt_models.main() == 0
    assert (tmp_path / "manifest.json").exists()
