import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { test, expect } from '@playwright/test';

test('입력 중 이동·새로고침과 분석 후 복귀에도 값이 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('허구 저장 시험 의자');
  await page.getByText('자료 더하기 · 결과물 선택', { exact: false }).click();
  await page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징').fill('보존해야 하는 메모');
  await expect(page.getByRole('status').filter({ hasText: '입력 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('무엇을 알리고 싶으신가요?')).toHaveValue('허구 저장 시험 의자');
  await expect(page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징')).toHaveValue('보존해야 하는 메모');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 허구 저장 시험 의자' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('무엇을 알리고 싶으신가요?')).toHaveValue('허구 저장 시험 의자');
  await expect(page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징')).toHaveValue('보존해야 하는 메모');
  await page.getByRole('button', { name: '바뀐 입력 저장하기' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 허구 저장 시험 의자' })).toBeVisible();
});

test('API 없이 두 번의 응답으로 여섯 문서를 분리하고 다시 연다', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('가상 브랜드 솔담 보온컵');
  await page.getByText('자료 더하기 · 결과물 선택', { exact: false }).click();
  await page.getByLabel('후기 영상 핵심 문구').check();
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 가상 브랜드 솔담 보온컵' })).toBeVisible();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const request = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const researchId = request.match(/요청 ID: ([\w-]+)/)?.[1];
  expect(researchId).toBeTruthy();
  const research = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.valid.json'), 'utf8'));
  research.requestId = researchId;
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(JSON.stringify(research));
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await expect(page.getByRole('heading', { name: '이번 문구의 방향' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('research-fictional-fixture.png'), fullPage: true });
  await page.getByText('근거 확인하기', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: '뚜껑을 돌려 닫는 구조', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '자료 보완용 구성안으로 진행' }).click();
  await page.getByRole('link', { name: '작성 요청문으로 가기' }).click();
  await page.getByRole('button', { name: '채널별 작성 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const contentId = prompt.match(/requestId: ([\w-]+)/)?.[1];
  expect(contentId).toBeTruthy();
  const content = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/content.six.json'), 'utf8'));
  content.requestId = contentId;
  await page.getByLabel('AI에서 받은 작성 결과 붙여넣기').fill('{형식을 읽지 못하는 원문');
  await page.getByRole('button', { name: '채널별 문구 가져오기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '응답 형식' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('AI에서 받은 작성 결과 붙여넣기')).toHaveValue('{형식을 읽지 못하는 원문');
  await expect(page.getByLabel('외부 AI에 보낼 요청문')).toHaveValue(new RegExp(contentId!));
  await page.getByLabel('AI에서 받은 작성 결과 붙여넣기').fill(JSON.stringify(content));
  await page.getByRole('button', { name: '채널별 문구 가져오기' }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('닫는 방식부터 살펴보세요');
  await page.screenshot({ path: testInfo.outputPath('results-fictional-fixture.png'), fullPage: true });
  await page.getByRole('button', { name: /후기 영상 핵심 문구/ }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('후기 촬영 가이드');
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /후기 영상 핵심 문구/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('후기 촬영 가이드');
  await expect(page.getByTestId('publication-status')).toHaveText('자료 보완용 구성안');
  await expect(page.getByRole('button', { name: '검토용 초안 복사', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '최종본 복사', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: '제목', exact: true }).fill('다시 열어도 남아 있는 촬영 가이드');
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('다시 열어도 남아 있는 촬영 가이드');
  await expect(page.getByTestId('publication-status')).toHaveText('수정 후 다시 확인');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('검수용 클립보드 거절'); } } }));
  await page.getByRole('button', { name: '검토용 초안 복사', exact: true }).click();
  await expect(page.getByLabel('직접 복사할 본문')).toHaveValue(/다시 열어도 남아 있는 촬영 가이드/);
  await expect(page.getByLabel('직접 복사할 본문')).not.toHaveValue(/촬영 후에만 추가/);
  await page.getByText('파일 받기', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 파일 받기', exact: true }).click();
  const download = await downloadPromise;
  const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
  const combined = await JSZip.loadAsync((await zip.file('채널별_전체원고.docx')?.async('uint8array'))!);
  const contentXml = await combined.file('word/document.xml')?.async('string');
  expect(contentXml).toContain('다시 열어도 남아 있는 촬영 가이드');
  expect(contentXml).toContain('닫는 방식부터 살펴보세요');
  expect(contentXml).not.toContain('촬영 후에만 추가');
  expect(zip.file('후기 영상 핵심 문구.txt')).toBeNull();
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })).slice(0, 20));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`results-${width}.png`), fullPage: true });
  }
});

test('320~1440px 입력과 모드 변경에서 내용·선택을 보존한다', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 375, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const name = page.getByLabel('무엇을 알리고 싶으신가요?');
    await expect(name).toBeVisible();
    await name.fill('이름이 아주 긴 가상 브랜드 보온컵');
    await page.getByLabel('앱에서 자동으로', { exact: false }).check();
    await expect(name).toHaveValue('이름이 아주 긴 가상 브랜드 보온컵');
    await expect(page.getByText('아직 자동 실행을 연결하지 않았습니다.', { exact: false })).toBeVisible();
    await page.getByLabel('외부 AI로 직접', { exact: false }).check();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })).slice(0, 20));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    const size = await page.getByRole('button', { name: '브랜드 분석 시작' }).boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`brief-${width}.png`), fullPage: true });
  }
});

test('두 창에서 겹친 수정도 새로고침 뒤 초안으로 남는다', async ({ page, context }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?', { exact: false }).fill('충돌 검수용 가상 브랜드');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 충돌 검수용 가상 브랜드' })).toBeVisible();
  await page.goto('/');
  const other = await context.newPage(); await other.goto('/');
  for (const tab of [page, other]) {
    await tab.getByRole('button', { name: '입력 고치기' }).click();
    await tab.getByText('자료 더하기 · 결과물 선택', { exact: false }).click();
  }
  await page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징').fill('첫 창에서 저장한 설명');
  await page.getByRole('button', { name: '바뀐 입력 저장하기' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 충돌 검수용 가상 브랜드' })).toBeVisible();
  await page.reload();
  await page.goto('/');
  await page.getByRole('button', { name: '입력 고치기' }).click();
  await page.getByText('자료 더하기 · 결과물 선택', { exact: false }).click();
  await expect(page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징')).toHaveValue('첫 창에서 저장한 설명');
  await other.getByLabel('한 줄 설명 또는 강조하고 싶은 특징').fill('두 번째 창에서 보관할 설명');
  await other.getByRole('button', { name: '바뀐 입력 저장하기' }).click();
  await expect(other.getByText(/이 창의 초안도 별도 보관/)).toBeVisible();
  await other.goto('/settings');
  await other.getByRole('button', { name: '보관한 초안 확인' }).click();
  await other.locator('summary').filter({ hasText: '충돌 검수용 가상 브랜드' }).click();
  await expect(other.getByText('두 번째 창에서 보관할 설명', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '입력 고치기' }).click();
  await page.getByText('자료 더하기 · 결과물 선택', { exact: false }).click();
  await expect(page.getByLabel('한 줄 설명 또는 강조하고 싶은 특징')).toHaveValue('첫 창에서 저장한 설명');
});

test('실제 제품 응답의 이름 차이와 우위 표기를 버튼 옆에서 안내하고 확인 후 가져온다', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('코웨이 비렉스 트리플체어2 슬림');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const requestId = prompt.match(/요청 ID: ([\w-]+)/)?.[1];
  expect(requestId).toBeTruthy();
  const response = JSON.stringify({
    contract: 'alc.research.v1', requestId, entity: { name: '코웨이 트리플체어2 슬림' },
    sources: [
      { ref: 'S1', title: '사용자가 제공한 공식몰 발췌', url: 'https://example.org/own', excerpt: '가로 폭 680mm', sourceType: 'official' },
      { ref: 'S2', title: '사용자가 제공한 경쟁 제품 발췌', url: 'https://example.org/other', excerpt: '가로 폭 780mm', sourceType: 'official' },
    ], claims: [
      { ref: 'C1', statement: '가로 폭 680mm', sourceRef: 'S1', quote: '가로 폭 680mm', conditions: '세웠을 때', subject: '코웨이 트리플체어2 슬림' },
      { ref: 'C2', statement: '가로 폭 780mm', sourceRef: 'S2', quote: '가로 폭 780cm', conditions: '세웠을 때', subject: '경쟁 제품' },
    ], questions: [], comparisons: [
      { ref: 'K1', competitor: '경쟁 제품', criterion: '가로 폭', ownClaimRefs: ['C1'], otherClaimRefs: ['C2'], comparable: true, verdict: 'own_advantage', reason: '폭 비교 제안' },
      { ref: 'K2', competitor: '경쟁 제품', criterion: '안마 범위', ownClaimRefs: ['C1'], otherClaimRefs: ['C2'], comparable: true, verdict: 'competitor_advantage', reason: '안마 비교 제안' },
    ], recommendations: [], missingEvidence: ['실제 원문과 모델 확인 필요'],
  });
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(response);
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await expect(page.locator('#research-import-error')).toContainText('현재 작업: 코웨이 비렉스 트리플체어2 슬림');
  await expect(page.locator('#research-import-error')).toContainText('조사 응답: 코웨이 트리플체어2 슬림');
  await expect(page.getByLabel('AI에서 받은 조사 결과 붙여넣기')).toHaveValue(response);
  await page.getByRole('button', { name: '같은 제품임을 확인하고 가져오기' }).click();
  await expect(page.getByRole('heading', { name: '이번 문구의 방향' })).toBeVisible();
  await expect(page.getByText('원문 확인이 필요한 주장이 2개 있습니다.', { exact: false })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="analysis-summary"]').getByText('인용문이 일치하지 않음: C2', { exact: false })).toBeVisible();
  await page.getByText('고객 질문과 경쟁 비교', { exact: false }).click();
  await expect(page.locator('.document-block > .badge.warn').filter({ hasText: '비교 미확인' })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('actual-response-alias-mobile.png'), fullPage: true });
});
