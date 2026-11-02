import type { PullRequestReaction, PullRequestReactionContent } from "@t3tools/contracts";
import type { Translate } from "~/i18n";

export const PULL_REQUEST_REACTION_ORDER: ReadonlyArray<PullRequestReactionContent> = [
  "thumbs-up",
  "thumbs-down",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

const REACTION_EMOJI: Record<PullRequestReactionContent, string> = {
  "thumbs-up": "👍",
  "thumbs-down": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

const REACTION_NAME: Record<PullRequestReactionContent, string> = {
  "thumbs-up": "thumbs up",
  "thumbs-down": "thumbs down",
  laugh: "laugh",
  hooray: "hooray",
  confused: "confused",
  heart: "heart",
  rocket: "rocket",
  eyes: "eyes",
};

export function pullRequestReactionEmoji(content: PullRequestReactionContent): string {
  return REACTION_EMOJI[content];
}

export function pullRequestReactionName(
  content: PullRequestReactionContent,
  t?: Translate,
): string {
  if (!t) return REACTION_NAME[content];
  return t(`pullRequest.reaction.${content}` as Parameters<Translate>[0]);
}

const NAMED_ACTOR_LIMIT = 3;

function joinNames(parts: ReadonlyArray<string>, t?: Translate): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) {
    return (
      t?.("pullRequest.reaction.twoActors", { first: parts[0]!, second: parts[1]! }) ??
      `${parts[0]} and ${parts[1]}`
    );
  }
  return (
    t?.("pullRequest.reaction.manyActors", {
      leading: parts.slice(0, -1).join(", "),
      last: parts.at(-1)!,
    }) ?? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`
  );
}

/** "others" only alongside somebody named; on its own a count is people, not other people. */
function countRemainder(count: number, named: boolean, t?: Translate): string {
  if (t) {
    return named
      ? t(count === 1 ? "pullRequest.reaction.otherOne" : "pullRequest.reaction.others", { count })
      : t(count === 1 ? "pullRequest.reaction.personOne" : "pullRequest.reaction.people", {
          count,
        });
  }
  if (named) return `${count} ${count === 1 ? "other" : "others"}`;
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** Hosts omit the viewer from actors; add You only if count has room, since viewer login is unavailable. */
export function pullRequestReactionTooltip(reaction: PullRequestReaction, t?: Translate): string {
  const viewerHasRoom = reaction.actors.length < reaction.count;
  const names =
    reaction.viewerHasReacted && viewerHasRoom
      ? [t?.("pullRequest.reaction.you") ?? "You", ...reaction.actors]
      : [...reaction.actors];
  const shown = names.slice(0, Math.min(NAMED_ACTOR_LIMIT, reaction.count));
  const others = Math.max(0, reaction.count - shown.length);
  const parts = [...shown, ...(others > 0 ? [countRemainder(others, shown.length > 0, t)] : [])];
  const actors = joinNames(parts, t);
  const name = pullRequestReactionName(reaction.content, t);
  return (
    t?.("pullRequest.reaction.tooltip", { actors, reaction: name }) ??
    `${actors} reacted with ${name} emoji`
  );
}

/** Changes whenever the host reports different reactions, so pending overlays can reset. */
export function pullRequestReactionsSignature(
  reactions: ReadonlyArray<PullRequestReaction>,
): string {
  return reactions
    .map((reaction) => `${reaction.content}:${reaction.count}:${reaction.viewerHasReacted ? 1 : 0}`)
    .join(" ");
}

export function applyPendingPullRequestReactions(
  reactions: ReadonlyArray<PullRequestReaction>,
  pending: ReadonlyMap<PullRequestReactionContent, boolean>,
): ReadonlyArray<PullRequestReaction> {
  if (pending.size === 0) return reactions;
  const byContent = new Map(reactions.map((reaction) => [reaction.content, reaction] as const));
  for (const [content, reacted] of pending) {
    const current = byContent.get(content);
    if (current === undefined) {
      if (reacted) {
        byContent.set(content, { content, count: 1, actors: [], viewerHasReacted: true });
      }
      continue;
    }
    if (current.viewerHasReacted === reacted) continue;
    const count = current.count + (reacted ? 1 : -1);
    if (count <= 0) byContent.delete(content);
    else byContent.set(content, { ...current, count, viewerHasReacted: reacted });
  }
  return PULL_REQUEST_REACTION_ORDER.flatMap((content) => byContent.get(content) ?? []);
}
