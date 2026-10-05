"""Authenticated, idempotent after-render hook for the public Base Sepolia demo.

Only projects with an explicit blockchain-demo.json opt in. Final acceptance is
validated by the same studio adapter before any network request. No keys here.
"""
from __future__ import annotations
import json
import hashlib
import os
import re
import tempfile
from pathlib import Path
import urllib.request
import urllib.error
from blockchain_release import prepare_release

MODULE = Path(__file__).resolve().parents[1] / 'blockchain-demo'
ADDRESS = re.compile(r'0x[0-9a-fA-F]{40}\Z')
HASH = re.compile(r'0x[0-9a-fA-F]{64}\Z')

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.URLError('studio_redirect_refused')

def _publication_result(result, passport):
    if not isinstance(result, dict) or result.get('ok') is not True:
        raise ValueError('public_base_publication_not_confirmed')
    record = result.get('result')
    if (not isinstance(record, dict) or type(record.get('chainId')) is not int or record.get('chainId') != 84532
            or record.get('status') != 'confirmed'
            or record.get('releaseId') != passport['releaseId']
            or record.get('videoSha256') != passport['videoSha256']
            or not isinstance(record.get('tokenId'), str)
            or not re.fullmatch(r'[1-9][0-9]{0,77}', record['tokenId'])
            or not isinstance(record.get('owner'), str) or not ADDRESS.fullmatch(record['owner'])
            or record['owner'].lower() != passport['recipient'].lower()
            or any(not isinstance(record.get(k), str) or not HASH.fullmatch(record[k])
                   for k in ['metadataHash', 'termsHash'])):
        raise ValueError('publication_does_not_match_accepted_version')
    if record['termsHash'] != '0x' + hashlib.sha256(passport['terms'].encode()).hexdigest():
        raise ValueError('publication_terms_differ_from_acceptance')
    metadata = {'name': passport['title'], 'description': 'AIMmontag demo certificate of an accepted video version.',
                'properties': {'release_id': passport['releaseId'], 'video_sha256': passport['videoSha256'],
                               'terms_sha256': record['termsHash'][2:], 'content_kind': 'video',
                               'test_only': True, 'rights': 'No copyright or commercial rights transfer'}}
    encode_hash = lambda value: '0x' + hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    current_hash = encode_hash(metadata)
    del metadata['properties']['content_kind']
    if record['metadataHash'] not in {current_hash, encode_hash(metadata)}:
        raise ValueError('publication_metadata_differ_from_acceptance')
    allowed = {'releaseId', 'tokenId', 'owner', 'currentOwner', 'videoSha256', 'metadataHash',
               'termsHash', 'tx', 'block', 'operationDigest', 'approvalAddresses', 'status',
               'confirmationPolicy', 'chainId', 'explorer', 'createdAt', 'idempotent', 'recovered'}
    if set(record) - allowed:
        raise ValueError('unexpected_publication_response_fields')
    if 'tx' in record and (not isinstance(record['tx'], str) or not HASH.fullmatch(record['tx'])):
        raise ValueError('invalid_publication_transaction')
    if 'block' in record and (type(record['block']) is not int or record['block'] <= 0):
        raise ValueError('invalid_publication_block')
    if 'currentOwner' in record and (not isinstance(record['currentOwner'], str) or not ADDRESS.fullmatch(record['currentOwner'])):
        raise ValueError('invalid_current_token_owner')
    for name in ['idempotent', 'recovered']:
        if name in record and type(record[name]) is not bool:
            raise ValueError('invalid_publication_flag')
    if record.get('explorer') is not None and record['explorer'] != 'https://sepolia.basescan.org/tx/' + record.get('tx', ''):
        raise ValueError('invalid_publication_explorer')
    fields = ['releaseId', 'tokenId', 'owner', 'currentOwner', 'videoSha256', 'metadataHash',
              'termsHash', 'tx', 'block', 'chainId', 'explorer', 'idempotent', 'recovered']
    return {'status': 'confirmed', **{k: record[k] for k in fields if k in record},
            'acceptanceReceiptSha256': passport['acceptanceReceiptSha256']}

def _save_publication(target, public):
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                         prefix='.blockchain-publication-', delete=False) as stream:
            name = stream.name
            json.dump(public, stream, ensure_ascii=False, indent=2)
            stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, target); name = None
        directory = os.open(target.parent, os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if name is not None:
            try: os.unlink(name)
            except FileNotFoundError: pass

def after_render(project_root: str) -> dict:
    root = Path(project_root).resolve()
    config_path = root / 'blockchain-demo.json'
    if not config_path.exists():
        return {'status': 'disabled', 'reason': 'project_not_opted_in'}
    try:
        config = json.loads(config_path.read_text(encoding='utf-8'))
        if (not isinstance(config, dict) or set(config) != {'enabled', 'chainId', 'recipient', 'receipt'}
                or config['enabled'] is not True or type(config['chainId']) is not int or config['chainId'] != 84532
                or not isinstance(config['recipient'], str) or not ADDRESS.fullmatch(config['recipient'])
                or config['receipt'] != 'final_acceptance.json'):
            raise ValueError('invalid_base_demo_project_config')
        receipt = (root / config['receipt']).resolve(strict=True)
        if receipt != root / 'final_acceptance.json':
            raise ValueError('only_final_acceptance_receipt_is_allowed')
        passport = prepare_release(str(root), str(receipt))
        if passport['recipient'].lower() != config['recipient'].lower():
            raise ValueError('recipient_differs_from_project_registration')
        token = (MODULE / 'runtime-base' / 'studio-api-token').read_text().strip()
        data = json.dumps({'project': str(root), 'acceptanceReceiptSha256': passport['acceptanceReceiptSha256']}).encode()
        request = urllib.request.Request('http://127.0.0.1:18339/api/studio-release', data=data,
            headers={'Content-Type': 'application/json', 'X-Studio-Token': token}, method='POST')
        # Never expose the studio token through redirects or environment proxies.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
        with opener.open(request, timeout=150) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError('publication_response_too_large')
        result = json.loads(raw)
        public = _publication_result(result, passport)
        if prepare_release(str(root), str(receipt)) != passport or json.loads(config_path.read_text(encoding='utf-8')) != config:
            raise ValueError('acceptance_changed_during_publication')
        target = root / 'blockchain-publication.json'
        _save_publication(target, public)
        return public
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        # Rendering can finish while publication is pending. Never claim chain success.
        return {'status': 'pending', 'reason': str(exc)}

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--project',required=True)
    args=parser.parse_args();result=after_render(args.project)
    print(json.dumps(result,ensure_ascii=False));raise SystemExit(0 if result['status'] in ['confirmed','disabled'] else 2)
