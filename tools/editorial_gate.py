#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EDITORIAL-ACCEPTANCE GATE -- DEPLOYED PRODUCTION implementation.

Origin: proposal artifact for bell event #1289 (oc-scenario), QA #2041 PASS.
Deployed into production by oc-integrator under bell #2131 (this file lives at
C:/AI/tools/montage_brain/editorial_gate.py and is imported by
подготовка_фильмов._сценарий_шаг). Pure-python, no model calls, no production
imports -- safe to import and test in isolation.

Bell #2862 adds the RELEASE gate (release_gate_check) that closes QA #2041's
flagged residual risk: gate_check blocks only byte-identical rejected text, so a
chapter that was MODIFIED but still carries every unsupported claim is recorded
as stale_needs_reaudit_no_block and the лента may advance. release_gate_check
therefore requires a FRESH accepted verdict for the CURRENT text before a film
may be declared ready for montage.

Purpose: prevent the подготовка_фильмов лента from advancing a film past a
chapter that an editorial audit (C02-style) marked not-accepted AND whose
GUION content is still the un-corrected text. This directly closes the two HIGH
gaps from the ep08 directing audit (event #1261, EP08-DC-1 and EP08-DC-2).

Design (see editorial_gate_proposal.md for full rationale):
  * A per-film editorial ledger at plan/EDITORIAL_STATUS.json holds, per
    chapter, the audit verdict and the sha256 of the audited chapter block.
  * The gate reads the ledger and the current GUION_ES.md, extracts each prior
    chapter's text block, and blocks iff some prior chapter is not-accepted
    AND its current block sha still equals the audited block sha (i.e. the
    un-accepted text is still present).
  * A rewritten chapter (sha changed) is NOT blocked -- the old verdict is
    stale; a re-audit is the audit process's job, not the gate's. This avoids
    deadlocking the лента on a corrected chapter with no re-audit scheduled.

The reference module exposes the functions the proposal recommends integrating
into подготовка_фильмов._сценарий_шаг (read-only gate_check + a return-string
helper) and into the editorial-audit writer (write_ledger_entry).
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Mapping, Optional

LEDGER_NAME = "EDITORIAL_STATUS.json"
LEDGER_REL = os.path.join("plan", LEDGER_NAME)
GUION_REL = os.path.join("plan", "GUION_ES.md")

CHAPTER_HEAD_RE = re.compile(r"^##\s+(\d\d)\s+—", re.M)

#: statuses that count as "not accepted" -- the gate blocks on these.
NOT_ACCEPTED = {"draft_not_accepted", "blocked", "rejected"}
ACCEPTED = {"accepted"}


def ledger_path(root: str) -> str:
    return os.path.join(root, LEDGER_REL)


def guion_path(root: str) -> str:
    return os.path.join(root, GUION_REL)


def _sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_newlines(text: str) -> str:
    """Canonical newline form: CRLF and lone CR both become LF.

    Why this is load-bearing (measured under bell #2862): production GUION_ES.md
    at X:/AIMmontag/Projects/ep08 has CRLF at rest, and the gate reads it with
    io.open(text mode), which applies universal-newline translation. A byte-strict
    reader of the SAME file therefore hashed ch02 to 41624bceaa68... while the gate
    hashed it to 612b73804a56... -- two different shas for identical content.
    Since X: is shared with Mac (LF) and station (CRLF), a pure line-ending
    difference would make an unaccepted chapter look 'rewritten since audit' and
    silently UNBLOCK it. Normalizing here makes the canonical sha reader-mode and
    host independent, WITHOUT changing the value the deployed gate already uses
    (text-mode input is already LF, so this is a no-op on that path).
    """
    return text.replace("\r\n", "\n").replace("\r", "\n")


def chapter_block(guion_text: str, chapter: int) -> str:
    """Return the canonical text block of chapter N (from its '## NN —' head to
    the next head or EOF). '' if the chapter is absent.

    The block is right-stripped of trailing whitespace/newlines so that it (and
    therefore its sha) is INVARIANT to the production append separator:
    подготовка_фильмов.py:573-574 appends `("\\n\\n" if existing else "") +
    кусок + "\\n"`, so the `\\n\\n` that precedes the NEXT chapter head lands
    inside the raw slice this function extracts. Without normalization the
    audited chapter's block grows by that separator on the first following
    append and the sha changes (QA criterion-5 defect, EDITORIAL_GATE_QA_REPORT
    _20260910.md). Normalizing here means the single canonical extraction cannot
    be bypassed by a caller that hashes the raw block.
    """
    guion_text = normalize_newlines(guion_text)
    needle = "## %02d —" % chapter
    start = guion_text.find(needle)
    if start < 0:
        return ""
    # next head after start
    nxt = guion_text.find("\n## ", start + 1)
    end = len(guion_text) if nxt < 0 else nxt + 1
    return guion_text[start:end].rstrip()


def chapter_block_sha(guion_text: str, chapter: int) -> Optional[str]:
    """sha256 of the normalized chapter block. The audit writer and the gate both
    call this, so both sides normalize identically. The `.rstrip()` is explicit
    here (idempotent with `chapter_block`) so the hash is self-evidently
    separator-invariant."""
    block = chapter_block(guion_text, chapter)
    if not block:
        return None
    return _sha_bytes(block.rstrip().encode("utf-8"))


def read_ledger(root: str) -> dict[str, Any]:
    p = Path(ledger_path(root))
    try:
        with io.open(str(p), "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def write_ledger_entry(root: str, chapter: int, *, editorial_status: str,
                       audited_chapter_sha256: str, blocked_claims=None,
                       audit_artifact: Optional[str] = None,
                       audited_at: Optional[str] = None) -> dict[str, Any]:
    """Audit-side helper: merge a chapter verdict into the per-film ledger.

    Atomic write; creates plan/ if missing. Intended to be called by the
    editorial-audit process (C02-style) after it reviews a chapter, with the
    chapter block sha at audit time so the gate can detect unchanged content.
    """
    p = Path(ledger_path(root))
    p.parent.mkdir(parents=True, exist_ok=True)
    ledger = read_ledger(root)
    if not isinstance(ledger.get("chapters"), dict):
        ledger = {"schema": "aimmontag.editorial-status/v1", "chapters": {}}
    entry = {
        "editorial_status": editorial_status,
        "audited_chapter_sha256": audited_chapter_sha256,
        "blocked_claims": blocked_claims or [],
        "audit_artifact": audit_artifact,
        "audited_at": audited_at or time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    ledger["chapters"][str(int(chapter))] = entry
    ledger["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    tmp = str(p) + ".tmp%d" % os.getpid()
    with io.open(tmp, "w", encoding="utf-8") as fh:
        json.dump(ledger, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, str(p))
    return entry


def gate_check(root: str, next_chapter: int, guion_text: Optional[str] = None) -> dict[str, Any]:
    """Read-only gate. Called by подготовка_фильмов._сценарий_шаг BEFORE the
    lock/model path, when about to write `next_chapter`.

    Returns {"block": bool, "blocking_chapter": int|None, "reason": str,
    "details": [...]}. Blocks iff some prior chapter 0..next_chapter-1 has an
    editorial verdict in NOT_ACCEPTED and its current GUION block sha equals
    the audited sha (content unchanged). A rewritten chapter (sha changed) is
    recorded as needs_reaudit but does NOT block.
    """
    details = []
    if next_chapter <= 0:
        return {"block": False, "blocking_chapter": None, "reason": "first chapter, no prior to gate",
                "details": details}
    if guion_text is None:
        try:
            with io.open(guion_path(root), "r", encoding="utf-8") as fh:
                guion_text = fh.read()
        except OSError:
            return {"block": False, "blocking_chapter": None,
                    "reason": "guion unreadable; gate cannot verify, not blocking (conservative)",
                    "details": details}
    ledger = read_ledger(root)
    chapters = (ledger.get("chapters") or {}) if isinstance(ledger, dict) else {}
    for ch in range(0, int(next_chapter)):
        entry = chapters.get(str(ch))
        if not isinstance(entry, Mapping):
            continue  # no audit for this chapter -> allow
        status = str(entry.get("editorial_status") or "")
        if status in ACCEPTED:
            continue  # accepted -> fine
        if status not in NOT_ACCEPTED:
            # unknown status -> do not block, record
            details.append({"chapter": ch, "status": status, "action": "unknown_status_no_block"})
            continue
        audited_sha = entry.get("audited_chapter_sha256")
        cur_sha = chapter_block_sha(guion_text, ch)
        if cur_sha is None:
            # chapter absent from GUION now (shouldn't happen for a prior ch) -> not blocking
            details.append({"chapter": ch, "status": status, "action": "chapter_absent_no_block"})
            continue
        if audited_sha and cur_sha == audited_sha:
            return {"block": True, "blocking_chapter": ch,
                    "reason": "chapter %02d editorial_status=%s and GUION block unchanged since audit" % (ch, status),
                    "details": details + [{"chapter": ch, "status": status,
                                           "audited_sha": audited_sha, "current_sha": cur_sha,
                                           "action": "BLOCK"}]}
        # content changed since audit -> verdict stale, allow, needs re-audit
        details.append({"chapter": ch, "status": status, "audited_sha": audited_sha,
                        "current_sha": cur_sha, "action": "stale_needs_reaudit_no_block"})
    return {"block": False, "blocking_chapter": None,
            "reason": "all prior chapters accepted/unaudited/rewritten-since-audit",
            "details": details}


def gate_return_string(next_chapter: int, gate_result: Mapping[str, Any]) -> str:
    """Produce a лента-style 'ждёт' string for a blocked gate, matching the
    existing pattern in подготовка_фильмов._сценарий_шаг (e.g. 'глава %02d ждёт:
    другой процесс...'). Only meaningful when gate_result['block'] is True."""
    if not gate_result.get("block"):
        return ""
    bc = gate_result.get("blocking_chapter")
    return ("глава %02d ждёт: глава %02d не принята редакцией (%s) — "
            "правка главы %02d нужна до движения ленты"
            % (int(next_chapter), int(bc), gate_result.get("reason", ""), int(bc)))
#: Statuses that mean "a fresh editorial verdict is required before release".
#: A chapter that was audited and NOT accepted blocks release whether or not its
#: text changed; a chapter whose text changed after an `accepted` verdict also
#: blocks, because that verdict no longer describes the current text.
def release_gate_check(root: str, guion_text: Optional[str] = None) -> dict[str, Any]:
    """RELEASE gate (bell #2862): read-only; decides whether a film may be
    declared ready for montage/release.

    This is the residual-risk mitigation QA #2041 required. gate_check() only
    blocks the *next chapter write* and only while the rejected text is
    byte-identical; a modified-but-still-unsupported chapter slips through as
    `stale_needs_reaudit_no_block`. Release is a stronger question, so this gate
    requires a FRESH `accepted` verdict for the CURRENT text of every chapter
    that has ever been editorially audited.

    Deliberately backward compatible / non-halting:
      * no ledger, unreadable ledger or unreadable GUION -> no block (identical
        to today's behaviour);
      * chapters with NO ledger entry -> no block (a film whose chapters were
        never audited is not suddenly unreleasable);
      * unknown status values -> recorded, no block.
    Only an explicit not-accepted verdict, or an `accepted` verdict whose sha no
    longer matches the current text, blocks release.

    Returns {"block": bool, "blocking_chapter": int|None, "reason": str,
             "details": [...]}. The lowest blocking chapter wins (deterministic).
    """
    details: list[dict[str, Any]] = []
    ledger = read_ledger(root)
    chapters = (ledger.get("chapters") or {}) if isinstance(ledger, dict) else {}
    if not chapters:
        return {"block": False, "blocking_chapter": None,
                "reason": "no editorial ledger entries; release gate not blocking (backward compatible)",
                "details": details}
    if guion_text is None:
        try:
            with io.open(guion_path(root), "r", encoding="utf-8") as fh:
                guion_text = fh.read()
        except OSError:
            return {"block": False, "blocking_chapter": None,
                    "reason": "guion unreadable; release gate cannot verify, not blocking (conservative)",
                    "details": details}
    guion_text = normalize_newlines(guion_text)

    def _keys() -> list[int]:
        out: list[int] = []
        for k in chapters:
            try:
                out.append(int(k))
            except (TypeError, ValueError):
                details.append({"chapter": k, "action": "non_integer_chapter_key_ignored"})
        return sorted(out)

    for ch in _keys():
        entry = chapters.get(str(ch))
        if not isinstance(entry, Mapping):
            details.append({"chapter": ch, "action": "malformed_entry_no_block"})
            continue
        status = str(entry.get("editorial_status") or "")
        audited_sha = entry.get("audited_chapter_sha256")
        cur_sha = chapter_block_sha(guion_text, ch)
        if cur_sha is None:
            details.append({"chapter": ch, "status": status, "action": "chapter_absent_no_block"})
            continue
        if status in ACCEPTED:
            if audited_sha and cur_sha == audited_sha:
                details.append({"chapter": ch, "status": status, "audited_sha": audited_sha,
                                "current_sha": cur_sha, "action": "fresh_accepted_ok"})
                continue
            details.append({"chapter": ch, "status": status, "audited_sha": audited_sha,
                            "current_sha": cur_sha, "action": "BLOCK",
                            "code": "accepted_stale_needs_reaudit"})
            return {"block": True, "blocking_chapter": ch,
                    "reason": ("chapter %02d was accepted at sha %s but the current text is %s "
                               "-- the verdict is stale, a fresh re-audit is required before release"
                               % (ch, str(audited_sha)[:12], cur_sha[:12])),
                    "details": details}
        if status not in NOT_ACCEPTED:
            details.append({"chapter": ch, "status": status, "action": "unknown_status_no_block"})
            continue
        code = ("unaccepted_unchanged" if (audited_sha and cur_sha == audited_sha)
                else "unaccepted_modified_needs_fresh_reaudit")
        details.append({"chapter": ch, "status": status, "audited_sha": audited_sha,
                        "current_sha": cur_sha, "action": "BLOCK", "code": code})
        return {"block": True, "blocking_chapter": ch,
                "reason": ("chapter %02d editorial_status=%s and no fresh accepted verdict for the "
                           "current text (%s)" % (ch, status, code)),
                "details": details}
    return {"block": False, "blocking_chapter": None,
            "reason": "every audited chapter carries a fresh accepted verdict for its current text",
            "details": details}


def release_return_string(release_result: Mapping[str, Any]) -> str:
    """лента-style waiting string for a blocked release, matching the existing
    pattern used by gate_return_string / plan_approval refusals."""
    if not release_result.get("block"):
        return ""
    bc = release_result.get("blocking_chapter")
    return ("фильм не готов к монтажу: глава %02d требует свежего редакционного вердикта (%s)"
            % (int(bc), release_result.get("reason", "")))
