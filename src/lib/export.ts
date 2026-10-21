import { channelNames, type ChannelDocument, type Project } from '@/domain/schema';

export function serializeDocument(document: ChannelDocument): string {
  return document.blocks.filter(b => b.kind !== 'note' && b.text.trim()).map(b => b.text.trim()).join('\n\n').trim();
}

export function serializeMarkdown(document: ChannelDocument): string {
  return document.blocks.filter(b => b.kind !== 'note' && b.text.trim()).map(block => {
    const content = block.text.trim();
    if (block.kind === 'heading') return `## ${content}`;
    if (block.kind === 'bullet') return `- ${content}`;
    return content;
  }).join('\n\n').trim();
}

export function serializeWithSources(project: Project, document: ChannelDocument): string {
  const main = serializeDocument(document);
  const claimIds = new Set(document.blocks.flatMap(block => block.claimRefs));
  const sourceIds = new Set(project.claims.filter(c => claimIds.has(c.id)).map(c => c.sourceId).filter((id): id is string => !!id));
  const sources = project.sources.filter(s => sourceIds.has(s.id) && s.publicationAllowed);
  return [main, sources.length ? '\n근거 자료\n' + sources.map(s => `- ${s.title}${s.url ? ` — ${s.url}` : ''}`).join('\n') : ''].join('\n').trim();
}

export function downloadableText(project: Project, document: ChannelDocument, sources = false) {
  const state = document.status === 'ready' ? '' : `［검토용 초안 — ${document.status === 'blocked' ? '근거 보완 필요' : '확인 후 사용'}］\n\n`;
  return state + (sources ? serializeWithSources(project, document) : serializeDocument(document));
}

export function downloadableMarkdown(project: Project, document: ChannelDocument) {
  const state = document.status === 'ready' ? '' : '> 검토용 초안 — 근거와 표현을 확인해 주세요.\n\n';
  const sourceText = serializeWithSources(project, document).slice(serializeDocument(document).length).trim();
  return `${state}${serializeMarkdown(document)}${sourceText ? `\n\n${sourceText}` : ''}\n`;
}

export function downloadBlob(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function xmlText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function wordParagraph(text: string, style = 'Normal'): string {
  const lines = text.split(/\r?\n/);
  const content = lines.map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlText(line)}</w:t>`).join('');
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${content}</w:r></w:p>`;
}

export async function buildWord(project: Project): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const sections = project.selectedChannels.flatMap(channel => {
    const doc = project.documents[channel];
    if (!doc || !serializeDocument(doc)) return [];
    const sourceText = serializeWithSources(project, doc).slice(serializeDocument(doc).length).trim();
    return [wordParagraph(channelNames[channel], 'Heading1'),
      wordParagraph(doc.status === 'ready' ? '현재 버전 확인' : `검토용 초안 · ${doc.status === 'blocked' ? '근거 보완 필요' :
        doc.status === 'outline' ? '자료 보완용 구성안' : '공개 전 확인 필요'}`, 'Subtitle'),
      ...doc.blocks.filter(b => b.kind !== 'note' && b.text.trim()).map(b => wordParagraph(b.text.trim(), b.kind === 'heading' ? 'Heading2' : 'Normal')),
      ...(sourceText ? [wordParagraph(sourceText, 'Source')] : [])];
  });
  if (!sections.length) throw new Error('받을 문구가 아직 없습니다. 먼저 채널별 문구를 가져와 주세요.');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:eastAsia="Malgun Gothic"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="360" w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="subtitle"/><w:rPr><w:color w:val="555555"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Source"><w:name w:val="source"/><w:rPr><w:color w:val="555555"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${wordParagraph(`${project.name} · 채널별 문구`, 'Heading1')}${wordParagraph('검토용 초안은 공개 전에 각 섹션의 근거와 조건을 확인해 주세요.')}${sections.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1100" w:bottom="1200" w:left="1100"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function downloadWord(project: Project) {
  const content = await buildWord(project);
  downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '브랜드'}_채널별문구.docx`, content);
}

export async function buildZip(project: Project): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let count = 0;
  const statusLines: string[] = [];
  const publicSources = new Set<string>();
  for (const channel of project.selectedChannels) {
    const doc = project.documents[channel];
    if (!doc || !serializeDocument(doc)) {
      statusLines.push(`${channelNames[channel]}: 작성된 문서 없음`);
      continue;
    }
    count++;
    statusLines.push(`${channelNames[channel]}: ${doc.status === 'ready' ? '현재 버전 확인' : '검토용 초안, 공개 전 확인 필요'}`);
    for (const claimId of doc.blocks.flatMap(block => block.claimRefs)) {
      const sourceId = project.claims.find(claim => claim.id === claimId)?.sourceId;
      const source = project.sources.find(item => item.id === sourceId && item.publicationAllowed);
      if (source) publicSources.add(`${source.title}${source.url ? ` — ${source.url}` : ''}`);
    }
  }
  if (!count) throw new Error('받을 문구가 아직 없습니다. 먼저 채널별 문구를 가져와 주세요.');
  zip.file('채널별_전체원고.docx', await (await buildWord(project)).arrayBuffer());
  zip.file('읽어주세요.txt', `작업: ${project.name}\n준비된 문서 ${count}개\n\n${statusLines.join('\n')}\n\n검토용 초안은 공개 전에 근거·표현을 확인해 주세요.\n내부 자료와 API 비밀정보는 포함하지 않았습니다.`);
  zip.file('공개 출처.txt', publicSources.size ? [...publicSources].map(source => `- ${source}`).join('\n') : '공개 가능한 출처 없음.');
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadZip(project: Project) {
  const content = await buildZip(project);
  downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '브랜드'}_채널별문구.zip`, content);
}
