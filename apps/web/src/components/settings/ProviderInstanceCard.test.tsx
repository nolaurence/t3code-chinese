import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";

import { I18nProvider } from "../../i18n/I18nProvider";
import {
  deriveProviderModelsForDisplay,
  renameCopilotModelConfiguration,
  retainCopilotModelConfigurations,
} from "./ProviderInstanceCard";
import { ProviderInstanceCard } from "./ProviderInstanceCard";
import { PROVIDER_CLIENT_DEFINITIONS } from "./providerDriverMeta";

const piInstanceId = ProviderInstanceId.make("piAgent");
const piDriver = ProviderDriverKind.make("piAgent");
const piInstance = {
  driver: piDriver,
  displayName: "Pi",
  enabled: true,
  config: { binaryPath: "pi" },
} satisfies ProviderInstanceConfig;

function piProvider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: piInstanceId,
    driver: piDriver,
    enabled: true,
    installed: true,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-07-15T12:00:00.000Z",
    message: "Pi CLI timed out while running `pi --version`.",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

function renderPiProviderCard(input: {
  readonly provider: ServerProvider;
  readonly isRetrying?: boolean;
}): string {
  return renderToStaticMarkup(
    <I18nProvider initialLocale="zh-CN">
      <ProviderInstanceCard
        instanceId={piInstanceId}
        instance={piInstance}
        driverOption={undefined}
        liveProvider={input.provider}
        isExpanded={false}
        onExpandedChange={() => undefined}
        onUpdate={() => undefined}
        hiddenModels={[]}
        favoriteModels={[]}
        modelOrder={[]}
        onHiddenModelsChange={() => undefined}
        onFavoriteModelsChange={() => undefined}
        onModelOrderChange={() => undefined}
        onRetryStatusCheck={() => undefined}
        isRetryingStatusCheck={input.isRetrying ?? false}
        isRetryStatusCheckDisabled={input.isRetrying ?? false}
      />
    </I18nProvider>,
  );
}

describe("deriveProviderModelsForDisplay", () => {
  it("uses current config custom models instead of stale live custom rows", () => {
    const liveModels: ReadonlyArray<ServerProviderModel> = [
      {
        slug: "server-model",
        name: "Server Model",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "removed-custom",
        name: "Removed Custom",
        isCustom: true,
        capabilities: null,
      },
      {
        slug: "kept-custom",
        name: "Kept Custom",
        isCustom: true,
        capabilities: null,
      },
    ];

    expect(
      deriveProviderModelsForDisplay({
        liveModels,
        customModels: ["kept-custom"],
      }).map((model) => model.slug),
    ).toEqual(["server-model", "kept-custom"]);
  });

  it("uses configured custom model display names before the server probe refreshes", () => {
    expect(
      deriveProviderModelsForDisplay({
        liveModels: [],
        customModels: ["gpt-custom"],
        modelConfigurations: {
          "gpt-custom": { displayName: "Custom GPT" },
        },
      }),
    ).toEqual([
      {
        slug: "gpt-custom",
        name: "Custom GPT",
        isCustom: true,
        capabilities: null,
      },
    ]);
  });

  it("removes deleted custom model metadata without touching built-in overrides", () => {
    expect(
      retainCopilotModelConfigurations(["gpt-custom"], [], {
        "gpt-custom": { contextWindowTokens: 262_144 },
        "gpt-built-in": { reasoningEfforts: ["high"] },
      }),
    ).toEqual({
      "gpt-built-in": { reasoningEfforts: ["high"] },
    });
  });

  it("moves custom model metadata when its ID changes", () => {
    expect(
      renameCopilotModelConfiguration(
        { "old-id": { displayName: "Custom GPT", contextWindowTokens: 262_144 } },
        "old-id",
        "new-id",
      ),
    ).toEqual({
      "new-id": { displayName: "Custom GPT", contextWindowTokens: 262_144 },
    });
  });
});

describe("provider status retry", () => {
  it("shows a localized retry action when an installed provider probe fails", () => {
    const markup = renderPiProviderCard({ provider: piProvider() });

    expect(markup).toContain('aria-label="重试 Pi 状态检查"');
    expect(markup).toContain("lucide-refresh-cw");
  });

  describe("GitHub Copilot LLM providers", () => {
    it("renders configured LLM providers and their models in the instance settings", () => {
      const instanceId = ProviderInstanceId.make("githubCopilot");
      const driver = ProviderDriverKind.make("githubCopilot");
      const driverOption = PROVIDER_CLIENT_DEFINITIONS.find(
        (candidate) => candidate.value === driver,
      );
      const markup = renderToStaticMarkup(
        <I18nProvider initialLocale="zh-CN">
          <ProviderInstanceCard
            instanceId={instanceId}
            instance={{
              driver,
              enabled: true,
              config: {
                llmProviders: [
                  {
                    id: "work-openai",
                    name: "工作 OpenAI",
                    type: "openai",
                    baseUrl: "https://gateway.example.com/v1",
                    apiKey: "sk-test",
                    wireApi: "responses",
                    azureApiVersion: "",
                    models: [{ id: "gpt-custom", displayName: "Custom GPT" }],
                  },
                ],
              },
            }}
            driverOption={driverOption}
            liveProvider={{
              instanceId,
              driver,
              enabled: true,
              installed: true,
              version: null,
              status: "ready",
              auth: { status: "unauthenticated" },
              checkedAt: "2026-08-26T00:00:00.000Z",
              message: "Custom LLM provider configured.",
              models: [],
              slashCommands: [],
              skills: [],
            }}
            isExpanded
            onExpandedChange={() => undefined}
            onUpdate={() => undefined}
            hiddenModels={[]}
            favoriteModels={[]}
            modelOrder={[]}
            onHiddenModelsChange={() => undefined}
            onFavoriteModelsChange={() => undefined}
            onModelOrderChange={() => undefined}
            onRetryStatusCheck={() => undefined}
            isRetryingStatusCheck={false}
            isRetryStatusCheckDisabled={false}
          />
        </I18nProvider>,
      );

      expect(markup).toContain("LLM 供应商");
      expect(markup).toContain("工作 OpenAI");
      expect(markup).toContain("https://gateway.example.com/v1");
      expect(markup).toContain("Custom GPT");
      expect(markup).not.toContain("个可用模型");
    });
  });

  it("disables the retry action and shows progress while the probe is running", () => {
    const markup = renderPiProviderCard({ provider: piProvider(), isRetrying: true });

    expect(markup).toContain('aria-label="正在重新检查 Pi 状态"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("lucide-loader");
    expect(markup).toContain("animate-spin");
  });

  it("does not suggest retrying when the provider needs authentication", () => {
    const markup = renderPiProviderCard({
      provider: piProvider({ auth: { status: "unauthenticated" } }),
    });

    expect(markup).not.toContain("重试 Pi 状态检查");
    expect(markup).not.toContain("lucide-refresh-cw");
  });
});
