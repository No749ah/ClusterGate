/**
 * Built-in path allowlist templates for well-known (mostly AI) APIs.
 *
 * Paths are relative to the route's public base, so a route
 * /r/openai/* -> https://api.openai.com with the "OpenAI – inference" template
 * exposes /r/openai/v1/chat/completions but not /r/openai/v1/files.
 * Management endpoints that can change or delete data on the upstream (e.g.
 * Ollama's /api/pull or /api/delete) are deliberately left out of the
 * inference templates.
 */

export interface BuiltinPathTemplate {
  id: string
  name: string
  description: string
  category: 'AI' | 'Automation' | 'Ops'
  paths: string[]
}

export const BUILTIN_PATH_TEMPLATES: BuiltinPathTemplate[] = [
  {
    id: 'builtin:openai-inference',
    name: 'OpenAI – inference',
    description: 'Chat, Responses, embeddings and model list. No files, fine-tuning or batches.',
    category: 'AI',
    paths: ['/v1/chat/completions', '/v1/responses', '/v1/responses/*', '/v1/embeddings', '/v1/models/*'],
  },
  {
    id: 'builtin:openai-full',
    name: 'OpenAI – full API',
    description: 'All public OpenAI API v1 endpoint groups.',
    category: 'AI',
    paths: [
      '/v1/chat/completions/*',
      '/v1/completions',
      '/v1/responses/*',
      '/v1/conversations/*',
      '/v1/embeddings',
      '/v1/models/*',
      '/v1/moderations',
      '/v1/audio/*',
      '/v1/images/*',
      '/v1/files/*',
      '/v1/uploads/*',
      '/v1/batches/*',
      '/v1/fine_tuning/*',
      '/v1/vector_stores/*',
      '/v1/assistants/*',
      '/v1/threads/*',
      '/v1/realtime/*',
    ],
  },
  {
    id: 'builtin:openai-compatible',
    name: 'OpenAI-compatible server',
    description: 'vLLM, LiteLLM, LocalAI, LM Studio, llama.cpp server: completions, embeddings, models, health.',
    category: 'AI',
    paths: ['/v1/chat/completions', '/v1/completions', '/v1/embeddings', '/v1/models/*', '/health'],
  },
  {
    id: 'builtin:anthropic',
    name: 'Anthropic Claude API',
    description: 'Messages (incl. token counting and batches) and model list.',
    category: 'AI',
    paths: ['/v1/messages', '/v1/messages/count_tokens', '/v1/messages/batches/*', '/v1/models/*'],
  },
  {
    id: 'builtin:ollama-inference',
    name: 'Ollama – inference only',
    description: 'Generate, chat, embeddings, model list and the OpenAI-compatible API. No pull/push/delete/create.',
    category: 'AI',
    paths: [
      '/api/generate',
      '/api/chat',
      '/api/embed',
      '/api/embeddings',
      '/api/tags',
      '/api/show',
      '/api/ps',
      '/api/version',
      '/v1/chat/completions',
      '/v1/completions',
      '/v1/embeddings',
      '/v1/models/*',
    ],
  },
  {
    id: 'builtin:gemini',
    name: 'Google Gemini API',
    description: 'generateContent, streamGenerateContent, embedContent and model list (v1 and v1beta).',
    category: 'AI',
    paths: ['/v1beta/models/*', '/v1/models/*'],
  },
  {
    id: 'builtin:mistral',
    name: 'Mistral AI',
    description: 'Chat, FIM, embeddings, moderation, OCR and model list.',
    category: 'AI',
    paths: ['/v1/chat/completions', '/v1/fim/completions', '/v1/embeddings', '/v1/moderations', '/v1/ocr', '/v1/models/*'],
  },
  {
    id: 'builtin:hf-tgi',
    name: 'Hugging Face TGI',
    description: 'Text Generation Inference: generate, stream, OpenAI-compatible chat, info and health.',
    category: 'AI',
    paths: ['/generate', '/generate_stream', '/v1/chat/completions', '/v1/completions', '/v1/models', '/info', '/health'],
  },
  {
    id: 'builtin:hf-tei',
    name: 'Hugging Face TEI',
    description: 'Text Embeddings Inference: embed, rerank, OpenAI-compatible embeddings, info and health.',
    category: 'AI',
    paths: ['/embed', '/rerank', '/v1/embeddings', '/info', '/health'],
  },
  {
    id: 'builtin:n8n-webhooks',
    name: 'n8n – webhooks & forms only',
    description: 'Production webhooks and forms. Keeps the editor UI and REST API private.',
    category: 'Automation',
    paths: ['/webhook/*', '/form/*'],
  },
  {
    id: 'builtin:health',
    name: 'Health endpoints only',
    description: 'Common liveness/readiness paths for monitoring from outside.',
    category: 'Ops',
    paths: ['/health', '/healthz', '/readyz', '/livez'],
  },
]
