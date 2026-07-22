import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqliteMigrator } from "@effect/sql-sqlite-node"

const initial = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE videos (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
      thumbnail_urls_json TEXT NOT NULL CHECK (json_valid(thumbnail_urls_json)),
      thumbnail_path TEXT NOT NULL,
      view_count INTEGER,
      comment_count INTEGER,
      thumbnail_description TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions = 1536),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT
  `

  yield* sql`CREATE INDEX videos_channel_id_idx ON videos(channel_id)`
  yield* sql`CREATE INDEX videos_published_at_idx ON videos(published_at)`
  yield* sql`CREATE INDEX videos_duration_seconds_idx ON videos(duration_seconds)`
  yield* sql`CREATE INDEX videos_view_count_idx ON videos(view_count)`

  yield* sql`
    CREATE VIRTUAL TABLE video_vectors USING vec0(
      video_id TEXT PRIMARY KEY,
      title_embedding FLOAT[1536] distance_metric=cosine,
      thumbnail_embedding FLOAT[1536] distance_metric=cosine,
      channel_id TEXT,
      channel_title TEXT,
      published_epoch FLOAT,
      duration_seconds FLOAT,
      view_count FLOAT,
      embedding_model TEXT
    )
  `
})

const thumbnailMutationLock = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE thumbnail_mutation_lock (
      singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
      generation INTEGER NOT NULL
    ) STRICT
  `
  yield* sql`INSERT INTO thumbnail_mutation_lock(singleton, generation) VALUES (1, 0)`
})

export const videoLibraryMigrations = SqliteMigrator.fromRecord({
  "1_initial": initial,
  "2_thumbnail_mutation_lock": thumbnailMutationLock,
})
