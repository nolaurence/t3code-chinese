#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import { Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const ReleaseChannel = Schema.Literals(["stable", "nightly"]);
type ReleaseChannel = typeof ReleaseChannel.Type;

export class InvalidReleaseTagError extends Schema.TaggedErrorClass<InvalidReleaseTagError>()(
  "InvalidReleaseTagError",
  {
    channel: ReleaseChannel,
    currentTag: Schema.String,
  },
) {
  override get message(): string {
    return `Invalid ${this.channel} release tag '${this.currentTag}'.`;
  }
}

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const releaseTagListProcessContext = {
  executable: Schema.Literal("git"),
  argumentCount: NonNegativeInt,
  cwd: Schema.String,
};

export class ReleaseTagListProcessError extends Schema.TaggedErrorClass<ReleaseTagListProcessError>()(
  "ReleaseTagListProcessError",
  {
    ...releaseTagListProcessContext,
    operation: Schema.Literals(["spawn", "read-stdout", "read-stderr", "wait-for-exit"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to list release tags during process operation "${this.operation}".`;
  }
}

export class ReleaseTagListProcessExitError extends Schema.TaggedErrorClass<ReleaseTagListProcessExitError>()(
  "ReleaseTagListProcessExitError",
  {
    ...releaseTagListProcessContext,
    exitCode: Schema.Number,
    stdoutLength: NonNegativeInt,
    stderrLength: NonNegativeInt,
  },
) {
  override get message(): string {
    return `Release tag listing exited with code ${this.exitCode}.`;
  }
}

export class PreviousReleaseTagGitHubOutputConfigError extends Schema.TaggedErrorClass<PreviousReleaseTagGitHubOutputConfigError>()(
  "PreviousReleaseTagGitHubOutputConfigError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to resolve the GITHUB_OUTPUT path for the previous release tag.";
  }
}

export class PreviousReleaseTagGitHubOutputAppendError extends Schema.TaggedErrorClass<PreviousReleaseTagGitHubOutputAppendError>()(
  "PreviousReleaseTagGitHubOutputAppendError",
  {
    outputPath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to append the previous release tag to ${this.outputPath}.`;
  }
}

interface NightlyVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly date: number;
  readonly runNumber: number;
}

const isStableTag = (tag: string): boolean => /^v\d+\.\d+\.\d+$/.test(tag);

const compareNightlyVersions = (left: NightlyVersion, right: NightlyVersion): number => {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.date !== right.date) return left.date - right.date;
  return left.runNumber - right.runNumber;
};

const parseNightlyTag = (tag: string): NightlyVersion | undefined => {
  // Accept both the current `v<semver>` format and the legacy `nightly-v<semver>`
  // format so release note diffs keep working across the tag-format transition.
  const match = /^(?:nightly-)?v(\d+)\.(\d+)\.(\d+)-nightly\.(\d{8})\.(\d+)$/.exec(tag);
  if (!match) return undefined;

  const [, major, minor, patch, date, runNumber] = match;
  if (!major || !minor || !patch || !date || !runNumber) return undefined;

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    date: Number(date),
    runNumber: Number(runNumber),
  };
};

export const resolvePreviousReleaseTag = (
  channel: ReleaseChannel,
  currentTag: string,
  tags: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    if (channel === "stable") {
      if (!isStableTag(currentTag)) {
        return yield* new InvalidReleaseTagError({ channel, currentTag });
      }

      // GitHub's automatic comparison base follows published releases. A git
      // tag can exist after a failed release run, so pinning the nearest tag
      // would omit all changes since the last release that users could install.
      return undefined;
    }

    const current = parseNightlyTag(currentTag);
    if (!current) {
      return yield* new InvalidReleaseTagError({ channel, currentTag });
    }

    const candidates = tags
      .map((tag) => ({ tag, parsed: parseNightlyTag(tag) }))
      .filter(
        (entry): entry is { tag: string; parsed: NightlyVersion } => entry.parsed !== undefined,
      )
      .filter((entry) => compareNightlyVersions(entry.parsed, current) < 0)
      .toSorted((left, right) => compareNightlyVersions(right.parsed, left.parsed));

    return candidates[0]?.tag;
  });

const collectStreamAsString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
  );

export const listGitTags = Effect.fn("listGitTags")(function* (cwd = process.cwd()) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const args = ["tag", "--list"] as const;
  const context = {
    executable: "git",
    argumentCount: args.length,
    cwd,
  } as const;
  const child = yield* spawner.spawn(ChildProcess.make("git", args, { cwd })).pipe(
    Effect.mapError(
      (cause) =>
        new ReleaseTagListProcessError({
          ...context,
          operation: "spawn",
          cause,
        }),
    ),
  );
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      collectStreamAsString(child.stdout).pipe(
        Effect.mapError(
          (cause) =>
            new ReleaseTagListProcessError({
              ...context,
              operation: "read-stdout",
              cause,
            }),
        ),
      ),
      collectStreamAsString(child.stderr).pipe(
        Effect.mapError(
          (cause) =>
            new ReleaseTagListProcessError({
              ...context,
              operation: "read-stderr",
              cause,
            }),
        ),
      ),
      child.exitCode.pipe(
        Effect.map(Number),
        Effect.mapError(
          (cause) =>
            new ReleaseTagListProcessError({
              ...context,
              operation: "wait-for-exit",
              cause,
            }),
        ),
      ),
    ],
    { concurrency: "unbounded" },
  );

  if (exitCode !== 0) {
    return yield* new ReleaseTagListProcessExitError({
      ...context,
      exitCode,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
    });
  }

  return stdout.split(/\r?\n/).map(String.trim).filter(String.isNonEmpty);
});

export const writePreviousReleaseTagOutput = Effect.fn("writePreviousReleaseTagOutput")(function* (
  previousTag: string | undefined,
  writeGithubOutput: boolean,
) {
  const entry = `previous_tag=${previousTag ?? ""}\n`;

  if (writeGithubOutput) {
    const fs = yield* FileSystem.FileSystem;
    const githubOutputPath = yield* Config.nonEmptyString("GITHUB_OUTPUT").pipe(
      Effect.mapError(
        (cause) =>
          new PreviousReleaseTagGitHubOutputConfigError({
            cause,
          }),
      ),
    );
    yield* fs.writeFileString(githubOutputPath, entry, { flag: "a" }).pipe(
      Effect.mapError(
        (cause) =>
          new PreviousReleaseTagGitHubOutputAppendError({
            outputPath: githubOutputPath,
            cause,
          }),
      ),
    );
    return;
  }

  process.stdout.write(entry);
});

const command = Command.make(
  "resolve-previous-release-tag",
  {
    channel: Flag.choice("channel", ReleaseChannel.literals).pipe(
      Flag.withDescription("Release channel whose previous tag should be resolved."),
    ),
    currentTag: Flag.string("current-tag").pipe(
      Flag.withDescription("Current release tag to compare against."),
    ),
    githubOutput: Flag.boolean("github-output").pipe(
      Flag.withDescription("Write values to GITHUB_OUTPUT instead of stdout."),
      Flag.withDefault(false),
    ),
  },
  ({ channel, currentTag, githubOutput }) =>
    listGitTags().pipe(
      Effect.flatMap((tags) => resolvePreviousReleaseTag(channel, currentTag, tags)),
      Effect.flatMap((previousTag) => writePreviousReleaseTagOutput(previousTag, githubOutput)),
    ),
).pipe(Command.withDescription("Resolve the previous release tag for a stable or nightly series."));

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
