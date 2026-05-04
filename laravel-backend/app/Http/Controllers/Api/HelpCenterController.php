<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HelpArticle;
use App\Models\HelpCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public help center / knowledge base.
 *
 * Platform-wide content (NOT tenant-scoped) — every practice + patient
 * sees the same articles. No auth required so the help link in emails
 * + the patient-portal Help button work for users who haven't logged
 * in yet. Voting is anonymous and rate-limited at the route layer.
 */
class HelpCenterController extends Controller
{
    /**
     * GET /help/categories — categories with their published article count.
     */
    public function categories(): JsonResponse
    {
        $rows = HelpCategory::orderBy('sort_order')
            ->orderBy('name')
            ->withCount(['articles as article_count' => fn ($q) => $q->where('is_published', true)])
            ->get();
        return response()->json(['data' => $rows]);
    }

    /**
     * GET /help/articles?q=...&category=slug — list/search published articles.
     */
    public function articles(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $catSlug = (string) $request->query('category', '');
        $limit = min(50, max(1, (int) $request->query('limit', 20)));

        $query = HelpArticle::with('category:id,name,slug,icon')
            ->where('is_published', true);

        if ($q !== '') {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
            $query->where(function ($qq) use ($like) {
                $qq->where('title', 'ilike', $like)
                   ->orWhere('content_markdown', 'ilike', $like)
                   ->orWhere('excerpt', 'ilike', $like);
            });
        }

        if ($catSlug !== '') {
            $query->whereHas('category', fn ($qq) => $qq->where('slug', $catSlug));
        }

        $rows = $query->orderBy('sort_order')
            ->orderByDesc('helpful_count')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * GET /help/articles/{slug} — one article + bumps view_count.
     */
    public function show(string $slug): JsonResponse
    {
        $article = HelpArticle::with('category:id,name,slug,icon')
            ->where('slug', $slug)
            ->where('is_published', true)
            ->first();
        if (!$article) {
            return response()->json(['message' => 'Article not found.'], 404);
        }
        // Best-effort view tally (atomic increment).
        try {
            $article->increment('view_count');
        } catch (\Throwable) {
            // non-fatal; reading is the priority
        }
        return response()->json(['data' => $article]);
    }

    /**
     * POST /help/articles/{slug}/vote {helpful: true|false}
     * Anonymous, rate-limited at the route layer.
     */
    public function vote(Request $request, string $slug): JsonResponse
    {
        $data = $request->validate([
            'helpful' => 'required|boolean',
        ]);

        $article = HelpArticle::where('slug', $slug)
            ->where('is_published', true)
            ->first();
        if (!$article) {
            return response()->json(['message' => 'Article not found.'], 404);
        }

        try {
            $article->increment($data['helpful'] ? 'helpful_count' : 'not_helpful_count');
        } catch (\Throwable) {
            // non-fatal
        }
        return response()->json([
            'data' => [
                'helpful_count' => $article->fresh()->helpful_count,
                'not_helpful_count' => $article->fresh()->not_helpful_count,
            ],
        ]);
    }
}
