import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("053_ForkUpstreamProjectionCompatibility", (it) => {
  it.effect("repairs a fork database that reused upstream 42/43 ids", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 41 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (42, 'ForkProjectionCompatibility'),
          (43, 'ProjectionThreadMessagePhase')
      `;

      yield* runMigrations();

      const threadColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const threadColumnNames = new Set(threadColumns.map((column) => column.name));
      assert.ok(threadColumnNames.has("linked_pull_request_json"));
      assert.ok(threadColumnNames.has("unsettled_at"));
      assert.ok(threadColumnNames.has("title_state_json"));

      const messageColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_thread_messages)
      `;
      assert.ok(messageColumns.some((column) => column.name === "message_phase"));

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `;
      assert.ok(tables.some((table) => table.name === "projection_thread_pull_requests"));
    }),
  );
});
