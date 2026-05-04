// Help Center modal — port from InsureFlow's knowledge base.
//
// Mounted at the App root, opened by the top-bar Help button. Three views:
//   1. Categories grid (default)
//   2. Article list (when a category is picked OR a search query is entered)
//   3. Article detail (when an article is opened)
//
// All API calls are public (/help/*) so users can read help docs without
// being logged in. The modal is a full-screen overlay on mobile and a
// large centered card on desktop.

import { useEffect, useMemo, useState } from "react";
import { X, Search, ChevronRight, ArrowLeft, ThumbsUp, ThumbsDown, BookOpen } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://pure-courage-production.up.railway.app/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  articleCount?: number;
  article_count?: number;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_markdown?: string;
  contentMarkdown?: string;
  helpful_count?: number;
  helpfulCount?: number;
  not_helpful_count?: number;
  notHelpfulCount?: number;
  category?: Category | null;
}

type View =
  | { kind: "categories" }
  | { kind: "list"; categorySlug?: string; query?: string }
  | { kind: "article"; slug: string };

export function HelpCenterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "categories" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState<"helpful" | "not_helpful" | null>(null);

  // Load categories on first open.
  useEffect(() => {
    if (!open || categories.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/help/categories`, { headers: { Accept: "application/json" } });
        const json = await res.json();
        if (!cancelled) setCategories(json?.data ?? []);
      } catch { /* silent — empty list is the safe default */ }
    })();
    return () => { cancelled = true; };
  }, [open, categories.length]);

  // Load list when view changes to "list".
  useEffect(() => {
    if (view.kind !== "list") return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (view.query) params.set("q", view.query);
        if (view.categorySlug) params.set("category", view.categorySlug);
        const res = await fetch(`${API_BASE_URL}/help/articles?${params.toString()}`, { headers: { Accept: "application/json" } });
        const json = await res.json();
        if (!cancelled) setArticles(json?.data ?? []);
      } catch {
        if (!cancelled) setArticles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view]);

  // Load article when view changes to "article".
  useEffect(() => {
    if (view.kind !== "article") return;
    let cancelled = false;
    setLoading(true);
    setVoted(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/help/articles/${view.slug}`, { headers: { Accept: "application/json" } });
        const json = await res.json();
        if (!cancelled) setArticle(json?.data ?? null);
      } catch {
        if (!cancelled) setArticle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view]);

  // Reset internal state when the modal closes.
  useEffect(() => {
    if (!open) {
      setView({ kind: "categories" });
      setSearch("");
      setArticle(null);
      setArticles([]);
      setVoted(null);
    }
  }, [open]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q.length === 0) return;
    setView({ kind: "list", query: q });
  };

  const vote = async (helpful: boolean) => {
    if (!article || voted) return;
    setVoted(helpful ? "helpful" : "not_helpful");
    try {
      await fetch(`${API_BASE_URL}/help/articles/${article.slug}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ helpful }),
      });
    } catch { /* non-fatal — we already updated the UI */ }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl h-screen sm:h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          {view.kind !== "categories" && (
            <button
              type="button"
              onClick={() => {
                if (view.kind === "article") setView({ kind: "list" });
                else setView({ kind: "categories" });
              }}
              className="p-1.5 rounded hover:bg-slate-100"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {view.kind === "article" && article ? article.title :
                view.kind === "list" ? (view.query ? `Results for "${view.query}"` : "Articles") :
                "Help Center"}
            </h2>
            {view.kind === "categories" && (
              <p className="text-xs text-slate-500 mt-0.5">Browse by topic, or search.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Search bar (always visible except in article view) */}
        {view.kind !== "article" && (
          <form onSubmit={onSearch} className="px-5 sm:px-6 pt-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search help articles…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </form>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pt-4 pb-6">
          {view.kind === "categories" && <CategoriesView categories={categories} onPick={(slug) => setView({ kind: "list", categorySlug: slug })} />}
          {view.kind === "list" && (
            <ArticlesList
              loading={loading}
              articles={articles}
              onPick={(slug) => setView({ kind: "article", slug })}
            />
          )}
          {view.kind === "article" && (
            <ArticleView
              loading={loading}
              article={article}
              voted={voted}
              onVote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CategoriesView({ categories, onPick }: { categories: Category[]; onPick: (slug: string) => void }) {
  if (categories.length === 0) {
    return <p className="text-sm text-slate-500">Loading categories…</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {categories.map((c) => (
        <button
          key={c.slug}
          type="button"
          onClick={() => onPick(c.slug)}
          className="text-left rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 p-4 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-slate-900">{c.name}</span>
            <span className="ml-auto text-xs text-slate-400">
              {(c.articleCount ?? c.article_count ?? 0)} article{(c.articleCount ?? c.article_count ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          {c.description && (
            <p className="text-xs text-slate-500 leading-relaxed">{c.description}</p>
          )}
        </button>
      ))}
    </div>
  );
}

function ArticlesList({ loading, articles, onPick }: { loading: boolean; articles: Article[]; onPick: (slug: string) => void }) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (articles.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm font-medium text-slate-700">No articles found</p>
        <p className="text-xs text-slate-500 mt-1">Try a different search or browse categories.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {articles.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onPick(a.slug)}
            className="w-full text-left py-3 flex items-start gap-3 hover:bg-slate-50 px-2 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{a.title}</p>
              {a.excerpt && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.excerpt}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArticleView({ loading, article, voted, onVote }: {
  loading: boolean;
  article: Article | null;
  voted: "helpful" | "not_helpful" | null;
  onVote: (helpful: boolean) => void;
}) {
  // Render markdown as basic formatted text (paragraphs + headings).
  // Avoiding a markdown library dependency for this small surface.
  const blocks = useMemo(() => {
    const md = article?.contentMarkdown ?? article?.content_markdown ?? "";
    return md.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  }, [article]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!article) return <p className="text-sm text-slate-500">Article not found.</p>;

  return (
    <div className="max-w-prose">
      <div className="prose prose-slate prose-sm max-w-none space-y-3">
        {blocks.map((b, i) => {
          if (/^#+\s/.test(b)) {
            const level = b.match(/^(#+)/)?.[1].length ?? 2;
            const text = b.replace(/^#+\s+/, "");
            return level === 1
              ? <h2 key={i} className="text-lg font-semibold text-slate-900">{text}</h2>
              : <h3 key={i} className="text-base font-semibold text-slate-800">{text}</h3>;
          }
          if (/^\d+\./.test(b) || /^[-*]\s/.test(b)) {
            const lines = b.split(/\n/).map((l) => l.replace(/^(\d+\.|[-*])\s+/, ""));
            const ordered = /^\d+\./.test(b);
            return ordered
              ? <ol key={i} className="list-decimal pl-5 space-y-1 text-sm text-slate-700">{lines.map((l, j) => <li key={j}>{l}</li>)}</ol>
              : <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-slate-700">{lines.map((l, j) => <li key={j}>{l}</li>)}</ul>;
          }
          return <p key={i} className="text-sm text-slate-700 leading-relaxed">{b}</p>;
        })}
      </div>

      {/* Vote */}
      <div className="mt-8 pt-4 border-t border-slate-100">
        <p className="text-sm font-medium text-slate-700 mb-2">Was this helpful?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onVote(true)}
            disabled={!!voted}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-50"
            style={{
              borderColor: voted === "helpful" ? "#10b981" : "#e2e8f0",
              backgroundColor: voted === "helpful" ? "#ecfdf5" : "#ffffff",
              color: voted === "helpful" ? "#065f46" : "#475569",
            }}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            Yes
          </button>
          <button
            type="button"
            onClick={() => onVote(false)}
            disabled={!!voted}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-50"
            style={{
              borderColor: voted === "not_helpful" ? "#dc2626" : "#e2e8f0",
              backgroundColor: voted === "not_helpful" ? "#fef2f2" : "#ffffff",
              color: voted === "not_helpful" ? "#991b1b" : "#475569",
            }}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            No
          </button>
          {voted && (
            <span className="text-xs text-slate-500 ml-2">Thanks for the feedback.</span>
          )}
        </div>
      </div>
    </div>
  );
}
