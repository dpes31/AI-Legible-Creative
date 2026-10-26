'use client';

import { useState } from 'react';
import { autoMapColumns, CONSUMER_DATA_LIMITS, dataColumnFields, importConsumerDataset, readConsumerDataFile,
  type ConsumerDataType, type DataColumnField, type DataColumnMapping, type ParsedConsumerFile } from '@/domain/consumer-data';
import { type Project } from '@/domain/schema';

const fieldNames: Record<DataColumnField, string> = {
  query: '검색어·질문', text: '원문·리뷰·상담', metric: '지표 이름', value: '값', unit: '단위',
  period: '기간·시점', market: '시장·지역', relationType: '관계 종류', relatedQuery: '연결 검색어',
  sampleScope: '표본 범위', estimate: '값의 성격',
};
const types: { value: ConsumerDataType; label: string }[] = [
  { value: 'search_metrics', label: '검색 지표·검색량' }, { value: 'search_query', label: '실제 검색어 내보내기' },
  { value: 'search_relation', label: '연관 검색어·관계 자료' }, { value: 'customer_verbatim', label: '상담·리뷰·고객 원문' },
  { value: 'survey', label: '설문 자료' }, { value: 'owned_content', label: '기존 온드미디어 자료' }, { value: 'other', label: '기타 자료' },
];

export function ConsumerDataForm({ project, update }: { project: Project; update: (project: Project) => void }) {
  const [table, setTable] = useState<ParsedConsumerFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<DataColumnMapping>({});
  const [dataType, setDataType] = useState<ConsumerDataType>('search_metrics');
  const [provider, setProvider] = useState(''); const [market, setMarket] = useState(project.market || 'KR');
  const [periodStart, setPeriodStart] = useState(''); const [periodEnd, setPeriodEnd] = useState('');
  const [metric, setMetric] = useState(''); const [unit, setUnit] = useState('');
  const [basis, setBasis] = useState<'absolute' | 'relative' | 'estimated' | 'unknown'>('unknown');
  const [sampleScope, setSampleScope] = useState('');
  const [externalAiAllowed, setExternalAiAllowed] = useState(false); const [publicationAllowed, setPublicationAllowed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const savedFiles = project.consumerDatasets.length + project.sources.filter(source => source.fileName).length;

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const parsed = await readConsumerDataFile(file);
      setTable(parsed); setFileName(file.name); setMapping(autoMapColumns(parsed.headers));
      setNotice(`${parsed.rows.length.toLocaleString()}개 행과 ${parsed.headers.length}개 열을 읽었습니다. 실제 자료로 분석하기 전에 열 매핑과 표본 조건을 확인해 주세요.`);
    } catch (cause) { setTable(null); setError(cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const saveDataset = () => {
    if (!table) return;
    setError(''); setNotice('');
    try {
      const next = importConsumerDataset(project, table, {
        fileName: fileName || '가져온 자료',
        dataType, provider: provider.trim(), market: market.trim() || project.market,
        periodStart: periodStart.trim() || null, periodEnd: periodEnd.trim() || null,
        metric: metric.trim(), unit: unit.trim(), basis, sampleScope: sampleScope.trim(), mapping,
        externalAiAllowed, publicationAllowed,
      });
      update(next); setNotice(next === project
        ? '같은 파일·열 매핑·자료 조건이 이미 저장되어 있어 중복으로 추가하지 않았습니다.'
        : `${next.consumerDatasets.at(-1)?.rowCount.toLocaleString() || 0}개 데이터 행을 저장했습니다. 공백 행은 제외하고, 읽기 어려운 행은 원본 값과 함께 검토 대상으로 남겼습니다. 새 조사 요청문을 만들어야 합니다.`);
      setTable(null); setFileName(''); setProvider(''); setPeriodStart(''); setPeriodEnd(''); setMetric(''); setUnit(''); setSampleScope('');
      setExternalAiAllowed(false); setPublicationAllowed(false);
      const input = document.getElementById('consumer-data-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (cause) { setError(cause instanceof Error ? cause.message : '자료를 저장하지 못했습니다. 원본 파일은 그대로 있습니다.'); }
  };

  return <section aria-labelledby="consumer-data-heading">
    <h3 id="consumer-data-heading">소비자·검색 자료 가져오기</h3>
    <p className="small muted">CSV·TSV·TXT·XLSX를 이 브라우저의 작업에 저장합니다. 검색 키워드와 검색량은 실제 AI 프롬프트나 전체 소비자 수요를 뜻하지 않습니다. 개인을 알아볼 수 있는 정보는 제거한 뒤 가져와 주세요.</p>
    {!!project.consumerDatasets.length && <div className="small" aria-label="저장된 소비자 자료">
      {project.consumerDatasets.map(dataset => <p key={dataset.id}><strong>{dataset.fileName}</strong> · {dataset.dataType} · {dataset.provider || '제공자 미기재'} · {dataset.rowCount.toLocaleString()}행
        {' '}<span className="badge">사용 가능 {dataset.acceptedRows}</span>{dataset.reviewRows > 0 && <> <span className="badge warn">검토 {dataset.reviewRows}</span></>}
        {dataset.rejectedRows > 0 && <> <span className="badge error">연결 보류 {dataset.rejectedRows}</span></>}
        {' '}<span className="small muted">{dataset.externalAiAllowed ? '외부 AI 전달 허용' : '외부 AI 전달 안 함'}</span></p>)}
    </div>}
    <div className="field"><label htmlFor="consumer-data-file">자료 파일</label><input id="consumer-data-file" type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || savedFiles >= CONSUMER_DATA_LIMITS.projectFiles} onChange={event => void chooseFile(event.target.files?.[0])} />
      <span className="small muted">파일당 10MB(Excel 압축 해제 후 50MB) · 프로젝트당 파일 {savedFiles}/{CONSUMER_DATA_LIMITS.projectFiles}개 · 구조화 행 최대 {CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}개. XLSX는 첫 시트만 읽으며 수식은 실행하지 않습니다.</span>
      {busy && <span role="status">파일 내용을 확인하고 있습니다…</span>}</div>
    {table && <>
      <div className="grid">
        <div className="field"><label htmlFor="consumer-type">자료 유형</label><select id="consumer-type" value={dataType} onChange={event => setDataType(event.target.value as ConsumerDataType)}>
          {types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select></div>
        <div className="field"><label htmlFor="consumer-provider">자료 제공자·도구</label><input id="consumer-provider" value={provider} onChange={event => setProvider(event.target.value)} placeholder="예: 검색 도구 이름, 고객센터 내보내기" /></div>
      </div>
      <div className="grid">
        <div className="field"><label htmlFor="consumer-market">시장·지역</label><input id="consumer-market" value={market} onChange={event => setMarket(event.target.value)} /></div>
        <div className="field"><label htmlFor="consumer-scope">표본·집계 범위</label><input id="consumer-scope" value={sampleScope} onChange={event => setSampleScope(event.target.value)} placeholder="예: 2026년 9월 선택한 키워드의 도구 지수" /></div>
      </div>
      <div className="grid">
        <div className="field"><label htmlFor="consumer-period-start">기간 시작</label><input id="consumer-period-start" value={periodStart} onChange={event => setPeriodStart(event.target.value)} placeholder="예: 2026-09" /></div>
        <div className="field"><label htmlFor="consumer-period-end">기간 종료</label><input id="consumer-period-end" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} placeholder="예: 2026-09" /></div>
      </div>
      <div className="grid">
        <div className="field"><label htmlFor="consumer-metric">지표 이름</label><input id="consumer-metric" value={metric} onChange={event => setMetric(event.target.value)} placeholder="예: 상대 검색 지수" /></div>
        <div className="field"><label htmlFor="consumer-unit">단위</label><input id="consumer-unit" value={unit} onChange={event => setUnit(event.target.value)} placeholder="예: 건, %, 상대지수" /></div>
      </div>
      <div className="field"><label htmlFor="consumer-basis">값의 성격</label><select id="consumer-basis" value={basis} onChange={event => setBasis(event.target.value as typeof basis)}>
        <option value="unknown">모름·미기재</option><option value="absolute">절대값·실측</option><option value="relative">상대값·지수</option><option value="estimated">추정값</option>
      </select></div>
      <h4>열을 확인해 주세요</h4><p className="small muted">자동 제안된 열을 직접 수정할 수 있습니다. 원본 행은 그대로 보존하며, 연결하지 않은 열은 분석에 사용하지 않습니다.</p>
      <div className="grid">
        {dataColumnFields.map(field => <div className="field" key={field}><label htmlFor={`consumer-map-${field}`}>{fieldNames[field]}</label>
          <select id={`consumer-map-${field}`} value={mapping[field] || ''} onChange={event => setMapping(current => ({ ...current, [field]: event.target.value || undefined }))}>
            <option value="">연결 안 함</option>{table.headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}
          </select></div>)}
      </div>
      <div className="field"><strong>행 미리보기</strong><div style={{ overflowX: 'auto' }}><table><thead><tr>{table.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
        <tbody>{table.rows.slice(0, 5).map((row, index) => <tr key={index}>{table.headers.map((header, column) => <td key={`${header}-${column}`}>{row[column] || '—'}</td>)}</tr>)}</tbody></table></div>
        <span className="small muted">전체 {table.rows.length.toLocaleString()}행 · 위에는 최대 5행만 미리 보여 줍니다. 저장 시 모든 행을 처리합니다.</span></div>
      {!!table.warnings.length && <div className="alert"><strong>파일 확인 사항</strong><ul>{table.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      <label className="row small"><input type="checkbox" checked={externalAiAllowed} onChange={event => setExternalAiAllowed(event.target.checked)} />익명화와 이용 권한을 확인했습니다. 이 자료의 원문 행을 외부 AI 조사 요청문에 포함합니다.</label>
      <label className="row small"><input type="checkbox" checked={publicationAllowed} onChange={event => setPublicationAllowed(event.target.checked)} />이 자료 내용을 공개 콘텐츠 근거로 사용할 권한이 있습니다.</label>
      <p className="small muted">체크하지 않은 자료는 외부 요청문에 원문이나 파일명을 넣지 않습니다. 동의하더라도 데이터는 이 기기의 로컬 저장소에만 남습니다.</p>
      {table.rows.length > 1000 && externalAiAllowed && <p className="alert" role="status">전달 행이 많습니다. 조사 요청문이 5만 자를 넘으면 자료를 나누어야 합니다. 임의로 일부만 전송하지 않습니다.</p>}
      <button type="button" className="button secondary" onClick={saveDataset}>이 자료를 분석에 추가</button>
    </>}
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
  </section>;
}
