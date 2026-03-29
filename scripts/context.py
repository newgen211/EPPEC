#!/usr/bin/env python3
"""Flatten EPPEC project files into a single directory for AI context upload.

Naming convention:
  backend/main.py                          ->  backend__main.py
  frontend/src/screens/ScenarioScreen.tsx  ->  frontend__src__screens__ScenarioScreen.tsx

Usage:
  python context.py                  # export everything
  python context.py --target backend # backend only
  python context.py --target frontend
  python context.py --dry-run        # preview without copying
"""

import argparse
import shutil
import sys
from pathlib import Path

# ============================================================================
# Config
# ============================================================================

DEFAULT_OUTPUT_DIR = "context_dump"
SEPARATOR = "__"

TARGET_INCLUDES: dict[str, list[str]] = {
    "backend":  ["backend"],
    "frontend": ["frontend"],
    "data":     ["data", "models"],
    "all":      [],
}

IGNORE_DIRS: set[str] = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    ".output",
    "context_dump",
}

IGNORE_SUFFIXES: set[str] = {
    ".pyc",
    ".pyo",
    ".log",
    ".lock",
    ".pt",        # YOLO weights — too large
}

IGNORE_NAMES: set[str] = {
    ".DS_Store",
    ".env",
    "package-lock.json",
    "pnpm-lock.yaml",
}

# ============================================================================
# CLI
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Flatten EPPEC files into one folder for AI context.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--target",
        nargs="+",
        choices=["backend", "frontend", "data", "all"],
        default=["all"],
        help="Which part of the project to export (default: all)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be copied without doing it",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Wipe the output directory before copying",
    )
    return parser.parse_args()

# ============================================================================
# Helpers
# ============================================================================

def should_ignore(path: Path) -> bool:
    # Check every part of the path against ignored dir names
    for part in path.parts:
        if part in IGNORE_DIRS:
            return True
        if part.startswith(".") and part not in {".env.example", ".gitignore"}:
            return True
    if path.name in IGNORE_NAMES:
        return True
    if path.suffix in IGNORE_SUFFIXES:
        return True
    return False


def collect_files(root: Path, include_dirs: list[str]) -> list[tuple[Path, str]]:
    results: list[tuple[Path, str]] = []

    for item in sorted(root.iterdir()):
        # Always include root-level files
        if item.is_file():
            rel = str(item.relative_to(root))
            if not should_ignore(item):
                results.append((item, rel))

        elif item.is_dir():
            # Skip if not in our target scope
            if include_dirs and item.name not in include_dirs:
                continue
            if should_ignore(item):
                continue

            for file in sorted(item.rglob("*")):
                if not file.is_file():
                    continue
                if should_ignore(file.relative_to(root)):
                    continue
                rel = str(file.relative_to(root))
                results.append((file, rel))

    return results


def flatten_name(relative_path: str) -> str:
    """
    backend/main.py  ->  backend__main.py
    frontend/src/App.tsx  ->  frontend__src__App.tsx
    """
    path = Path(relative_path)
    parts = list(path.parent.parts) + [path.name]
    return SEPARATOR.join(parts)

# ============================================================================
# Main
# ============================================================================

def main() -> None:
    args = parse_args()

    root   = Path(".").resolve()
    output = root / args.output

    include_dirs = (
        []
        if "all" in args.target
        else [d for t in args.target for d in TARGET_INCLUDES[t]]
    )

    files = collect_files(root, include_dirs)

    if not files:
        print("No files matched.")
        sys.exit(0)

    if args.dry_run:
        print(f"DRY RUN — {len(files)} files would be copied to {output}/\n")
        for _, rel in files:
            print(f"  {rel}  ->  {flatten_name(rel)}")
        return

    if args.clean and output.exists():
        shutil.rmtree(output)
        print(f"Cleaned {output}/")

    output.mkdir(parents=True, exist_ok=True)

    copied   = 0
    skipped  = 0

    for abs_path, rel_path in files:
        flat = flatten_name(rel_path)
        dest = output / flat

        # Skip unchanged files
        if dest.exists() and not args.clean:
            src_stat  = abs_path.stat()
            dest_stat = dest.stat()
            if src_stat.st_size == dest_stat.st_size and src_stat.st_mtime <= dest_stat.st_mtime:
                skipped += 1
                continue

        shutil.copy2(abs_path, dest)
        print(f"  {rel_path}")
        copied += 1

    print()
    print(f"✅ {copied} copied, {skipped} unchanged  ->  {output}/")
    print()
    print("Paste the contents of that folder into your AI project.")


if __name__ == "__main__":
    main()