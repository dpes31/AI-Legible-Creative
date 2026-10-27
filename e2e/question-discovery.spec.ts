import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Project } from '../src/domain/schema';

// Public source excerpts are real. All model responses/consent clicks below are
// authored UI test inputs, not real AI analysis or actual permission grants.
const corpus = readFileSync('data/poc-consumers/public-excerpts-20261028.json', 'utf8');
async function backup(page: Page): Promise<Project> {
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.goto('/settings'); const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '현재 작업 백업 받기', exact: true }).click();
  return JSON.parse(readFileSync((await (await event).path())!, 'utf8'));
}
async function setup(page: Page) {
  await page.goto('/'); await page.getByLabel('무엇을 알리고 싶으신가요?').fill('질문 발견 UI 검수');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: '소비자 원문에서 질문 발견', exact: true }) });
  await panel.getByText('공개 소비자 발췌와 출처 연결', { exact: true }).click();
  await panel.getByLabel('소비자 발췌 묶음 JSON 가져오기').setInputFiles({ name: 'public-consumers.json', mimeType: 'application/json', buffer: Buffer.from(corpus) });
  await expect(panel.getByRole('status')).toContainText('실제 발췌 묶음을 보관했습니다');
  await panel.getByText('발견할 원자료 선택 (12행)', { exact: true }).click();
  await panel.getByRole('button', { name: '모든 행 선택', exact: true }).click();
  await panel.getByLabel('실행할 외부 서비스').fill('수동 UI 시험 · 실제 AI 아님');
  await panel.getByLabel('화면에 표시된 모델명').fill('authored-ui-test-input');
  await panel.getByRole('button', { name: '질문 발견 실행 만들기', exact: true }).click();
  let runFold = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^발견 실행 / }) }).first();
  await runFold.locator(':scope > summary').click();
  await expect(runFold).toContainText('외부 AI 제공 동의를 확인하지 못했습니다.');
  await expect(runFold.getByLabel('소비자 발견 요청문')).toHaveValue('');
  const held = await backup(page);
  expect(held.questionDiscoveryRuns[0].status).toBe('held'); expect(held.questionDiscoveryRuns[0].excluded).toHaveLength(12);
  await page.goto('/review');
  await panel.getByText('공개 소비자 발췌와 출처 연결', { exact: true }).click();
  await panel.getByText('기존 파일 행에 원문 출처 연결', { exact: true }).click();
  await panel.getByLabel('연결할 원본 행').selectOption(held.consumerObservations[0].id);
  await panel.getByLabel('개인정보와 문맥 생략 범위를 검토했습니다').check();
  await panel.getByLabel('비식별·확보 범위 검토 이유').fill('식별정보 없는 최소 발췌의 권한 검토 동작을 시험합니다. 실제 외부 전송은 없습니다.');
  await panel.getByLabel('이 발췌를 외부 AI에 제공할 권한을 확인했습니다').check();
  await panel.getByRole('button', { name: '선택 행의 권한·비식별 검토 저장', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('선택한 행의 권한');
  await panel.getByText('발견할 원자료 선택 (12행)', { exact: true }).click();
  await panel.getByRole('button', { name: '모든 행 선택', exact: true }).click();
  await panel.getByLabel('실행할 외부 서비스').fill('수동 UI 시험 · 실제 AI 아님');
  await panel.getByLabel('화면에 표시된 모델명').fill('authored-ui-test-input');
  await panel.getByRole('button', { name: '질문 발견 실행 만들기', exact: true }).click();
  const prepared = await backup(page); const run = prepared.questionDiscoveryRuns.at(-1)!;
  expect(run.manifest).toHaveLength(1); expect(run.excluded).toHaveLength(11);
  expect(run.prompt).not.toContain(prepared.name);
  await page.goto('/review');
  runFold = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^발견 실행 / }) }).first();
  await runFold.locator(':scope > summary').click();
  const unknown = { text: '', basis: 'unknown', evidenceIndexes: [] }, row = run.manifest[0];
  const response = { contract: 'alc.question-discovery.v1', runId: run.id, inputHash: run.inputHash,
    questions: [{ ref: 'Q1', text: row.text, provenance: 'observed', evidence: [{ rowId: row.rowId, quote: row.text,
      start: 0, end: row.text.length, role: 'support' }], reason: '공개 원문의 질문 표현 존재를 시험합니다. AI 발견 결과가 아닙니다.',
      alternativeInterpretations: ['구매 의도나 대표 니즈의 증거는 아닙니다.'],
      context: { situation: unknown, task: unknown, barrier: unknown, expectedOutcome: unknown },
      unmetNeed: 'unknown', decisionImpact: 'unknown', impactReason: '표본 부족' }],
    rowDispositions: [{ rowId: row.rowId, status: 'linked', questionRefs: ['Q1'], reason: '실제 원문의 질문 문구 연결 시험' }] };
  return { panel, runFold, response };
}

test('실제 원자료 UI: 12개 발췌·권한 분리·실패/정상 응답 원본·검토·재열기', async ({ page }, info) => {
  test.setTimeout(180000); const { panel, runFold, response } = await setup(page);
  await runFold.getByLabel('질문 발견 원본 응답').fill('중단된 {');
  await runFold.getByRole('button', { name: '발견 응답 원본 보관·대조', exact: true }).click();
  await expect(runFold).toContainText('invalid');
  await runFold.getByLabel('질문 발견 원본 응답').fill(JSON.stringify(response));
  await runFold.getByRole('button', { name: '발견 응답 원본 보관·대조', exact: true }).click();
  const candidate = runFold.locator('article'); await expect(candidate).toContainText('review_required');
  await candidate.getByLabel('원문·질문 유형·대안 해석·표본 한계를 직접 검토했습니다').check();
  await candidate.getByLabel('질문 후보 검토 이유').fill('원문 질문 표현의 연결을 시험합니다. 대표 수요 또는 미충족 수요로 확정하지 않습니다.');
  await candidate.getByRole('button', { name: '분석 후보 수용', exact: true }).click();
  await expect(candidate).toContainText('accepted'); await expect(candidate).toContainText('우선순위 보류');
  const saved = await backup(page); expect(saved.questionCandidates[0].status).toBe('accepted');
  expect(saved.questionDiscoveryRuns.at(-1)!.attempts).toHaveLength(2);
  expect(saved.questionDiscoveryRuns.at(-1)!.attempts[0].raw).toBe('중단된 {'); expect(saved.questions).toHaveLength(0);
  await page.goto('/review'); await page.reload();
  await panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^발견 실행 / }) }).first().locator(':scope > summary').click();
  await expect(panel.locator('article')).toContainText('accepted');
  await page.screenshot({ path: info.outputPath('discovery-reopened.png'), fullPage: true });
});

test('실제 원자료 UI: 다른 질문 표기 보류와 메타데이터·권한·요청문 변경 재열기 차단', async ({ page, browser }, info) => {
  test.setTimeout(240000); const { runFold, response } = await setup(page);
  response.questions[0].text = '원문에 없는 시험용 다른 질문?';
  await runFold.getByLabel('질문 발견 원본 응답').fill(JSON.stringify(response));
  await runFold.getByRole('button', { name: '발견 응답 원본 보관·대조', exact: true }).click();
  const candidate = runFold.locator('article'); await expect(candidate).toContainText('실제 질문 표기와 원문 표현이 다릅니다');
  await candidate.getByLabel('원문·질문 유형·대안 해석·표본 한계를 직접 검토했습니다').check();
  await candidate.getByLabel('질문 후보 검토 이유').fill('실패 차단을 확인하기 위한 검토 입력이며 실제 승인 이유가 아닙니다.');
  await candidate.getByRole('button', { name: '분석 후보 수용', exact: true }).click();
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: '소비자 원문에서 질문 발견', exact: true }) }).getByRole('alert')).toContainText('실제 질문');
  const saved = await backup(page);
  for (const kind of ['publisher', 'rights', 'prompt']) {
    const changed = structuredClone(saved);
    if (kind === 'publisher') changed.sources[0].publisher = '변경 발행자';
    if (kind === 'rights') changed.consumerDatasets.forEach(d => { d.externalAiAllowed = false; });
    if (kind === 'prompt') changed.questionDiscoveryRuns.at(-1)!.prompt += ' 변조';
    const context = await browser.newContext(); const restored = await context.newPage();
    await restored.goto('/settings');
    await restored.getByLabel('이전에 받은 새 버전 백업 가져오기').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
    await expect(restored.getByText('백업을 새 작업으로 가져왔습니다.', { exact: false })).toBeVisible();
    await restored.goto('/review'); await restored.reload();
    const fold = restored.locator('details').filter({ has: restored.locator('summary').filter({ hasText: /^발견 실행 / }) }).first();
    await fold.locator(':scope > summary').click();
    await expect(fold.locator('article')).toContainText('stale');
    await expect(fold.getByRole('button', { name: '발견 요청문 복사', exact: true })).toBeDisabled();
    await restored.screenshot({ path: info.outputPath('discovery-held-' + kind + '.png'), fullPage: true });
    await context.close();
  }
});
