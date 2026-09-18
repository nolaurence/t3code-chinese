import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Fork databases recorded 42/43 as ForkProjectionCompatibility and
// ProjectionThreadMessagePhase, so upstream's same-id migrations never ran.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const threadColumnNames = new Set(threadColumns.map((column) => column.name));

  if (!threadColumnNames.has("linked_pull_request_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN linked_pull_request_json TEXT
    `;
  }
  if (!threadColumnNames.has("unsettled_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN unsettled_at TEXT
    `;
  }

  const messageColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `;
  if (!messageColumns.some((column) => column.name === "message_phase")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      ADD COLUMN message_phase TEXT
      CHECK (message_phase IN ('commentary', 'final_answer') OR message_phase IS NULL)
    `;
  }
});
