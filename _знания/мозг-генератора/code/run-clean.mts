// usage: node --experimental-strip-types run-clean.mts <input.md>  → печатает очищенный образец
import { cleanSample } from './text-guard.ts';
import { readFileSync } from 'node:fs';
console.log(cleanSample(readFileSync(process.argv[2], 'utf8')));
