import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseDelimitedText, autoMapColumns, importConsumerDataset, externalDatasetContext, readConsumerDataFile } from '../src/domain/consumer-data';
import { newProject } from '../src/domain/schema';
import { importResearch, prepareContent, prepareResearch } from '../src/domain/workflow';
import { approveInsight } from '../src/domain/insight';

function project() {
  return newProject({ name: '가상 제품', kind: 'product', description: '', officialUrl: '', objective: 'feature',
    audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
}

describe('소비자 자료 가져오기와 근거 범위', () => {
  it('CSV의 따옴표·쉼표·줄바꿈·BOM을 보존한다', () => {
    expect(parseDelimitedText('\uFEFF검색어,검색량,기간\r\n"작은 방, 서재","0",2026-09\r\n"안마\n소음",,2026-10')).toEqual({
      headers: ['검색어', '검색량', '기간'],
      rows: [['작은 방, 서재', '0', '2026-09'], ['안마\n소음', '', '2026-10']],
      sourceRows: [2, 3],
      warnings: [],
    });
  });

  it('한국어 열 이름을 제안 매핑하되 사용자가 바꿀 수 있게 필드별 제안을 돌려준다', () => {
    expect(autoMapColumns(['검색어', '월간 검색량', '기준월', '지역', '추정 여부'])).toMatchObject({
      query: '검색어', value: '월간 검색량', period: '기준월', market: '지역', estimate: '추정 여부',
    });
  });

  it('XLSX 첫 시트의 원문과 행을 읽고 수식은 실행하지 않은 채 표시한다', async () => {
    const archive = new JSZip();
    archive.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="검색어" sheetId="1" r:id="rId1"/></sheets></workbook>');
    archive.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    archive.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>검색어</t></is></c><c r="B1" t="inlineStr"><is><t>검색량</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>좁은 방 의자</t></is></c><c r="B2"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>');
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const table = await readConsumerDataFile(new File([arrayBuffer], 'sample.xlsx'));
    expect(table.format).toBe('xlsx');
    expect(table.headers).toEqual(['검색어', '검색량']);
    expect(table.rows).toEqual([['좁은 방 의자', '[수식 미실행: 1+2]']]);
    expect(table.sourceRows).toEqual([2]);
    expect(table.warnings.join(' ')).toContain('수식은 실행하지 않았습니다');
  });

  it('압축 해제 크기가 제한을 넘는 XLSX를 읽기 전에 거절한다', async () => {
    // Pre-compressed, synthetic 51 MiB unused ZIP entry. Generate once, not in each timed test.
    const bytes = Buffer.from(readFileSync(new URL('./fixtures/consumer-overlimit.xlsx.b64', import.meta.url), 'utf8').trim(), 'base64');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await expect(readConsumerDataFile(new File([arrayBuffer], 'large.xlsx'))).rejects.toThrow(/압축 해제 후 크기/);
  });

  it('크기 예비 검사 후에도 허용 크기 ZIP의 CRC 오류를 거절한다', async () => {
    const zip = new JSZip(); zip.file('test.txt', 'small crc fixture');
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const central = bytes.findIndex((_, i) => bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2);
    bytes[central + 16] ^= 1;
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await expect(readConsumerDataFile(new File([arrayBuffer], 'corrupt.xlsx'))).rejects.toThrow(/CRC32/);
  });

  it('0과 결측값, 원본 행, 기간·단위·상대지표를 분리해 보존한다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['검색어', '검색량', '단위', '기준월'],
      rows: [['작은 방 안마의자', '0', '상대지수', '2026-09'], ['', '', '', ''], ['업무용 안마의자', '', '상대지수', '2026-09']],
      warnings: [] as string[], fileHash: 'sha256:fake' };
    const imported = importConsumerDataset(p, table, {
      fileName: 'sample.csv', dataType: 'search_metrics', provider: '예시 데이터', market: 'KR',
      periodStart: '2026-09', periodEnd: '2026-09', metric: '검색 관심도', unit: '상대지수', basis: 'relative',
      sampleScope: '허구 fixture', mapping: { query: '검색어', value: '검색량', unit: '단위', period: '기준월' },
      externalAiAllowed: false, publicationAllowed: false,
    });
    expect(imported.consumerObservations.map(row => row.value)).toEqual([0, null]);
    expect(imported.consumerObservations.map(row => row.rawRecord['검색량'])).toEqual(['0', '']);
    expect(imported.consumerObservations.map(row => row.sourceRow)).toEqual([2, 4]);
    expect(imported.consumerObservations[0]).toMatchObject({ basis: 'relative', unit: '상대지수', period: '2026-09' });
    expect(imported.consumerDatasets[0]).toMatchObject({ provider: '예시 데이터', rowCount: 2, acceptedRows: 2, externalAiAllowed: false });
    expect(imported.consumerDatasets[0].mappingVersion).toMatch(/^fnv1a:/);
  });

  it('같은 파일·열 매핑·조건을 다시 가져오면 중복 행을 만들지 않는다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['질문'], rows: [['좁은 방 안마의자']], warnings: [], fileHash: 'sha256:duplicate' };
    const input = { fileName: 'queries.csv', dataType: 'search_query' as const, provider: '예시 자료', market: 'KR',
      periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown' as const, sampleScope: '허구 자료',
      mapping: { query: '질문' }, externalAiAllowed: false, publicationAllowed: false };
    const imported = importConsumerDataset(p, table, input);
    expect(importConsumerDataset(imported, table, input)).toBe(imported);
    expect(imported.consumerDatasets).toHaveLength(1);
    expect(imported.consumerObservations).toHaveLength(1);
  });

  it('외부 제공을 허용하지 않은 자료는 요청문에 원문·검색어를 싣지 않는다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['질문'], rows: [['비공개 상담 문구']], warnings: [], fileHash: 'sha256:private' };
    const imported = importConsumerDataset(p, table, { fileName: 'private.csv', dataType: 'customer_verbatim', provider: '내부 상담',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '비공개',
      mapping: { text: '질문' }, externalAiAllowed: false, publicationAllowed: false });
    expect(externalDatasetContext(imported)).not.toContain('비공개 상담 문구');
    expect(prepareResearch(imported).prompt).not.toContain('비공개 상담 문구');
    expect(externalDatasetContext(imported)).toContain('제공하지 않았습니다');
  });

  it('외부 제공을 허용하지 않은 행은 외부 요청 식별 hash에도 반영하지 않는다', () => {
    const p = project();
    const shared = importConsumerDataset(p,
      { format: 'csv', headers: ['검색어'], rows: [['공개 허용 검색어']], warnings: [], fileHash: 'sha256:shared-hash' },
      { fileName: 'shared.csv', dataType: 'search_query', provider: '공개 허용 자료', market: 'KR', periodStart: null, periodEnd: null,
        metric: '', unit: '', basis: 'unknown', sampleScope: '허구 fixture', mapping: { query: '검색어' }, externalAiAllowed: true, publicationAllowed: false });
    const withPrivate = importConsumerDataset(shared,
      { format: 'csv', headers: ['원문'], rows: [['절대 외부 전달하지 않을 원문']], warnings: [], fileHash: 'sha256:private-hash' },
      { fileName: 'private.csv', dataType: 'customer_verbatim', provider: '비공개 상담', market: 'KR', periodStart: null, periodEnd: null,
        metric: '', unit: '', basis: 'unknown', sampleScope: '비공개', mapping: { text: '원문' }, externalAiAllowed: false, publicationAllowed: false });
    const withoutPrivateHash = prepareResearch(shared).project.manualResearchInputHash;
    const withPrivateHash = prepareResearch(withPrivate).project.manualResearchInputHash;
    expect(withPrivateHash).toBe(withoutPrivateHash);
    expect(prepareResearch(withPrivate).prompt).not.toContain('절대 외부 전달하지 않을 원문');
  });

  it('사용자가 외부 전달을 허용한 자료는 실제 원문과 집계 조건을 명시해 요청문에 전달한다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['검색어', '검색량'], rows: [['좁은 방 의자', '12']], warnings: [], fileHash: 'sha256:shared' };
    const imported = importConsumerDataset(p, table, { fileName: 'queries.csv', dataType: 'search_metrics', provider: '검색 도구 A',
      market: 'KR', periodStart: '2026-09', periodEnd: '2026-09', metric: '검색 관심도', unit: '상대지수', basis: 'relative',
      sampleScope: '선택한 키워드의 도구 지표', mapping: { query: '검색어', value: '검색량' },
      externalAiAllowed: true, publicationAllowed: false });
    const prompt = prepareResearch(imported).prompt;
    expect(prompt).toContain('좁은 방 의자');
    expect(prompt).toContain('상대지수');
    expect(prompt).toContain('실제 입력 문구가 아니라 검색 도구의 키워드입니다');
    expect(prompt).toContain('alc.research.v4');
  });

  it('검토가 필요한 잘못된 행은 원본 보존 후 외부 요청 자료에서 제외한다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['검색어', '검색량'],
      rows: [['확인된 키워드', '3'], ['수치 형식 오류 전용 키워드', '약 3회']], warnings: [], fileHash: 'sha256:invalid-value' };
    const imported = importConsumerDataset(p, table, { fileName: 'metrics.csv', dataType: 'search_metrics', provider: '예시 도구',
      market: 'KR', periodStart: '2026-09', periodEnd: '2026-09', metric: '검색량', unit: '회', basis: 'absolute', sampleScope: '허구 fixture',
      mapping: { query: '검색어', value: '검색량' }, externalAiAllowed: true, publicationAllowed: true });
    const prompt = prepareResearch(imported).prompt;
    expect(imported.consumerObservations[1]).toMatchObject({ importStatus: 'needs_review', value: null, rawRecord: { 검색량: '약 3회' } });
    expect(prompt).toContain('확인된 키워드');
    expect(prompt).not.toContain('수치 형식 오류 전용 키워드');
    expect(prompt).toContain('검토 필요=1');
  });

  it('v4 응답은 같은 프로젝트·입력 버전을 검사하고 질문을 실제 데이터 행에 연결한다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['질문'], rows: [['안마의자 소음']], warnings: [], fileHash: 'sha256:query' };
    const data = importConsumerDataset(p, table, { fileName: 'queries.csv', dataType: 'search_query', provider: '예시 검색 자료',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '허구 fixture',
      mapping: { query: '질문' }, externalAiAllowed: true, publicationAllowed: false });
    const started = prepareResearch(data).project;
    const response = { contract: 'alc.research.v4', requestId: started.manualResearchRequestId, projectId: started.id,
      inputHash: started.manualResearchInputHash, entity: { name: started.name },
      sources: [{ ref: 'S1', title: '허구 출처', url: null, excerpt: '허구 기능 설명' }], claims: [],
      questions: [{ ref: 'Q1', text: '안마의자를 업무에 사용할 수 있나요?', provenance: 'reconstructed', sourceRefs: [],
        observationRefs: [started.consumerObservations[0].id], situation: '업무 중', need: '의자 겸용', painPoint: '', decisionCriteria: ['착좌감'] }],
      questionClusters: [], unmetNeeds: [], productCandidates: [], existingContent: [], answerPlans: [],
      comparisons: [], recommendations: [], missingEvidence: [] };
    const imported = importResearch(started, JSON.stringify(response));
    expect(imported.questions[0]).toMatchObject({ observationIds: [started.consumerObservations[0].id], observationLinkStatus: 'linked' });
    expect(imported.manualResearchInputHash).toBeNull();
    expect(() => importResearch(started, JSON.stringify({ ...response, projectId: 'other-project' }))).toThrow(/다른 프로젝트/);
  });

  it('외부 AI 전달이 허용되지 않은 원문 행은 조사 응답이 관찰 근거로 연결할 수 없다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['질문'], rows: [['사내 비공개 질문']], warnings: [], fileHash: 'sha256:withheld' };
    const privateData = importConsumerDataset(p, table, { fileName: 'private.csv', dataType: 'customer_verbatim', provider: '사내 상담',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '비공개',
      mapping: { query: '질문' }, externalAiAllowed: false, publicationAllowed: false });
    const started = prepareResearch(privateData).project;
    const response = { contract: 'alc.research.v4', requestId: started.manualResearchRequestId, projectId: started.id,
      inputHash: started.manualResearchInputHash, entity: { name: started.name },
      sources: [{ ref: 'S1', title: '허구 출처', url: null, excerpt: '허구 기능 설명' }], claims: [],
      questions: [{ ref: 'Q1', text: '고객이 무엇을 궁금해 하나요?', provenance: 'observed', sourceRefs: [],
        observationRefs: [started.consumerObservations[0].id], situation: '', need: '', painPoint: '', decisionCriteria: [] }],
      questionClusters: [], unmetNeeds: [], productCandidates: [], existingContent: [], answerPlans: [],
      comparisons: [], recommendations: [], missingEvidence: [] };
    expect(() => importResearch(started, JSON.stringify(response))).toThrow(/소비자 자료 연결을 찾지 못했습니다/);
  });

  it('실제 검색 키워드 질문에는 원본이 연결되고 검색 결과를 AI 프롬프트 빈도로 바꾸지 않는다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['검색어'], rows: [['안마의자 소음']], warnings: [], fileHash: 'sha256:actual-query' };
    const data = importConsumerDataset(p, table, { fileName: 'query.csv', dataType: 'search_query', provider: '허구 검색 데이터',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '허구 데이터 한 건',
      mapping: { query: '검색어' }, externalAiAllowed: true, publicationAllowed: false });
    const prompt = prepareResearch(data).prompt;
    expect(prompt).toContain('안마의자 소음');
    expect(prompt).toContain('생성형 AI에 입력된 프롬프트나 전체 시장 수요가 아닙니다');
  });

  it('외부 전달 동의가 없는 데이터에서 파생된 질문은 작성 요청문으로 유출하지 않는다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['원문'], rows: [['비공개 상담 원문: 허리 불편']], warnings: [], fileHash: 'sha256:private-derived' };
    const data = importConsumerDataset(p, table, { fileName: 'private.csv', dataType: 'customer_verbatim', provider: '사내 상담',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '내부 상담',
      mapping: { text: '원문' }, externalAiAllowed: false, publicationAllowed: false });
    const question = { id: 'q-private', text: '고객은 허리 불편을 어떻게 해결하나요?', provenance: 'observed' as const,
      sourceIds: [], observationIds: [data.consumerObservations[0].id], observationLinkStatus: 'linked' as const };
    const approved = approveInsight({ ...data, questions: [question] }, true);
    const prompt = prepareContent(approved, ['blog']).prompt;
    expect(prompt).not.toContain('비공개 상담 원문');
    expect(prompt).not.toContain('고객은 허리 불편을 어떻게 해결하나요?');
  });

  it('외부 분석만 허용한 소비자 원문과 그로부터 만든 질문은 작성 요청문에서 제외한다', () => {
    const p = project();
    const table = { format: 'csv' as const, headers: ['고객 질문'], rows: [['허리 지지가 안 되면 불편할까요?']], warnings: [], fileHash: 'sha256:analysis-only' };
    const imported = importConsumerDataset(p, table, { fileName: 'analysis-only.csv', dataType: 'customer_verbatim', provider: '예시 상담 자료',
      market: 'KR', periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown', sampleScope: '허구 fixture',
      mapping: { query: '고객 질문' }, externalAiAllowed: true, publicationAllowed: false });
    const question = { id: 'q-analysis-only', text: '허리 지지가 불편하다는 고객은 어떤 의자를 찾나요?', provenance: 'observed' as const,
      sourceIds: [], observationIds: [imported.consumerObservations[0].id], observationLinkStatus: 'linked' as const };
    const approved = approveInsight({ ...imported, questions: [question] }, true);
    const prompt = prepareContent(approved, ['blog']).prompt;
    expect(prompt).not.toContain('허리 지지가 안 되면 불편할까요?');
    expect(prompt).not.toContain('허리 지지가 불편하다는 고객은 어떤 의자를 찾나요?');
  });

  it('원본 행에 연결되지 않은 관찰 표기 질문은 작성 요청문에 포함하지 않는다', () => {
    const p = project();
    const question = { id: 'q-unlinked-observed', text: '실제 고객이 한 말인지 확인되지 않은 질문', provenance: 'observed' as const,
      sourceIds: [], observationIds: [], observationLinkStatus: 'missing' as const };
    const approved = approveInsight({ ...p, questions: [question] }, true);
    expect(prepareContent(approved, ['blog']).prompt).not.toContain(question.text);
  });

  it('질문 우선순위가 없는 경우 배열 첫 항목을 전략 우선순위처럼 제시하지 않는다', async () => {
    const { buildStrategy } = await import('../src/domain/analysis/strategy');
    const p = project();
    p.questions = [
      { id: 'q1', text: '어떤 의자를 고르나요?', provenance: 'hypothesis', sourceIds: [] },
      { id: 'q2', text: '좁은 방에 둘 수 있나요?', provenance: 'hypothesis', sourceIds: [] },
    ];
    expect(buildStrategy(p).focus).toContain('실제 소비자 관찰 자료');
  });
});
