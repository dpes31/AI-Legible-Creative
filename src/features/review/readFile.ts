export async function readEvidenceFile(file: File): Promise<{ body: string; page: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error('파일은 10MB 이하로 올려 주세요.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'txt' || extension === 'md') {
    const body = await file.text();
    if (!body.trim()) throw new Error('빈 파일은 자료로 사용할 수 없습니다.');
    return { body, page: '텍스트 파일' };
  }
  if (extension !== 'pdf') throw new Error('TXT, MD 또는 글자를 선택할 수 있는 PDF만 지원합니다.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 50) throw new Error('PDF는 50페이지 이하만 사용할 수 있습니다.');
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(`［${i}쪽］\n${content.items.map(item => 'str' in item ? item.str : '').join(' ')}`);
  }
  const body = pages.join('\n\n');
  if (body.replace(/［\d+쪽］/g, '').trim().length < 30) throw new Error('이미지 PDF에서 글자를 읽지 못했어요. 본문을 직접 붙여넣어 주세요.');
  return { body, page: `${pdf.numPages}쪽` };
}
