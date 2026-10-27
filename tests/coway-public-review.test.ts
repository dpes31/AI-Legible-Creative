import { captureSource } from '../src/domain/analysis/source-audit';
import { fingerprint } from '../src/domain/text';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { newProject, type Channel } from '../src/domain/schema';
import { approveInsight, reviseInsight } from '../src/domain/insight';
import { attachOriginalText, importContent, importResearch, prepareContent, prepareResearch, reviewDocument, verifyClaim } from '../src/domain/workflow';
import { buildWord, serializeDocument } from '../src/lib/export';
import { channelCompleteness } from '../src/domain/validation/document';

// A manually authored review scenario, based only on the linked public Coway
// release and the product-page search snippet. It is not an AI output or a
// verified published marketing asset. No private company guide is included.
const release = 'https://company.coway.com/newsroom/press/1019';
const productUrl = 'https://m.coway.com/product/detail?prdno=1553&optno=9';
const product = '비렉스 트리플체어2 슬림';

describe('트리플체어2 슬림 공개 자료의 수동 경로', () => {
  it('모델 차이를 미확인으로 유지하면서 질문 설계와 다섯 문서를 Word까지 보존한다', async () => {
    const start = prepareResearch(newProject({
      name: product, kind: 'product', description: '업무, 안마, 휴식을 위한 다기능 체어',
      officialUrl: productUrl, objective: 'sales', audience: '', audienceUndecided: true,
      selectedChannels: ['ad_copy', 'press_release', 'blog', 'product_page', 'youtube_description'], mode: 'manual',
      category: 'berex',
    })).project;
    const pressExcerpt = '트리플체어 무빙형 대비 부피를 9% 줄여 공간을 더 여유롭게 활용할 수 있도록 했다.';
    const searchSnippet = '허리맞춤형(MC-R02S) 모델은 등, 허리를 제외한 목, 어깨 부위 안마만 가능';
    const research = JSON.stringify({
      contract: 'alc.research.v3', requestId: start.manualResearchRequestId, entity: { name: product },
      sources: [
        { ref: 'S1', title: '코웨이 트리플체어2 슬림 출시 공식 보도자료', url: release, excerpt: pressExcerpt, sourceType: 'official' },
        { ref: 'S2', title: '공식 제품 페이지 검색 색인 구간', url: productUrl, excerpt: searchSnippet, sourceType: 'official' },
      ],
      claims: [
        { ref: 'C1', statement: '기존 트리플체어 무빙형 대비 부피 9% 감소라는 제조사 발표',
          sourceRef: 'S1', quote: pressExcerpt, conditions: '트리플체어 무빙형 대비 부피 기준',
          subject: product },
        { ref: 'C2', statement: '허리맞춤형 MC-R02S는 등·허리 안마가 제외된다',
          sourceRef: 'S2', quote: searchSnippet, conditions: '공식 제품 상세 원문 재확인 전',
          subject: product + ' MC-R02S' },
      ],
      questions: [
        { ref: 'Q1', text: '일반형과 허리맞춤형은 등과 허리 안마가 어떻게 다른가요?',
          provenance: 'reconstructed', sourceRefs: ['S2'], situation: '옵션 선택 직전', need: '원하는 안마 범위를 확인',
          painPoint: '허리 지지와 허리 안마를 혼동', decisionCriteria: ['모델별 안마 부위'] },
        { ref: 'Q2', text: '작은 공간에 놓을 수 있나요?',
          provenance: 'reconstructed', sourceRefs: ['S1'], situation: '서재 설치 검토', need: '실제 설치 공간 확인',
          painPoint: '부피 감소율과 바닥 면적을 혼동', decisionCriteria: ['제품 크기', '리클라이닝 동선'] },
      ],
      questionClusters: [{ label: '모델 선택과 설치 공간', questionRefs: ['Q1', 'Q2'] }],
      unmetNeeds: [{ situation: '서재 설치', need: '리클라이닝 동선의 실제 치수', provenance: 'hypothesis', sourceRefs: [] }],
      productCandidates: [
        { name: product + ' 일반형', model: 'MC-R03S', category: '다기능 체어', status: '상세 원문 재확인 필요' },
        { name: product + ' 허리맞춤형', model: 'MC-R02S', category: '다기능 체어', status: '검색 색인 확인, 상세 원문 재확인 필요' },
      ],
      existingContent: [{ title: '코웨이 출시 자료', url: release, gap: '모델 선택과 설치 동선 질문에 직접 답하는 구간을 보완할 필요' }],
      comparisons: [], recommendations: [],
      answerPlans: [
        { questionRef: 'Q1', directAnswer: '허리맞춤형 MC-R02S는 등·허리 안마가 제외된다는 색인 안내를 원문으로 확인한 뒤 모델별 선택표를 작성한다.',
          applicableModel: 'MC-R02S', alternatives: ['MC-R03S'], selectionReason: '안마 범위와 허리 지지의 선택 기준을 구분',
          limitations: '상세페이지 동적 본문 직접 확인 전', contentGap: '옵션별 기능 비교표',
          claimRefs: ['C2'], channels: ['product_page', 'blog', 'youtube_description'].map(channel =>
            ({ channel, angle: '옵션별 안마 범위', depth: '두 모델의 조건과 한계를 직접 답변' })) },
        { questionRef: 'Q2', directAnswer: '코웨이는 기존 트리플체어 무빙형 대비 부피 9% 감소를 발표했으나, 실제 설치 가능 여부는 방과 동선을 재야 한다.',
          applicableModel: '', alternatives: ['기존 트리플체어 무빙형'], selectionReason: '공간 조건에 따른 적합성 확인',
          limitations: '바닥 면적 9% 감소나 타사 우위는 아님', contentGap: '눕혔을 때 필요한 공간',
          claimRefs: ['C1'], channels: ['product_page', 'blog', 'youtube_description'].map(channel =>
            ({ channel, angle: '공간에 맞는지 판단', depth: '부피와 실제 설치 면적을 구분' })) },
      ],
      missingEvidence: ['MC-R02S 및 MC-R03S 옵션별 상세 원문과 영상·대본은 이 검수에서 확보하지 못함'],
    });
    const imported = importResearch(start, research);
    expect(imported.claims.every(claim => claim.status === 'unreviewed')).toBe(true);
    const connected = attachOriginalText(imported, imported.sources[0].id, pressExcerpt, true);
    // Real release excerpt: preserve exact quoted text and manufacturer-only scope.
    const source = connected.sources[0];
    source.body = '코웨이, ‘비렉스 트리플체어2 슬림’ 출시\n' + pressExcerpt;
    source.hash = fingerprint(source.body);
    source.collectedAt = new Date().toISOString(); source.retrieval = 'partial';
    connected.sources[0] = captureSource(source, { method: 'manual_excerpt', locator: '제목과 부피 비교 문장만', coverage: 'excerpt',
      modelScope: [product], conditionScope: ['트리플체어 무빙형 대비 부피'], interest: '제조사 발표, 독립 시험 아님' });
    connected.claims[0].conditions = '트리플체어 무빙형 대비 부피';
    const verified = verifyClaim(connected, connected.claims[0].id, '제조사 발표 문구와 부피 비교 범위만 확인했습니다. 개별 모델·설치 면적·독립 효과는 미확인입니다.');
    expect(verified.claims[1].status).toBe('unreviewed');
    const approved = approveInsight(reviseInsight(verified, '옵션별 안마 범위를 먼저 설명하고 부피 9%를 바닥 면적 절감으로 쓰지 마세요.'));
    const { project: requested, prompt } = prepareContent(approved);
    expect(prompt).toContain('부피 9%를 바닥 면적 절감으로 쓰지 마세요');
    expect(prompt).toContain('MC-R02S');
    expect(prompt).toContain('MC-R03S');

    type Block = { kind: 'heading' | 'paragraph' | 'cta'; text: string; claimRefs: string[]; questionRefs: string[]; section: string };
    const block = (kind: Block['kind'], text: string, claims: string[] = [], questions: string[] = [], section = ''): Block =>
      ({ kind, text, claimRefs: claims.map(ref => ref === 'C1' ? verified.claims[0].id : verified.claims[1].id),
        questionRefs: questions.map(ref => ref === 'Q1' ? verified.questions[0].id : verified.questions[1].id), section });
    const space = '코웨이 발표에 따르면 트리플체어 무빙형 대비 부피를 9% 줄였습니다. 트리플체어 무빙형 대비 부피 기준이며, 실제 설치 가능 여부는 눕혔을 때 동선을 재어 확인하세요.';
    const variant = '조사 응답 기반 · 원문/의미 확인 전: MC-R02S 허리맞춤형은 등·허리 안마가 제외된다는 안내입니다. 공식 제품 상세 원문 재확인 전에는 MC-R03S 일반형의 기능과 섞어 소개하지 마세요.';
    const documents: { channel: Channel; blocks: Block[] }[] = [
      { channel: 'ad_copy', blocks: [
        block('heading', '서재의 한 자리에서 선택하기', [], [], '공간'),
        block('paragraph', space, ['C1']),
        block('cta', '내 방의 설치 동선과 모델별 기능을 공식몰에서 확인하세요.'),
        block('heading', '안마 범위부터 고르기', [], [], '옵션'),
        block('paragraph', variant, ['C2']),
        block('cta', '일반형과 허리맞춤형의 안마 부위를 비교해 보세요.'),
        block('heading', '쉬는 자세도 살펴보기', [], [], '휴식'),
        block('paragraph', '책상 앞에서 사용할 때와 휴식할 때의 필요한 공간이 다릅니다. 사용 장소의 여유 공간을 먼저 살펴보세요.'),
        block('cta', '설치 조건과 구매 조건을 공식몰에서 확인하세요.'),
      ] },
      { channel: 'press_release', blocks: [
        block('heading', '코웨이 비렉스 트리플체어2 슬림 출시 자료를 바탕으로 한 검토용 원고'),
        block('heading', '공간 조건과 모델 선택 질문에 답하는 정보 보완 제안'),
        block('paragraph', space, ['C1']),
        block('paragraph', '출시 보도자료에는 제품의 공간 활용 목적이 설명돼 있습니다. 이를 실제 방에 놓을 수 있다는 보장으로 확대하지 않고 설치 치수와 사용 동선을 별도로 확인할 수 있게 안내합니다.'),
        block('paragraph', '두 옵션의 안마 범위는 공식 상세 원문을 다시 확인한 뒤 별도 표로 분리할 예정입니다. 새로운 발표일이나 관계자 발언은 추가하지 않았습니다.'),
      ] },
      { channel: 'product_page', blocks: [
        block('heading', '서재에 둘 트리플체어2 슬림을 고를 때'),
        block('paragraph', '업무 공간에서 안마와 휴식을 함께 고려한다면, 제품 기능보다 먼저 방의 크기와 책상 주변 동선을 확인해야 합니다.'),
        block('heading', '작은 공간에 놓을 수 있나요?'),
        block('paragraph', space, ['C1'], ['Q2']),
        block('heading', '모델별 안마 범위는 어떻게 다른가요?'),
        block('paragraph', variant, ['C2'], ['Q1']),
        block('heading', '자주 묻는 질문'),
        block('paragraph', 'Q. 어떤 모델을 고를까요? A. 등·허리 안마 필요 여부와 허리 지지 필요 여부를 나눠 확인하세요. 현재 옵션별 상세 원문은 확인이 필요합니다.', [], ['Q1']),
        block('cta', '공식몰에서 옵션과 현재 구매 조건을 확인하세요.'),
      ] },
      { channel: 'blog', blocks: [
        block('heading', '서재에 둘 안마 체어를 고를 때 묻는 두 가지'),
        block('paragraph', '첫 질문은 방에 들어가는가이고, 두 번째는 선택한 모델에서 원하는 부위를 안마하는가입니다. 제품명만 보고 두 조건을 함께 판단할 수는 없습니다.'),
        block('heading', '부피 감소와 실제 설치 면적을 구분하세요'),
        block('paragraph', space, ['C1'], ['Q2']),
        block('heading', '허리 지지와 허리 안마는 같은 기능이 아닙니다'),
        block('paragraph', variant, ['C2'], ['Q1']),
        block('paragraph', '구매 전에는 모델별 안마 범위, 의자를 눕혔을 때의 공간, 현재 관리·결제 조건을 각각 확인하세요. 지금 확보한 자료만으로 장시간 착좌감이나 타사보다 높은 안마 성능은 단정할 수 없습니다.'),
      ] },
      { channel: 'youtube_description', blocks: [
        block('heading', '[COWAY BEREX] 비렉스 트리플체어2 슬림 | 모델별 안마 범위와 공간 확인', [], [], '제목 후보'),
        block('heading', '[COWAY BEREX] 비렉스 트리플체어2 슬림 | 서재 설치 전에 볼 크기와 옵션', [], [], '제목 후보'),
        block('heading', '[COWAY BEREX] 비렉스 트리플체어2 슬림 | 일반형과 허리맞춤형 선택 기준', [], [], '제목 후보'),
        block('paragraph', `영상 제작 전 설명 초안입니다. 실제 영상 장면·타임스탬프는 확인하지 않았습니다. 공식 제품 정보: ${productUrl}`),
        block('paragraph', space, ['C1'], ['Q2']),
        block('paragraph', variant, ['C2'], ['Q1']),
        block('paragraph', 'Q. 작은 방에도 놓을 수 있나요? A. 기존 제품 대비 부피 발표만으로는 판단할 수 없으니 실제 방의 크기와 사용 동선을 확인하세요.', [], ['Q2']),
      ] },
    ];
    const content = JSON.stringify({ contract: 'alc.content.v2', requestId: requested.manualContentRequestId,
      inputRevision: requested.inputRevision, evidenceRevision: requested.evidenceRevision, insightRevision: requested.insight.revision,
      documents, unresolvedItems: ['옵션별 원문, 실제 영상·대본, 설치 여유 공간 확인 필요'] });
    const written = importContent(requested, content);
    expect(Object.keys(written.documents)).toHaveLength(5);
    expect(written.documents.product_page?.status).toBe('needs_review');
    expect(() => reviewDocument(written, 'product_page', { meaningReviewed: true, feedbackReviewed: true })).toThrow();
    expect(channelCompleteness(written, written.documents.press_release!).missing.join(' ')).toMatch(/질문|방향/);
    expect(serializeDocument(written.documents.youtube_description!)).toContain('[COWAY BEREX]');
    expect(serializeDocument(written.documents.blog!)).toContain('트리플체어 무빙형 대비 부피');
    const word = await buildWord(written);
    const opened = await JSZip.loadAsync(await word.arrayBuffer());
    const xml = await opened.file('word/document.xml')!.async('string');
    for (const heading of ['광고카피', '보도자료', '블로그', '상세페이지', '유튜브 설명']) expect(xml).toContain(heading);
    expect(xml).toContain('MC-R02S');
    expect(xml).toContain('검토용 초안');
    if (process.env.ALC_COWAY_QA_OUTPUT) writeFileSync(process.env.ALC_COWAY_QA_OUTPUT, new Uint8Array(await word.arrayBuffer()));
  });
});
