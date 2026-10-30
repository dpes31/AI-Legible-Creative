import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';

// All adversarial inputs here are deliberately fictitious. Never copy real data to a failing assertion.
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'alc-public-boundary-')); dirs.push(dir);
  for (const part of ['tests/fixtures', 'scripts', 'src', 'e2e', 'public-test-results']) mkdirSync(join(dir, part), { recursive: true });
  const text = JSON.stringify({ kind: 'SYNTHETIC ONLY', value: '허구 표식 상자 질문?' });
  writeFileSync(join(dir, 'tests/fixtures/synthetic.json'), text);
  writeFileSync(join(dir, 'scripts/public-test-inputs.json'), JSON.stringify({ classification: 'reviewed-synthetic-test-inputs', files: {
    'tests/fixtures/synthetic.json': createHash('sha256').update(text).digest('hex'),
  } }));
  return dir;
}
function check(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [resolve('scripts/check-public-material.mjs'), '--root=' + dir, ...args], { encoding: 'utf8' });
}
it('reviewed synthetic inputs pass; changed/unreviewed input fails without echoing its value', () => {
  const dir = setup(); expect(check(dir).status).toBe(0);
  writeFileSync(join(dir, 'tests/fixtures/synthetic.json'), '허구 비공개 값: DO_NOT_ECHO');
  const result = check(dir); expect(result.status).toBe(1); expect(result.stderr).not.toContain('DO_NOT_ECHO');
});
it('retained source material blocks the whole-tree gate while independent synthetic tests stay usable', () => {
  const dir = setup(); mkdirSync(join(dir, 'data', 'poc-consumers'), { recursive: true });
  writeFileSync(join(dir, 'data', 'poc-consumers', 'fictional-retention-probe.json'), '{}');
  expect(check(dir).status).toBe(0); expect(check(dir, '--all').status).toBe(1);
});
it('artifact scope excludes parent/private paths and finds a denied URL in nested trace text', async () => {
  const dir = setup(); expect(check(dir, '--artifacts=public-test-results').status).toBe(0);
  expect(check(dir, '--artifacts=../private').status).toBe(1);
  const trace = new JSZip();
  // Constructed URL is an adversarial domain-policy probe, not a real source-post locator.
  trace.file('trace.network', JSON.stringify({ url: 'https://' + ['m', 'puliodays', 'com'].join('.') + '/fictional-only' }));
  writeFileSync(join(dir, 'public-test-results', 'trace.zip'), await trace.generateAsync({ type: 'nodebuffer' }));
  expect(check(dir, '--artifacts=public-test-results').status).toBe(1);
}, 20000);
