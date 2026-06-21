import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';

export interface ExpectedFixture {
  persona: string;
  groundingTokens: string[];
  forbiddenInInjection: string[];
}

export function loadResume(id: string): string {
  return readFileSync(join(config.fixturesDir, 'resumes', `${id}.txt`), 'utf-8');
}

export function loadExpected(id: string): ExpectedFixture {
  return JSON.parse(readFileSync(join(config.fixturesDir, `${id}.expected.json`), 'utf-8')) as ExpectedFixture;
}
