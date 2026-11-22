"""Approve or reject an indexed knowledge document after clinician review.

Example:
  python scripts/review_knowledge.py --file sources/unicef_maternal_nutrition_programming_2021.txt \
    --status APPROVED --reviewer "Dr. Example" --notes "Reviewed for nutrition counselling"
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "knowledge" / "sources_manifest.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Manifest text_file, e.g. sources/example.txt")
    parser.add_argument("--status", required=True, choices=("APPROVED", "REJECTED", "REVIEW_REQUIRED"))
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    matches = [item for item in manifest.get("documents", []) if item.get("text_file") == args.file or item.get("file") == args.file]
    if len(matches) != 1:
        raise SystemExit(f"Document not found or ambiguous: {args.file}")
    item = matches[0]
    item["review_status"] = args.status
    item["reviewed_by"] = args.reviewer
    item["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    item["review_notes"] = args.notes
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{item.get('title', args.file)} -> {args.status} by {args.reviewer}")


if __name__ == "__main__":
    main()
