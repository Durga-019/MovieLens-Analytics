"""Local demo analytics API with a deterministic, Mongo-backed dataset."""

from collections import Counter, defaultdict
from datetime import datetime, timezone
import asyncio
import re
import uuid

from fastapi import APIRouter, Query

from lib.db import db
from models.analytics import (
    ApiRoot,
    FilterOptions,
    GenreAnalytics,
    MovieAnalytics,
    OverviewAnalytics,
    PipelineRunResponse,
    PlatformAnalytics,
    PreferenceAnalytics,
    RatingBucket,
    SearchResponse,
    TrendPoint,
    TrendingMovie,
)


router = APIRouter()
_seed_lock = asyncio.Lock()

MOVIE_SEEDS = [
    ("Neon Harbor", 2024, "Drama", "Streamly", "English", 8.7, 841, 18200, 128),
    ("The Last Orchard", 2023, "Drama", "PrimeBox", "English", 8.4, 622, 14900, 116),
    ("Paper Moons", 2025, "Romance", "CineMax", "English", 8.1, 1210, 22600, 104),
    ("Signal Lost", 2024, "Sci-Fi", "Streamly", "English", 8.8, 932, 21100, 121),
    ("Monsoon Protocol", 2022, "Action", "ViewNow", "Hindi", 7.9, 488, 13100, 136),
    ("Small Town Static", 2021, "Comedy", "PrimeBox", "English", 7.6, 371, 9800, 97),
    ("Afterlight", 2025, "Sci-Fi", "Streamly", "English", 8.5, 733, 19400, 112),
    ("Blue Hour", 2023, "Thriller", "CineMax", "Spanish", 8.0, 519, 11700, 109),
    ("Atlas of Rain", 2020, "Documentary", "EarthView", "English", 8.9, 286, 7200, 91),
    ("The Quiet Algorithm", 2024, "Documentary", "EarthView", "English", 8.6, 402, 10100, 88),
    ("Velvet Ropes", 2022, "Romance", "FlixHub", "French", 7.8, 339, 8300, 118),
    ("Redline Sunday", 2025, "Action", "ViewNow", "English", 8.2, 1104, 20100, 124),
    ("Mango Season", 2021, "Comedy", "FlixHub", "Tamil", 7.7, 450, 11600, 102),
    ("Northbound", 2023, "Adventure", "PrimeBox", "English", 8.3, 657, 15300, 132),
    ("House of Echoes", 2024, "Thriller", "CineMax", "English", 8.1, 812, 17600, 107),
    ("Little Satellites", 2025, "Adventure", "Streamly", "English", 8.6, 1294, 24800, 115),
    ("Midnight Masala", 2022, "Comedy", "ViewNow", "Hindi", 7.5, 612, 13800, 99),
    ("A Map for Tomorrow", 2020, "Adventure", "EarthView", "English", 8.2, 221, 6100, 126),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _movie_documents() -> list[dict]:
    documents = []
    for index, seed in enumerate(MOVIE_SEEDS, start=1):
        title, year, genre, platform, language, rating, rating_count, views, duration = seed
        documents.append(
            {
                "id": f"movie-{index:02d}",
                "title": title,
                "year": year,
                "genre": genre,
                "platform": platform,
                "language": language,
                "rating": rating,
                "rating_count": rating_count,
                "views": views,
                "duration_minutes": duration,
                "release_date": f"{year}-{(index % 11) + 1:02d}-{(index % 24) + 1:02d}",
            }
        )
    return documents


def _event_documents(movies: list[dict]) -> tuple[list[dict], int]:
    raw_events: list[dict] = []
    for index in range(260):
        movie = movies[index % len(movies)]
        month = (index % 6) + 1
        day = (index % 26) + 1
        hour = (index * 3) % 24
        timestamp = f"2025-{month:02d}-{day:02d}T{hour:02d}:00:00Z"
        event = {
            "id": f"event-{index:03d}",
            "movie_id": movie["id"],
            "user_id": f"viewer-{(index * 7) % 43:02d}",
            "watched_at": timestamp,
            "watch_minutes": min(movie["duration_minutes"], 42 + (index * 11) % 90),
            "platform": movie["platform"],
            "genre": movie["genre"],
        }
        raw_events.append(event)
        if index > 0 and index % 31 == 0:
            raw_events.append(event.copy())

    deduped: dict[tuple[str, str, str], dict] = {}
    for event in raw_events:
        key = (event["movie_id"], event["user_id"], event["watched_at"])
        deduped[key] = event
    return list(deduped.values()), len(raw_events) - len(deduped)


async def run_local_pipeline() -> PipelineRunResponse:
    movies = _movie_documents()
    events, duplicates_removed = _event_documents(movies)
    generated_at = _now_iso()

    await db.movies.delete_many({})
    await db.viewing_events.delete_many({})
    await db.movies.insert_many(movies)
    await db.viewing_events.insert_many(events)
    response = PipelineRunResponse(
        success=True,
        mode="local_demo",
        generated_at=generated_at,
        movies_ingested=len(movies),
        events_processed=len(events),
        rows_cleaned=len(events),
        duplicates_removed=duplicates_removed,
        message="Demo dataset generated, cleaned, deduplicated, and indexed for analysis.",
    )
    await db.pipeline_runs.insert_one(response.model_dump())
    return response


async def _ensure_dataset() -> None:
    if await db.movies.count_documents({}) > 0:
        return
    async with _seed_lock:
        if await db.movies.count_documents({}) == 0:
            await run_local_pipeline()


async def _all_movies() -> list[dict]:
    await _ensure_dataset()
    return await db.movies.find({}, {"_id": 0}).to_list(1000)


async def _all_events() -> list[dict]:
    await _ensure_dataset()
    return await db.viewing_events.find({}, {"_id": 0}).to_list(2000)


def _matches(movie: dict, platform: str | None, genre: str | None, year: int | None,
             language: str | None, min_rating: float, min_views: int) -> bool:
    return (
        (not platform or movie["platform"].casefold() == platform.casefold())
        and (not genre or movie["genre"].casefold() == genre.casefold())
        and (not year or movie["year"] == year)
        and (not language or movie["language"].casefold() == language.casefold())
        and movie["rating"] >= min_rating
        and movie["views"] >= min_views
    )


def _trend_score(movie: dict) -> float:
    # Guardrails: rating_count prevents a small sample from dominating; views anchor recency/popularity.
    rating_signal = movie["rating"] / 10
    vote_confidence = min(movie["rating_count"] / 500, 1)
    view_signal = min(movie["views"] / 25000, 1)
    freshness = 1 if movie["year"] >= 2024 else 0.75 if movie["year"] >= 2022 else 0.55
    return round((view_signal * 0.45 + rating_signal * vote_confidence * 0.35 + freshness * 0.2) * 100, 1)


def _movie_model(movie: dict) -> MovieAnalytics:
    return MovieAnalytics(**movie, trend_score=_trend_score(movie))


def _filtered_movies(movies: list[dict], platform: str | None, genre: str | None, year: int | None,
                     language: str | None, min_rating: float, min_views: int) -> list[dict]:
    selected = [m for m in movies if _matches(m, platform, genre, year, language, min_rating, min_views)]
    return sorted(selected, key=lambda movie: movie["views"], reverse=True)


async def _last_pipeline_at() -> str | None:
    run = await db.pipeline_runs.find_one({}, {"_id": 0}, sort=[("generated_at", -1)])
    return run["generated_at"] if run else None


@router.get("/", response_model=ApiRoot)
async def root() -> ApiRoot:
    return ApiRoot(message="MovieLens local analytics API", mode="local_demo")


@router.post("/run-pipeline", response_model=PipelineRunResponse)
async def run_pipeline() -> PipelineRunResponse:
    async with _seed_lock:
        return await run_local_pipeline()


@router.get("/overview", response_model=OverviewAnalytics)
async def overview() -> OverviewAnalytics:
    movies = await _all_movies()
    events = await _all_events()
    genre_views = Counter(movie["genre"] for movie in movies for _ in range(max(1, movie["views"] // 1000)))
    platform_views = Counter(movie["platform"] for movie in movies for _ in range(max(1, movie["views"] // 1000)))
    return OverviewAnalytics(
        total_titles=len(movies),
        total_views=sum(movie["views"] for movie in movies),
        average_rating=round(sum(movie["rating"] for movie in movies) / len(movies), 1) if movies else 0,
        platforms=len({movie["platform"] for movie in movies}),
        genres=len({movie["genre"] for movie in movies}),
        active_users=len({event["user_id"] for event in events}),
        top_genre=genre_views.most_common(1)[0][0] if genre_views else "—",
        top_platform=platform_views.most_common(1)[0][0] if platform_views else "—",
        last_pipeline_at=await _last_pipeline_at(),
    )


@router.get("/movies", response_model=list[MovieAnalytics])
async def movies(
    platform: str | None = None,
    genre: str | None = None,
    year: int | None = None,
    language: str | None = None,
    min_rating: float = 0,
    min_views: int = 0,
) -> list[MovieAnalytics]:
    return [_movie_model(movie) for movie in _filtered_movies(await _all_movies(), platform, genre, year, language, min_rating, min_views)]


@router.get("/genres", response_model=list[GenreAnalytics])
async def genres(
    platform: str | None = None,
    genre: str | None = None,
    year: int | None = None,
    language: str | None = None,
    min_rating: float = 0,
    min_views: int = 0,
) -> list[GenreAnalytics]:
    selected = _filtered_movies(await _all_movies(), platform, genre, year, language, min_rating, min_views)
    total_views = sum(movie["views"] for movie in selected) or 1
    grouped: dict[str, list[dict]] = defaultdict(list)
    for movie in selected:
        grouped[movie["genre"]].append(movie)
    return [
        GenreAnalytics(
            name=name,
            title_count=len(items),
            views=sum(item["views"] for item in items),
            average_rating=round(sum(item["rating"] for item in items) / len(items), 1),
            share=round(sum(item["views"] for item in items) / total_views * 100, 1),
        )
        for name, items in sorted(grouped.items(), key=lambda entry: sum(item["views"] for item in entry[1]), reverse=True)
    ]


@router.get("/ratings", response_model=list[RatingBucket])
async def ratings() -> list[RatingBucket]:
    movies = await _all_movies()
    buckets = [("6.0–6.9", 6, 6.99), ("7.0–7.9", 7, 7.99), ("8.0–8.9", 8, 8.99), ("9.0+", 9, 10)]
    return [RatingBucket(label=label, count=sum(1 for movie in movies if low <= movie["rating"] <= high)) for label, low, high in buckets]


@router.get("/trends", response_model=list[TrendPoint])
async def trends() -> list[TrendPoint]:
    events = await _all_events()
    grouped: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        date = datetime.fromisoformat(event["watched_at"].replace("Z", "+00:00"))
        grouped[date.strftime("%b")].append(event)
    order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    return [
        TrendPoint(
            label=label,
            views=len(grouped[label]),
            watch_minutes=sum(event["watch_minutes"] for event in grouped[label]),
            active_users=len({event["user_id"] for event in grouped[label]}),
        )
        for label in order if label in grouped
    ]


@router.get("/platforms", response_model=list[PlatformAnalytics])
async def platforms() -> list[PlatformAnalytics]:
    movies = await _all_movies()
    grouped: dict[str, list[dict]] = defaultdict(list)
    for movie in movies:
        grouped[movie["platform"]].append(movie)
    return [
        PlatformAnalytics(
            name=name,
            titles=len(items),
            views=sum(item["views"] for item in items),
            average_rating=round(sum(item["rating"] for item in items) / len(items), 1),
            popular_genre=Counter(item["genre"] for item in items).most_common(1)[0][0],
        )
        for name, items in sorted(grouped.items(), key=lambda entry: sum(item["views"] for item in entry[1]), reverse=True)
    ]


@router.get("/preferences", response_model=list[PreferenceAnalytics])
async def preferences() -> list[PreferenceAnalytics]:
    movies = await _all_movies()
    rows = sorted(movies, key=lambda movie: movie["views"], reverse=True)[:8]
    return [
        PreferenceAnalytics(
            genre=movie["genre"],
            platform=movie["platform"],
            average_rating=movie["rating"],
            views=movie["views"],
            viewing_frequency="High" if movie["views"] > 15000 else "Steady",
        )
        for movie in rows
    ]


@router.get("/trending", response_model=list[TrendingMovie])
async def trending() -> list[TrendingMovie]:
    movies = sorted(await _all_movies(), key=_trend_score, reverse=True)
    return [
        TrendingMovie(
            **movie,
            trend_score=_trend_score(movie),
            explanation=f"Strong {movie['rating']:.1f} rating with {movie['rating_count']:,} ratings and a healthy viewing signal.",
        )
        for movie in movies[:8]
    ]


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(default=""), limit: int = Query(default=8, ge=1, le=20)) -> SearchResponse:
    normalized = re.sub(r"\s+", " ", q.casefold()).strip()
    items = []
    for movie in await _all_movies():
        haystack = " ".join([movie["title"], movie["genre"], movie["platform"], movie["language"]]).casefold()
        if not normalized or normalized in haystack:
            items.append(_movie_model(movie))
    return SearchResponse(query=q, items=sorted(items, key=lambda item: item.views, reverse=True)[:limit])


@router.get("/filters", response_model=FilterOptions)
async def filters() -> FilterOptions:
    movies = await _all_movies()
    return FilterOptions(
        platforms=sorted({movie["platform"] for movie in movies}),
        genres=sorted({movie["genre"] for movie in movies}),
        years=sorted({movie["year"] for movie in movies}, reverse=True),
        languages=sorted({movie["language"] for movie in movies}),
    )