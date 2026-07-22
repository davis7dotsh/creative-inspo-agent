import { useState } from "react";
import type { CSSProperties } from "react";
import { videos, type Video } from "./videos";

const compactViews = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const exactViews = new Intl.NumberFormat("en-US");

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function VideoCard({ video }: { video: Video }) {
  const [loaded, setLoaded] = useState(false);
  const [delay] = useState(() => Math.round(Math.random() * 260));
  const style = { "--entrance-delay": `${delay}ms` } as CSSProperties;

  return (
    <a
      className={`video-card${video.featured ? " video-card--featured" : ""}`}
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${video.title} by ${video.channel} on YouTube`}
      style={style}
    >
      <img
        className={`video-card__thumbnail${loaded ? " is-loaded" : ""}`}
        src={assetUrl(video.thumbnail)}
        alt={video.alt}
        width="640"
        height="360"
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
      <span className="video-card__shade" aria-hidden="true" />
      <span className="video-card__metadata">
        <span className="video-card__summary">
          <img
            className="video-card__avatar"
            src={assetUrl(video.avatar)}
            alt=""
            width="28"
            height="28"
            loading="lazy"
            decoding="async"
          />
          <span className="video-card__title video-card__title--compact">{video.title}</span>
          <span className="video-card__views">{compactViews.format(video.views)} views</span>
        </span>
        <span className="video-card__details">
          <span className="video-card__title video-card__title--full">{video.title}</span>
          <span className="video-card__channel">{video.channel}</span>
          <span className="video-card__facts">
            {exactViews.format(video.views)} views · {video.published} · {video.duration}
          </span>
        </span>
      </span>
    </a>
  );
}

export function App() {
  return (
    <main className="page-shell">
      <header className="board-header">
        <h1>Future Systems</h1>
        <p>{videos.length} videos</p>
      </header>
      <section className="video-grid" aria-label="Technology video inspiration">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </section>
    </main>
  );
}
