import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { videos } from "./videos";

describe("example board content", () => {
  it("contains a complete, varied inspiration wall", () => {
    expect(videos).toHaveLength(36);
    expect(new Set(videos.map((video) => video.id)).size).toBe(videos.length);
    expect(videos.filter((video) => video.featured)).toHaveLength(2);
  });

  it("uses only local image assets and safe YouTube links", () => {
    for (const video of videos) {
      expect(video.thumbnail).toMatch(/^thumbnails\/[\w-]+\.svg$/);
      expect(video.avatar).toMatch(/^avatars\/[\w-]+\.svg$/);
      expect(existsSync(resolve("public", video.thumbnail))).toBe(true);
      expect(existsSync(resolve("public", video.avatar))).toBe(true);
      expect(video.url).toBe(`https://www.youtube.com/watch?v=${video.id}`);
      expect(video.alt.length).toBeGreaterThan(20);
    }
  });
});
