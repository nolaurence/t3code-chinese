import { describe, expect, it, vi } from "@effect/vitest";

import type { ProviderConfig } from "@github/copilot-sdk";

import { fetchCopilotProviderModels, resolveCopilotSessionProvider } from "./copilotRuntime.ts";

describe("resolveCopilotSessionProvider", () => {
  it("returns undefined without a base URL so sessions use GitHub Copilot auth", () => {
    expect(
      resolveCopilotSessionProvider({
        baseUrl: "  ",
        providerType: "openai",
        apiKey: "sk-test",
        wireApi: "responses",
        azureApiVersion: "",
      }),
    ).toBeUndefined();
  });

  describe("fetchCopilotProviderModels", () => {
    it("loads OpenAI-compatible models with configured capabilities", async () => {
      const provider: ProviderConfig = {
        baseUrl: "https://gateway.example.com/v1",
        apiKey: "sk-test",
      };
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: "gpt-custom", name: "GPT Custom", context_window: 64_000 },
                { id: "gpt-basic" },
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      const models = await fetchCopilotProviderModels(
        provider,
        {
          "gpt-custom": {
            contextWindowTokens: 262_144,
            reasoningEfforts: ["low", "high"],
            defaultReasoningEffort: "high",
          },
        },
        fetchImpl,
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        new URL("https://gateway.example.com/v1/models"),
        expect.objectContaining({
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        }),
      );
      const headers = fetchImpl.mock.calls[0]?.[1]?.headers;
      expect(headers).toBeInstanceOf(Headers);
      expect((headers as Headers).get("Authorization")).toBe("Bearer sk-test");
      expect(models).toEqual([
        {
          id: "gpt-custom",
          name: "GPT Custom",
          capabilities: {
            supports: { vision: false, reasoningEffort: true },
            limits: { max_context_window_tokens: 262_144 },
          },
          supportedReasoningEfforts: ["low", "high"],
          defaultReasoningEffort: "high",
        },
        {
          id: "gpt-basic",
          name: "gpt-basic",
          capabilities: {
            supports: { vision: false, reasoningEffort: false },
            limits: { max_context_window_tokens: 128_000 },
          },
        },
      ]);
    });

    it("uses Azure model-list authentication and API version", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
      );
      await fetchCopilotProviderModels(
        {
          type: "azure",
          baseUrl: "https://azure.example.com/openai/v1",
          apiKey: "azure-key",
          azure: { apiVersion: "2024-10-21" },
        },
        {},
        fetchImpl,
      );
      const [url, init] = fetchImpl.mock.calls[0]!;
      expect(String(url)).toBe("https://azure.example.com/openai/v1/models?api-version=2024-10-21");
      const headers = new Headers(init?.headers);
      expect(headers.get("api-key")).toBe("azure-key");
      expect(headers.has("Authorization")).toBe(false);
    });

    it("rejects malformed model-list responses", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 })),
      );
      await expect(
        fetchCopilotProviderModels({ baseUrl: "https://gateway.example.com/v1" }, {}, fetchImpl),
      ).rejects.toThrow("data array");
    });
  });

  it("builds an OpenAI-compatible provider with the t3code user agent", () => {
    expect(
      resolveCopilotSessionProvider({
        baseUrl: "https://gateway.example.com/v1",
        providerType: "",
        apiKey: "sk-test",
        wireApi: "responses",
        azureApiVersion: "",
      }),
    ).toEqual({
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "sk-test",
      wireApi: "responses",
      headers: { "User-Agent": "t3code" },
    });
  });

  it("omits wireApi for anthropic providers", () => {
    expect(
      resolveCopilotSessionProvider({
        baseUrl: "https://anthropic.example.com",
        providerType: "anthropic",
        apiKey: "",
        wireApi: "completions",
        azureApiVersion: "",
      }),
    ).toEqual({
      type: "anthropic",
      baseUrl: "https://anthropic.example.com",
    });
  });

  it("passes the API version through for azure providers", () => {
    expect(
      resolveCopilotSessionProvider({
        baseUrl: "https://azure.example.com/openai",
        providerType: "azure",
        apiKey: "sk-azure",
        wireApi: "",
        azureApiVersion: "2024-10-21",
      }),
    ).toEqual({
      type: "azure",
      baseUrl: "https://azure.example.com/openai",
      apiKey: "sk-azure",
      azure: { apiVersion: "2024-10-21" },
    });
  });

  it("ignores unrecognized provider types and wire APIs", () => {
    expect(
      resolveCopilotSessionProvider({
        baseUrl: "https://gateway.example.com/v1",
        providerType: "bogus",
        apiKey: "",
        wireApi: "bogus",
        azureApiVersion: "",
      }),
    ).toEqual({
      baseUrl: "https://gateway.example.com/v1",
      headers: { "User-Agent": "t3code" },
    });
  });
});
