# MovieLens Analytics Architecture

## Working local demo

The current demo keeps the app reliable without external Big Data services:

```text
deterministic Python generator
          ↓
clean + validate + deduplicate
          ↓
MongoDB (movies, viewing_events, pipeline_runs)
          ↓
FastAPI analytics endpoints
          ↓
React + TypeScript dashboard
```

The pipeline applies stable IDs, validates the generated fields, removes repeated
`movie_id + user_id + watched_at` activity rows, and stores a run summary. A GET
analytics request lazily creates the dataset if MongoDB is empty, so the preview
never depends on a manual seed command.

## Big Data extension for viva / production discussion

```text
Kafka producer → Kafka consumer → HDFS raw zone
                                  ↓
                           Spark cleaning jobs
                                  ↓
                              Hive tables
                                  ↓
                       MongoDB analytics snapshots
                                  ↓
                             FastAPI / React
```

- Kafka is the ingestion boundary for high-volume viewing activity.
- HDFS is the durable raw and cleansed data lake.
- Spark owns distributed validation, deduplication, feature creation, and trend scoring.
- Hive exposes SQL-friendly aggregates for reporting and college viva queries.
- MongoDB remains the low-latency metadata/snapshot store consumed by the app.
- If any connector is unavailable, the local mode remains the safe fallback; the API contract does not change.