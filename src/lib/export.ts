import { channelNames, type ChannelDocument, type Project } from '@/domain/schema';

export function serializeDocument(document: ChannelDocument): string {
  return document.blocks.filter(b => b.kind !== 'note' && b.text.trim()).map(b => b.text.trim()).join('\n\n').trim();
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

export function downloadBlob(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadZip(project: Project) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let count = 0;
  for (const channel of project.selectedChannels) {
    const doc = project.documents[channel];
    if (!doc || !serializeDocument(doc)) continue;
    zip.file(`${channelNames[channel]}.txt`, downloadableText(project, doc, true)); count++;
  }
  if (!count) throw new Error('받을 문구가 아직 없습니다. 먼저 채널별 문구를 가져와 주세요.');
  zip.file('읽어주세요.txt', `작업: ${project.name}\n준비된 문서 ${count}개. '검토용 초안'은 공개 전에 근거·표현을 확인해 주세요.\n내부 자료와 API 비밀정보는 포함하지 않았습니다.`);
  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '브랜드'}_채널별문구.zip`, content);
}
