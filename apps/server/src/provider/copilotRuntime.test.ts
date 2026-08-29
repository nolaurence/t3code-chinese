import { describe, expect, it, vi } from "@effect/vitest";

import type { ProviderConfig } from "@github/copilot-sdk";
import { makeCopilotLlmModelSlug, ProviderInstanceId } from "@t3tools/contracts";

import {
  discoverCopilotLlmProviderModels,
  fetchCopilotProviderModels,
  makeCopilotRuntime,
  resolveCopilotSessionProvider,
} from "./copilotRuntime.ts";

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

  describe("Copilot model routing", () => {
    const runtime = makeCopilotRuntime({
      instanceId: ProviderInstanceId.make("githubCopilot"),
      stateDir: process.cwd(),
      environment: {},
      platform: "darwin",
      architecture: "arm64",
      modelConfigurations: {
        "github-model": { contextWindowTokens: 64_000 },
      },
      llmProviders: [
        {
          id: "work-openai",
          name: "Work OpenAI",
          type: "openai",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "sk-test",
          wireApi: "responses",
          azureApiVersion: "",
          models: [
            {
              id: "gpt-custom",
              displayName: "Custom GPT",
              contextWindowTokens: 262_144,
              reasoningEfforts: ["low", "high"],
            },
          ],
        },
      ],
    });

    it("leaves official GitHub Copilot models unscoped", () => {
      expect(runtime.resolveModel("github-model")).toEqual({
        selectionModel: "github-model",
        sdkModel: "github-model",
        provider: undefined,
        providerId: undefined,
        configuration: { contextWindowTokens: 64_000 },
      });
    });

    it("routes a scoped model to its configured LLM provider", () => {
      const selectionModel = makeCopilotLlmModelSlug("work-openai", "gpt-custom");
      expect(runtime.resolveModel(selectionModel)).toEqual({
        selectionModel,
        sdkModel: "gpt-custom",
        providerId: "work-openai",
        provider: {
          type: "openai",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "sk-test",
          wireApi: "responses",
          headers: { "User-Agent": "t3code" },
        },
        configuration: {
          id: "gpt-custom",
          displayName: "Custom GPT",
          contextWindowTokens: 262_144,
          reasoningEfforts: ["low", "high"],
        },
      });
    });

    it("rejects stale provider and model selections", () => {
      expect(() =>
        runtime.resolveModel(makeCopilotLlmModelSlug("removed-provider", "gpt-custom")),
      ).toThrow("no longer configured");
      expect(() =>
        runtime.resolveModel(makeCopilotLlmModelSlug("work-openai", "removed-model")),
      ).toThrow("no longer configured");
    });
  });

  describe("fetchCopilotProviderModels", () => {
    it("converts discovered models into editable provider settings", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "custom-reasoner",
                  display_name: "Custom Reasoner",
                  context_window: 200_000,
                  supported_reasoning_efforts: ["low", "high"],
                  default_reasoning_effort: "high",
                },
                { id: "plain-model" },
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      const models = await discoverCopilotLlmProviderModels(
        {
          type: "openai",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "sk-test",
          azureApiVersion: "",
        },
        fetchImpl,
      );

      expect(models).toEqual([
        {
          id: "custom-reasoner",
          displayName: "Custom Reasoner",
          contextWindowTokens: 200_000,
          reasoningEfforts: ["low", "high"],
          defaultReasoningEffort: "high",
        },
        {
          id: "plain-model",
          contextWindowTokens: 128_000,
        },
      ]);
    });

    it("rejects model discovery URLs outside HTTP and HTTPS", async () => {
      const fetchImpl = vi.fn();

      await expect(
        discoverCopilotLlmProviderModels(
          {
            type: "openai",
            baseUrl: "file:///tmp/models",
            apiKey: "",
            azureApiVersion: "",
          },
          fetchImpl,
        ),
      ).rejects.toThrow("Model provider URL must use HTTP or HTTPS.");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

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
        Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 })),
      );
      await expect(
        fetchCopilotProviderModels({ baseUrl: "https://gateway.example.com/v1" }, {}, fetchImpl),
      ).rejects.toThrow("data/models array");
    });

    it("accepts common model-list shapes and nested capability metadata", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              models: [
                {
                  id: "nested-model",
                  displayName: "Nested Model",
                  capabilities: {
                    limits: { maxContextWindowTokens: "200000" },
                    supports: { reasoningEffort: ["low", "high"] },
                  },
                },
                "string-model",
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      const models = await fetchCopilotProviderModels(
        { baseUrl: "https://gateway.example.com/v1" },
        {},
        fetchImpl,
      );

      expect(models).toEqual([
        {
          id: "nested-model",
          name: "Nested Model",
          capabilities: {
            supports: { vision: false, reasoningEffort: true },
            limits: { max_context_window_tokens: 200_000 },
          },
          supportedReasoningEfforts: ["low", "high"],
        },
        {
          id: "string-model",
          name: "string-model",
          capabilities: {
            supports: { vision: false, reasoningEffort: false },
            limits: { max_context_window_tokens: 128_000 },
          },
        },
      ]);
    });

    it("uses reasoning efforts reported by the provider", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "custom-reasoner",
                  supported_reasoning_efforts: ["low", "high", "bogus"],
                  default_reasoning_effort: "high",
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      const models = await fetchCopilotProviderModels(
        { baseUrl: "https://gateway.example.com/v1" },
        {},
        fetchImpl,
      );

      expect(models[0]).toMatchObject({
        id: "custom-reasoner",
        supportedReasoningEfforts: ["low", "high"],
        defaultReasoningEffort: "high",
        capabilities: { supports: { reasoningEffort: true } },
      });
    });

    it("falls back to known reasoning efforts when the provider reports none", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: "gpt-5.5" }, { id: "unknown-model" }],
            }),
            { status: 200 },
          ),
        ),
      );

      const models = await fetchCopilotProviderModels(
        { baseUrl: "https://gateway.example.com/v1" },
        {},
        fetchImpl,
      );

      expect(models[0]).toMatchObject({
        id: "gpt-5.5",
        supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
        capabilities: { supports: { reasoningEffort: true } },
      });
      expect(models[1]).toMatchObject({
        id: "unknown-model",
        capabilities: { supports: { reasoningEffort: false } },
      });
      expect(models[1]).not.toHaveProperty("supportedReasoningEfforts");
    });

    it("lets manual configuration override provider and known efforts", async () => {
      const fetchImpl = vi.fn((_input: URL, _init?: RequestInit) =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 }),
        ),
      );

      const models = await fetchCopilotProviderModels(
        { baseUrl: "https://gateway.example.com/v1" },
        { "gpt-5.5": { reasoningEfforts: ["low"], defaultReasoningEffort: "low" } },
        fetchImpl,
      );

      expect(models[0]).toMatchObject({
        id: "gpt-5.5",
        supportedReasoningEfforts: ["low"],
        defaultReasoningEffort: "low",
      });
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
});
