"""Create an explicitly labelled demo acceptance fixture through studio code."""
import hashlib
import json
import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for _p in [ROOT.parent / "tools", Path("C:/AI/tools"), ROOT.parent.parent / "tools"]:
    if _p.exists():
        sys.path.insert(0, str(_p))
        break
import editorial_gate
from blockchain_release import file_sha256, prepare_release

def prepare(recipient: str) -> dict:
    runtime = ROOT / ("runtime-base" if os.environ.get("AIM_DEMO_NETWORK") == "base-sepolia" else "runtime-bsc" if os.environ.get("AIM_DEMO_NETWORK") == "bsc-testnet" else "runtime")
    project = Path(os.environ.get("AIM_DEMO_PROJECT", str(runtime / "demo-studio-project"))).resolve()
    (project / "plan").mkdir(parents=True, exist_ok=True)
    (project / "exports").mkdir(exist_ok=True)
    video = project / "exports" / "investor-demo.mp4"
    if not video.exists():
        source = ROOT.parent.parent / "part1_FINAL_ffmpeg.mp4"
        ffmpeg = str(Path.home() / ".local" / "bin" / "ffmpeg")
        args = (["-ss", "15", "-i", str(source)] if source.exists() else
                ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25"])
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *args,
                        "-t", "8", "-vf", "scale=1280:720", "-an", "-c:v", "libx264",
                        "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart", str(video)],
                       check=True, timeout=60)
    guion = "## 01 — AIMmontag Web3 investor demo\n\nThis is an isolated demo acceptance fixture.\n"
    (project / "plan" / "GUION_ES.md").write_text(guion, encoding="utf-8")
    chapter_hash = editorial_gate.chapter_block_sha(guion, 1)
    if not chapter_hash:
        raise ValueError("demo_script_chapter_not_recognized")
    ledger = {"chapters": {"1": {"editorial_status": "accepted", "audited_chapter_sha256": chapter_hash}}}
    (project / "plan" / "EDITORIAL_STATUS.json").write_text(json.dumps(ledger), encoding="utf-8")
    receipt = {"schemaVersion": 1, "releaseId": "aimmontag-investor-demo-v1", "accepted": True,
               "reviewer": "demo-fixture-generator (not production editorial approval)",
               "videoPath": "exports/investor-demo.mp4", "videoSha256": file_sha256(video),
               "recipient": recipient, "title": "AIMmontag / Video ownership demo",
               "terms": "Demo certificate only. No copyright or commercial license transfer. " +
                        ("Public Base Sepolia; test ETH has no monetary value." if os.environ.get("AIM_DEMO_NETWORK") == "base-sepolia" else "Public BSC Testnet; tBNB has no monetary value." if os.environ.get("AIM_DEMO_NETWORK") == "bsc-testnet" else "Local sandbox; no monetary value."),
               "demoFixture": True}
    receipt_path = project / "final_acceptance.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    passport = prepare_release(str(project), str(receipt_path))
    (runtime / "prepared-passport.json").write_text(json.dumps(passport, indent=2), encoding="utf-8")
    return passport

if __name__ == "__main__":
    print(json.dumps(prepare(sys.argv[1]), ensure_ascii=False))
