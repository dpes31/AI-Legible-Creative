export function capabilities(config: Record<string, string | undefined> = process.env) {
  const cloudStorage = !!(config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const configured = !!(config.OPENAI_API_KEY && config.OPENAI_RESEARCH_MODEL && config.OPENAI_WRITE_MODEL);
  const paidExecutionEnabled = false; // The server's incomplete paid pipeline is also blocked in executionConfig.
  return {
    generation: configured, webSearch: configured, structuredOutput: configured, sourceFetch: false,
    cloudStorage, paidExecutionEnabled,
    connectionTested: false,
    reasonCode: !cloudStorage ? 'cloud_unconfigured' : !configured ? 'provider_unconfigured' : 'pipeline_review_pending',
  };
}
