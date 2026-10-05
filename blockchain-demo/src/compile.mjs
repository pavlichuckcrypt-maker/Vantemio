import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function compile() {
  const sources = Object.fromEntries(['StudioRelease.sol', 'DemoCredit.sol'].map(name =>
    [name, { content: fs.readFileSync(path.join(ROOT, 'contracts', name), 'utf8') }]));
  const result = JSON.parse(solc.compile(JSON.stringify({language:'Solidity', sources,
    settings:{ optimizer:{enabled:true,runs:200}, evmVersion:'shanghai',
      outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}} }
  }), {import:name => {
    try { return {contents:fs.readFileSync(path.join(ROOT, 'node_modules', name), 'utf8')}; }
    catch { return {error:`Import not found: ${name}`}; }
  }}));
  const errors = (result.errors || []).filter(x=>x.severity==='error');
  if (errors.length) throw new Error(errors.map(x=>x.formattedMessage).join('\n'));
  return Object.fromEntries(Object.entries(result.contracts).filter(([name])=>name in sources)
    .flatMap(([,contracts])=>Object.entries(contracts)));
}

export function artifact(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules',relative),'utf8'));
}
