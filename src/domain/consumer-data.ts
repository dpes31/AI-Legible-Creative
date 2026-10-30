import JSZip from 'jszip';
import { type ConsumerDataset, type ConsumerObservation, type Project } from './schema';
import { fingerprint } from './text';

export const CONSUMER_DATA_LIMITS = { fileBytes: 10 * 1024 * 1024, expandedFileBytes: 50 * 1024 * 1024, projectFiles: 5, projectRows: 50_000, columns: 100 } as const;

export const dataColumnFields = ['query', 'text', 'metric', 'value', 'unit', 'period', 'market', 'relationType', 'relatedQuery', 'sampleScope', 'estimate'] as const;
export type DataColumnField = (typeof dataColumnFields)[number];
export type DataColumnMapping = Partial<Record<DataColumnField, string>>;
export type ConsumerDataType = ConsumerDataset['dataType'];
export type ParsedConsumerFile = { format: ConsumerDataset['format']; headers: string[]; rows: string[][]; sourceRows?: number[]; warnings: string[]; fileHash: string };

function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && !field) quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다. 파일을 확인해 주세요.');
  row.push(field);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function delimiterFor(text: string): string {
  const counts = new Map([',', '\t', ';'].map(delimiter => [delimiter, 0]));
  let quoted = false;
  for (let i = 0; i < text.length && text[i] !== '\n' && text[i] !== '\r'; i += 1) {
    if (text[i] === '"' && text[i + 1] === '"' && quoted) { i += 1; continue; }
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && counts.has(text[i])) counts.set(text[i], (counts.get(text[i]) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || ',';
}

function uniqueHeaders(input: string[]): { headers: string[]; warnings: string[] } {
  if (input.length > CONSUMER_DATA_LIMITS.columns) throw new Error(`열은 ${CONSUMER_DATA_LIMITS.columns}개까지만 가져올 수 있습니다. 파일을 나누어 주세요.`);
  const used = new Map<string, number>(); const warnings: string[] = [];
  const headers = input.map((value, index) => {
    const base = value.trim() || `열 ${index + 1}`; const count = (used.get(base) || 0) + 1; used.set(base, count);
    if (count > 1) warnings.push(`같은 이름의 열 “${base}”이 있어 ${base} (${count})로 구분했습니다.`);
    return count === 1 ? base : `${base} (${count})`;
  });
  return { headers, warnings };
}

export function parseDelimitedText(input: string, delimiter?: string) {
  const text = input.replace(/^\uFEFF/, '');
  const raw = splitDelimited(text, delimiter || delimiterFor(text));
  if (!raw.length) throw new Error('파일에 읽을 수 있는 행이 없습니다.');
  const { headers, warnings } = uniqueHeaders(raw[0]);
  if (!headers.length) throw new Error('첫 행에서 열 이름을 찾지 못했습니다.');
  const rows = raw.slice(1).map((cells, index) => {
    if (cells.length > headers.length) {
      warnings.push(`${index + 2}행에 열 이름보다 값이 더 많습니다. 초과 값은 원본 행에 보존하고 검토 대상으로 표시합니다.`);
    }
    return cells;
  });
  if (rows.length > CONSUMER_DATA_LIMITS.projectRows) throw new Error(`행이 ${CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}개를 넘습니다. 파일을 나누어 주세요. 일부 행만 가져오지는 않았습니다.`);
  return { headers, rows, sourceRows: rows.map((_, index) => index + 2), warnings };
}

function xmlDecode(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16))).replace(/&amp;/g, '&');
}

function attribute(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`));
  return match ? xmlDecode(match[1]) : null;
}

function columnNumber(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return -1;
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function textNodes(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => xmlDecode(match[1])).join('');
}

async function parseXlsx(buffer: ArrayBuffer) {
  // Inspect the ZIP directory before CRC validation: checkCRC32 inflates every
  // entry, including oversized unused parts. Keep full CRC validation below.
  const directory = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  const expandedBytes = Object.values(directory.files).reduce((total, entry) => total +
    ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0);
  if (expandedBytes > CONSUMER_DATA_LIMITS.expandedFileBytes) {
    throw new Error(`Excel 압축 해제 후 크기가 ${CONSUMER_DATA_LIMITS.expandedFileBytes / 1024 / 1024}MB를 넘습니다. 파일을 나누어 주세요.`);
  }
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const names = Object.keys(zip.files);
  if (names.some(name => /(^|\/)vbaProject\.bin$/i.test(name))) throw new Error('매크로가 포함된 Excel 파일은 가져오지 않습니다. CSV로 내보내 주세요.');
  if (names.some(name => name.startsWith('xl/externalLinks/'))) throw new Error('외부 파일 연결이 포함된 Excel입니다. CSV로 내보내 주세요.');
  const workbookEntry = zip.file('xl/workbook.xml');
  const relsEntry = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookEntry || !relsEntry) throw new Error('Excel 통합 문서 구조를 읽지 못했습니다. 암호화 여부와 파일 형식을 확인해 주세요.');
  const [workbook, rels] = await Promise.all([workbookEntry.async('string'), relsEntry.async('string')]);
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)];
  const firstSheetId = sheets[0]?.[1];
  if (!firstSheetId) throw new Error('Excel에서 읽을 시트를 찾지 못했습니다.');
  const relation = [...rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].find(match => attribute(match[0], 'Id') === firstSheetId);
  const target = relation && attribute(relation[0], 'Target');
  if (!target || target.includes('..')) throw new Error('Excel 첫 번째 시트 위치를 안전하게 확인하지 못했습니다.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheetEntry = zip.file(sheetPath);
  if (!sheetEntry) throw new Error('Excel 첫 번째 시트 내용을 찾지 못했습니다.');
  const sharedEntry = zip.file('xl/sharedStrings.xml');
  const [sheet, sharedXml] = await Promise.all([sheetEntry.async('string'), sharedEntry?.async('string')]);
  const shared = sharedXml ? [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match => textNodes(match[1])) : [];
  const warnings: string[] = [];
  if (sheets.length > 1) warnings.push(`시트 ${sheets.length}개 중 첫 번째 시트 “${xmlDecode(attribute(sheets[0][0], 'name') || '첫 번째 시트')}”만 가져왔습니다.`);
  const rows: string[][] = [];
  let formulas = false;
  const sourceRows: number[] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const values: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = columnNumber(attribute(cellMatch[1], 'r') || '');
      if (col < 0 || col >= CONSUMER_DATA_LIMITS.columns) throw new Error(`열은 ${CONSUMER_DATA_LIMITS.columns}개까지만 가져올 수 있습니다.`);
      const type = attribute(cellMatch[1], 't'); const inner = cellMatch[2]; const formula = inner.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
      const value = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      if (formula) { formulas = true; values[col] = `[수식 미실행: ${xmlDecode(formula[1])}]`; }
      else if (type === 's' && value !== undefined) values[col] = shared[Number(value)] ?? '';
      else if (type === 'inlineStr') values[col] = textNodes(inner);
      else values[col] = value === undefined ? '' : xmlDecode(value);
    }
    rows.push(values.map(value => value ?? ''));
    sourceRows.push(Number(attribute(rowMatch[1], 'r')) || sourceRows.length + 1);
    if (rows.length > CONSUMER_DATA_LIMITS.projectRows + 1) throw new Error(`행이 ${CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}개를 넘습니다. 일부 행만 가져오지는 않았습니다.`);
  }
  if (formulas) warnings.push('수식은 실행하지 않았습니다. 원본 수식 표기를 검토 대상으로 보존했습니다.');
  if (!rows.length) throw new Error('Excel 첫 번째 시트에서 읽을 행을 찾지 못했습니다.');
  const normalized = uniqueHeaders(rows[0]); warnings.push(...normalized.warnings);
  return { headers: normalized.headers, rows: rows.slice(1), sourceRows: sourceRows.slice(1), warnings };
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readConsumerDataFile(file: File): Promise<ParsedConsumerFile> {
  if (file.size > CONSUMER_DATA_LIMITS.fileBytes) throw new Error('파일은 10MB 이하로 올려 주세요. 초과 파일을 잘라서 가져오지는 않습니다.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'tsv', 'txt', 'xlsx'].includes(extension || '')) throw new Error('CSV, TSV, TXT 또는 XLSX 파일을 선택해 주세요.');
  const buffer = await file.arrayBuffer(); const fileHash = `sha256:${await sha256(buffer)}`;
  if (extension === 'xlsx') {
    const table = await parseXlsx(buffer);
    return { ...table, format: 'xlsx', fileHash };
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (extension === 'txt') {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (!lines.some(line => line.trim())) throw new Error('파일에 읽을 수 있는 문장이 없습니다.');
    if (lines.length > CONSUMER_DATA_LIMITS.projectRows) throw new Error(`행이 ${CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}개를 넘습니다. 일부 행만 가져오지는 않았습니다.`);
    return { format: 'txt', headers: ['원문'], rows: lines.map(line => [line]), sourceRows: lines.map((_, index) => index + 1), warnings: [], fileHash };
  }
  const table = parseDelimitedText(text, extension === 'tsv' ? '\t' : undefined);
  return { ...table, format: extension as 'csv' | 'tsv', fileHash };
}

const aliases: Record<DataColumnField, string[]> = {
  query: ['query', 'keyword', 'search term', '검색어', '검색 키워드', '키워드', '고객 질문', '질문'],
  text: ['text', 'content', 'comment', 'review', '본문', '원문', '리뷰', '상담 내용', '응답', '의견'],
  metric: ['metric', 'metric name', '지표', '항목', '측정 항목'],
  value: ['value', 'volume', 'search volume', 'count', '검색량', '월간 검색량', '수치', '값', '건수'],
  unit: ['unit', '단위'], period: ['period', 'date', 'month', '기간', '기준월', '일자', '시점'],
  market: ['market', 'country', 'region', 'location', '시장', '국가', '지역'],
  relationType: ['relation type', 'relationship', '관계 유형', '관계유형', '연관 유형'],
  relatedQuery: ['related query', 'related keyword', '연관 검색어', '연관검색어', '함께 검색'],
  sampleScope: ['sample', 'sample scope', 'scope', '표본', '대상 범위'],
  estimate: ['estimate', 'estimated', 'basis', '추정 여부', '추정', '수치 성격', '측정 방식'],
};

function normalizeHeader(value: string) { return value.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim(); }

export function autoMapColumns(headers: string[]): DataColumnMapping {
  const mapping: DataColumnMapping = {};
  for (const field of dataColumnFields) {
    const match = headers.find(header => aliases[field].some(alias => normalizeHeader(header) === normalizeHeader(alias)));
    if (match) mapping[field] = match;
  }
  return mapping;
}

type DatasetInput = Omit<ConsumerDataset, 'schemaVersion' | 'id' | 'projectId' | 'format' | 'fileHash' | 'rowCount' | 'acceptedRows' | 'reviewRows' | 'rejectedRows' | 'importedAt' | 'headers' | 'warnings' | 'mappingVersion'> & {
  headers?: string[]; warnings?: string[];
};

function basisFromCell(value: string | undefined, fallback: ConsumerDataset['basis']): ConsumerDataset['basis'] {
  const normalized = (value || '').toLowerCase();
  if (/추정|estimate/.test(normalized)) return 'estimated';
  if (/상대|지수|relative|index/.test(normalized)) return 'relative';
  if (/절대|실측|actual|absolute/.test(normalized)) return 'absolute';
  return fallback;
}

function parseNumber(value: string): number | null | 'invalid' {
  const text = value.trim();
  if (!text) return null;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return 'invalid';
  const number = Number(text.replaceAll(',', ''));
  return Number.isFinite(number) ? number : 'invalid';
}

function getCell(record: Record<string, string>, mapping: DataColumnMapping, key: DataColumnField) {
  const header = mapping[key]; return header ? record[header] ?? '' : '';
}

function markDocumentsStale(documents: Project['documents']): Project['documents'] {
  return Object.fromEntries(Object.entries(documents).map(([key, document]) => [key, document && { ...document, status: 'stale' }])) as Project['documents'];
}

export function importConsumerDataset(project: Project, table: Pick<ParsedConsumerFile, 'format' | 'headers' | 'rows' | 'sourceRows' | 'warnings' | 'fileHash'>, input: DatasetInput): Project {
  const mappingVersion = fingerprint(JSON.stringify(Object.entries(input.mapping).sort(([left], [right]) => left.localeCompare(right))));
  const identicalImport = project.consumerDatasets.find(dataset => dataset.fileHash === table.fileHash &&
    dataset.mappingVersion === mappingVersion && dataset.dataType === input.dataType && dataset.provider === input.provider &&
    dataset.market === input.market && dataset.periodStart === input.periodStart && dataset.periodEnd === input.periodEnd &&
    dataset.metric === input.metric && dataset.unit === input.unit && dataset.basis === input.basis &&
    dataset.sampleScope === input.sampleScope && dataset.externalAiAllowed === input.externalAiAllowed &&
    dataset.publicationAllowed === input.publicationAllowed);
  if (identicalImport) return project;
  if (project.consumerDatasets.length >= CONSUMER_DATA_LIMITS.projectFiles || project.sources.filter(source => source.fileName).length + project.consumerDatasets.length >= CONSUMER_DATA_LIMITS.projectFiles) {
    throw new Error(`프로젝트당 자료 파일은 ${CONSUMER_DATA_LIMITS.projectFiles}개까지 저장할 수 있습니다.`);
  }
  if (table.rows.length + project.consumerObservations.length > CONSUMER_DATA_LIMITS.projectRows) {
    throw new Error(`프로젝트의 구조화 자료는 총 ${CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}행까지 저장할 수 있습니다. 일부 행만 가져오지는 않습니다.`);
  }
  if (!input.mapping.query && !input.mapping.text && !input.mapping.metric) {
    throw new Error('검색어·원문·지표 중 어떤 열을 분석할지 한 가지 이상 지정해 주세요.');
  }
  const datasetId = crypto.randomUUID(); const importedAt = new Date().toISOString();
  const rows = table.rows.map((cells, index) => {
    const rawRecord: Record<string, string> = {};
    table.headers.forEach((header, column) => { rawRecord[header] = cells[column] ?? ''; });
    cells.slice(table.headers.length).forEach((value, extra) => { rawRecord[`미지정 열 ${extra + 1}`] = value; });
    const query = getCell(rawRecord, input.mapping, 'query').trim() || null;
    const text = getCell(rawRecord, input.mapping, 'text').trim() || null;
    const rowMetric = getCell(rawRecord, input.mapping, 'metric').trim();
    const rawValue = getCell(rawRecord, input.mapping, 'value'); const parsedValue = parseNumber(rawValue);
    const hasMappedData = !!(query || text || rowMetric || rawValue.trim());
    const state = !hasMappedData ? 'rejected' : parsedValue === 'invalid' ? 'needs_review' : 'accepted';
    const reason = !hasMappedData ? '검색어·원문·지표 중 연결된 값을 찾지 못했습니다.' : parsedValue === 'invalid' ? '수치 형식을 확인해야 합니다. 원본 값은 보존했습니다.' : null;
    return {
      schemaVersion: 1 as const, id: crypto.randomUUID(), projectId: project.id, datasetId, sourceRow: table.sourceRows?.[index] ?? index + 2,
      rawRecord, importStatus: state, reason, query, text, metric: rowMetric || input.metric || null,
      value: parsedValue === 'invalid' ? null : parsedValue, unit: getCell(rawRecord, input.mapping, 'unit').trim() || input.unit || null,
      basis: basisFromCell(getCell(rawRecord, input.mapping, 'estimate'), input.basis),
      period: getCell(rawRecord, input.mapping, 'period').trim() || null,
      market: getCell(rawRecord, input.mapping, 'market').trim() || input.market,
      relationType: getCell(rawRecord, input.mapping, 'relationType').trim() || null,
      relatedQuery: getCell(rawRecord, input.mapping, 'relatedQuery').trim() || null,
      sampleScope: getCell(rawRecord, input.mapping, 'sampleScope').trim() || input.sampleScope || null,
      observedAt: getCell(rawRecord, input.mapping, 'period').trim() || null,
    } satisfies ConsumerObservation;
  }).filter(observation => Object.values(observation.rawRecord).some(value => value !== ''));
  if (rows.length > CONSUMER_DATA_LIMITS.projectRows) throw new Error(`행이 ${CONSUMER_DATA_LIMITS.projectRows.toLocaleString()}개를 넘습니다. 일부 행만 가져오지는 않습니다.`);
  const dataset: ConsumerDataset = {
    schemaVersion: 1, id: datasetId, projectId: project.id, fileName: input.fileName, format: table.format,
    fileHash: table.fileHash, dataType: input.dataType, provider: input.provider, market: input.market,
    periodStart: input.periodStart, periodEnd: input.periodEnd, metric: input.metric, unit: input.unit,
    basis: input.basis, sampleScope: input.sampleScope, mapping: input.mapping, mappingVersion,
    headers: table.headers, rowCount: rows.length,
    acceptedRows: rows.filter(row => row.importStatus === 'accepted').length,
    reviewRows: rows.filter(row => row.importStatus === 'needs_review').length,
    rejectedRows: rows.filter(row => row.importStatus === 'rejected').length,
    externalAiAllowed: input.externalAiAllowed, publicationAllowed: input.publicationAllowed,
    warnings: [...table.warnings, ...(project.consumerDatasets.some(item => item.fileHash === table.fileHash)
      ? ['같은 원본 파일의 다른 가져오기 설정입니다. 서로 독립된 표본으로 합산하지 마세요.'] : [])], importedAt,
  };
  const history = project.questions.length || project.comparisons.length || project.recommendations.length
    ? [...project.analysisHistory, { inputRevision: project.inputRevision, evidenceRevision: project.evidenceRevision,
      at: importedAt, questions: project.questions, comparisons: project.comparisons,
      recommendations: project.recommendations, answerPlans: project.answerPlans, researchInsights: project.researchInsights }]
    : project.analysisHistory;
  return {
    ...project, consumerDatasets: [...project.consumerDatasets, dataset], consumerObservations: [...project.consumerObservations, ...rows],
    analysisHistory: history, evidenceRevision: project.evidenceRevision + 1, manualResearchRequestId: null,
    manualResearchInputHash: null, manualContentRequestId: null, documents: markDocumentsStale(project.documents),
  };
}

const promptLimit = 45_000;
export function externalDatasetContext(project: Project): string {
  const authorized = project.consumerDatasets.filter(dataset => dataset.externalAiAllowed);
  const withheld = project.consumerDatasets.length - authorized.length;
  const sections = authorized.map(dataset => {
    const rows = project.consumerObservations.filter(row => row.datasetId === dataset.id);
    return [
      `자료명=${dataset.fileName}; 유형=${dataset.dataType}; 제공자=${dataset.provider || '미상'}; 시장=${dataset.market}; 기간=${dataset.periodStart || '미상'}~${dataset.periodEnd || '미상'}; 지표=${dataset.metric || '미상'}; 단위=${dataset.unit || '미상'}; 값 성격=${dataset.basis}; 표본 범위=${dataset.sampleScope || '미기재'}`,
      `원본 파일 해시=${dataset.fileHash}; 열 매핑 버전=${dataset.mappingVersion || '이전 버전'}. 같은 원본 해시를 가진 데이터셋은 독립된 표본으로 합산하지 마세요.`,
      dataset.dataType === 'search_metrics' ? '실제 입력 문구가 아니라 검색 도구의 키워드입니다. AI 프롬프트 빈도나 전체 소비자 수요로 해석하지 마세요.' : '',
      `행 수=${dataset.rowCount}; 수용=${dataset.acceptedRows}; 검토 필요=${dataset.reviewRows}; 제외=${dataset.rejectedRows}`,
      ...rows.filter(row => row.importStatus === 'accepted').map(row => JSON.stringify({ rowId: row.id, row: row.sourceRow, state: row.importStatus, query: row.query,
        text: row.text, metric: row.metric, value: row.value, unit: row.unit, basis: row.basis, period: row.period,
        market: row.market, relationType: row.relationType, relatedQuery: row.relatedQuery,
        sampleScope: row.sampleScope, raw: row.rawRecord })),
    ].join('\n');
  });
  if (withheld) sections.push(`외부 AI에 전달하지 않은 비공개 데이터셋 ${withheld}개가 있습니다. 이름·내용·행은 제공하지 않았습니다.`);
  const text = sections.join('\n\n');
  if (text.length > promptLimit) throw new Error(`외부 AI에 전달하도록 선택한 소비자 자료가 ${promptLimit.toLocaleString()}자를 넘습니다. 기간이나 분석 대상을 나누어 새 자료로 가져와 주세요. 일부 행을 몰래 생략하지 않았습니다.`);
  return text;
}

export function questionEvidenceLabel(project: Project, question: Project['questions'][number]): string {
  if (question.observationIds?.length) {
    const linked = question.observationIds.map(id => project.consumerObservations.find(row => row.id === id)).filter(row => row !== undefined);
    const types = new Set(linked.map(row => project.consumerDatasets.find(dataset => dataset.id === row.datasetId)?.dataType));
    if (types.has('search_metrics')) return `검색 지표 연결 ${linked.length}행 · AI 질문 빈도 아님`;
    if (types.has('search_query')) return `실제 검색어 연결 ${linked.length}행 · 생성형 AI 프롬프트와 구분`;
    return `원본 자료 연결 ${linked.length}행`;
  }
  if (question.provenance === 'observed') return '관찰 표기 · 연결된 원본 자료 없음';
  if (question.provenance === 'reconstructed') return '자료 기반 재구성 · 관찰 원문 연결 전';
  return '조사 가설';
}
