import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
test.use({ actionTimeout: 10000 });
const data = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/poc/public-excerpts.json'), 'utf8'));

async function create(page: Page) {
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill(data.release.subject);
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: ' + data.release.subject })).toBeVisible();
}
async function addSource(page: Page, item: typeof data.release, kind: string, retrieval = 'partial') {
  // Scope by the direct summary; the intake remains the existing product-source UI.
  const sourceFold = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^제품 원문 자료 더하기/ }) });
  if ((await sourceFold.getAttribute('open')) === null) await sourceFold.locator(':scope > summary').click();
  await page.getByLabel('자료 이름', { exact: true }).fill(item.title);
  await page.getByLabel('원문 링크, 있다면').fill(item.url);
  await page.getByLabel('실제 원문', { exact: true }).fill(item.body);
  await page.getByLabel('자료 종류', { exact: true }).selectOption(kind);
  await page.getByLabel('수집 결과', { exact: true }).selectOption(retrieval);
  await page.getByLabel('확보한 본문 범위', { exact: true }).fill(item.scope);
  await page.getByLabel('게시일 (미확인이면 비움)').fill(item.publishedAt);
  await page.getByLabel('이해관계·표본 한계').fill(item.interest);
  await page.getByRole('button', { name: '자료 저장하기', exact: true }).click();
  const savedFold = sourceFold.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^저장한 자료/ }) });
  if ((await savedFold.getAttribute('open')) === null) await savedFold.locator(':scope > summary').click();
  const li = savedFold.locator('li').filter({ has: page.getByText(item.title, { exact: true }) });
  await li.getByText('저장된 원문과 수집 증적', { exact: true }).click();
  await expect(li).toContainText('sha256:');
  await expect(li).toContainText(item.scope);
  return li;
}
async function sourceScope(li: ReturnType<Page['locator']>, item: typeof data.release) {
  await li.getByText('원출처 재대조 후 수집 범위 기록', { exact: true }).click();
  await li.getByLabel('원문에 확인된 적용 모델·제품 (줄별)').fill(item.subject);
  await li.getByLabel('원문에 확인된 적용 조건 (줄별)').fill(item.conditions);
  await li.getByRole('button', { name: '수집 범위와 새 스냅샷 저장' }).click();
}
async function claim(li: ReturnType<Page['locator']>, item: typeof data.release, statement = item.statement) {
  await li.getByText('이 원문에 주장 연결', { exact: true }).click();
  await li.getByLabel('검증할 주장', { exact: true }).fill(statement);
  await li.getByLabel('정확한 원문 인용').fill(item.quote);
  await li.getByLabel('주장의 적용 모델·제품').fill(item.subject);
  await li.getByLabel('주장의 적용 조건').fill(item.conditions);
  await li.getByRole('button', { name: '주장을 검토 대상으로 저장' }).click();
}
async function backup(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.goto('/settings');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '현재 작업 백업 받기', exact: true }).click();
  const download = await event; return JSON.parse(readFileSync((await download.path())!, 'utf8'));
}

test('실제 공개 발췌: UI 가져오기·SHA 스냅샷·주장 연결·사람 검토·재열기', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await create(page);
  let li = await addSource(page, data.release, 'official');
  await sourceScope(li, data.release);
  await claim(li, data.release);
  const evidence = page.locator('#evidence'); await evidence.locator(':scope > summary').click();
  const article = evidence.locator('article').filter({ has: page.getByRole('heading', { name: data.release.statement, exact: true }) });
  await expect(article).not.toContainText('자동 대조 + 사람 의미 검토 기록');
  await article.getByText('이 주장의 의미와 모델 조건 검토', { exact: true }).click();
  await article.getByLabel('의미 검토 이유와 한계').fill(data.release.note);
  await article.getByRole('button', { name: '원문과 의미를 직접 대조했어요' }).click();
  await expect(article).toContainText('자동 대조 + 사람 의미 검토 기록');
  // The second real source is kept as a personal observation, never product efficacy.
  li = await addSource(page, data.review, 'review');
  await claim(li, data.review);
  await expect(evidence.locator('article').filter({ has: page.getByRole('heading', { name: data.review.statement, exact: true }) })).toContainText('보류');
  const saved = await backup(page);
  expect(saved.sources).toHaveLength(2);
  expect(saved.sources.every((s: { snapshots: unknown[] }) => s.snapshots.length > 0)).toBe(true);
  expect(saved.claims[0].status).toBe('supported'); expect(saved.claims[1].status).toBe('insufficient');
  await page.goto('/review'); await page.reload(); await page.locator('#evidence > summary').click();
  await expect(page.locator('#evidence')).toContainText('자동 대조 + 사람 의미 검토 기록');
  await expect(page.locator('#evidence')).toContainText('적용 조건이 없거나');
  await page.screenshot({ path: testInfo.outputPath('public-evidence-reopened.png'), fullPage: true });
  await testInfo.attach('public-evidence-status', { body: JSON.stringify({ sourceCount: saved.sources.length,
    claims: saved.claims.map((c: { status: string; evidenceHold?: unknown }) => ({ status: c.status, evidenceHold: c.evidenceHold })) }), contentType: 'application/json' });
});

test('실제 보도자료 파생 변조: 숫자·hash·실패·모델·조건과 백업 재열기 차단', async ({ page, browser }, testInfo) => {
  test.setTimeout(180000);
  await create(page); const li = await addSource(page, data.release, 'official'); await sourceScope(li, data.release);
  await claim(li, data.release, data.release.statement.replace('9%', '19%'));
  await page.locator('#evidence > summary').click();
  await expect(page.locator('#evidence')).toContainText('주장과 인용의 수치·단위가 다릅니다.');
  await page.locator('#evidence article').getByText('이 주장의 의미와 모델 조건 검토').click();
  await page.locator('#evidence article').getByLabel('의미 검토 이유와 한계').fill(data.release.note);
  await page.locator('#evidence article').getByRole('button', { name: '원문과 의미를 직접 대조했어요' }).click();
  await expect(page.getByRole('alert')).toContainText('수치');
  const saved = await backup(page);
  for (const mutation of ['hash', 'sha256', 'failed', 'model', 'conditions', 'missingSnapshot']) {
    const corrupt = structuredClone(saved);
    corrupt.claims[0].statement = data.release.statement;
    corrupt.claims[0].status = 'supported'; // deliberately untrusted persisted state
    if (mutation === 'hash') corrupt.sources[0].hash = 'fnv1a:changed';
    if (mutation === 'sha256') corrupt.sources[0].snapshots.at(-1).sha256 = 'sha256:' + '0'.repeat(64);
    if (mutation === 'failed') corrupt.sources[0].retrieval = 'failed';
    if (mutation === 'model') corrupt.claims[0].subject = '미확인 모델 MC-R02S';
    if (mutation === 'conditions') corrupt.claims[0].conditions = '';
    if (mutation === 'missingSnapshot') { delete corrupt.sources[0].snapshots; delete corrupt.sources[0].activeSnapshotId; }
    const context = await browser.newContext(); const restored = await context.newPage();
    await restored.goto('/settings');
    await restored.getByLabel('이전에 받은 새 버전 백업 가져오기').setInputFiles({ name: 'changed-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupt)) });
    await expect(restored.getByText('백업을 새 작업으로 가져왔습니다.', { exact: false })).toBeVisible();
    await restored.goto('/review'); await restored.locator('#evidence > summary').click();
    await expect(restored.locator('#evidence article')).toContainText('보류');
    await expect(restored.locator('#evidence article')).not.toContainText('자동 대조 + 사람 의미 검토 기록');
    await restored.locator('#evidence article').getByText('이 주장의 의미와 모델 조건 검토').click();
    await restored.locator('#evidence article').getByLabel('의미 검토 이유와 한계').fill(data.release.note);
    await restored.locator('#evidence article').getByRole('button', { name: '원문과 의미를 직접 대조했어요' }).click();
    await expect(restored.getByRole('alert')).toBeVisible();
    await expect(restored.locator('#evidence article')).not.toContainText('자동 대조 + 사람 의미 검토 기록');
    await restored.reload(); await restored.locator('#evidence > summary').click();
    await expect(restored.locator('#evidence article')).toContainText('보류');
    await restored.screenshot({ path: testInfo.outputPath('held-' + mutation + '.png'), fullPage: true });
    await context.close();
  }
});
