/*
 * One call to Claude (the Messages API, over fetch: no SDK needed) that answers through a single
 * tool, so the menu comes back as JSON in our schema rather than as prose. The tool can't be forced
 * (current models refuse tool_choice "tool"), so the instructions require it and an answer without
 * it is an error that quotes what Claude said instead. The answer is streamed: a long menu can
 * take minutes, longer than a plain request may wait for its headers.
 */

export const DEFAULT_MODEL = 'claude-opus-5-5';
const API = 'https://api.anthropic.com/v1/messages';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

export interface ToolCall {
  apiKey: string;
  model?: string;
  system: string;
  content: ContentBlock[];
  tool: { name: string; description: string; input_schema: object };
  maxTokens?: number;
  fetch?: Fetch;
  /** Waits between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ToolResult<T> {
  input: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class ClaudeError extends Error {}

/** Calls Claude and returns what it passed to the tool. Retries twice when the API is busy. */
export async function callTool<T>({ apiKey, model = DEFAULT_MODEL, system, content, tool, maxTokens = 32_000, fetch: send = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: ToolCall): Promise<ToolResult<T>> {
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    stream: true,
    system,
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });

  for (let attempt = 0; ; attempt++) {
    const res = await send(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body,
    });
    if (res.ok && res.body) return readStream<T>(res.body, model);

    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? res.statusText;
    // Busy or briefly down: worth another try. Anything else (a wrong key, a bad request) is not.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    throw new ClaudeError(`Claude answered ${res.status}: ${detail}`);
  }
}

interface StreamEvent {
  type: string;
  message?: { model?: string; usage?: { input_tokens?: number } };
  content_block?: { type: string };
  delta?: { type?: string; partial_json?: string; text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}

/** Reads the server-sent events and puts the tool's JSON back together. */
async function readStream<T>(stream: ReadableStream<Uint8Array>, requested: string): Promise<ToolResult<T>> {
  let json = '';
  let said = '';
  let model = requested;
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | undefined;
  let buffer = '';

  const handle = (event: StreamEvent) => {
    if (event.type === 'message_start') {
      model = event.message?.model ?? model;
      inputTokens = event.message?.usage?.input_tokens ?? 0;
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
      json += event.delta.partial_json ?? '';
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      said += event.delta.text ?? '';
    } else if (event.type === 'message_delta') {
      stopReason = event.delta?.stop_reason ?? stopReason;
      outputTokens = event.usage?.output_tokens ?? outputTokens;
    } else if (event.type === 'error') {
      throw new ClaudeError(`Claude stopped with an error: ${event.error?.message ?? 'unknown'}`);
    }
  };

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (data) handle(JSON.parse(data) as StreamEvent);
    }
    if (done) break;
  }

  if (stopReason === 'max_tokens') throw new ClaudeError('The menu is too long for one reading. Split the photos or pages into two runs.');
  if (!json) {
    const reply = said.trim().replace(/\s+/g, ' ').slice(0, 400);
    throw new ClaudeError(`Claude returned no menu${reply ? `, only this: "${reply}"` : ` (stop reason: ${stopReason ?? 'none'})`}`);
  }
  try {
    return { input: JSON.parse(json) as T, model, usage: { inputTokens, outputTokens } };
  } catch {
    throw new ClaudeError("Claude's answer wasn't complete JSON. Run it again.");
  }
}
