import "server-only";
import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming, ResponseOutputItem } from "openai/resources/responses/responses";
export type ProviderResult = { status: string | null; output: ResponseOutputItem[]; outputText: string; outputTokens: number };
export interface ChatProvider { create(body: ResponseCreateParamsNonStreaming, signal: AbortSignal): Promise<ProviderResult> }
export function openAIProvider(): ChatProvider {
  // Explicit host, no browser client, automatic retries, provider logging or state storage.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 25000, logLevel: "off" });
  return { async create(body, signal) {
    const response = await client.responses.create(body, { signal });
    return { status: response.status ?? null, output: response.output, outputText: response.output_text, outputTokens: response.usage?.output_tokens ?? 0 };
  } };
}
