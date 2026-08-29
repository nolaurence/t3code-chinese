"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  Settings2Icon,
  PlusIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  ProviderDriverKind,
  type CopilotModelConfiguration,
  type CopilotModelConfigurations,
  type ProviderInstanceId,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { normalizeCustomModelSlug } from "@t3tools/shared/model";

import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import { sortModelsForProviderInstance } from "../../modelOrdering";
import { MAX_CUSTOM_MODEL_LENGTH } from "../../modelSelection";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Placeholder text for the "add a custom model" input, keyed by driver
 * kind. Mirrors the prior hardcoded switch in `SettingsPanels.tsx` so the
 * UX is unchanged — only the owning component has moved.
 */
const CUSTOM_MODEL_PLACEHOLDER_BY_KIND: Partial<Record<ProviderDriverKind, string>> = {
  [ProviderDriverKind.make("codex")]: "gpt-6.7-codex-ultra-preview",
  [ProviderDriverKind.make("claudeAgent")]: "claude-sonnet-5",
  [ProviderDriverKind.make("cursor")]: "claude-sonnet-4-6",
  [ProviderDriverKind.make("opencode")]: "openai/gpt-5",
};

interface ProviderModelsSectionProps {
  /** Identifier used to namespace input ids within the DOM. */
  readonly instanceId: ProviderInstanceId;
  /**
   * Driver kind for slug normalization + input placeholder. `null` when
   * the section is rendered without enough provider metadata.
   */
  readonly driverKind: ProviderDriverKind | null;
  /**
   * The live model list to display. Includes both built-in (probe-reported)
   * and custom entries, distinguished by `isCustom`.
   */
  readonly models: ReadonlyArray<ServerProviderModel>;
  /**
   * The persisted custom-model slug list for this instance. Drives dedup,
   * and is the array we hand back verbatim (with the new slug appended /
   * removed) via `onChange`.
   */
  readonly customModels: ReadonlyArray<string>;
  /** Server-returned model slugs hidden from the model picker. */
  readonly hiddenModels: ReadonlyArray<string>;
  /** Model slugs favorited for this provider instance. */
  readonly favoriteModels: ReadonlyArray<string>;
  /** Explicit user-authored model ordering for this provider instance. */
  readonly modelOrder: ReadonlyArray<string>;
  readonly modelConfigurations: CopilotModelConfigurations;
  /**
   * Commit the new custom-model list. Caller is responsible for routing the
   * write to the correct storage (legacy `settings.providers[kind]` vs.
   * `providerInstances[id].config`).
   */
  readonly onChange: (next: ReadonlyArray<string>) => void;
  readonly onCustomModelRename: (previousSlug: string, nextSlug: string) => void;
  readonly onHiddenModelsChange: (next: ReadonlyArray<string>) => void;
  readonly onFavoriteModelsChange: (next: ReadonlyArray<string>) => void;
  readonly onModelOrderChange: (next: ReadonlyArray<string>) => void;
  readonly onModelConfigurationsChange: (next: CopilotModelConfigurations) => void;
}

const COPILOT_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * Shared "Models" section rendered on both the built-in default and custom
 * provider-instance cards. Owns its own input + error local state so two
 * cards on screen don't fight over the input value.
 *
 * Validation mirrors the pre-consolidation logic in `SettingsPanels`:
 *   - empty / whitespace → "Enter a model slug."
 *   - duplicate of a non-custom (probe-reported) slug → "already built in"
 *   - exceeds `MAX_CUSTOM_MODEL_LENGTH` → length error
 *   - duplicate of an already-saved custom slug → already-saved error
 */
export function ProviderModelsSection({
  instanceId,
  driverKind,
  models,
  customModels,
  hiddenModels,
  favoriteModels,
  modelOrder,
  modelConfigurations,
  onChange,
  onCustomModelRename,
  onHiddenModelsChange,
  onFavoriteModelsChange,
  onModelOrderChange,
  onModelConfigurationsChange,
}: ProviderModelsSectionProps) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hiddenModelSet = useMemo(() => new Set(hiddenModels), [hiddenModels]);
  const favoriteModelSet = useMemo(() => new Set(favoriteModels), [favoriteModels]);
  const orderedModels = useMemo(() => {
    return sortModelsForProviderInstance(models, {
      favoriteModels: favoriteModelSet,
      groupFavorites: true,
      modelOrder,
    });
  }, [favoriteModelSet, modelOrder, models]);

  const handleAdd = () => {
    const normalized = normalizeCustomModelSlug(input);
    if (!normalized) {
      setError(t("providers.modelEnter"));
      return;
    }
    if (models.some((model) => !model.isCustom && model.slug === normalized)) {
      setError(t("providers.modelBuiltIn"));
      return;
    }
    if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
      setError(t("providers.modelTooLong", { max: MAX_CUSTOM_MODEL_LENGTH }));
      return;
    }
    if (customModels.includes(normalized)) {
      setError(t("providers.modelSaved"));
      return;
    }

    onChange([...customModels, normalized]);
    setInput("");
    setError(null);

    // Scroll the new row into view once the DOM reflects the commit.
    // `MutationObserver` handles the one-frame gap between `onChange` and
    // the `models` prop update; the `requestAnimationFrame` covers the
    // common case where the parent updates synchronously.
    const el = listRef.current;
    if (!el) return;
    const scrollToEnd = () => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(scrollToEnd);
    const observer = new MutationObserver(() => {
      scrollToEnd();
      observer.disconnect();
    });
    observer.observe(el, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 2_000);
  };

  const handleRemove = (slug: string) => {
    onChange(customModels.filter((model) => model !== slug));
    onModelOrderChange(modelOrder.filter((model) => model !== slug));
    onFavoriteModelsChange(favoriteModels.filter((model) => model !== slug));
    if (editingModel === slug) setEditingModel(null);
    setError(null);
  };

  const handleCustomModelRename = (previousSlug: string, value: string) => {
    const nextSlug = normalizeCustomModelSlug(value);
    if (!nextSlug) {
      setError(t("providers.modelEnter"));
      return;
    }
    if (nextSlug.length > MAX_CUSTOM_MODEL_LENGTH) {
      setError(t("providers.modelTooLong", { max: MAX_CUSTOM_MODEL_LENGTH }));
      return;
    }
    if (nextSlug !== previousSlug && models.some((model) => model.slug === nextSlug)) {
      setError(
        customModels.includes(nextSlug) ? t("providers.modelSaved") : t("providers.modelBuiltIn"),
      );
      return;
    }
    if (nextSlug === previousSlug) {
      setError(null);
      return;
    }

    onCustomModelRename(previousSlug, nextSlug);
    onModelOrderChange(modelOrder.map((slug) => (slug === previousSlug ? nextSlug : slug)));
    onFavoriteModelsChange(favoriteModels.map((slug) => (slug === previousSlug ? nextSlug : slug)));
    setEditingModel(nextSlug);
    setError(null);
  };

  const handleToggleHidden = (slug: string) => {
    if (hiddenModelSet.has(slug)) {
      onHiddenModelsChange(hiddenModels.filter((model) => model !== slug));
      return;
    }
    onHiddenModelsChange([...hiddenModels, slug]);
  };

  const handleToggleFavorite = (slug: string) => {
    if (favoriteModelSet.has(slug)) {
      onFavoriteModelsChange(favoriteModels.filter((model) => model !== slug));
      return;
    }
    onFavoriteModelsChange([...favoriteModels, slug]);
  };

  const handleMove = (slug: string, direction: -1 | 1) => {
    const slugs = orderedModels.map((model) => model.slug);
    const index = slugs.indexOf(slug);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= slugs.length) {
      return;
    }
    const next = [...slugs];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    onModelOrderChange(next);
  };

  const updateModelConfiguration = (slug: string, next: CopilotModelConfiguration | undefined) => {
    const configurations = { ...modelConfigurations };
    if (
      next &&
      (next.displayName !== undefined ||
        next.contextWindowTokens !== undefined ||
        (next.reasoningEfforts?.length ?? 0) > 0 ||
        next.defaultReasoningEffort !== undefined)
    ) {
      configurations[slug] = next;
    } else {
      delete configurations[slug];
    }
    onModelConfigurationsChange(configurations);
  };

  return (
    <div>
      <div className="text-xs font-medium text-foreground">{t("providers.models")}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {t(models.length === 1 ? "providers.modelCountOne" : "providers.modelCountMany", {
          count: models.length,
        })}
      </div>
      <div ref={listRef} className="mt-2 max-h-40 overflow-y-auto pb-1">
        {orderedModels.map((model, index) => {
          const caps = model.capabilities;
          const capLabels: string[] = [];
          const isHidden = !model.isCustom && hiddenModelSet.has(model.slug);
          const isFavorite = favoriteModelSet.has(model.slug);
          const previousModel = orderedModels[index - 1];
          const nextModel = orderedModels[index + 1];
          const canMoveUp =
            previousModel !== undefined && favoriteModelSet.has(previousModel.slug) === isFavorite;
          const canMoveDown =
            nextModel !== undefined && favoriteModelSet.has(nextModel.slug) === isFavorite;
          const descriptors = caps?.optionDescriptors ?? [];
          if (descriptors.some((descriptor) => descriptor.id === "fastMode")) {
            capLabels.push(t("providers.modelFast"));
          }
          if (descriptors.some((descriptor) => descriptor.id === "thinking")) {
            capLabels.push(t("providers.modelThinking"));
          }
          if (
            descriptors.some(
              (descriptor) =>
                descriptor.type === "select" &&
                (descriptor.id === "reasoningEffort" ||
                  descriptor.id === "effort" ||
                  descriptor.id === "reasoning" ||
                  descriptor.id === "variant"),
            )
          ) {
            capLabels.push(t("providers.modelReasoning"));
          }
          const hasDetails = capLabels.length > 0 || model.name !== model.slug;

          const configuration = modelConfigurations[model.slug] ?? {};
          const reasoningEfforts = configuration.reasoningEfforts ?? [];
          const isEditing = editingModel === model.slug;
          return (
            <div
              key={`${instanceId}:${model.slug}`}
              className="border-border/50 border-b last:border-b-0"
            >
              <div
                className={cn(
                  "grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1",
                  isHidden && "text-muted-foreground",
                )}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn(
                      "min-w-0 truncate text-xs",
                      isHidden ? "text-muted-foreground line-through" : "text-foreground/90",
                    )}
                  >
                    {model.name}
                  </span>
                  {hasDetails ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-micro"
                            variant="ghost"
                            className="text-muted-foreground/60 hover:text-muted-foreground"
                            aria-label={t("providers.modelDetails", { model: model.name })}
                          />
                        }
                      >
                        <InfoIcon className="size-3" />
                      </TooltipTrigger>
                      <TooltipPopup side="top" className="max-w-56">
                        <div className="space-y-1">
                          <code className="block text-[11px] text-foreground">{model.slug}</code>
                          {capLabels.length > 0 ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {capLabels.map((label) => (
                                <span key={label} className="text-[10px] text-muted-foreground">
                                  {label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </TooltipPopup>
                    </Tooltip>
                  ) : null}
                  {isHidden ? (
                    <span className="text-[10px] text-muted-foreground">
                      {t("providers.modelHidden")}
                    </span>
                  ) : null}
                  {model.isCustom ? (
                    <span className="text-[10px] text-muted-foreground">
                      {t("providers.modelCustom")}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-micro"
                          variant="ghost-muted"
                          className={cn(isFavorite && "text-yellow-500 hover:text-yellow-600")}
                          onClick={() => handleToggleFavorite(model.slug)}
                          aria-label={t("providers.modelFavoriteAria", {
                            action: isFavorite
                              ? t("providers.modelRemoveFavorite")
                              : t("providers.modelAddFavorite"),
                            model: model.name,
                            target: t("common.favorites"),
                          })}
                        />
                      }
                    >
                      <StarIcon className={cn("size-3", isFavorite && "fill-current")} />
                    </TooltipTrigger>
                    <TooltipPopup side="top">
                      {isFavorite
                        ? t("providers.modelRemoveFavorite")
                        : t("providers.modelAddFavorite")}
                    </TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-micro"
                          variant="ghost-muted"
                          disabled={!canMoveUp}
                          onClick={() => handleMove(model.slug, -1)}
                          aria-label={t("providers.modelMoveAria", {
                            model: model.name,
                            direction: t("providers.modelMoveUp"),
                          })}
                        />
                      }
                    >
                      <ArrowUpIcon className="size-3" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">{t("providers.modelMoveUp")}</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-micro"
                          variant="ghost-muted"
                          disabled={!canMoveDown}
                          onClick={() => handleMove(model.slug, 1)}
                          aria-label={t("providers.modelMoveAria", {
                            model: model.name,
                            direction: t("providers.modelMoveDown"),
                          })}
                        />
                      }
                    >
                      <ArrowDownIcon className="size-3" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">{t("providers.modelMoveDown")}</TooltipPopup>
                  </Tooltip>
                  {!model.isCustom ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-micro"
                            variant="ghost-muted"
                            onClick={() => handleToggleHidden(model.slug)}
                            aria-label={t("providers.modelVisibilityAria", {
                              action: isHidden
                                ? t("providers.modelShow")
                                : t("providers.modelHide"),
                              model: model.name,
                            })}
                          />
                        }
                      >
                        {isHidden ? (
                          <EyeIcon className="size-3" />
                        ) : (
                          <EyeOffIcon className="size-3" />
                        )}
                      </TooltipTrigger>
                      <TooltipPopup side="top">
                        {isHidden ? t("providers.modelShow") : t("providers.modelHide")}
                      </TooltipPopup>
                    </Tooltip>
                  ) : null}
                  {model.isCustom ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-micro"
                            variant="ghost-muted"
                            aria-label={t("providers.modelRemoveAria", { model: model.slug })}
                            onClick={() => handleRemove(model.slug)}
                          />
                        }
                      >
                        <XIcon className="size-3" />
                      </TooltipTrigger>
                      <TooltipPopup side="top">{t("providers.modelRemoveCustom")}</TooltipPopup>
                    </Tooltip>
                  ) : null}
                  {driverKind === "githubCopilot" ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-micro"
                            variant="ghost-muted"
                            onClick={() => setEditingModel(isEditing ? null : model.slug)}
                            aria-label={t("providers.modelConfigure", { model: model.name })}
                          />
                        }
                      >
                        <Settings2Icon className="size-3" />
                      </TooltipTrigger>
                      <TooltipPopup side="top">{t("providers.modelConfigureAction")}</TooltipPopup>
                    </Tooltip>
                  ) : null}
                </div>
              </div>
              {isEditing ? (
                <div className="space-y-3 pb-3 pl-1 pr-1">
                  {model.isCustom ? (
                    <>
                      <label className="block">
                        <span className="text-[11px] font-medium text-foreground">
                          {t("providers.modelId")}
                        </span>
                        <Input
                          key={`id:${model.slug}`}
                          className="mt-1 h-7 text-xs"
                          defaultValue={model.slug}
                          maxLength={MAX_CUSTOM_MODEL_LENGTH}
                          onBlur={(event) =>
                            handleCustomModelRename(model.slug, event.currentTarget.value)
                          }
                          spellCheck={false}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-foreground">
                          {t("providers.modelDisplayName")}
                        </span>
                        <Input
                          key={`name:${model.slug}:${configuration.displayName ?? ""}`}
                          className="mt-1 h-7 text-xs"
                          defaultValue={configuration.displayName ?? ""}
                          placeholder={model.slug}
                          onBlur={(event) => {
                            const displayName = event.currentTarget.value.trim() || undefined;
                            updateModelConfiguration(model.slug, {
                              ...configuration,
                              displayName,
                            });
                            setError(null);
                          }}
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="block">
                    <span className="text-[11px] font-medium text-foreground">
                      {t("providers.modelContextWindow")}
                    </span>
                    <Input
                      key={`${model.slug}:${configuration.contextWindowTokens ?? ""}`}
                      className="mt-1 h-7 text-xs"
                      type="number"
                      min={1}
                      max={10_000_000}
                      defaultValue={configuration.contextWindowTokens ?? ""}
                      placeholder={
                        model.contextWindowTokens ? String(model.contextWindowTokens) : "128000"
                      }
                      onBlur={(event) => {
                        const raw = event.currentTarget.value.trim();
                        if (!raw) {
                          updateModelConfiguration(model.slug, {
                            ...configuration,
                            contextWindowTokens: undefined,
                          });
                          setError(null);
                          return;
                        }
                        const parsed = Number(raw);
                        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000_000) {
                          setError(t("providers.modelContextInvalid"));
                          return;
                        }
                        updateModelConfiguration(model.slug, {
                          ...configuration,
                          contextWindowTokens: parsed,
                        });
                        setError(null);
                      }}
                    />
                  </label>
                  <div>
                    <div className="text-[11px] font-medium text-foreground">
                      {t("providers.modelReasoningEfforts")}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                      {COPILOT_REASONING_EFFORTS.map((effort) => (
                        <label key={effort} className="flex items-center gap-1.5 text-[11px]">
                          <Checkbox
                            checked={reasoningEfforts.includes(effort)}
                            onCheckedChange={(checked) => {
                              const nextEfforts = checked
                                ? [...reasoningEfforts, effort]
                                : reasoningEfforts.filter((candidate) => candidate !== effort);
                              updateModelConfiguration(model.slug, {
                                ...configuration,
                                reasoningEfforts: nextEfforts,
                                defaultReasoningEffort: nextEfforts.includes(
                                  configuration.defaultReasoningEffort ?? "medium",
                                )
                                  ? configuration.defaultReasoningEffort
                                  : undefined,
                              });
                            }}
                          />
                          {effort}
                        </label>
                      ))}
                    </div>
                  </div>
                  {reasoningEfforts.length > 0 ? (
                    <label className="block">
                      <span className="text-[11px] font-medium text-foreground">
                        {t("providers.modelDefaultReasoningEffort")}
                      </span>
                      <select
                        className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={configuration.defaultReasoningEffort ?? ""}
                        onChange={(event) =>
                          updateModelConfiguration(model.slug, {
                            ...configuration,
                            defaultReasoningEffort:
                              (event.target
                                .value as CopilotModelConfiguration["defaultReasoningEffort"]) ||
                              undefined,
                          })
                        }
                      >
                        <option value="">{t("chat.traits.default")}</option>
                        {reasoningEfforts.map((effort) => (
                          <option key={effort} value={effort}>
                            {effort}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id={`provider-instance-${instanceId}-custom-model`}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            handleAdd();
          }}
          placeholder={driverKind ? CUSTOM_MODEL_PLACEHOLDER_BY_KIND[driverKind] : "model-slug"}
          spellCheck={false}
        />
        <Button className="shrink-0" variant="outline" onClick={handleAdd}>
          <PlusIcon className="size-3.5" />
          {t("common.add")}
        </Button>
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
