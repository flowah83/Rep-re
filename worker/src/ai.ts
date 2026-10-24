import { TOOLS, buildSystemPrompt, sanitizeMessages } from "../../lib/coach";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_CHAIN = ["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-flash-lite-latest"];
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const RATE_LIMIT_MESSAGE = "Le coach souffle un peu, réessayez dans une minute.";

export type AiEnv = {
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_MODEL_FALLBACKS?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

export type AiCall = {
  provider: "gemini" | "openai";
  url: string;
  headers: Record<string, string>;
  body: string;
};

export function providerName(value: string | undefined): "gemini" | "openai" {
  return value?.trim().toLowerCase() === "openai" ? "openai" : "gemini";
}

export function modelName(env: AiEnv): string {
  const chosen = env.AI_MODEL?.trim();
  if (chosen) return chosen;
  return providerName(env.AI_PROVIDER) === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL;
}

/** Modèles Gemini à essayer, dans l’ordre. `AI_MODEL_FALLBACKS` remplace la chaîne par défaut. */
export function modelChain(env: AiEnv): string[] {
  const configured = splitModels(env.AI_MODEL_FALLBACKS);
  if (configured.length) return configured;
  const primary = env.AI_MODEL?.trim();
  if (!primary || primary === DEFAULT_GEMINI_CHAIN[0]) return [...DEFAULT_GEMINI_CHAIN];
  return dedupe([primary, ...DEFAULT_GEMINI_CHAIN]);
}

export function shouldTryNextModel(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

/** Un flux peut essayer le modèle suivant : saturation, panne, ou silence. */
export function retryableStreamStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function splitModels(value: string | undefined): string[] {
  if (!value) return [];
  return dedupe(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function dedupe(models: string[]): string[] {
  return [...new Set(models)];
}

export function buildAiCall(env: AiEnv, context: unknown, messages: unknown): AiCall | { error: string; status: number } {
  const provider = providerName(env.AI_PROVIDER);
  const model = modelName(env);
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) return { error: "Le coach n’est pas encore activé.", status: 503 };
    return {
      provider,
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [{ role: "system", content: buildSystemPrompt(context) }, ...sanitizeMessages(messages)],
        tools: TOOLS,
        tool_choice: "auto",
      }),
    };
  }
  if (!env.GEMINI_API_KEY) return { error: "Le coach n’est pas encore activé.", status: 503 };
  return {
    provider,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] },
      contents: geminiContents(sanitizeMessages(messages)),
      tools: [{ functionDeclarations: geminiTools() }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.3 },
    }),
  };
}

export function coachFailure(status: number, exhausted = false): { error: string; status: number } {
  if (status === 429 || exhausted) return { error: RATE_LIMIT_MESSAGE, status: 429 };
  return { error: "Le coach n’a pas pu répondre. Réessayez dans un moment.", status: 502 };
}

export type StreamFold = { text: string; calls: { id: string; name: string; arguments: string; thoughtSignature?: string }[] };

/** Ajoute un morceau Gemini (texte ou appel d’outil) au message en cours. */
export function foldGeminiChunk(state: StreamFold, data: unknown): StreamFold {
  const parts = (data as { candidates?: { content?: { parts?: GeminiPart[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  let text = state.text;
  const calls = [...state.calls];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall?.name) {
      calls.push({
        id: `call_${calls.length + 1}`,
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args ?? {}),
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
      });
    }
  }
  return { text, calls };
}

export function streamUrl(call: AiCall): string {
  if (call.provider !== "gemini") return call.url;
  return call.url.replace(":generateContent", ":streamGenerateContent?alt=sse");
}

/** Relit un corps Gemini qui n’est pas du SSE (JSON unique ou tableau de morceaux). */
export function messageFromGeminiBody(raw: string): { role: "assistant"; content: string; tool_calls: StreamFold["calls"] } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (Array.isArray(data)) {
      let state: StreamFold = { text: "", calls: [] };
      for (const item of data) state = foldGeminiChunk(state, item);
      if (!state.text && state.calls.length === 0) return null;
      return { role: "assistant", content: state.text, tool_calls: state.calls };
    }
    if (!data || typeof data !== "object" || "error" in data) return null;
    return readAiMessage("gemini", data);
  } catch {
    return null;
  }
}

export function readAiMessage(provider: "gemini" | "openai", data: unknown): { role: "assistant"; content: string; tool_calls: { id: string; name: string; arguments: string; thoughtSignature?: string }[] } {
  if (provider === "openai") return readOpenAi(data);
  return readGemini(data);
}

function readOpenAi(data: unknown) {
  const message = (data as { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] })?.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? [])
    .map((item) => ({
      id: item.id || "",
      name: item.function?.name || "",
      arguments: item.function?.arguments || "{}",
    }))
    .filter((item) => item.id && item.name);
  return { role: "assistant" as const, content: message?.content ?? "", tool_calls: toolCalls };
}

function readGemini(data: unknown) {
  const parts = (data as { candidates?: { content?: { parts?: GeminiPart[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text || "").filter(Boolean).join("\n");
  const toolCalls = parts
    .filter((part) => part.functionCall?.name)
    .map((part, index) => ({
      id: `call_${index + 1}`,
      name: part.functionCall?.name || "",
      arguments: JSON.stringify(part.functionCall?.args ?? {}),
      ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
    }));
  return { role: "assistant" as const, content: text, tool_calls: toolCalls };
}

type GeminiPart = { text?: string; functionCall?: { name?: string; args?: unknown }; thoughtSignature?: string };

function geminiTools() {
  return TOOLS.map((item) => ({
    name: item.function.name,
    description: item.function.description,
    parameters: stripSchema(item.function.parameters),
  }));
}

function geminiContents(messages: Record<string, unknown>[]) {
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  const names = new Map<string, string>();
  for (const message of messages) {
    const role = message.role;
    const content = typeof message.content === "string" ? message.content : "";
    if (role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (content) parts.push({ text: content });
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const item of calls) {
        if (!item || typeof item !== "object") continue;
        const call = item as { id?: string; thoughtSignature?: string; function?: { name?: string; arguments?: string } };
        const name = call.function?.name || "";
        if (!name) continue;
        if (call.id) names.set(call.id, name);
        const part: Record<string, unknown> = { functionCall: { name, args: parseArgs(call.function?.arguments) } };
        if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
        parts.push(part);
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    if (role === "tool") {
      const id = typeof message.tool_call_id === "string" ? message.tool_call_id : "";
      const part = { functionResponse: { name: names.get(id) || "outil", response: { result: content } } };
      const last = contents.at(-1);
      if (last && last.role === "user" && last.parts.some((entry) => "functionResponse" in entry)) last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
      continue;
    }
    if (role === "user" && content) contents.push({ role: "user", parts: [{ text: content }] });
  }
  return contents;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stripSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSchema);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "additionalProperties") continue;
    next[key] = stripSchema(child);
  }
  return next;
}
