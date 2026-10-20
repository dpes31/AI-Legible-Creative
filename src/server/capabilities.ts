export function capabilities(config: Record<string, string | undefined> = process.env) {
  const cloudStorage = !!(config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const configured = !!(config.OPENAI_API_KEY && config.OPENAI_RESEARCH_MODEL && config.OPENAI_WRITE_MODEL);
  const priceDate = config.OPENAI_PRICE_CONFIRMED_AT ? new Date(config.OPENAI_PRICE_CONFIRMED_AT).valueOf() : NaN;
  const paidExecutionEnabled = configured && cloudStorage && config.PAID_EXECUTION_ENABLED === 'true' &&
    Number(config.APPROVED_TOTAL_USD) > 0 && Number(config.RUN_RESERVE_USD) > 0 &&
    Number.isFinite(priceDate) && Date.now() - priceDate <= 7 * 86400000;
  return {
    generation: configured, webSearch: configured, structuredOutput: configured, sourceFetch: false,
    cloudStorage, paidExecutionEnabled,
    connectionTested: false,
    reasonCode: !cloudStorage ? 'cloud_unconfigured' : !configured ? 'provider_unconfigured' : !paidExecutionEnabled ? 'paid_disabled' : 'configured_unverified',
  };
}
