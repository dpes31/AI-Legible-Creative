import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

// This is an input/output boundary, not a claim that hashes prove data rights.
const args = process.argv.slice(2);
const rootArg = args.find(a => a.startsWith('--root='));
const root = resolve(rootArg ? rootArg.slice(7) : '.');
const artifactArg = args.find(a => a.startsWith('--artifacts='));
const all = args.includes('--all');
const failures = [];
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) { failures.push('symbolic link is not a reviewed public input'); return []; }
    return stat.isDirectory() ? walk(path) : [path];
  });
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = join(root, 'scripts/public-test-inputs.json');
let manifest = null;
try { if (existsSync(manifestPath)) manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
catch { failures.push('reviewed manifest is unreadable'); }
if (manifest?.classification !== 'reviewed-synthetic-test-inputs') failures.push('reviewed input manifest missing');
const legacyFixture = 'tests/fixtures/poc/public-excerpts.json';
const inputs = [...walk(join(root, 'tests')), ...walk(join(root, 'e2e'))]
  .map(p => relative(root, p).replaceAll('\\', '/')).filter(p => p !== legacyFixture);
const expected = manifest?.files || {};
for (const path of new Set([...inputs, ...Object.keys(expected)])) {
  const full = resolve(root, path);
  if (!full.startsWith(root + '/') || !inputs.includes(path) || sha(readFileSync(full)) !== expected[path]) {
    failures.push('test input added/changed outside reviewed manifest'); continue;
  }
  if (/\.(?:ts|json)$/.test(path)) {
    const text = readFileSync(full, 'utf8');
    if (text.includes('data/poc-consumers/') || text.includes(legacyFixture)) failures.push('public test reads retained real-material path');
    if (/https?:\/\/(?:[^/]+\.)?(?:82cook\.com|puliodays\.com|quasarzone\.com|ohou\.se)\//i.test(text)) failures.push('source-post URL in public test');
  }
}
for (const path of walk(join(root, 'src'))) {
  const text = readFileSync(path, 'utf8');
  if (/(?:from\s*|import\s*\(|readFile\w*\s*\()[^;\n]*(?:poc-consumers|fixtures\/poc)/.test(text)) failures.push('application imports retained test/real material');
}
if (all) {
  const retained = [...walk(join(root, 'data/poc-consumers')), ...(existsSync(join(root, legacyFixture)) ? [join(root, legacyFixture)] : [])];
  if (retained.length) failures.push(`preservation destination pending: ${retained.length} real-material files still present`);
}
if (artifactArg) {
  const artifactRoot = resolve(root, artifactArg.slice(12));
  // One explicit public-output directory; never sweep the repo, browser profile or private folder.
  if (isAbsolute(artifactArg.slice(12)) || relative(root, artifactRoot) !== 'public-test-results') failures.push('artifact root must be public-test-results');
  else {
    let expanded = 0;
    const inspect = async (name, bytes, depth = 0) => {
      expanded += bytes.length;
      if (expanded > 150_000_000 || depth > 2) throw new Error('artifact expansion limit');
      if (/\.(?:png|jpe?g|woff2?|ico)$/.test(name)) return; // Images: reviewed synthetic input + separate visual QA, not OCR certification.
      if (name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(bytes);
        for (const entry of Object.values(zip.files)) if (!entry.dir) await inspect(entry.name, await entry.async('nodebuffer'), depth + 1);
        return;
      }
      const text = bytes.toString('utf8');
      if (/https?:\/\/(?:[^/]+\.)?(?:82cook\.com|puliodays\.com|quasarzone\.com|ohou\.se)\//i.test(text)) failures.push('source-post URL in artifact text');
      if (/data\/poc-consumers\//.test(text)) failures.push('retained material reference in artifact text');
    };
    for (const path of walk(artifactRoot)) {
      try { await inspect(relative(artifactRoot, path), readFileSync(path)); }
      catch { failures.push('artifact unreadable/over limit'); }
    }
  }
}
const unique = [...new Set(failures)];
// Deliberately never print source text, credentials, personal fields or failed assertion values.
if (unique.length) { process.stderr.write('PUBLIC_BOUNDARY_BLOCKED\n' + unique.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write(`PUBLIC_BOUNDARY_PASS (${all ? 'whole tree' : artifactArg ? 'reviewed inputs + public artifacts' : 'reviewed test inputs + application imports'})\n`);
