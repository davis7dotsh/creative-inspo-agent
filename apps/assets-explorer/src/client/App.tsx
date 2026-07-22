import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Asset, CreatorSummary, SortOrder } from "../contracts/api.js"
import { fetchAssets, fetchCreators } from "./api.js"

const sortOptions: ReadonlyArray<{ readonly value: SortOrder; readonly label: string }> = [
  { value: "random", label: "Random" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "mostViewed", label: "Most viewed" },
]

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const skeletonIds = [
  "amber",
  "birch",
  "cedar",
  "dune",
  "elm",
  "fern",
  "grove",
  "heath",
  "iris",
  "juniper",
  "kelp",
  "linen",
  "moss",
  "north",
  "olive",
  "pine",
  "quartz",
  "reed",
  "stone",
  "thistle",
  "umber",
  "vale",
  "willow",
  "yarrow",
  "zinc",
  "ash",
  "brook",
  "clay",
] as const

const formatDuration = (duration: number) => {
  const hours = Math.floor(duration / 3600)
  const minutes = Math.floor((duration % 3600) / 60)
  const seconds = duration % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`
}

const formatDate = (date: string) => {
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? date : dateFormatter.format(parsed)
}

const initials = (title: string) =>
  title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()

function CreatorAvatar({
  creator,
  size = "normal",
}: {
  readonly creator: CreatorSummary
  readonly size?: "normal" | "small"
}) {
  const [failed, setFailed] = useState(false)

  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {failed ? (
        <span className="avatar__fallback">{initials(creator.title)}</span>
      ) : (
        <img src={creator.avatarUrl} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  )
}

function AssetCard({
  asset,
  onBroken,
}: {
  readonly asset: Asset
  readonly onBroken: (id: string) => void
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <a
      className="asset-card"
      href={asset.youtubeUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Watch ${asset.title} by ${asset.creatorTitle} on YouTube`}
    >
      <img
        className={loaded ? "asset-card__image is-loaded" : "asset-card__image"}
        src={asset.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => onBroken(asset.id)}
      />
      <span className="asset-card__duration">{formatDuration(asset.durationSeconds)}</span>
      <span className="asset-card__overlay" aria-hidden="true">
        <span className="asset-card__eyebrow">
          <img src={asset.creatorAvatarUrl} alt="" />
          <span className="asset-card__creator-name">{asset.creatorTitle}</span>
        </span>
        <span className="asset-card__title">{asset.title}</span>
        <span className="asset-card__stats">
          {compactNumber.format(Number(asset.viewCount))} views
          <span>·</span>
          {formatDate(asset.publishedAt)}
        </span>
      </span>
    </a>
  )
}

function SkeletonGrid() {
  return (
    <div className="asset-grid" aria-hidden="true">
      {skeletonIds.map((id) => (
        <div className="asset-skeleton" key={id} />
      ))}
    </div>
  )
}

export default function App() {
  const [creators, setCreators] = useState<ReadonlyArray<CreatorSummary>>([])
  const [creatorsFailed, setCreatorsFailed] = useState(false)
  const [creatorId, setCreatorId] = useState<string>()
  const [sort, setSort] = useState<SortOrder>("random")
  const [assets, setAssets] = useState<ReadonlyArray<Asset>>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)

  const selectedCreator = useMemo(
    () => creators.find((creator) => creator.id === creatorId),
    [creatorId, creators],
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchCreators(controller.signal).then(
      (result) => setCreators(result),
      (fetchError: unknown) => {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setCreatorsFailed(true)
        }
      },
    )
    return () => controller.abort()
  }, [])

  const loadInitial = useCallback(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    const controller = new AbortController()

    setLoading(true)
    loadingMoreRef.current = false
    setLoadingMore(false)
    setError(false)
    setLoadMoreFailed(false)
    setAssets([])
    setNextCursor(undefined)

    fetchAssets({ ...(creatorId ? { creatorId } : {}), sort }, controller.signal).then(
      (page) => {
        if (generation !== generationRef.current) return
        setAssets(page.items)
        setNextCursor(page.nextCursor)
        setTotal(page.total)
        setLoading(false)
      },
      (fetchError: unknown) => {
        if (generation !== generationRef.current) return
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setError(true)
          setLoading(false)
        }
      },
    )

    return controller
  }, [creatorId, sort])

  useEffect(() => {
    const controller = loadInitial()
    return () => controller.abort()
  }, [loadInitial])

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMoreRef.current) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreFailed(false)

    fetchAssets({ ...(creatorId ? { creatorId } : {}), sort, cursor: nextCursor })
      .then(
        (page) => {
          if (generation !== generationRef.current) return
          setAssets((current) => [...current, ...page.items])
          setNextCursor(page.nextCursor)
          setTotal(page.total)
        },
        () => {
          if (generation === generationRef.current) setLoadMoreFailed(true)
        },
      )
      .finally(() => {
        if (generation === generationRef.current) {
          loadingMoreRef.current = false
          setLoadingMore(false)
        }
      })
  }, [creatorId, nextCursor, sort])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore()
      },
      { rootMargin: "900px 0px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  useEffect(() => {
    let previousY = window.scrollY
    const onScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - previousY
      if (currentY < 40 || delta < -8) setHeaderVisible(true)
      else if (currentY > 140 && delta > 8) setHeaderVisible(false)
      previousY = currentY
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const hideBrokenAsset = useCallback((id: string) => {
    setAssets((current) => current.filter((asset) => asset.id !== id))
    setTotal((current) => Math.max(0, current - 1))
  }, [])

  return (
    <div className="explorer-shell">
      <header className={headerVisible ? "explorer-header is-visible" : "explorer-header"}>
        <div className="explorer-header__bar">
          <div className="brand-block">
            <span className="brand-block__mark">A</span>
            <div>
              <h1>Assets Explorer</h1>
              <p>
                {selectedCreator ? selectedCreator.title : "The full video corpus"}
                <span className="brand-block__divider"> / </span>
                {compactNumber.format(total)} assets
              </p>
            </div>
          </div>

          <label className="sort-control">
            <span className="sort-control__label">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}>
              {sortOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </label>
        </div>

        <nav className="creator-filter" aria-label="Filter by creator">
          <button
            type="button"
            className={!creatorId ? "creator-chip is-selected" : "creator-chip"}
            onClick={() => setCreatorId(undefined)}
            aria-pressed={!creatorId}
          >
            <span className="avatar avatar--normal avatar--all">ALL</span>
            <span className="creator-chip__text">
              <strong>All creators</strong>
              <span className="creator-chip__count">
                {compactNumber.format(
                  creators.reduce((sum, creator) => sum + creator.assetCount, 0),
                )}
              </span>
            </span>
          </button>
          {creators.map((creator) => (
            <button
              type="button"
              className={creator.id === creatorId ? "creator-chip is-selected" : "creator-chip"}
              key={creator.id}
              onClick={() => setCreatorId(creator.id)}
              aria-pressed={creator.id === creatorId}
            >
              <CreatorAvatar creator={creator} />
              <span className="creator-chip__text">
                <strong>{creator.title}</strong>
                <span className="creator-chip__count">
                  {compactNumber.format(creator.assetCount)}
                </span>
              </span>
            </button>
          ))}
          {creatorsFailed && <span className="creator-filter__error">Creators unavailable</span>}
        </nav>
      </header>

      <main>
        {loading ? <SkeletonGrid /> : null}
        {!loading && assets.length > 0 ? (
          <div className="asset-grid">
            {assets.map((asset) => (
              <AssetCard asset={asset} onBroken={hideBrokenAsset} key={asset.id} />
            ))}
          </div>
        ) : null}
        {!loading && error && assets.length === 0 ? (
          <section className="status-panel">
            <span>Couldn’t read the local library.</span>
            <button type="button" onClick={loadInitial}>
              Try again
            </button>
          </section>
        ) : null}
        {!loading && !error && assets.length === 0 ? (
          <section className="status-panel">No playable assets found.</section>
        ) : null}
        <div className="load-sentinel" ref={sentinelRef}>
          {loadingMore ? <span>Loading more assets…</span> : null}
          {loadMoreFailed && !loadingMore ? (
            <button type="button" className="load-sentinel__retry" onClick={loadMore}>
              Loading more failed — try again
            </button>
          ) : null}
          {!nextCursor && assets.length > 0 ? <span>End of corpus</span> : null}
        </div>
      </main>
    </div>
  )
}
