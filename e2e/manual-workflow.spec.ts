import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

test('API 없이 두 번의 응답으로 여섯 문서를 분리하고 다시 연다', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('무엇을 알리고 싶으신가요?').fill('가상 브랜드 솔담 보온컵');
  await page.getByRole('button', { name: '브랜드 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: /솔담 보온컵을 선택할 이유/ })).toBeVisible();
  await page.getByRole('button', { name: '조사 요청문 만들기' }).click();
  const request = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const researchId = request.match(/요청 ID: ([\w-]+)/)?.[1];
  expect(researchId).toBeTruthy();
  const research = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.valid.json'), 'utf8'));
  research.requestId = researchId;
  await page.getByLabel('AI에서 받은 조사 결과 붙여넣기').fill(JSON.stringify(research));
  await page.getByRole('button', { name: '조사 내용 가져오기' }).click();
  await expect(page.getByText('뚜껑을 돌려 닫는 구조', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '근거 확인 후 문구 만들기' }).click();
  await page.getByRole('button', { name: '채널별 작성 요청문 만들기' }).click();
  const prompt = await page.getByLabel('외부 AI에 보낼 요청문').inputValue();
  const contentId = prompt.match(/requestId: ([\w-]+)/)?.[1];
  expect(contentId).toBeTruthy();
  const content = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/content.six.json'), 'utf8'));
  content.requestId = contentId;
  await page.getByLabel('AI에서 받은 작성 결과 붙여넣기').fill(JSON.stringify(content));
  await page.getByRole('button', { name: '채널별 문구 가져오기' }).click();
  await expect(page.getByText('닫는 방식부터 살펴보세요')).toBeVisible();
  await page.getByRole('button', { name: /후기 영상 핵심 문구/ }).click();
  await expect(page.getByText('후기 촬영 가이드')).toBeVisible();
  await page.reload();
  await expect(page.getByText('후기 촬영 가이드')).toBeVisible();
  await expect(page.getByText('검토용 초안', { exact: true }).first()).toBeVisible();
});

test('320px 화면에서 새 프로젝트 입력의 가로 넘침이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.getByLabel('무엇을 알리고 싶으신가요?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
