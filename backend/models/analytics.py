from pydantic import BaseModel, Field


class MovieAnalytics(BaseModel):
    id: str
    title: str
    year: int
    genre: str
    platform: str
    language: str
    rating: float
    rating_count: int
    views: int
    duration_minutes: int
    release_date: str
    trend_score: float = 0


class OverviewAnalytics(BaseModel):
    total_titles: int
    total_views: int
    average_rating: float
    platforms: int
    genres: int
    active_users: int
    top_genre: str
    top_platform: str
    last_pipeline_at: str | None = None
    mode: str = "local_demo"


class GenreAnalytics(BaseModel):
    name: str
    title_count: int
    views: int
    average_rating: float
    share: float


class RatingBucket(BaseModel):
    label: str
    count: int


class TrendPoint(BaseModel):
    label: str
    views: int
    watch_minutes: int
    active_users: int


class PlatformAnalytics(BaseModel):
    name: str
    titles: int
    views: int
    average_rating: float
    popular_genre: str


class PreferenceAnalytics(BaseModel):
    genre: str
    platform: str
    average_rating: float
    views: int
    viewing_frequency: str


class TrendingMovie(MovieAnalytics):
    explanation: str


class SearchResponse(BaseModel):
    query: str
    items: list[MovieAnalytics]


class FilterOptions(BaseModel):
    platforms: list[str]
    genres: list[str]
    years: list[int]
    languages: list[str]


class PipelineRunResponse(BaseModel):
    success: bool
    mode: str
    generated_at: str
    movies_ingested: int
    events_processed: int
    rows_cleaned: int
    duplicates_removed: int
    message: str


class ApiRoot(BaseModel):
    message: str
    mode: str