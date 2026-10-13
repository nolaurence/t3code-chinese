import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import PullRequestFilesViewed from "./Migrations/053_PullRequestFilesViewed.ts";
import AutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import ForkCompatibility from "./Migrations/077_ForkUpstreamProjectionCompatibility.ts";

// Older fork builds used 53 for compatibility and 55 for viewed files, before V2 reserved 55.
export const reconcileForkMigrations = Effect.fn("reconcileForkMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return [];
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 53
      `;
      if (
        !history.some(
          (row) => row.migration_id === 53 && row.name === "ForkUpstreamProjectionCompatibility",
        )
      ) {
        return [];
      }
      const valid = history.every(
        (row) =>
          (row.migration_id === 53 && row.name === "ForkUpstreamProjectionCompatibility") ||
          (row.migration_id === 54 && row.name === "ProjectionThreadsAutoSettleDisabledAt") ||
          (row.migration_id === 55 && row.name === "PullRequestFilesViewed"),
      );
      if (!valid) {
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: "Cannot upgrade fork with unexpected later migrations.",
        });
      }
      yield* ForkCompatibility;
      yield* PullRequestFilesViewed;
      const executed: Array<readonly [number, string]> = [[53, "PullRequestFilesViewed"]];
      if (!history.some((row) => row.migration_id === 54)) {
        yield* AutoSettleDisabledAt;
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (54, 'ProjectionThreadsAutoSettleDisabledAt')`;
        executed.push([54, "ProjectionThreadsAutoSettleDisabledAt"]);
      }
      yield* sql`UPDATE effect_sql_migrations SET name = 'PullRequestFilesViewed' WHERE migration_id = 53`;
      yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id = 55 AND name = 'PullRequestFilesViewed'`;
      return executed;
    }),
  );
});
