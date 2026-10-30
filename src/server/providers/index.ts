import OpenAI from 'openai';
import { z } from 'zod';

export type ProviderResult = {
  requestId: string; text: string; inputTokens: number | null; outputTokens: number | null;
  citations: { title: string; url: string; start: number; end: number }[];
};

export interface ProviderAdapter {
  research(prompt: string): Promise<ProviderResult>;
  generateStructured(prompt: string, kind: 'research' | 'content'): Promise<ProviderResult>;
  validateClaims(prompt: string): Promise<ProviderResult>;
}

export class ProviderFailure extends Error {
  constructor(public reason: 'refused' | 'incomplete' | 'empty' | 'unavailable', message: string) { super(message); }
}

const annotation = z.object({ title: z.string(), url: z.string(), start: z.number(), end: z.number() });
export function inspectResponse(response: {
  id: string; status?: string; output_text: string; usage?: { input_tokens: number; output_tokens: number } | null;
  output?: { type: string; content?: { type: string; annotations?: unknown[] }[] }[];
}): ProviderResult {
  if (response.status !== 'completed') throw new ProviderFailure('incomplete', 'AI 응답이 끝나지 않았어요. 사용량을 확인한 뒤 다시 시도해 주세요.');
  if (response.output?.some(item => item.content?.some(c => c.type === 'refusal'))) throw new ProviderFailure('refused', 'AI가 이 요청을 처리하지 못했어요. 자료를 확인해 주세요.');
  if (!response.output_text.trim()) throw new ProviderFailure('empty', 'AI가 빈 응답을 보냈어요.');
  const citations = response.output?.flatMap(item => item.content?.flatMap(content =>
    (content.annotations || []).flatMap(raw => {
      const parsed = annotation.safeParse({ ...(raw as object),
        start: (raw as { start_index?: number }).start_index,
        end: (raw as { end_index?: number }).end_index });
      return parsed.success ? [parsed.data] : [];
    })) || []) || [];
  return { requestId: response.id, text: response.output_text,
    inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null,
    citations };
}

export class OpenAIProvider implements ProviderAdapter {
  private client: OpenAI;
  constructor(key: string) { this.client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 60000 }); }

  async research(prompt: string) {
    const model = process.env.OPENAI_RESEARCH_MODEL;
    if (!model) throw new ProviderFailure('unavailable', '조사 모델이 설정되지 않았어요.');
    const result = await this.client.responses.create({ model, input: prompt,
      tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'],
      max_output_tokens: 3500, store: false });
    return inspectResponse(result);
  }

  async generateStructured(prompt: string, kind: 'research' | 'content') {
    const model = process.env.OPENAI_WRITE_MODEL;
    if (!model) throw new ProviderFailure('unavailable', '작성 모델이 설정되지 않았어요.');
    const schema = kind === 'research' ? {
      type: 'object', properties: { contract: { type: 'string' }, requestId: { type: 'string' }, entity: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
        sources: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, title: { type: 'string' }, url: { type: ['string', 'null'] }, excerpt: { type: 'string' }, sourceType: { type: 'string' } }, required: ['ref','title','url','excerpt','sourceType'], additionalProperties: false } },
        claims: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, statement: { type: 'string' }, sourceRef: { type: ['string','null'] }, quote: { type: 'string' }, conditions: { type: 'string' }, subject: { type: 'string' } }, required: ['ref','statement','sourceRef','quote','conditions','subject'], additionalProperties: false } },
        questions: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' }, provenance: { type: 'string' }, sourceRefs: { type: 'array', items: { type: 'string' } } }, required: ['ref','text','provenance','sourceRefs'], additionalProperties: false } },
        comparisons: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, competitor: { type: 'string' }, criterion: { type: 'string' }, ownClaimRefs: { type: 'array', items: { type: 'string' } }, otherClaimRefs: { type: 'array', items: { type: 'string' } }, comparable: { type: 'boolean' }, verdict: { type: 'string' }, reason: { type: 'string' } }, required: ['ref','competitor','criterion','ownClaimRefs','otherClaimRefs','comparable','verdict','reason'], additionalProperties: false } },
        recommendations: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, situation: { type: 'string' }, reason: { type: 'string' }, claimRefs: { type: 'array', items: { type: 'string' } }, comparisonRefs: { type: 'array', items: { type: 'string' } }, limitation: { type: 'string' } }, required: ['ref','situation','reason','claimRefs','comparisonRefs','limitation'], additionalProperties: false } },
        missingEvidence: { type: 'array', items: { type: 'string' } },
      }, required: ['contract','requestId','entity','sources','claims','questions','comparisons','recommendations','missingEvidence'], additionalProperties: false,
    } : {
      type: 'object', properties: { contract: { type: 'string' }, requestId: { type: 'string' },
        documents: { type: 'array', items: { type: 'object', properties: { channel: { type: 'string' }, blocks: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, text: { type: 'string' }, claimRefs: { type: 'array', items: { type: 'string' } } }, required: ['kind','text','claimRefs'], additionalProperties: false } } }, required: ['channel','blocks'], additionalProperties: false } },
        unresolvedItems: { type: 'array', items: { type: 'string' } },
      }, required: ['contract','requestId','documents','unresolvedItems'], additionalProperties: false,
    };
    const result = await this.client.responses.create({ model, input: prompt, max_output_tokens: 3500,
      text: { format: { type: 'json_schema', name: `alc_${kind}_v1`, strict: true, schema } }, store: false });
    return inspectResponse(result);
  }

  async validateClaims(prompt: string) {
    const model = process.env.OPENAI_VALIDATE_MODEL || process.env.OPENAI_WRITE_MODEL;
    if (!model) throw new ProviderFailure('unavailable', '검증 모델이 설정되지 않았어요.');
    const result = await this.client.responses.create({ model, input: prompt, max_output_tokens: 1600,
      text: { format: { type: 'json_schema', name: 'alc_validation_v1', strict: true,
        schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'object',
          properties: { claimRef: { type: 'string' }, status: { type: 'string' }, reason: { type: 'string' }, quote: { type: 'string' } },
          required: ['claimRef', 'status', 'reason', 'quote'], additionalProperties: false } } },
          required: ['findings'], additionalProperties: false } } }, store: false });
    return inspectResponse(result);
  }
}

export class MockProvider implements ProviderAdapter {
  constructor(private responses: { research: ProviderResult; structured: ProviderResult }) {}
  async research() { return this.responses.research; }
  async generateStructured() { return this.responses.structured; }
  async validateClaims() { return this.responses.structured; }
}
