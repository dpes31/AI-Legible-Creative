import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { buildWord, buildZip, downloadableText } from '../src/lib/export';

it('수정한 공개 본문을 선택 채널별로 한 Word에 담고 비공개 메모를 제외한다', async () => {
  const p = newProject({ name: '허구 한글 의자', kind: 'product', description: '', officialUrl: '', objective: 'feature',
    audience: '', audienceUndecided: true, selectedChannels: ['ad_copy', 'blog', 'youtube_description'], mode: 'manual' });
  p.documents.ad_copy = { id: 'a', channel: 'ad_copy', revision: 2, evidenceRevision: 0, status: 'needs_review',
    validationHash: null, reviewedBlocks: {}, warnings: [], updatedAt: p.createdAt, blocks: [
      { id: 'h', kind: 'heading', text: '수정한 광고 제목 & <한글>', claimRefs: [] },
      { id: 'b', kind: 'paragraph', text: '첫 줄\n둘째 줄', claimRefs: [] },
      { id: 'n', kind: 'note', text: '비공개: 내부 촬영 메모', claimRefs: [] },
    ] };
  p.documents.blog = { ...p.documents.ad_copy, id: 'blog', channel: 'blog',
    blocks: [{ id: 'blog-text', kind: 'paragraph', text: '블로그에만 남는 본문', claimRefs: [] }] };
  const wordBytes = await (await buildWord(p)).arrayBuffer();
  if (process.env.ALC_WORD_QA_OUTPUT) writeFileSync(process.env.ALC_WORD_QA_OUTPUT, Buffer.from(wordBytes));
  const word = await JSZip.loadAsync(wordBytes);
  const xml = await word.file('word/document.xml')?.async('string');
  expect(xml).toContain('광고카피'); expect(xml).toContain('블로그');
  expect(xml).toContain('수정한 광고 제목 &amp; &lt;한글&gt;');
  expect(xml).toContain('첫 줄</w:t><w:br/><w:t xml:space="preserve">둘째 줄');
  expect(xml).toContain('블로그에만 남는 본문');
  expect(xml).not.toContain('비공개: 내부 촬영 메모');
  expect(xml).not.toContain('유튜브 설명');
  expect(downloadableText(p, p.documents.ad_copy)).toContain('첫 줄\n둘째 줄');
  const zipped = await JSZip.loadAsync(await (await buildZip(p)).arrayBuffer());
  expect(zipped.file('채널별_전체원고.docx')).not.toBeNull();
  expect(Object.keys(zipped.files).filter(name => name.endsWith('.docx'))).toEqual(['채널별_전체원고.docx']);
  expect(Object.keys(zipped.files).filter(name => /\.md$|광고카피\.txt$/.test(name))).toHaveLength(0);
});
