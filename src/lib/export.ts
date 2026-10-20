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
    zip.file(`${channelNames[channel]}.txt`, downloadableText(project, doc, true)); count++;
    zip.file(`${channelNames[channel]}.md`, downloadableMarkdown(project, doc));
    statusLines.push(`${channelNames[channel]}: ${doc.status === 'ready' ? '현재 버전 확인' : '검토용 초안, 공개 전 확인 필요'}`);
    for (const claimId of doc.blocks.flatMap(block => block.claimRefs)) {
      const sourceId = project.claims.find(claim => claim.id === claimId)?.sourceId;
      const source = project.sources.find(item => item.id === sourceId && item.publicationAllowed);
      if (source) publicSources.add(`${source.title}${source.url ? ` — ${source.url}` : ''}`);
    }
  }
  if (!count) throw new Error('받을 문구가 아직 없습니다. 먼저 채널별 문구를 가져와 주세요.');
  zip.file('읽어주세요.txt', `작업: ${project.name}\n준비된 문서 ${count}개\n\n${statusLines.join('\n')}\n\n검토용 초안은 공개 전에 근거·표현을 확인해 주세요.\n내부 자료와 API 비밀정보는 포함하지 않았습니다.`);
  zip.file('공개 출처.txt', publicSources.size ? [...publicSources].map(source => `- ${source}`).join('\n') : '공개 가능한 출처 없음.');
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadZip(project: Project) {
  const content = await buildZip(project);
  downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '브랜드'}_채널별문구.zip`, content);
}
