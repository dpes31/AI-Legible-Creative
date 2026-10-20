import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { newProject, type Project } from '../src/domain/schema';
import { importContent, importResearch } from '../src/domain/workflow';
import { downloadableText, serializeDocument } from '../src/lib/export';

const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures/manual', name), 'utf8');
function project(): Project { return { ...newProject({ name: '가상 브랜드 솔담 보온컵', kind: 'product', description: '', officialUrl: '', objective: 'feature', audience: '', audienceUndecided: true,
  selectedChannels: ['ad_copy', 'product_page', 'press_release', 'youtube_description', 'blog', 'review_video'], mode: 'manual' }),
  manualResearchRequestId: 'fixture-request', manualContentRequestId: 'fixture-request' }; }

describe('허구의 여섯 채널 기능 검수', () => {
  it('조사는 검토 대기, 여섯 문서는 독립된 검토용 초안으로 저장한다', () => {
    const researched = importResearch(project(), fixture('research.valid.json'));
    expect(researched.claims[0].status).toBe('unreviewed');
    const written = importContent({ ...researched, manualContentRequestId: 'fixture-request' }, fixture('content.six.json'));
    expect(Object.keys(written.documents)).toHaveLength(6);
    expect(new Set(Object.values(written.documents).map(d => serializeDocument(d!)) ).size).toBe(6);
    expect(written.documents.review_video?.status).toBe('outline');
    expect(downloadableText(written, written.documents.ad_copy!)).toContain('검토용 초안');
    expect(serializeDocument(written.documents.press_release!)).not.toContain('발표일과 공식 발언');
  });
  it('자료가 전혀 없는 조사, 잘못된 참조, 중복 응답은 승인하지 않는다', () => {
    expect(() => importResearch(project(), fixture('research.empty.json'))).toThrow();
    const researched = importResearch(project(), fixture('research.valid.json'));
    expect(() => importContent({ ...researched, manualContentRequestId: 'wrong' }, fixture('content.partial.json'))).toThrow();
    const written = importContent({ ...researched, manualContentRequestId: 'fixture-request' }, fixture('content.partial.json'));
    expect(written.documents.ad_copy).toBeDefined();
    expect(written.documents.blog).toBeUndefined();
    expect(() => importContent(written, fixture('content.partial.json'))).toThrow();
  });
  it('약속된 Markdown만 부분 가져오고 자유 본문은 원문 그대로 남긴다', () => {
    const p = project();
    const markdown = `# alc.research.v1\nrequestId: fixture-request\nentity: 가상 브랜드 솔담 보온컵\n## sources\n- S1 | 허구 제품 안내 |  | 뚜껑을 돌려 닫습니다.\n## claims\n- C1 | 돌려 닫는 뚜껑 | S1 | 뚜껑을 돌려 닫습니다.\n## missingEvidence\n- 누수 시험 없음`;
    expect(importResearch(p, markdown).claims[0].status).toBe('unreviewed');
    expect(() => importResearch(p, '브랜드가 좋고 모두 추천합니다.')).toThrow('응답 형식');
    const content = `# alc.content.v1\nrequestId: fixture-request\n## blog\n- heading | 무엇을 살펴볼까요? | \n- paragraph | 뚜껑을 확인해 보세요. | `;
    expect(importContent(p, content).documents.blog?.status).toBe('outline');
  });
  it('실제 ZIP 압축 파일에서 한글 파일을 열 수 있다', async () => {
    const zip = new JSZip(); zip.file('광고카피.txt', downloadableText(project(), importContent(project(), fixture('content.partial.json')).documents.ad_copy!));
    const archive = await zip.generateAsync({ type: 'uint8array' });
    const opened = await JSZip.loadAsync(archive);
    expect(await opened.file('광고카피.txt')?.async('string')).toContain('검토용 제목');
  });
});
