// Help Guides — in-app reader for the markdown playbooks at /docs/guides/.
//
// Loads every guide markdown file at build time via Vite's import.meta.glob
// (eager + raw), filters the persona sidebar by the current user's role,
// and renders the picked file with react-markdown.
//
// The markdown files in /docs/guides/ stay canonical — edit there, the
// reader auto-picks them up on next dev reload / build.

import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, BookOpen, ArrowLeft, Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { UserRole } from "../../types";

// ─── Markdown loader ──────────────────────────────────────────────────────────
//
// Vite eagerly imports every .md file under /docs/guides/ as raw text at build
// time. Keys are paths relative to this file ("../../../../docs/guides/...").
// We normalize keys to "<persona>/<file>.md" for cleaner internal use.

const RAW_GUIDES = import.meta.glob("../../../../docs/guides/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

interface GuideFile {
  /** "01-superadmin/README.md" */
  key: string;
  /** "01-superadmin" */
  persona: string;
  /** "README.md" or "01-fleet-health-check.md" */
  file: string;
  /** Pulled from the first `# Heading` line, falls back to file slug. */
  title: string;
  /** Pulled from the `> **For:** ...` line if present. */
  meta: string | null;
  /** Pulled from the `description:` frontmatter or first paragraph. */
  excerpt: string;
  /** Full markdown body. */
  body: string;
}

function parseGuide(key: string, body: string): GuideFile {
  // key looks like "../../../../docs/guides/01-superadmin/README.md"
  const rel = key.replace(/^.*\/docs\/guides\//, "");
  const [persona, ...rest] = rel.split("/");
  const file = rest.join("/");

  // Title: first "# " line in the body.
  const titleMatch = body.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1] : file.replace(/\.md$/, "");

  // Meta line: first "> **For:** ..." line.
  const metaMatch = body.match(/^>\s*\*\*For:\*\*\s*(.+?)\s*$/m);
  const meta = metaMatch ? metaMatch[1] : null;

  // Excerpt: first non-heading, non-blockquote paragraph, capped at 160 chars.
  const lines = body.split("\n");
  let excerpt = "";
  for (const ln of lines) {
    if (!ln.trim()) continue;
    if (ln.startsWith("#")) continue;
    if (ln.startsWith(">")) continue;
    if (ln.startsWith("|")) continue;
    excerpt = ln.replace(/[*_`]/g, "").trim();
    if (excerpt.length > 160) excerpt = excerpt.slice(0, 157) + "…";
    break;
  }

  return { key: `${persona}/${file}`, persona, file, title, meta, excerpt, body };
}

const ALL_GUIDES: GuideFile[] = Object.entries(RAW_GUIDES)
  .map(([k, v]) => parseGuide(k, v))
  .sort((a, b) => a.key.localeCompare(b.key));

// ─── Role → persona folder map ────────────────────────────────────────────────
//
// Which persona folders a logged-in user can see. Superadmin sees everything.
// Practice admin sees their own folder PLUS staff + provider, since they
// onboard those roles. Provider/staff/patient/employer see only their own.

const ROLE_TO_PERSONAS: Record<UserRole, string[]> = {
  superadmin: [
    "01-superadmin",
    "02-practice-admin",
    "03-provider",
    "04-staff",
    "05-patient",
    "06-employer-admin",
  ],
  practice_admin: ["02-practice-admin", "03-provider", "04-staff", "05-patient"],
  provider: ["03-provider", "05-patient"],
  staff: ["04-staff", "05-patient"],
  patient: ["05-patient"],
  employer_admin: ["06-employer-admin"],
};

const PERSONA_LABELS: Record<string, string> = {
  "01-superadmin": "Superadmin",
  "02-practice-admin": "Practice Admin",
  "03-provider": "Provider",
  "04-staff": "Staff",
  "05-patient": "Patient",
  "06-employer-admin": "Employer Admin",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HelpGuidesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const allowedPersonas = useMemo(
    () => (user?.role ? ROLE_TO_PERSONAS[user.role] : []),
    [user?.role]
  );

  const visibleGuides = useMemo(
    () => ALL_GUIDES.filter((g) => allowedPersonas.includes(g.persona)),
    [allowedPersonas]
  );

  const filteredGuides = useMemo(() => {
    if (!search.trim()) return visibleGuides;
    const q = search.toLowerCase();
    return visibleGuides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.excerpt.toLowerCase().includes(q) ||
        g.body.toLowerCase().includes(q)
    );
  }, [visibleGuides, search]);

  // Selected guide from ?guide=<key>; default to first persona's README.
  const selectedKey = searchParams.get("guide");
  const selected = useMemo(() => {
    if (selectedKey) {
      const found = visibleGuides.find((g) => g.key === selectedKey);
      if (found) return found;
    }
    return visibleGuides.find((g) => g.file === "README.md") ?? visibleGuides[0] ?? null;
  }, [selectedKey, visibleGuides]);

  // Persist initial selection in URL so refresh + back/forward work.
  useEffect(() => {
    if (selected && !selectedKey) {
      setSearchParams({ guide: selected.key }, { replace: true });
    }
  }, [selected, selectedKey, setSearchParams]);

  // Group guides by persona for the sidebar.
  const grouped = useMemo(() => {
    const out: Record<string, GuideFile[]> = {};
    for (const g of filteredGuides) {
      (out[g.persona] ??= []).push(g);
    }
    return out;
  }, [filteredGuides]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Please sign in to view the staff handbook.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2 ml-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h1 className="text-base font-semibold text-slate-900">Staff Handbook</h1>
          </div>
          <div className="ml-auto relative w-72 max-w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3">
          <nav className="bg-white rounded-xl border border-slate-200 p-2 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {Object.keys(grouped).length === 0 && (
              <div className="px-3 py-6 text-sm text-slate-500 text-center">
                No guides match your search.
              </div>
            )}
            {allowedPersonas.map((persona) => {
              const guides = grouped[persona];
              if (!guides || guides.length === 0) return null;
              const indexGuide = guides.find((g) => g.file === "README.md");
              const playbooks = guides.filter((g) => g.file !== "README.md");
              return (
                <div key={persona} className="mb-2">
                  <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {PERSONA_LABELS[persona] ?? persona}
                  </div>
                  {indexGuide && (
                    <SidebarItem
                      label="Overview"
                      isActive={selected?.key === indexGuide.key}
                      onClick={() => setSearchParams({ guide: indexGuide.key })}
                    />
                  )}
                  {playbooks.map((g) => (
                    <SidebarItem
                      key={g.key}
                      label={g.title}
                      isActive={selected?.key === g.key}
                      onClick={() => setSearchParams({ guide: g.key })}
                    />
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Reader */}
        <main className="col-span-12 md:col-span-8 lg:col-span-9">
          {selected ? (
            <article className="bg-white rounded-xl border border-slate-200 p-8 markdown-body">
              {selected.meta && (
                <div className="mb-4 text-xs uppercase tracking-wide text-teal-700 font-semibold">
                  {selected.meta}
                </div>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => {
                    // Intercept relative .md links → navigate within the reader.
                    if (href && /\.md(\?.*)?$/.test(href) && !/^https?:/i.test(href)) {
                      return (
                        <button
                          type="button"
                          className="text-teal-600 hover:underline"
                          onClick={() => {
                            const resolved = resolveMdLink(selected.key, href);
                            if (resolved) setSearchParams({ guide: resolved });
                          }}
                        >
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noreferrer" {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {selected.body}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              No guide selected.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SidebarItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-teal-50 text-teal-800 font-medium"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <ChevronRight
        className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? "rotate-90 text-teal-700" : "text-slate-400"}`}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Resolve a relative .md link inside a guide back to a "persona/file.md" key.
 * E.g. from "01-superadmin/README.md" with href "./01-fleet-health-check.md"
 * → "01-superadmin/01-fleet-health-check.md".
 * And from "01-superadmin/02-impersonate.md" with href "../03-provider/01-foo.md"
 * → "03-provider/01-foo.md".
 */
function resolveMdLink(fromKey: string, href: string): string | null {
  const cleanHref = href.split("#")[0].split("?")[0];
  const fromParts = fromKey.split("/").slice(0, -1); // drop filename
  const hrefParts = cleanHref.split("/");
  for (const part of hrefParts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      fromParts.pop();
    } else {
      fromParts.push(part);
    }
  }
  const resolved = fromParts.join("/");
  // Sanity: only resolve into known guide keys.
  return ALL_GUIDES.some((g) => g.key === resolved) ? resolved : null;
}
