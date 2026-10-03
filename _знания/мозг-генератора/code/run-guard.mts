// usage: node --experimental-strip-types run-guard.mts <input> <format_code> [maxChars] [lastOpeningsFile] [signaturesFile]
import { guard } from './text-guard.ts';
import { readFileSync } from 'node:fs';
const [,, file, format, maxChars, lastFile, sigFile] = process.argv;
const rd = (f?: string) => (f && f !== '-' ? readFileSync(f, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : []);
const r = guard(readFileSync(file, 'utf8'), { format: format as any, maxChars: maxChars && maxChars !== '-' ? +maxChars : undefined, lastOpenings: rd(lastFile), signatures: rd(sigFile) });
console.log(JSON.stringify(r, null, 2));
