import type { SessionConfig } from "@github/copilot-sdk";
import { TextGenerationError } from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import { extractJsonObject } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { CopilotRuntime } from "../provider/copilotRuntime.ts";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import * as TextGeneration from "./TextGeneration.ts";
import {
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./TextGenerationUtils.ts";

const REASONING_EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high", "xhigh", "max"]);
type CopilotReasoningEffort = NonNullable<SessionConfig["reasoningEffort"]>;

type CopilotTextGenerationOperation =
  | "generateCommitMessage"
  | "generatePrContent"
  | "generateBranchName"
  | "generateThreadTitle";

function isReasoningEffort(value: string): value is CopilotReasoningEffort {
  return REASONING_EFFORTS.has(value);
}

export function makeCopilotTextGeneration(
  runtime: CopilotRuntime,
): TextGeneration.TextGeneration["Service"] {
  const runCopilotJson = Effect.fn("runCopilotJson")(function* <S extends Schema.Top>(input: {
    readonly operation: CopilotTextGenerationOperation;
    readonly cwd: string;
    readonly prompt: string;
    readonly outputSchema: S;
    readonly modelSelection: Parameters<
      TextGeneration.TextGeneration["Service"]["generateCommitMessage"]
    >[0]["modelSelection"];
  }) {
    const effortValue = getModelSelectionStringOptionValue(input.modelSelection, "reasoningEffort");
    const reasoningEffort = effortValue && isReasoningEffort(effortValue) ? effortValue : undefined;

    const rawOutput = yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () =>
          runtime.createSession({
            workingDirectory: input.cwd,
            model: input.modelSelection.model,
            ...(reasoningEffort ? { reasoningEffort } : {}),
            streaming: false,
            availableTools: [],
            clientName: "T3 Code Text Generation",
            onPermissionRequest: () => ({
              kind: "reject",
              feedback: "Tools are disabled for text generation.",
            }),
          }),
        catch: (cause) =>
          new TextGenerationError({
            operation: input.operation,
            detail: "GitHub Copilot could not create a text generation session.",
            cause,
          }),
      }),
      (session) =>
        Effect.tryPromise({
          try: () => session.sendAndWait(input.prompt, 120_000),
          catch: (cause) =>
            new TextGenerationError({
              operation: input.operation,
              detail: "GitHub Copilot text generation request failed.",
              cause,
            }),
        }).pipe(
          Effect.flatMap((response) =>
            response?.data.content.trim()
              ? Effect.succeed(response.data.content.trim())
              : Effect.fail(
                  new TextGenerationError({
                    operation: input.operation,
                    detail: "GitHub Copilot returned empty text generation output.",
                  }),
                ),
          ),
        ),
      (session) =>
        Effect.promise(() => session.disconnect()).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to disconnect GitHub Copilot text generation session", cause),
          ),
          Effect.ignore,
        ),
    );

    return yield* Schema.decodeEffect(Schema.fromJsonString(input.outputSchema))(
      extractJsonObject(rawOutput),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation: input.operation,
            detail: "GitHub Copilot returned invalid structured output.",
            cause,
          }),
      ),
    );
  });

  const generateCommitMessage: TextGeneration.TextGeneration["Service"]["generateCommitMessage"] =
    Effect.fn("CopilotTextGeneration.generateCommitMessage")(function* (input) {
      const { prompt, outputSchema } = buildCommitMessagePrompt({
        branch: input.branch,
        stagedSummary: input.stagedSummary,
        stagedPatch: input.stagedPatch,
        includeBranch: input.includeBranch === true,
      });
      const generated = yield* runCopilotJson({
        operation: "generateCommitMessage",
        cwd: input.cwd,
        prompt,
        outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        subject: sanitizeCommitSubject(generated.subject),
        body: generated.body.trim(),
        ...("branch" in generated && typeof generated.branch === "string"
          ? { branch: sanitizeFeatureBranchName(generated.branch) }
          : {}),
      };
    });

  const generatePrContent: TextGeneration.TextGeneration["Service"]["generatePrContent"] =
    Effect.fn("CopilotTextGeneration.generatePrContent")(function* (input) {
      const { prompt, outputSchema } = buildPrContentPrompt(input);
      const generated = yield* runCopilotJson({
        operation: "generatePrContent",
        cwd: input.cwd,
        prompt,
        outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        title: sanitizePrTitle(generated.title),
        body: generated.body.trim(),
      };
    });

  const generateBranchName: TextGeneration.TextGeneration["Service"]["generateBranchName"] =
    Effect.fn("CopilotTextGeneration.generateBranchName")(function* (input) {
      const { prompt, outputSchema } = buildBranchNamePrompt(input);
      const generated = yield* runCopilotJson({
        operation: "generateBranchName",
        cwd: input.cwd,
        prompt,
        outputSchema,
        modelSelection: input.modelSelection,
      });
      return { branch: sanitizeBranchFragment(generated.branch) };
    });

  const generateThreadTitle: TextGeneration.TextGeneration["Service"]["generateThreadTitle"] =
    Effect.fn("CopilotTextGeneration.generateThreadTitle")(function* (input) {
      const { prompt, outputSchema } = buildThreadTitlePrompt(input);
      const generated = yield* runCopilotJson({
        operation: "generateThreadTitle",
        cwd: input.cwd,
        prompt,
        outputSchema,
        modelSelection: input.modelSelection,
      });
      return { title: sanitizeThreadTitle(generated.title) };
    });

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
  };
}
