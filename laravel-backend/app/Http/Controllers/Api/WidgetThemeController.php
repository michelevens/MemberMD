<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WidgetTheme;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Practice-side widget theme management.
 *
 *   GET    /api/widget-themes               — list (one per scope)
 *   GET    /api/widget-themes/{scope}       — show one (creates default in-memory if missing)
 *   PUT    /api/widget-themes/{scope}       — upsert
 *   DELETE /api/widget-themes/{scope}       — reset to defaults
 */
class WidgetThemeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $themes = WidgetTheme::where('tenant_id', $user->tenant_id)->get();

        return response()->json([
            'data' => $themes->map(fn ($t) => $this->serialize($t))->values(),
        ]);
    }

    public function show(Request $request, string $scope): JsonResponse
    {
        abort_if(!in_array($scope, WidgetTheme::SCOPES, true), 404);

        $user = $request->user();
        $theme = WidgetTheme::where('tenant_id', $user->tenant_id)->where('scope', $scope)->first();

        if (!$theme) {
            // Return the default theme in-memory so the UI has something to render
            return response()->json([
                'data' => [
                    'tenant_id' => $user->tenant_id,
                    'scope' => $scope,
                    'css_variables' => WidgetTheme::defaults(),
                    'custom_css' => null,
                    'font_family' => null,
                    'logo' => null,
                    'is_active' => true,
                    'is_default' => true,
                ],
            ]);
        }

        return response()->json(['data' => $this->serialize($theme)]);
    }

    public function upsert(Request $request, string $scope): JsonResponse
    {
        abort_if(!in_array($scope, WidgetTheme::SCOPES, true), 404);
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403, 'Only practice admins can change themes.');

        $validated = $request->validate([
            'css_variables' => 'sometimes|array',
            'custom_css' => 'nullable|string|max:20000',
            'font_family' => 'nullable|string|max:100',
            'logo' => 'nullable|array',
            'logo.url' => 'sometimes|string|max:512',
            'logo.position' => 'sometimes|string|in:top-left,top-center,top-right',
            'logo.max_height' => 'sometimes|integer|min:8|max:200',
            'is_active' => 'sometimes|boolean',
        ]);

        // Filter css_variables to allowed keys
        if (isset($validated['css_variables'])) {
            $validated['css_variables'] = array_intersect_key(
                $validated['css_variables'],
                array_flip(WidgetTheme::ALLOWED_VARIABLES),
            );
        }

        if (isset($validated['custom_css'])) {
            $validated['custom_css'] = $this->sanitizeCss((string) $validated['custom_css']);
        }

        $theme = WidgetTheme::updateOrCreate(
            ['tenant_id' => $user->tenant_id, 'scope' => $scope],
            $validated,
        );

        return response()->json(['data' => $this->serialize($theme)]);
    }

    public function destroy(Request $request, string $scope): JsonResponse
    {
        abort_if(!in_array($scope, WidgetTheme::SCOPES, true), 404);
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        WidgetTheme::where('tenant_id', $user->tenant_id)->where('scope', $scope)->delete();

        return response()->json(['message' => 'Theme reset to defaults.']);
    }

    private function serialize(WidgetTheme $t): array
    {
        return [
            'id' => $t->id,
            'tenant_id' => $t->tenant_id,
            'scope' => $t->scope,
            'css_variables' => $t->resolvedVariables(),
            'custom_css' => $t->custom_css,
            'font_family' => $t->font_family,
            'logo' => $t->logo,
            'is_active' => $t->is_active,
            'is_default' => false,
            'created_at' => $t->created_at,
            'updated_at' => $t->updated_at,
        ];
    }

    /**
     * Strip dangerous CSS constructs from operator-supplied custom_css.
     * Blocks: @import, expression(), javascript:, behavior:, off-host url().
     */
    private function sanitizeCss(string $css): string
    {
        // Remove comments first to prevent comment-wrapped attacks
        $css = preg_replace('/\/\*.*?\*\//s', '', $css) ?? $css;

        $banned = [
            '/@import\s+[^;]+;?/i',
            '/expression\s*\([^)]*\)/i',
            '/javascript\s*:/i',
            '/behavior\s*:/i',
            '/-moz-binding\s*:/i',
        ];
        foreach ($banned as $pattern) {
            $css = preg_replace($pattern, '', $css) ?? $css;
        }

        // Block url() to off-host resources — keep only data: and same-origin paths
        $css = preg_replace_callback(
            '/url\s*\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)/i',
            function ($m) {
                $u = trim($m[1]);
                $isSafe = str_starts_with($u, 'data:image/')
                    || str_starts_with($u, '/')
                    || str_starts_with($u, '#');
                return $isSafe ? $m[0] : '';
            },
            $css,
        ) ?? $css;

        return $css;
    }
}
