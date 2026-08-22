function tokenValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function getCachedTokens(tokens) {
  return tokenValue(tokens?.cached_tokens || tokens?.cache_read_input_tokens || tokens?.prompt_tokens_details?.cached_tokens);
}

export function getCacheCreationTokens(tokens) {
  return tokenValue(tokens?.cache_creation_input_tokens || tokens?.prompt_tokens_details?.cache_creation_tokens || tokens?.prompt_tokens_details?.cache_write_tokens);
}

export function getPromptTokens(tokens) {
  const promptTokens = tokenValue(tokens?.prompt_tokens || tokens?.input_tokens);
  return Math.max(promptTokens, getCachedTokens(tokens) + getCacheCreationTokens(tokens));
}
