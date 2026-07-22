import { Schema } from "effect"

export const ThumbnailVariant = Schema.Struct({
  url: Schema.String,
  width: Schema.optionalKey(Schema.Finite),
  height: Schema.optionalKey(Schema.Finite),
})

export const ChannelAvatarVariant = Schema.Struct({
  url: Schema.String,
  width: Schema.optionalKey(Schema.Finite),
  height: Schema.optionalKey(Schema.Finite),
})

export const PreparedChannel = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  avatars: Schema.Array(ChannelAvatarVariant),
  localAvatarPath: Schema.String,
})

export const PreparedChannelBatch = Schema.Struct({
  channels: Schema.Array(PreparedChannel),
})

export const VideoStatistics = Schema.Struct({
  viewCount: Schema.String,
  commentCount: Schema.optionalKey(Schema.String),
})

export const Embedding = Schema.Struct({
  model: Schema.String,
  dimensions: Schema.Finite.check(Schema.isBetween({ minimum: 1536, maximum: 1536 })),
  values: Schema.Array(Schema.Finite).check(Schema.isLengthBetween(1536, 1536)),
})

export const PreparedVideo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  channelId: Schema.String,
  channelTitle: Schema.String,
  publishedAt: Schema.String,
  durationSeconds: Schema.Finite,
  thumbnails: Schema.Array(ThumbnailVariant),
  localThumbnailPath: Schema.String,
  statistics: VideoStatistics,
  thumbnailDescription: Schema.String,
  titleEmbedding: Embedding,
  thumbnailDescriptionEmbedding: Embedding,
})

export const PreparedVideoBatch = Schema.Struct({
  videos: Schema.Array(PreparedVideo),
  channels: Schema.optionalKey(Schema.Array(PreparedChannel)),
})

export const VideoEmbeddingUpdate = Schema.Struct({
  id: Schema.String,
  titleEmbedding: Embedding,
  thumbnailDescriptionEmbedding: Embedding,
})

export const VideoEmbeddingUpdateBatch = Schema.Struct({
  videos: Schema.Array(VideoEmbeddingUpdate),
})

export type ThumbnailVariant = typeof ThumbnailVariant.Type
export type ChannelAvatarVariant = typeof ChannelAvatarVariant.Type
export type PreparedChannel = typeof PreparedChannel.Type
export type PreparedChannelBatch = typeof PreparedChannelBatch.Type
export type VideoStatistics = typeof VideoStatistics.Type
export type Embedding = typeof Embedding.Type
export type PreparedVideo = typeof PreparedVideo.Type
export type PreparedVideoBatch = typeof PreparedVideoBatch.Type
export type VideoEmbeddingUpdate = typeof VideoEmbeddingUpdate.Type
export type VideoEmbeddingUpdateBatch = typeof VideoEmbeddingUpdateBatch.Type
