import { type Project } from '@/domain/schema';
import { buildStrategy, comparisonAssessment } from '@/domain/analysis/strategy';
import styles from './Review.module.css';

export function AnalysisSummary({ project }: { project: Project }) {
  const strategy = buildStrategy(project);
  return <section className={styles.summary} aria-labelledby="analysis-summary">
    <div className={styles.summaryTitle}><h2 id="analysis-summary">이번 문구의 방향</h2><span className="badge">{strategy.objective}</span></div>
    <div className={styles.overview}>
      <div className={styles.focus}><span className="eyebrow">먼저 전할 이야기</span><p>{strategy.focus}</p>
        <span className="small muted">{strategy.eligible.length ? `공개 사용을 확인한 자사 사실 ${strategy.eligible.length}개` : '자료 보완용 구성안으로 시작할 수 있습니다.'}</span></div>
      <div className={styles.audience}><span className="small muted">누구에게 필요한가</span><h3>{strategy.audience}</h3><span className="badge warn">{strategy.audienceLabel}</span></div>
    </div>
    <div className={styles.summaryRows}>
      <div><h3>이번에 답할 질문</h3>{project.questions.length ? <ul>{project.questions.slice(0, 12).map(q => <li key={q.id}>
        {q.text} <span className="small muted">{q.provenance === 'observed' ? '관찰한 질문' : q.provenance === 'reconstructed' ? '자료에서 재구성' : '조사할 가설'}
          {q.situation ? ` · ${q.situation}` : ''}</span></li>)}</ul> : <p className="muted">질문 자료가 없습니다. 이번 목적에 맞는 고객 질문을 조사해 주세요.</p>}</div>
      <div><h3>아직 해결되지 않은 요구</h3>{project.researchInsights.unmetNeeds.length ? <ul>{project.researchInsights.unmetNeeds.map((item, index) =>
        <li key={`${item.situation}-${index}`}>{item.situation}: {item.need} <span className="small muted">{item.provenance === 'observed' ? '관찰' : '추가 확인 필요'}</span></li>)}</ul>
        : <p className="muted">경쟁 제품 이용자의 불편이나 미충족 요구는 아직 확인하지 않았습니다. 추측을 실제 고객 의견처럼 쓰지 않습니다.</p>}</div>
      <div><h3>선택할 이유</h3><div>{strategy.candidates.length ? strategy.candidates.map(r => <p key={r.candidate.id}><span className={r.usable ? 'badge' : 'badge warn'}>{r.label}</span> {r.candidate.reason}<br /><span className="small muted">{r.usable ? r.candidate.limitation || '적합한 조건을 확인해 주세요.' : r.reason}</span></p>) : <p className="muted">원문을 확인하면 고객에게 의미 있는 특징부터 정리합니다.</p>}</div></div>
      <div><h3>세부 기능과 근거</h3>{strategy.eligible.length ? <ul>{strategy.eligible.map(claim => <li key={claim.id}>
        <strong>{claim.statement}</strong>{claim.conditions && <span className="small"> · 적용 조건: {claim.conditions}</span>}
        <span className="small muted"> · {project.sources.find(s => s.id === claim.sourceId)?.title || '출처 확인 필요'}</span>
      </li>)}</ul> : <p className="muted">공개 사용과 원문 대조를 모두 확인한 자사 주장이 없습니다.</p>}</div>
      <div><h3>경쟁 제품과의 차이</h3><div>{project.comparisons.length ? project.comparisons.map(c => {
        const assessment = comparisonAssessment(project, c);
        return <p key={c.id}><strong>{c.competitor}</strong> · {c.criterion} <span className="badge warn">{assessment.label}</span><br /><span className="small muted">{assessment.reason}</span></p>;
      }) : <p className="muted">같은 조건의 비교 자료가 없습니다. 경쟁 제품보다 낫다고 말할 단계는 아닙니다.</p>}</div></div>
      {!!strategy.gaps.length && <div><h3>더 확인할 것</h3><ul>{strategy.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div>}
      <div><h3>채널별 작성 방향</h3><div className={styles.channelPlans}>{strategy.plans.map(plan => <div key={plan.channel}><strong>{plan.label}</strong><p>{plan.purpose}</p><details><summary>구성과 주의할 점</summary><p>{plan.structure}</p><p>{plan.guard}</p></details></div>)}</div></div>
    </div>
  </section>;
}
