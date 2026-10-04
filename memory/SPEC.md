# MovieLens Analytics — Living Spec

## Product
MovieLens Analytics is a demo-friendly movie and OTT analysis dashboard. It uses a deterministic local Python pipeline backed by MongoDB, exposes analytics through FastAPI, and renders a warm cream React dashboard.

## Data model
- `movies`: normalized title metadata, genre, platform, language, rating, rating count, views, runtime, and release date.
- `viewing_events`: deduplicated viewing activity used for monthly trends and active-user counts.
- `pipeline_runs`: local pipeline run metadata and cleaning counters.

## Key flows
1. Any analytics GET lazily creates the deterministic local dataset when MongoDB is empty.
2. “Run local pipeline” regenerates the dataset, removes duplicate activity rows, stores clean records, and invalidates dashboard queries.
3. Overview, movies, genres, ratings, trends, platforms, preferences, trending, search, and filter options are served from `/api`.
4. Dashboard filters apply to movie, genre, and overview tables/charts; search normalizes casing and spacing.

## Auth
No authentication or gated roles in the demo MVP.

## Mode
`local_demo` is the working mode. Kafka → HDFS → Spark → Hive is documented as the future Big Data path; the UI does not pretend those services are live.