"""Explicit studio acceptance -> immutable Web3 passport adapter.

No wallet keys or blockchain writes. Missing editorial/final-file acceptance fails
closed. The demo server consumes this same adapter using a labelled demo fixture.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any
import editorial_gate


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_release(project_root: str, receipt_path: str) -> dict[str, Any]:
    root = Path(project_root).resolve(strict=True)
    receipt_file = Path(receipt_path).resolve(strict=True)
    if not receipt_file.is_relative_to(root):
        raise ValueError("acceptance_receipt_outside_project")
    receipt = json.loads(receipt_file.read_text(encoding="utf-8"))
    allowed = {"schemaVersion", "releaseId", "accepted", "reviewer", "videoPath", "videoSha256",
               "recipient", "title", "terms", "demoFixture"}
    if set(receipt) != allowed or receipt["schemaVersion"] != 1 or receipt["accepted"] is not True:
        raise ValueError("invalid_or_missing_final_acceptance")
    if not all(isinstance(receipt[k], str) and receipt[k].strip()
               for k in ["releaseId", "reviewer", "videoPath", "videoSha256", "recipient", "title", "terms"]):
        raise ValueError("invalid_acceptance_fields")
    recipient = receipt["recipient"]
    if len(recipient) != 42 or not recipient.startswith("0x"):
        raise ValueError("invalid_recipient")
    try:
        if int(recipient[2:], 16) == 0:
            raise ValueError("zero_recipient")
    except ValueError as exc:
        raise ValueError("invalid_recipient") from exc
    video = (root / receipt["videoPath"]).resolve(strict=True)
    if not video.is_relative_to(root) or not video.is_file() or video.stat().st_size == 0:
        raise ValueError("invalid_video_path")
    actual_sha = file_sha256(video)
    if actual_sha != receipt["videoSha256"]:
        raise ValueError("video_changed_after_acceptance")
    gate = editorial_gate.release_gate_check(str(root))
    ledger = editorial_gate.read_ledger(str(root))
    chapters = ledger.get("chapters")
    script = Path(editorial_gate.guion_path(str(root))).read_text(encoding="utf-8")
    script_chapters = {str(int(value)) for value in re.findall(r"^## (\d{2}) —", script, re.MULTILINE)}
    # Existing editorial gate is backward compatible. This stricter adapter must
    # not treat an absent/unreadable ledger or missing chapter as accepted.
    if (gate.get("block") or not isinstance(chapters, dict) or not chapters
            or not script_chapters or set(chapters) != script_chapters
            or len(gate.get("details", [])) != len(chapters)
            or any(d.get("action") != "fresh_accepted_ok" for d in gate["details"])):
        raise ValueError("fresh_editorial_acceptance_required")
    if not isinstance(receipt["demoFixture"], bool):
        raise ValueError("invalid_demo_marker")
    return {"schemaVersion": 1, "releaseId": receipt["releaseId"], "recipient": recipient,
            "title": receipt["title"], "videoSha256": actual_sha, "videoSize": video.stat().st_size,
            "terms": receipt["terms"], "reviewer": receipt["reviewer"], "accepted": True,
            "editorialVerified": True, "acceptanceReceiptSha256": file_sha256(receipt_file),
            "demoFixture": receipt["demoFixture"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        result = prepare_release(args.project, args.receipt)
        content = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2)
        if args.output:
            target = Path(args.output)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + ".tmp")
            temporary.write_text(content + "\n", encoding="utf-8")
            temporary.replace(target)
        print(content)
        return 0
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
