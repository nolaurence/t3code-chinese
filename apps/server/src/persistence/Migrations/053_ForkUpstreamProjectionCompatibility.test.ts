import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("reasoning-text fork upgrade", (it) => {
  it.effect("upgrades the reasoning-text fork without losing conversations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN reasoning_text TEXT`;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (33, 'ProjectionThreadMessageReasoningText')
      `;
      yield* sql`
        INSERT INTO projection_threads
          (thread_id, project_id, title, model_selection_json, created_at, updated_at)
        VALUES ('fork-thread', 'project', 'Existing conversation',
          '{"instanceId":"codex","model":"gpt-5.6-sol"}',
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO projection_thread_messages
          (message_id, thread_id, role, text, reasoning_text, is_streaming, created_at, updated_at)
        VALUES ('message', 'fork-thread', 'assistant', 'Original reply', 'Original reasoning', 0,
          '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
      `;

      yield* runMigrations();
      assert.deepEqual(yield* runMigrations(), []);
      const threads = yield* sql`
        SELECT title, settled_at, settled_override FROM projection_threads WHERE thread_id = 'fork-thread'
      `;
      assert.deepEqual(threads, [
        { title: "Existing conversation", settled_at: null, settled_override: null },
      ]);
      const messages = yield* sql`
        SELECT text, reasoning_text FROM projection_thread_messages WHERE message_id = 'message'
      `;
      assert.deepEqual(messages, [
        { text: "Original reply", reasoning_text: "Original reasoning" },
      ]);
    }),
  );
});

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
