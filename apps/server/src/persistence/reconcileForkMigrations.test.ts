import { SourceControlProviderKind } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "./Migrations.ts";
import ForkCompatibility from "./Migrations/077_ForkUpstreamProjectionCompatibility.ts";
import AutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import ViewedFiles from "./Migrations/053_PullRequestFilesViewed.ts";
import * as PullRequestFilesViewed from "./PullRequestFilesViewed.ts";

const databaseLayer = PullRequestFilesViewed.layer.pipe(
  Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
);

it.effect.each([53, 54, 55])(
  "upgrades a fork at migration %s and preserves viewed marks",
  (latest) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repository = yield* PullRequestFilesViewed.PullRequestFilesViewedRepository;
      yield* runMigrations({ toMigrationInclusive: 52 });
      yield* ForkCompatibility;
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (53, 'ForkUpstreamProjectionCompatibility')`;
      if (latest >= 54) {
        yield* AutoSettleDisabledAt;
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (54, 'ProjectionThreadsAutoSettleDisabledAt')`;
      }
      if (latest === 55) {
        yield* ViewedFiles;
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (55, 'PullRequestFilesViewed')`;
      }

      const scope = {
        provider: SourceControlProviderKind.make("gitlab"),
        host: "gitlab.example.com",
        repository: "group/project",
        number: 7,
        viewer: "reader",
      } as const;
      if (latest < 55) yield* runMigrations();
      yield* repository.set({
        ...scope,
        files: [{ path: "src/main.ts", revision: "revision-1", viewed: true }],
        viewedAt: "2026-10-13T00:00:00.000Z",
      });
      const expected = {
        files: [{ path: "src/main.ts", revision: "revision-1" }],
        truncated: false,
      };
      assert.deepEqual(yield* repository.list(scope), expected);
      if (latest === 55) yield* runMigrations();
      assert.deepEqual(yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = 55`, [
        { name: "OrchestrationV2" },
      ]);
      assert.deepEqual(yield* runMigrations(), []);
      assert.deepEqual(yield* repository.list(scope), expected);
    }).pipe(Effect.provide(databaseLayer)),
);
it.effect("leaves an unknown fork migration history unchanged", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 52 });
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES
        (53, 'ForkUpstreamProjectionCompatibility'), (55, 'UnknownForkMigration')`;
    const before = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepEqual(yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`, before);
  }).pipe(Effect.provide(databaseLayer)),
);
