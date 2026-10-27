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

test('소비자 자료를 실제 화면에서 가져오고 외부 제공 동의가 없으면 조사 요청문에서 제외한다', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('허구 검색자료 검수 제품');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '브랜드 분석: 허구 검색자료 검수 제품' })).toBeVisible();
  await page.getByLabel('자료 파일').setInputFiles({ name: 'private-search.csv', mimeType: 'text/csv',
    buffer: Buffer.from('검색어,검색량\n비공개 테스트 키워드,7', 'utf8') });
  await expect(page.getByRole('status').filter({ hasText: '1개 행과 2개 열을 읽었습니다' })).toBeVisible();
  await page.getByLabel('표본·집계 범위').fill('허구 검수용 검색 자료 한 행');
  await expect(page.getByLabel('익명화와 이용 권한을 확인했습니다. 이 자료의 원문 행을 외부 AI 조사 요청문에 포함합니다.')).not.toBeChecked();
  await page.getByRole('button', { name: '이 자료를 분석에 추가' }).click();
  await expect(page.getByLabel('저장된 소비자 자료')).toContainText('private-search.csv');
  await expect(page.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('저장된 소비자 자료')).toContainText('private-search.csv');
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  expect(prompt).toContain('외부 AI에 전달하지 않은 비공개 데이터셋 1개');
  expect(prompt).not.toContain('비공개 테스트 키워드');
  expect(prompt).not.toContain('private-search.csv');
});

test('질문별 분석과 같은 출처의 발췌를 한 번에 살펴보고 검토용 작성으로 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('가상 트리플체어');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  expect(prompt).toContain('alc.research.v4');
  const requestId = prompt.match(/요청 ID: ([\w-]+)/)?.[1];
  expect(requestId).toBeTruthy();
  const research = { contract: 'alc.research.v3', requestId, entity: { name: '가상 트리플체어' },
    sources: [
      { ref: 'S1', title: '가상 설명서 기능', url: 'https://example.org/chair', excerpt: '일반형 A는 등 안마를 제공합니다.', sourceType: 'official' },
      { ref: 'S2', title: '가상 설명서 옵션', url: 'https://example.org/chair', excerpt: '허리형 B는 목 안마를 제공합니다.', sourceType: 'official' },
    ], claims: [
      { ref: 'C1', statement: '일반형 A 등 안마', sourceRef: 'S1', quote: '일반형 A는 등 안마를 제공합니다.', subject: '가상 트리플체어 일반형 A', conditions: '일반형 A' },
      { ref: 'C2', statement: '허리형 B 목 안마', sourceRef: 'S2', quote: '허리형 B는 목 안마를 제공합니다.', subject: '가상 트리플체어 허리형 B', conditions: '허리형 B' },
    ], questions: [{ ref: 'Q1', text: '등 안마는 어느 모델인가요?', provenance: 'reconstructed', sourceRefs: ['S1'],
      situation: '모델 선택', need: '정확한 안마 범위', painPoint: '모델 혼동', decisionCriteria: ['안마 부위'] }],
    comparisons: [], recommendations: [], missingEvidence: [],
    answerPlans: [{ questionRef: 'Q1', directAnswer: '일반형 A의 등 안마는 확인 후보입니다.', applicableModel: '일반형 A',
      alternatives: ['허리형 B'], selectionReason: '안마 범위를 우선', limitations: '허리형 B로 일반화 금지',
      contentGap: '모델 선택 안내 부족', claimRefs: ['C1'], comparisonRefs: [],
      channels: [{ channel: 'product_page', angle: '옵션별 선택표', depth: '안마 부위와 조건' }] }],
  };
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(JSON.stringify(research));
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await expect(page.locator('section[aria-labelledby="analysis-summary"] p').filter({ hasText: '일반형 A의 등 안마는 확인 후보입니다.' })).toBeVisible();
  await page.getByText('소비자·검색 자료 보완').click();
  await expect(page.getByLabel('자료 파일')).toBeVisible();
  await page.getByText('자료와 근거 살펴보기', { exact: false }).click();
  await expect(page.getByRole('textbox', { name: '이 출처의 실제 본문 또는 관련 원문 구간' })).toHaveCount(1);
  await page.getByLabel('수정할 방향').fill('일반형 A를 먼저 설명해 주세요.');
  await page.getByRole('button', { name: '이 방향으로 작성 요청문 만들기' }).click();
  await expect(page).toHaveURL(/\/results$/);
  const writing = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  expect(writing).toContain('옵션별 선택표');
  expect(writing).toContain('일반형 A를 먼저 설명해 주세요.');
  expect(writing).toContain('unverified_candidate');
  expect(writing).toContain('가상 트리플체어 일반형 A');
  const contentId = writing.match(/requestId: ([\w-]+)/)?.[1];
  const inputRevision = Number(writing.match(/입력 버전: (\d+)/)?.[1]);
  const evidenceRevision = Number(writing.match(/근거 버전: (\d+)/)?.[1]);
  const insightRevision = Number(writing.match(/"insightRevision": (\d+)/)?.[1]);
  const unsafe = { contract: 'alc.content.v2', requestId: contentId, inputRevision, evidenceRevision, insightRevision,
    documents: [{ channel: 'product_page', blocks: [
      { kind: 'heading', text: '모델별 선택', claimRefs: [] },
      { kind: 'paragraph', text: '모든 고객의 허리 통증이 사라집니다.', claimRefs: [] },
      { kind: 'heading', text: '자주 묻는 질문', claimRefs: [] },
      { kind: 'paragraph', text: '등 안마는 어느 모델인가요? 구매 전 옵션을 확인해 주세요.', claimRefs: [] },
    ] }], unresolvedItems: [] };
  await page.getByLabel('AI에서 받은 작성 결과 붙여넣기').fill(JSON.stringify(unsafe));
  await page.getByRole('button', { name: '채널별 문구 가져오기' }).click();
  await page.getByLabel('보고 싶은 결과물').selectOption('product_page');
  await expect(page.getByTestId('publication-status')).toHaveText('근거 보완 필요');
  await page.getByRole('button', { name: '이 채널 원고 검토 완료' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '확인되지 않은 사실' })).toBeVisible();
  await expect(page.getByRole('button', { name: '최종본 복사' })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: '고객 질문별 답변과 채널 계획' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('research-fictional-fixture.png'), fullPage: true });
  await page.getByText('자료와 근거 살펴보기', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: '뚜껑을 돌려 닫는 구조', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '자료 보완용 구성안 요청문 만들기' }).click();
  await expect(page).toHaveURL(/\/results$/);
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
  await expect(page.getByRole('heading', { name: '고객 질문별 답변과 채널 계획' })).toBeVisible();
  const nextStep = page.locator('section[aria-labelledby="next-step-heading"]');
  await expect(nextStep).toContainText('사실 후보 1개');
  await expect(page.getByText('위에서 인사이트 방향을 확인하면 작성 요청문을 만들 수 있습니다.')).toHaveCount(0);
  await expect(nextStep.getByRole('button', { name: '이 방향으로 작성 요청문 만들기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '이 방향으로 작성', exact: true })).toHaveCount(0);
  await page.getByText('자료와 근거 살펴보기', { exact: false }).click();
  await expect(page.locator('#evidence')).toHaveAttribute('open', '');
  await expect(page.locator('section[aria-labelledby="analysis-summary"]').getByText('인용문이 일치하지 않음: C2', { exact: false })).toBeVisible();
  await page.getByText('고객 질문과 경쟁 비교', { exact: false }).click();
  await expect(page.locator('.document-block > .badge.warn').filter({ hasText: '비교 미확인' })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('actual-response-alias-mobile.png'), fullPage: true });
});

test('제조사 발표만 있는 v2 비교도 나머지 조사 내용을 잃지 않고 가져온다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('허구 검수컵');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const requestId = prompt.match(/요청 ID: ([\w-]+)/)?.[1];
  expect(requestId).toBeTruthy();
  const research = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.manufacturer-claim-only.json'), 'utf8'));
  research.requestId = requestId;
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(JSON.stringify(research));
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await expect(page.getByRole('heading', { name: '고객 질문별 답변과 채널 계획' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="analysis-summary"]').getByText('인용문이 일치하지 않음: C2', { exact: false })).toBeVisible();
  await page.getByText('고객 질문과 경쟁 비교', { exact: false }).click();
  await expect(page.locator('ul.list').getByText('기존 제품보다 얼마나 더 담을 수 있나요?')).toBeVisible();
  await expect(page.locator('.document-block > .badge.warn').filter({ hasText: '비교 미확인' })).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: '고객 질문별 답변과 채널 계획' })).toBeVisible();
});

test('원문을 확인한 뒤 작성 버튼 한 번으로 현재 요청문을 열고 수정 방향을 보존한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('가상 브랜드 솔담 보온컵');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const request = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const research = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.valid.json'), 'utf8'));
  research.sources[0].url = 'https://example.test/synthetic-source';
  research.claims[0].conditions = '뚜껑';
  research.requestId = request.match(/요청 ID: ([\w-]+)/)?.[1];
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(JSON.stringify(research));
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await page.getByLabel('수정할 방향').fill('뚜껑을 닫는 방법을 먼저 설명해 주세요.');
  await page.getByText('자료와 근거 살펴보기', { exact: false }).click();
  const evidence = page.locator('#evidence');
  await expect(evidence).toHaveAttribute('open', '');
  await evidence.getByLabel('이 출처의 실제 본문 또는 관련 원문 구간').fill('가상 브랜드 솔담 보온컵\n솔담 보온컵은 뚜껑을 돌려 닫는 구조입니다.');
  await evidence.getByLabel('공개 문구의 근거로 사용할 권한이 있습니다').check();
  await evidence.getByRole('button', { name: '이 출처 한 번 연결하기' }).click();
  await page.locator('summary').filter({ hasText: /^제품 원문 자료 더하기/ }).click();
  await page.getByText('저장한 자료 1개', { exact: true }).click();
  await page.getByText('저장된 원문과 수집 증적', { exact: true }).click();
  await page.getByText('원출처 재대조 후 수집 범위 기록', { exact: true }).click();
  await page.getByLabel('확보한 본문 구간', { exact: true }).fill('허구 제품 안내문의 전체 시험 구간');
  await page.getByLabel('원문에 확인된 적용 모델·제품 (줄별)').fill('가상 브랜드 솔담 보온컵');
  await page.getByLabel('원문에 확인된 적용 조건 (줄별)').fill('뚜껑');
  await page.getByRole('button', { name: '수집 범위와 새 스냅샷 저장' }).click();
  await evidence.getByText('이 주장의 의미와 모델 조건 검토').click();
  await evidence.getByLabel('의미 검토 이유와 한계').fill('허구 안내문의 닫는 구조만 확인했습니다. 누수 성능이나 실제 소비자 경험을 입증하지 않습니다.');
  await evidence.getByRole('button', { name: '원문과 의미를 직접 대조했어요' }).click();
  await expect(page.getByRole('button', { name: '이 방향으로 작성 요청문 만들기' })).toBeVisible();
  await page.getByRole('button', { name: '이 방향으로 작성 요청문 만들기' }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByLabel('외부 AI에 보낼 요청문')).toHaveValue(/뚜껑을 닫는 방법을 먼저 설명해 주세요/);
  await expect(page.getByLabel('외부 AI에 보낼 요청문')).toHaveValue(/뚜껑을 돌려 닫는 구조/);
  await page.reload();
  await expect(page.getByLabel('외부 AI에 보낼 요청문')).toHaveValue(/뚜껑을 닫는 방법을 먼저 설명해 주세요/);
});
