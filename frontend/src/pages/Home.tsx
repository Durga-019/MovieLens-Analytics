import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Film,
  LayoutDashboard,
  Monitor,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tags,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";

interface OverviewAnalytics {
  total_titles: number;
  total_views: number;
  average_rating: number;
  platforms: number;
  genres: number;
  active_users: number;
  top_genre: string;
  top_platform: string;
  last_pipeline_at: string | null;
  mode: string;
}

interface MovieAnalytics {
  id: string;
  title: string;
  year: number;
  genre: string;
  platform: string;
  language: string;
  rating: number;
  rating_count: number;
  views: number;
  duration_minutes: number;
  release_date: string;
  trend_score: number;
}

interface GenreAnalytics {
  name: string;
  title_count: number;
  views: number;
  average_rating: number;
  share: number;
}

interface RatingBucket {
  label: string;
  count: number;
}

interface TrendPoint {
  label: string;
  views: number;
  watch_minutes: number;
  active_users: number;
}

interface PlatformAnalytics {
  name: string;
  titles: number;
  views: number;
  average_rating: number;
  popular_genre: string;
}

interface PreferenceAnalytics {
  genre: string;
  platform: string;
  average_rating: number;
  views: number;
  viewing_frequency: string;
}

interface TrendingMovie extends MovieAnalytics {
  explanation: string;
}

interface SearchResponse {
  query: string;
  items: MovieAnalytics[];
}

interface FilterOptions {
  platforms: string[];
  genres: string[];
  years: number[];
  languages: string[];
}

interface PipelineRunResponse {
  success: boolean;
  mode: string;
  generated_at: string;
  movies_ingested: number;
  events_processed: number;
  rows_cleaned: number;
  duplicates_removed: number;
  message: string;
}

type Section = "overview" | "movies" | "trends" | "genres" | "platforms" | "preferences";
type FilterState = { platform: string; genre: string; year: string; language: string; minRating: string; minViews: string };

const initialFilters: FilterState = {
  platform: "all",
  genre: "all",
  year: "all",
  language: "all",
  minRating: "0",
  minViews: "0",
};

const navItems: { id: Section; label: string; caption: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", caption: "The full picture", icon: LayoutDashboard },
  { id: "movies", label: "Movies", caption: "Title performance", icon: Film },
  { id: "trends", label: "Viewing trends", caption: "Momentum over time", icon: BarChart3 },
  { id: "genres", label: "Genres", caption: "Audience appetite", icon: Tags },
  { id: "platforms", label: "Platforms", caption: "Where titles win", icon: Monitor },
  { id: "preferences", label: "Preferences", caption: "Viewer signals", icon: Users },
];

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
const compactNumber = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function filterQuery(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.platform !== "all") params.set("platform", filters.platform);
  if (filters.genre !== "all") params.set("genre", filters.genre);
  if (filters.year !== "all") params.set("year", filters.year);
  if (filters.language !== "all") params.set("language", filters.language);
  if (filters.minRating !== "0") params.set("min_rating", filters.minRating);
  if (filters.minViews !== "0") params.set("min_views", filters.minViews);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function QueryHint({ hasError, empty }: { hasError: boolean; empty: boolean }) {
  if (hasError) {
    return <p data-testid="analytics-connection-error" className="text-sm text-[#8b4e31]">The analytics service is taking a moment. The dashboard shell is still ready.</p>;
  }
  if (empty) {
    return <p data-testid="analytics-empty-state" className="text-sm text-[#817a6e]">No records match these filters. Try widening the view.</p>;
  }
  return null;
}

function KpiCard({ label, value, note, icon: Icon, accent }: { label: string; value: string; note: string; icon: typeof Eye; accent?: boolean }) {
  return (
    <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }} data-testid={`kpi-${label.toLowerCase().replaceAll(" ", "-")}-card`}>
      <Card className={`border-[#e8e0d1] bg-white shadow-[0_14px_40px_rgba(70,52,28,0.05)] ${accent ? "ring-2 ring-[#f2c75c]/40" : ""}`}>
        <CardContent className="flex items-start justify-between p-5">
          <div>
            <p data-testid={`kpi-${label.toLowerCase().replaceAll(" ", "-")}-label`} className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#928879]">{label}</p>
            <p data-testid={`kpi-${label.toLowerCase().replaceAll(" ", "-")}-value`} className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-[#24231f]">{value}</p>
            <p data-testid={`kpi-${label.toLowerCase().replaceAll(" ", "-")}-note`} className="mt-1 text-xs text-[#928879]">{note}</p>
          </div>
          <div className={`rounded-2xl p-3 ${accent ? "bg-[#fff3c9] text-[#a66f00]" : "bg-[#f7f3eb] text-[#817a6e]"}`}>
            <Icon size={18} strokeWidth={1.8} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FilterBar({ filters, setFilters, options }: { filters: FilterState; setFilters: (filters: FilterState) => void; options?: FilterOptions }) {
  const update = (key: keyof FilterState, value: string) => setFilters({ ...filters, [key]: value });
  const valueLabel = (value: string, fallback: string) => (value === "all" ? fallback : value);
  return (
    <div data-testid="global-filter-bar" className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#e8e0d1] bg-[#fbf8f1] p-3">
      <div data-testid="filter-bar-label" className="mr-1 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.13em] text-[#928879]"><Sparkles size={14} />Filters</div>
      <Select value={filters.platform} onValueChange={(value) => update("platform", value)}>
        <SelectTrigger data-testid="filter-platform-select" className="w-[148px] bg-white"><SelectValue>{(value) => valueLabel(value as string, "All platforms")}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="all">All platforms</SelectItem>{options?.platforms.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.genre} onValueChange={(value) => update("genre", value)}>
        <SelectTrigger data-testid="filter-genre-select" className="w-[142px] bg-white"><SelectValue>{(value) => valueLabel(value as string, "All genres")}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="all">All genres</SelectItem>{options?.genres.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.year} onValueChange={(value) => update("year", value)}>
        <SelectTrigger data-testid="filter-year-select" className="w-[112px] bg-white"><SelectValue>{(value) => valueLabel(value as string, "All years")}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="all">All years</SelectItem>{options?.years.map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.language} onValueChange={(value) => update("language", value)}>
        <SelectTrigger data-testid="filter-language-select" className="w-[128px] bg-white"><SelectValue>{(value) => valueLabel(value as string, "All languages")}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="all">All languages</SelectItem>{options?.languages.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Input data-testid="filter-min-rating-input" aria-label="Minimum rating" value={filters.minRating} onChange={(event) => update("minRating", event.target.value)} type="number" min="0" max="10" step="0.1" className="h-8 w-[112px] bg-white" placeholder="Min rating" />
      <Input data-testid="filter-min-views-input" aria-label="Minimum views" value={filters.minViews} onChange={(event) => update("minViews", event.target.value)} type="number" min="0" step="1000" className="h-8 w-[120px] bg-white" placeholder="Min views" />
      <Button data-testid="filter-reset-button" variant="ghost" size="sm" onClick={() => setFilters(initialFilters)} className="ml-auto text-[#817a6e] hover:text-[#24231f]"><RefreshCw size={14} />Reset</Button>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div data-testid={`section-header-${eyebrow.toLowerCase().replaceAll(" ", "-")}`} className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p data-testid="section-eyebrow" className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#b07b18]">{eyebrow}</p><h2 data-testid="section-title" className="mt-2 font-heading text-3xl font-semibold tracking-[-0.045em] text-[#24231f]">{title}</h2><p data-testid="section-description" className="mt-2 max-w-xl text-sm leading-6 text-[#817a6e]">{description}</p></div>{action}</div>;
}

function MovieTable({ movies, empty, onMovieSelect }: { movies: MovieAnalytics[]; empty: boolean; onMovieSelect: (movie: MovieAnalytics) => void }) {
  return <Card data-testid="movies-ranking-card" className="border-[#e8e0d1] bg-white shadow-[0_14px_40px_rgba(70,52,28,0.05)]"><CardHeader className="border-b border-[#f0eadf] px-5 py-4"><CardTitle data-testid="movies-ranking-title" className="text-base">Most viewed titles</CardTitle><CardDescription data-testid="movies-ranking-description">Popularity with rating quality kept in view</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow className="border-[#f0eadf] hover:bg-transparent"><TableHead data-testid="movie-table-title-heading">Title</TableHead><TableHead data-testid="movie-table-genre-heading">Genre</TableHead><TableHead data-testid="movie-table-platform-heading">Platform</TableHead><TableHead data-testid="movie-table-rating-heading">Rating</TableHead><TableHead data-testid="movie-table-views-heading" className="text-right">Views</TableHead></TableRow></TableHeader><TableBody>{movies.map((movie, index) => <TableRow key={movie.id} data-testid={`movie-row-${movie.id}`} className="border-[#f0eadf] cursor-pointer" onClick={() => onMovieSelect(movie)}><TableCell data-testid={`movie-title-${movie.id}`}><div className="flex items-center gap-3"><span data-testid={`movie-rank-${movie.id}`} className="w-5 text-xs font-semibold text-[#b5ab9b]">{String(index + 1).padStart(2, "0")}</span><div><p data-testid={`movie-name-${movie.id}`} className="font-medium text-[#2c2b27]">{movie.title}</p><p data-testid={`movie-meta-${movie.id}`} className="mt-0.5 text-xs text-[#aaa091]">{movie.year} · {movie.duration_minutes} min</p></div></div></TableCell><TableCell data-testid={`movie-genre-${movie.id}`}><Badge variant="outline" className="border-[#e7dec9] bg-[#fcfaf5] text-[#817a6e]">{movie.genre}</Badge></TableCell><TableCell data-testid={`movie-platform-${movie.id}`} className="text-sm text-[#625d54]">{movie.platform}</TableCell><TableCell data-testid={`movie-rating-${movie.id}`}><span className="inline-flex items-center gap-1 text-sm font-semibold text-[#5f4a18]"><Star size={13} fill="currentColor" />{movie.rating.toFixed(1)}</span></TableCell><TableCell data-testid={`movie-views-${movie.id}`} className="text-right font-semibold text-[#34312c]">{compactNumber(movie.views)}</TableCell></TableRow>)}{empty && <TableRow><TableCell data-testid="movies-table-empty" colSpan={5} className="h-36 text-center text-sm text-[#817a6e]">No titles match the active filters.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>;
}

function Home() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMovie, setSelectedMovie] = useState<MovieAnalytics | null>(null);

  const optionsQuery = useQuery({ queryKey: ["filters"], queryFn: () => apiGet<FilterOptions>("/filters"), retry: false });
  const overviewQuery = useQuery({ queryKey: ["overview", filterQuery(filters)], queryFn: () => apiGet<OverviewAnalytics>(`/overview${filterQuery(filters)}`), retry: false });
  const moviesQuery = useQuery({ queryKey: ["movies", filterQuery(filters)], queryFn: () => apiGet<MovieAnalytics[]>(`/movies${filterQuery(filters)}`), retry: false });
  const genresQuery = useQuery({ queryKey: ["genres", filterQuery(filters)], queryFn: () => apiGet<GenreAnalytics[]>(`/genres${filterQuery(filters)}`), retry: false });
  const trendsQuery = useQuery({ queryKey: ["trends"], queryFn: () => apiGet<TrendPoint[]>("/trends"), retry: false });
  const ratingsQuery = useQuery({ queryKey: ["ratings"], queryFn: () => apiGet<RatingBucket[]>("/ratings"), retry: false });
  const platformsQuery = useQuery({ queryKey: ["platforms"], queryFn: () => apiGet<PlatformAnalytics[]>("/platforms"), retry: false });
  const preferencesQuery = useQuery({ queryKey: ["preferences"], queryFn: () => apiGet<PreferenceAnalytics[]>("/preferences"), retry: false });
  const trendingQuery = useQuery({ queryKey: ["trending"], queryFn: () => apiGet<TrendingMovie[]>("/trending"), retry: false });
  const searchQuery = useQuery({ queryKey: ["search", searchTerm], queryFn: () => apiGet<SearchResponse>(`/search?q=${encodeURIComponent(searchTerm)}`), enabled: Boolean(searchTerm), retry: false });

  const pipelineMutation = useMutation({
    mutationFn: () => apiPost<PipelineRunResponse>("/run-pipeline"),
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      toast.success("Local pipeline refreshed", { description: `${result.movies_ingested} titles are ready for analysis.` });
    },
    onError: () => toast.error("Pipeline could not run", { description: "Check that the local API is available and try again." }),
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };
  const movies = moviesQuery.data ?? [];
  const hasAnyError = overviewQuery.isError || moviesQuery.isError;
  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0];

  return <div data-testid="movie-analytics-app" className="min-h-svh bg-[#f6f1e8] text-[#24231f]">
    <div className="mx-auto flex min-h-svh max-w-[1600px]">
      <aside data-testid="sidebar-navigation" className="hidden w-[250px] shrink-0 border-r border-[#e9e1d4] bg-[#f9f5ed] px-5 py-7 lg:flex lg:flex-col">
        <div data-testid="brand-mark" className="flex items-center gap-3 px-2"><div className="flex size-10 items-center justify-center rounded-2xl bg-[#24231f] text-[#f8d267] shadow-lg shadow-[#24231f]/10"><Film size={19} /></div><div><p data-testid="brand-name" className="font-heading text-lg font-semibold tracking-[-0.04em]">MovieLens</p><p data-testid="brand-caption" className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a79d8c]">studio analytics</p></div></div>
        <div data-testid="sidebar-mode-card" className="mt-12 rounded-2xl border border-[#eadfc9] bg-[#fffaf0] p-4"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#87a96b] shadow-[0_0_0_4px_#e6f0dc]" /><span data-testid="mode-status-label" className="text-xs font-bold uppercase tracking-[0.12em] text-[#6d8056]">Local demo mode</span></div><p data-testid="mode-status-description" className="mt-3 text-xs leading-5 text-[#817a6e]">A reliable, presentation-ready analytics snapshot powered by the local pipeline.</p></div>
        <nav data-testid="primary-navigation" className="mt-9 space-y-1">{navItems.map((item) => { const Icon = item.icon; const active = activeSection === item.id; return <button data-testid={`nav-${item.id}-button`} key={item.id} type="button" onClick={() => setActiveSection(item.id)} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-[background,transform,color] duration-200 hover:translate-x-0.5 ${active ? "bg-[#24231f] text-white shadow-lg shadow-[#24231f]/10" : "text-[#817a6e] hover:bg-[#f0e9dd] hover:text-[#24231f]"}`}><Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span className="min-w-0 flex-1"><span data-testid={`nav-${item.id}-label`} className="block text-sm font-semibold">{item.label}</span><span data-testid={`nav-${item.id}-caption`} className={`mt-0.5 block text-[10px] ${active ? "text-white/55" : "text-[#b0a797]"}`}>{item.caption}</span></span>{active && <ChevronRight size={14} className="text-[#f8d267]" />}</button>; })}</nav>
        <div data-testid="sidebar-architecture-note" className="mt-auto rounded-2xl bg-[#eee8dc] p-4"><div className="flex items-center gap-2 text-[#655a4a]"><Database size={15} /><span className="text-xs font-semibold">Built for the viva</span></div><p data-testid="architecture-note-description" className="mt-2 text-xs leading-5 text-[#958b7c]">Kafka → HDFS → Spark → Hive remains the documented scale path.</p></div>
      </aside>

      <main className="min-w-0 flex-1">
        <header data-testid="top-header" className="sticky top-0 z-10 border-b border-[#ebe3d7]/80 bg-[#f6f1e8]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3 lg:hidden"><div className="flex size-9 items-center justify-center rounded-xl bg-[#24231f] text-[#f8d267]"><Film size={17} /></div><span data-testid="mobile-brand-name" className="font-heading font-semibold">MovieLens</span></div><div data-testid="breadcrumb-label" className="hidden items-center gap-2 text-sm text-[#a1988a] sm:flex"><span>Workspace</span><ChevronRight size={14} /><span className="font-semibold text-[#4d483f]">{activeNav.label}</span></div><form data-testid="global-search-form" onSubmit={submitSearch} className="ml-auto flex w-full max-w-[390px] items-center gap-2"><div className="relative flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa091]" /><Input data-testid="global-search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, genre, platform…" className="h-9 rounded-xl border-[#e8e0d1] bg-white pl-9 text-sm shadow-none" /></div><Button data-testid="global-search-submit-button" type="submit" size="sm" className="h-9 rounded-xl bg-[#24231f] px-3 text-white hover:bg-[#3b3933]"><Search size={15} /></Button></form></div></header>

        <div className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div data-testid="mobile-section-navigation" className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">{navItems.map((item) => <Button data-testid={`mobile-nav-${item.id}-button`} key={item.id} type="button" variant={activeSection === item.id ? "default" : "outline"} size="sm" onClick={() => setActiveSection(item.id)} className="shrink-0 rounded-xl">{item.label}</Button>)}</div>
          <div data-testid="hero-header" className="mb-8 flex flex-col justify-between gap-6 xl:flex-row xl:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#eadfbe] bg-[#fff8df] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.17em] text-[#a27013]"><Activity size={13} />Live local snapshot</div><h1 data-testid="page-title" className="max-w-3xl font-heading text-4xl font-semibold leading-[1.03] tracking-[-0.055em] text-[#24231f] sm:text-5xl">Know what your audience<br /><span className="text-[#aa7717]">watches next.</span></h1><p data-testid="page-subtitle" className="mt-4 max-w-xl text-[15px] leading-7 text-[#817a6e]">A clear read on movie performance, viewing momentum, and platform opportunity — ready for your next demo or content decision.</p></div><div className="flex items-center gap-3"><div data-testid="last-refresh-status" className="hidden text-right sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#aaa091]">Last pipeline run</p><p data-testid="last-refresh-value" className="mt-1 text-sm font-semibold text-[#625d54]">{overviewQuery.data?.last_pipeline_at ? new Date(overviewQuery.data.last_pipeline_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Waiting for data"}</p></div><Button data-testid="run-pipeline-button" onClick={() => pipelineMutation.mutate()} disabled={pipelineMutation.isPending} className="h-10 rounded-xl bg-[#24231f] px-4 text-white shadow-lg shadow-[#24231f]/10 hover:bg-[#3b3933]">{pipelineMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}<span>{pipelineMutation.isPending ? "Running…" : "Run local pipeline"}</span></Button></div></div>

          <div className="mb-8"><FilterBar filters={filters} setFilters={setFilters} options={optionsQuery.data} /><div className="mt-3"><QueryHint hasError={hasAnyError} empty={!overviewQuery.isLoading && !overviewQuery.data && !hasAnyError} /></div></div>

          {searchTerm && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="search-results-section" className="mb-8"><SectionHeader eyebrow="Search results" title={`Matches for “${searchTerm}”`} description="Search is normalized across title, genre, platform, and language." action={<Button data-testid="clear-search-button" variant="outline" size="sm" onClick={() => { setSearchTerm(""); setSearchInput(""); }} className="rounded-xl border-[#e4dac8] bg-white">Clear search</Button>} />{searchQuery.isLoading && <div data-testid="search-loading-state" className="rounded-2xl border border-[#e8e0d1] bg-white p-6 text-sm text-[#817a6e]">Searching the clean catalog…</div>}{searchQuery.data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{searchQuery.data.items.map((movie) => <button data-testid={`search-result-${movie.id}`} type="button" key={movie.id} onClick={() => setSelectedMovie(movie)} className="rounded-2xl border border-[#e8e0d1] bg-white p-4 text-left shadow-[0_10px_30px_rgba(70,52,28,0.04)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(70,52,28,0.08)]"><div className="flex items-start justify-between gap-3"><div><p data-testid={`search-result-title-${movie.id}`} className="font-semibold text-[#35322c]">{movie.title}</p><p data-testid={`search-result-meta-${movie.id}`} className="mt-1 text-xs text-[#9e9587]">{movie.genre} · {movie.platform}</p></div><span className="inline-flex items-center gap-1 text-xs font-semibold text-[#9f731e]"><Star size={12} fill="currentColor" />{movie.rating.toFixed(1)}</span></div></button>)}</div>}{searchQuery.data?.items.length === 0 && <div data-testid="search-empty-state" className="rounded-2xl border border-dashed border-[#d9cdb9] bg-[#fbf8f1] p-8 text-center text-sm text-[#817a6e]">No titles found. Try a different spelling or search by platform.</div>}</motion.section>}

          {activeSection === "overview" && <OverviewSection overview={overviewQuery.data} genres={genresQuery.data ?? []} trends={trendsQuery.data ?? []} ratings={ratingsQuery.data ?? []} trending={trendingQuery.data ?? []} movies={movies} moviesError={moviesQuery.isError} onMovieSelect={setSelectedMovie} />}
          {activeSection === "movies" && <MoviesSection movies={movies} error={moviesQuery.isError} onMovieSelect={setSelectedMovie} />}
          {activeSection === "trends" && <TrendsSection trends={trendsQuery.data ?? []} error={trendsQuery.isError} />}
          {activeSection === "genres" && <GenresSection genres={genresQuery.data ?? []} error={genresQuery.isError} />}
          {activeSection === "platforms" && <PlatformsSection platforms={platformsQuery.data ?? []} error={platformsQuery.isError} />}
          {activeSection === "preferences" && <PreferencesSection preferences={preferencesQuery.data ?? []} error={preferencesQuery.isError} />}
        </div>
      </main>
    </div>
    {selectedMovie && <div data-testid="movie-detail-overlay" className="fixed inset-0 z-30 flex items-end justify-center bg-[#24231f]/20 p-4 backdrop-blur-sm sm:items-center" onClick={() => setSelectedMovie(null)}><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={(event) => event.stopPropagation()} data-testid="movie-detail-card" className="w-full max-w-lg rounded-3xl border border-[#e8e0d1] bg-[#fffdf9] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><Badge className="bg-[#fff3c9] text-[#8f6716] hover:bg-[#fff3c9]">Title detail</Badge><h3 data-testid="movie-detail-title" className="mt-4 font-heading text-3xl font-semibold tracking-[-0.04em]">{selectedMovie.title}</h3><p data-testid="movie-detail-subtitle" className="mt-2 text-sm text-[#817a6e]">{selectedMovie.genre} · {selectedMovie.platform} · {selectedMovie.language}</p></div><button data-testid="movie-detail-close-button" type="button" onClick={() => setSelectedMovie(null)} className="rounded-full p-2 text-[#9f9688] hover:bg-[#f3ede4]" aria-label="Close movie detail">×</button></div><div className="mt-7 grid grid-cols-3 gap-3"><div data-testid="movie-detail-rating" className="rounded-2xl bg-[#fbf5e5] p-3"><Star size={15} className="text-[#b07b18]" fill="currentColor" /><p className="mt-3 text-xl font-semibold">{selectedMovie.rating.toFixed(1)}</p><p className="text-[11px] text-[#968b7b]">rating</p></div><div data-testid="movie-detail-views" className="rounded-2xl bg-[#f6f2eb] p-3"><Eye size={15} className="text-[#817a6e]" /><p className="mt-3 text-xl font-semibold">{compactNumber(selectedMovie.views)}</p><p className="text-[11px] text-[#968b7b]">views</p></div><div data-testid="movie-detail-trend-score" className="rounded-2xl bg-[#edf3e7] p-3"><ArrowUpRight size={15} className="text-[#6e8d59]" /><p className="mt-3 text-xl font-semibold">{selectedMovie.trend_score}</p><p className="text-[11px] text-[#968b7b]">trend score</p></div></div><p data-testid="movie-detail-description" className="mt-6 border-t border-[#eee7dc] pt-5 text-sm leading-6 text-[#71695d]">Released in {selectedMovie.year}, this {selectedMovie.genre.toLowerCase()} title is finding its audience on {selectedMovie.platform} with {formatNumber(selectedMovie.rating_count)} ratings.</p></motion.div></div>}
  </div>;
}

function OverviewSection({ overview, genres, trends, ratings, trending, movies, moviesError, onMovieSelect }: { overview?: OverviewAnalytics; genres: GenreAnalytics[]; trends: TrendPoint[]; ratings: RatingBucket[]; trending: TrendingMovie[]; movies: MovieAnalytics[]; moviesError: boolean; onMovieSelect: (movie: MovieAnalytics) => void }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="overview-section"><SectionHeader eyebrow="Overview" title="The audience at a glance" description="A balanced snapshot of catalog health, audience demand, and what is gaining momentum." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Total titles" value={overview ? formatNumber(overview.total_titles) : "—"} note="clean titles in catalog" icon={Film} /><KpiCard label="Total views" value={overview ? compactNumber(overview.total_views) : "—"} note="across all platforms" icon={Eye} accent /><KpiCard label="Average rating" value={overview ? overview.average_rating.toFixed(1) : "—"} note="out of 10 · quality signal" icon={Star} /><KpiCard label="Active users" value={overview ? formatNumber(overview.active_users) : "—"} note="unique viewing profiles" icon={Users} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]"><Card data-testid="viewing-momentum-card" className="border-[#e8e0d1] bg-white shadow-[0_14px_40px_rgba(70,52,28,0.05)]"><CardHeader className="flex-row items-start justify-between border-b border-[#f0eadf] px-5 py-4"><div><CardTitle data-testid="viewing-momentum-title">Viewing momentum</CardTitle><CardDescription data-testid="viewing-momentum-description">Monthly views and watch-time signal</CardDescription></div><Badge data-testid="viewing-momentum-badge" variant="outline" className="border-[#d9e5ce] bg-[#f3f8ee] text-[#6e8d59]">6-month window</Badge></CardHeader><CardContent data-testid="viewing-momentum-chart" className="h-[280px] p-5"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trends}><defs><linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eec75b" stopOpacity={0.5} /><stop offset="100%" stopColor="#eec75b" stopOpacity={0.04} /></linearGradient></defs><CartesianGrid stroke="#f1eadf" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eee5d6", boxShadow: "0 10px 24px rgba(70,52,28,.08)" }} /><Area type="monotone" dataKey="views" stroke="#c9942c" strokeWidth={3} fill="url(#viewsFill)" /></AreaChart></ResponsiveContainer></CardContent></Card><Card data-testid="top-trending-card" className="border-[#e8e0d1] bg-[#24231f] text-white shadow-[0_14px_40px_rgba(70,52,28,0.09)]"><CardHeader className="px-5 py-5"><div className="flex items-center justify-between"><CardTitle data-testid="top-trending-title" className="text-white">Trending now</CardTitle><Sparkles data-testid="top-trending-icon" size={18} className="text-[#f8d267]" /></div><CardDescription data-testid="top-trending-description" className="text-white/50">Explainable score, not just a leaderboard</CardDescription></CardHeader><CardContent className="space-y-2 px-5 pb-5">{trending.slice(0, 4).map((movie, index) => <button data-testid={`trending-card-${movie.id}`} type="button" key={movie.id} onClick={() => onMovieSelect(movie)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition-[background,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.1]"><span data-testid={`trending-rank-${movie.id}`} className="w-5 text-xs text-[#f8d267]">0{index + 1}</span><span className="min-w-0 flex-1"><span data-testid={`trending-title-${movie.id}`} className="block truncate text-sm font-semibold">{movie.title}</span><span data-testid={`trending-meta-${movie.id}`} className="mt-1 block truncate text-xs text-white/45">{movie.genre} · {movie.platform}</span></span><span data-testid={`trending-score-${movie.id}`} className="text-sm font-bold text-[#f8d267]">{movie.trend_score}</span></button>)}{trending.length === 0 && <p data-testid="trending-empty" className="py-8 text-sm text-white/50">No trend data yet.</p>}</CardContent></Card></div><div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.35fr]"><Card data-testid="genre-mix-card" className="border-[#e8e0d1] bg-white shadow-[0_14px_40px_rgba(70,52,28,0.05)]"><CardHeader className="px-5 py-4"><CardTitle data-testid="genre-mix-title">Genre mix</CardTitle><CardDescription data-testid="genre-mix-description">Where demand is concentrated</CardDescription></CardHeader><CardContent data-testid="genre-mix-chart" className="h-[270px] px-5 pb-5"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genres.slice(0, 6)} dataKey="views" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={3}>{genres.slice(0, 6).map((entry, index) => <Cell key={entry.name} fill={["#e8bd4e", "#6f8b5a", "#d88461", "#7e9eb2", "#b69a78", "#817a6e"][index % 6]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card><Card data-testid="rating-distribution-card" className="border-[#e8e0d1] bg-white shadow-[0_14px_40px_rgba(70,52,28,0.05)]"><CardHeader className="px-5 py-4"><CardTitle data-testid="rating-distribution-title">Rating distribution</CardTitle><CardDescription data-testid="rating-distribution-description">Quality guardrails across the catalog</CardDescription></CardHeader><CardContent data-testid="rating-distribution-chart" className="h-[270px] px-5 pb-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={ratings} barCategoryGap="28%"><CartesianGrid stroke="#f1eadf" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#cf9a36" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card></div><div className="mt-6"><MovieTable movies={movies.slice(0, 6)} empty={!movies.length && !moviesError} onMovieSelect={onMovieSelect} /></div></motion.section>;
}

function MoviesSection({ movies, error, onMovieSelect }: { movies: MovieAnalytics[]; error: boolean; onMovieSelect: (movie: MovieAnalytics) => void }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="movies-section"><SectionHeader eyebrow="Movies" title="Performance by title" description="Rank the catalog by viewing demand while keeping ratings and sample size visible." action={<Badge data-testid="movies-count-badge" variant="outline" className="border-[#e4dac8] bg-white text-[#817a6e]">{movies.length} titles</Badge>} /><QueryHint hasError={error} empty={!movies.length && !error} /><div className="mt-6"><MovieTable movies={movies} empty={!movies.length} onMovieSelect={onMovieSelect} /></div></motion.section>;
}

function TrendsSection({ trends, error }: { trends: TrendPoint[]; error: boolean }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="trends-section"><SectionHeader eyebrow="Viewing trends" title="Momentum has a shape" description="See where watch-time and unique viewers are building month over month." /><QueryHint hasError={error} empty={!trends.length && !error} /><div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><Card data-testid="trend-detail-chart-card" className="border-[#e8e0d1] bg-white"><CardHeader><CardTitle data-testid="trend-detail-chart-title">Views & watch time</CardTitle><CardDescription data-testid="trend-detail-chart-description">A rising line means more than a single viral spike.</CardDescription></CardHeader><CardContent data-testid="trend-detail-chart" className="h-[350px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}><CartesianGrid stroke="#f1eadf" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#a59b8b", fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="views" stroke="#c9942c" strokeWidth={3} dot={{ fill: "#c9942c", r: 4 }} /><Line type="monotone" dataKey="active_users" stroke="#769260" strokeWidth={3} dot={{ fill: "#769260", r: 4 }} /></LineChart></ResponsiveContainer></CardContent></Card><div className="space-y-3">{trends.map((point) => <Card data-testid={`trend-month-${point.label}`} key={point.label} size="sm" className="border-[#e8e0d1] bg-white"><CardContent className="flex items-center justify-between p-4"><div><p data-testid={`trend-month-label-${point.label}`} className="font-semibold text-[#35322c]">{point.label} 2025</p><p data-testid={`trend-month-users-${point.label}`} className="mt-1 text-xs text-[#958b7b]">{formatNumber(point.active_users)} active viewers</p></div><div className="text-right"><p data-testid={`trend-month-views-${point.label}`} className="font-semibold text-[#9b701c]">{formatNumber(point.views)} plays</p><p data-testid={`trend-month-watch-${point.label}`} className="mt-1 text-xs text-[#958b7b]">{formatNumber(point.watch_minutes)} min watched</p></div></CardContent></Card>)}</div></div></motion.section>;
}

function GenresSection({ genres, error }: { genres: GenreAnalytics[]; error: boolean }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="genres-section"><SectionHeader eyebrow="Genres" title="Audience appetite" description="Popularity, share, and quality side by side to keep programming conversations grounded." /><QueryHint hasError={error} empty={!genres.length && !error} /><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{genres.map((genre, index) => <Card data-testid={`genre-card-${genre.name}`} key={genre.name} className="border-[#e8e0d1] bg-white"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p data-testid={`genre-name-${genre.name}`} className="font-heading text-xl font-semibold">{genre.name}</p><p data-testid={`genre-title-count-${genre.name}`} className="mt-1 text-xs text-[#958b7b]">{genre.title_count} titles · {genre.share}% of views</p></div><span data-testid={`genre-index-${genre.name}`} className="text-sm font-bold text-[#c9942c]">0{index + 1}</span></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-[#f0eadf]"><div data-testid={`genre-share-bar-${genre.name}`} className="h-full rounded-full bg-[#e1b344]" style={{ width: `${Math.max(8, genre.share)}%` }} /></div><div className="mt-5 flex items-end justify-between"><div><p data-testid={`genre-views-${genre.name}`} className="text-2xl font-semibold tracking-[-0.04em]">{compactNumber(genre.views)}</p><p className="text-xs text-[#958b7b]">total views</p></div><div className="text-right"><p data-testid={`genre-rating-${genre.name}`} className="inline-flex items-center gap-1 text-lg font-semibold text-[#6f8b5a]"><Star size={14} fill="currentColor" />{genre.average_rating.toFixed(1)}</p><p className="text-xs text-[#958b7b]">avg rating</p></div></div></CardContent></Card>)}</div></motion.section>;
}

function PlatformsSection({ platforms, error }: { platforms: PlatformAnalytics[]; error: boolean }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="platforms-section"><SectionHeader eyebrow="Platforms" title="Where titles win" description="Compare catalog depth, viewing demand, and the genre each platform owns." /><QueryHint hasError={error} empty={!platforms.length && !error} /><Card data-testid="platform-performance-card" className="mt-6 border-[#e8e0d1] bg-white"><CardContent className="p-0"><Table><TableHeader><TableRow className="border-[#f0eadf] hover:bg-transparent"><TableHead data-testid="platform-table-name-heading">Platform</TableHead><TableHead data-testid="platform-table-titles-heading">Titles</TableHead><TableHead data-testid="platform-table-views-heading">Views</TableHead><TableHead data-testid="platform-table-rating-heading">Avg rating</TableHead><TableHead data-testid="platform-table-genre-heading" className="text-right">Popular genre</TableHead></TableRow></TableHeader><TableBody>{platforms.map((platform, index) => <TableRow data-testid={`platform-row-${platform.name}`} key={platform.name} className="border-[#f0eadf]"><TableCell data-testid={`platform-name-${platform.name}`}><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-xl bg-[#f6f0e4] text-xs font-bold text-[#a27013]">0{index + 1}</span><span className="font-semibold">{platform.name}</span></div></TableCell><TableCell data-testid={`platform-titles-${platform.name}`} className="text-[#625d54]">{platform.titles}</TableCell><TableCell data-testid={`platform-views-${platform.name}`} className="font-semibold">{compactNumber(platform.views)}</TableCell><TableCell data-testid={`platform-rating-${platform.name}`}><span className="inline-flex items-center gap-1 text-[#6f8b5a]"><Star size={13} fill="currentColor" />{platform.average_rating.toFixed(1)}</span></TableCell><TableCell data-testid={`platform-genre-${platform.name}`} className="text-right text-[#817a6e]">{platform.popular_genre}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></motion.section>;
}

function PreferencesSection({ preferences, error }: { preferences: PreferenceAnalytics[]; error: boolean }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="preferences-section"><SectionHeader eyebrow="Preferences" title="Viewer signals" description="A compact view of the audience patterns behind the catalog numbers." /><QueryHint hasError={error} empty={!preferences.length && !error} /><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{preferences.map((item, index) => <Card data-testid={`preference-card-${index}`} key={`${item.genre}-${item.platform}-${index}`} className="border-[#e8e0d1] bg-white"><CardContent className="p-5"><div className="flex items-center justify-between"><span data-testid={`preference-index-${index}`} className="text-xs font-bold text-[#b07b18]">0{index + 1}</span><Badge data-testid={`preference-frequency-${index}`} variant="outline" className="border-[#d9e5ce] bg-[#f3f8ee] text-[#6e8d59]">{item.viewing_frequency}</Badge></div><p data-testid={`preference-genre-${index}`} className="mt-7 font-heading text-xl font-semibold">{item.genre}</p><p data-testid={`preference-platform-${index}`} className="mt-1 text-xs text-[#958b7b]">Often on {item.platform}</p><div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#f0eadf] pt-4"><div><p data-testid={`preference-rating-${index}`} className="text-lg font-semibold">{item.average_rating.toFixed(1)}</p><p className="text-[11px] text-[#958b7b]">avg rating</p></div><div><p data-testid={`preference-views-${index}`} className="text-lg font-semibold">{compactNumber(item.views)}</p><p className="text-[11px] text-[#958b7b]">views</p></div></div></CardContent></Card>)}</div></motion.section>;
}

export default Home;