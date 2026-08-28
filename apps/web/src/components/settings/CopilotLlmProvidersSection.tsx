"use client";

import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import type {
  CopilotLlmProvider,
  CopilotLlmProviderModel,
  CopilotLlmProviderModelDiscoveryRequest,
  CopilotLlmProviderType,
  CopilotLlmProviderWireApi,
  CopilotReasoningEffort,
} from "@t3tools/contracts";

import { useI18n } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

type ModelDraft = {
  readonly key: string;
  id: string;
  displayName: string;
  contextWindowTokens: string;
  reasoningEfforts: CopilotReasoningEffort[];
  defaultReasoningEffort: CopilotReasoningEffort | "";
};

type ProviderDraft = {
  id: string;
  name: string;
  type: CopilotLlmProviderType;
  baseUrl: string;
  apiKey: string;
  wireApi: CopilotLlmProviderWireApi;
  azureApiVersion: string;
  models: ModelDraft[];
};

let modelDraftId = 0;
const nextModelDraftKey = () => `copilot-llm-model-${modelDraftId++}`;
const COPILOT_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies ReadonlyArray<CopilotReasoningEffort>;

function modelToDraft(model?: CopilotLlmProviderModel): ModelDraft {
  return {
    key: nextModelDraftKey(),
    id: model?.id ?? "",
    displayName: model?.displayName ?? "",
    contextWindowTokens:
      model?.contextWindowTokens === undefined ? "" : String(model.contextWindowTokens),
    reasoningEfforts: [...(model?.reasoningEfforts ?? [])],
    defaultReasoningEffort: model?.defaultReasoningEffort ?? "",
  };
}

function nextProviderId(providers: ReadonlyArray<CopilotLlmProvider>): string {
  const existingIds = new Set(providers.map((provider) => provider.id));
  let ordinal = providers.length + 1;
  while (existingIds.has(`llm-provider-${ordinal}`)) ordinal += 1;
  return `llm-provider-${ordinal}`;
}

function providerToDraft(provider: CopilotLlmProvider | undefined, id: string): ProviderDraft {
  return {
    id: provider?.id ?? id,
    name: provider?.name ?? "",
    type: provider?.type ?? "openai",
    baseUrl: provider?.baseUrl ?? "",
    apiKey: provider?.apiKey ?? "",
    wireApi: provider?.wireApi ?? "completions",
    azureApiVersion: provider?.azureApiVersion ?? "",
    models: provider?.models.length ? provider.models.map(modelToDraft) : [modelToDraft()],
  };
}

function hasModelDraftContent(model: ModelDraft): boolean {
  return (
    model.id.trim().length > 0 ||
    model.displayName.trim().length > 0 ||
    model.contextWindowTokens.trim().length > 0 ||
    model.reasoningEfforts.length > 0 ||
    model.defaultReasoningEffort.length > 0
  );
}

export function mergeDiscoveredModelDrafts(
  current: ReadonlyArray<ModelDraft>,
  discovered: ReadonlyArray<CopilotLlmProviderModel>,
): ModelDraft[] {
  if (discovered.length === 0) return [...current];

  const currentById = new Map(
    current.map((model) => [model.id.trim(), model] as const).filter(([id]) => id.length > 0),
  );
  const discoveredIds = new Set(discovered.map((model) => model.id));
  const merged = discovered.map((model) => {
    const existing = currentById.get(model.id);
    if (!existing) return modelToDraft(model);

    const fromApi = modelToDraft(model);
    const reasoningEfforts =
      existing.reasoningEfforts.length > 0
        ? [...existing.reasoningEfforts]
        : fromApi.reasoningEfforts;
    const defaultReasoningEffort: ModelDraft["defaultReasoningEffort"] =
      existing.defaultReasoningEffort ||
      (fromApi.defaultReasoningEffort && reasoningEfforts.includes(fromApi.defaultReasoningEffort)
        ? fromApi.defaultReasoningEffort
        : "");
    return {
      ...existing,
      displayName: existing.displayName.trim() ? existing.displayName : fromApi.displayName,
      contextWindowTokens: existing.contextWindowTokens.trim()
        ? existing.contextWindowTokens
        : fromApi.contextWindowTokens,
      reasoningEfforts,
      defaultReasoningEffort,
    };
  });
  return [
    ...merged,
    ...current.filter(
      (model) => hasModelDraftContent(model) && !discoveredIds.has(model.id.trim()),
    ),
  ];
}

function providerProtocolLabel(provider: CopilotLlmProvider): string {
  if (provider.type === "anthropic") return "Anthropic";
  if (provider.type === "azure") {
    return provider.wireApi === "responses" ? "Azure Responses" : "Azure OpenAI";
  }
  return provider.wireApi === "responses" ? "OpenAI Responses" : "OpenAI";
}

export function CopilotLlmProvidersSection(props: {
  readonly providers: ReadonlyArray<CopilotLlmProvider>;
  readonly onChange: (providers: ReadonlyArray<CopilotLlmProvider>) => void;
  readonly onDiscoverModels:
    | ((
        input: CopilotLlmProviderModelDiscoveryRequest,
      ) => Promise<ReadonlyArray<CopilotLlmProviderModel>>)
    | undefined;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const discoveryRequestId = useRef(0);

  const openEditor = (provider?: CopilotLlmProvider) => {
    discoveryRequestId.current += 1;
    setDraft(providerToDraft(provider, nextProviderId(props.providers)));
    setError(null);
    setIsFetchingModels(false);
  };

  const closeEditor = () => {
    discoveryRequestId.current += 1;
    setDraft(null);
    setIsFetchingModels(false);
  };

  const updateModel = (key: string, update: Partial<ModelDraft>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            models: current.models.map((model) =>
              model.key === key ? { ...model, ...update } : model,
            ),
          }
        : null,
    );
  };

  const fetchModels = async () => {
    if (!draft) return;
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) {
      setError(t("providers.copilotLlm.fetchModelsRequired"));
      return;
    }

    const requestId = discoveryRequestId.current + 1;
    discoveryRequestId.current = requestId;
    setIsFetchingModels(true);
    setError(null);
    try {
      const models = await props.onDiscoverModels?.({
        type: draft.type,
        baseUrl,
        apiKey: draft.apiKey.trim(),
        azureApiVersion: draft.azureApiVersion.trim(),
      });
      if (discoveryRequestId.current !== requestId) return;
      if (!models || models.length === 0) {
        setError(t("providers.copilotLlm.fetchModelsEmpty"));
        return;
      }
      setDraft((current) =>
        current?.id === draft.id
          ? { ...current, models: mergeDiscoveredModelDrafts(current.models, models) }
          : current,
      );
    } catch {
      if (discoveryRequestId.current === requestId) {
        setError(t("providers.copilotLlm.fetchModelsFailed"));
      }
    } finally {
      if (discoveryRequestId.current === requestId) {
        setIsFetchingModels(false);
      }
    }
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    if (!name || !baseUrl) {
      setError(t("providers.copilotLlm.required"));
      return;
    }
    const populated = draft.models.filter(
      (model) => model.id.trim() || model.displayName.trim() || model.contextWindowTokens.trim(),
    );
    if (populated.length === 0 || populated.some((model) => !model.id.trim())) {
      setError(t("providers.copilotLlm.modelRequired"));
      return;
    }
    const modelIds = populated.map((model) => model.id.trim());
    if (new Set(modelIds).size !== modelIds.length) {
      setError(t("providers.copilotLlm.modelDuplicate"));
      return;
    }
    const models: CopilotLlmProviderModel[] = [];
    for (const model of populated) {
      const rawContext = model.contextWindowTokens.trim();
      const contextWindowTokens = rawContext ? Number(rawContext) : undefined;
      if (
        contextWindowTokens !== undefined &&
        (!Number.isSafeInteger(contextWindowTokens) ||
          contextWindowTokens < 1 ||
          contextWindowTokens > 10_000_000)
      ) {
        setError(t("providers.modelContextInvalid"));
        return;
      }
      const displayName = model.displayName.trim();
      models.push({
        id: model.id.trim(),
        ...(displayName ? { displayName } : {}),
        ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
        ...(model.reasoningEfforts.length > 0 ? { reasoningEfforts: model.reasoningEfforts } : {}),
        ...(model.defaultReasoningEffort
          ? { defaultReasoningEffort: model.defaultReasoningEffort }
          : {}),
      });
    }
    const provider: CopilotLlmProvider = {
      id: draft.id,
      name,
      type: draft.type,
      baseUrl,
      apiKey: draft.apiKey.trim(),
      wireApi: draft.wireApi,
      azureApiVersion: draft.azureApiVersion.trim(),
      models,
    };
    const exists = props.providers.some((candidate) => candidate.id === provider.id);
    props.onChange(
      exists
        ? props.providers.map((candidate) => (candidate.id === provider.id ? provider : candidate))
        : [...props.providers, provider],
    );
    closeEditor();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-medium text-foreground">{t("providers.copilotLlm.title")}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("providers.copilotLlm.description")}
          </p>
        </div>
        <Button size="xs" variant="outline" onClick={() => openEditor()}>
          <PlusIcon />
          {t("providers.copilotLlm.add")}
        </Button>
      </div>

      {props.providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {t("providers.copilotLlm.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {props.providers.map((provider) => (
            <div key={provider.id} className="rounded-lg border border-border/70 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {provider.name}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {provider.baseUrl}
                  </div>
                </div>
                <Badge variant="secondary" size="sm">
                  {providerProtocolLabel(provider)}
                </Badge>
                <Button
                  size="icon-micro"
                  variant="ghost-muted"
                  onClick={() => openEditor(provider)}
                  aria-label={t("providers.copilotLlm.editAria", { provider: provider.name })}
                >
                  <PencilIcon />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {provider.models.map((model) => (
                  <Badge key={model.id} variant="secondary" size="sm">
                    {model.displayName ?? model.id}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft && props.providers.some((provider) => provider.id === draft.id)
                ? t("providers.copilotLlm.edit")
                : t("providers.copilotLlm.add")}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <>
              <DialogPanel className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium">{t("providers.copilotLlm.name")}</span>
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder={t("providers.copilotLlm.namePlaceholder")}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium">{t("providers.copilotLlm.type")}</span>
                    <Select
                      value={draft.type}
                      onValueChange={(value) => {
                        if (value) {
                          setDraft({ ...draft, type: value as CopilotLlmProviderType });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {draft.type === "openai"
                            ? "OpenAI"
                            : draft.type === "azure"
                              ? "Azure"
                              : "Anthropic"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="azure">Azure</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                      </SelectPopup>
                    </Select>
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">{t("providers.copilotLlm.baseUrl")}</span>
                  <Input
                    value={draft.baseUrl}
                    onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                    spellCheck={false}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {draft.type !== "anthropic" ? (
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium">
                        {t("providers.copilotLlm.wireApi")}
                      </span>
                      <Select
                        value={draft.wireApi}
                        onValueChange={(value) => {
                          if (value) {
                            setDraft({
                              ...draft,
                              wireApi: value as CopilotLlmProviderWireApi,
                            });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {draft.wireApi === "responses" ? "Responses" : "Chat Completions"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="completions">Chat Completions</SelectItem>
                          <SelectItem value="responses">Responses</SelectItem>
                        </SelectPopup>
                      </Select>
                    </label>
                  ) : null}
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium">{t("providers.copilotLlm.apiKey")}</span>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={draft.apiKey}
                      onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                    />
                  </label>
                </div>
                {draft.type === "azure" ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">
                      {t("providers.copilotLlm.azureApiVersion")}
                    </span>
                    <Input
                      value={draft.azureApiVersion}
                      onChange={(event) =>
                        setDraft({ ...draft, azureApiVersion: event.target.value })
                      }
                      placeholder="2024-10-21"
                    />
                  </label>
                ) : null}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{t("providers.copilotLlm.models")}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isFetchingModels || props.onDiscoverModels === undefined}
                        onClick={() => void fetchModels()}
                      >
                        <RefreshCwIcon className={isFetchingModels ? "animate-spin" : undefined} />
                        {t(
                          isFetchingModels
                            ? "providers.copilotLlm.fetchingModels"
                            : "providers.copilotLlm.fetchModels",
                        )}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setDraft({ ...draft, models: [...draft.models, modelToDraft()] })
                        }
                      >
                        <PlusIcon />
                        {t("providers.copilotLlm.addModel")}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {draft.models.map((model, index) => (
                      <div
                        key={model.key}
                        className="space-y-2 rounded-lg border border-border/70 p-2"
                      >
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                          <Input
                            value={model.id}
                            onChange={(event) => updateModel(model.key, { id: event.target.value })}
                            placeholder={t("providers.modelId")}
                            aria-label={t("providers.copilotLlm.modelIdAria", {
                              number: index + 1,
                            })}
                          />
                          <Input
                            value={model.displayName}
                            onChange={(event) =>
                              updateModel(model.key, { displayName: event.target.value })
                            }
                            placeholder={t("providers.modelDisplayName")}
                          />
                          <Input
                            type="number"
                            min={1}
                            max={10_000_000}
                            value={model.contextWindowTokens}
                            onChange={(event) =>
                              updateModel(model.key, {
                                contextWindowTokens: event.target.value,
                              })
                            }
                            placeholder="128000"
                            aria-label={t("providers.modelContextWindow")}
                          />
                          <Button
                            size="icon-sm"
                            variant="ghost-muted"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                models: draft.models.filter(
                                  (candidate) => candidate.key !== model.key,
                                ),
                              })
                            }
                            aria-label={t("providers.copilotLlm.removeModelAria", {
                              number: index + 1,
                            })}
                          >
                            <XIcon />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                          <div>
                            <div className="text-[11px] font-medium text-foreground">
                              {t("providers.modelReasoningEfforts")}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                              {COPILOT_REASONING_EFFORTS.map((effort) => (
                                <label
                                  key={effort}
                                  className="flex items-center gap-1.5 text-[11px]"
                                >
                                  <Checkbox
                                    checked={model.reasoningEfforts.includes(effort)}
                                    onCheckedChange={(checked) => {
                                      const reasoningEfforts = checked
                                        ? [...model.reasoningEfforts, effort]
                                        : model.reasoningEfforts.filter(
                                            (candidate) => candidate !== effort,
                                          );
                                      updateModel(model.key, {
                                        reasoningEfforts,
                                        defaultReasoningEffort: reasoningEfforts.includes(
                                          model.defaultReasoningEffort as CopilotReasoningEffort,
                                        )
                                          ? model.defaultReasoningEffort
                                          : "",
                                      });
                                    }}
                                  />
                                  {effort}
                                </label>
                              ))}
                            </div>
                          </div>
                          {model.reasoningEfforts.length > 0 ? (
                            <label className="min-w-36 flex-1">
                              <span className="text-[11px] font-medium text-foreground">
                                {t("providers.modelDefaultReasoningEffort")}
                              </span>
                              <select
                                className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                                value={model.defaultReasoningEffort}
                                onChange={(event) =>
                                  updateModel(model.key, {
                                    defaultReasoningEffort: event.target
                                      .value as ModelDraft["defaultReasoningEffort"],
                                  })
                                }
                              >
                                <option value="">{t("chat.traits.default")}</option>
                                {model.reasoningEfforts.map((effort) => (
                                  <option key={effort} value={effort}>
                                    {effort}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </DialogPanel>
              <DialogFooter>
                {props.providers.some((provider) => provider.id === draft.id) ? (
                  <Button
                    variant="destructive-outline"
                    className="mr-auto"
                    onClick={() => {
                      props.onChange(
                        props.providers.filter((provider) => provider.id !== draft.id),
                      );
                      closeEditor();
                    }}
                  >
                    <Trash2Icon />
                    {t("common.delete")}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={closeEditor}>
                  {t("common.cancel")}
                </Button>
                <Button disabled={isFetchingModels} onClick={save}>
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogPopup>
      </Dialog>
    </section>
  );
}
