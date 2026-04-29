<?php

namespace App\Http\Middleware;

use App\Support\OperatorContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bind an OperatorContext to the container for the current request when the
 * authenticated user is a member of one or more Operators.
 *
 * Reads two optional headers from the client:
 *  - X-Operator-Id  — selects which operator's scope to use (when user belongs
 *                     to multiple). Defaults to first membership.
 *  - X-Active-Tenant-Id — selects active tenant within the operator scope
 *                     (used by writes / tenant-aware UI). Must be one of the
 *                     operator's tenants or it's ignored.
 *
 * For non-operator users the middleware is a no-op and BelongsToTenant falls
 * back to legacy single-tenant behavior.
 */
class ResolveOperatorScope
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && method_exists($user, 'isOperatorMember') && $user->isOperatorMember()) {
            $context = OperatorContext::forUser(
                $user,
                $request->header('X-Active-Tenant-Id'),
                $request->header('X-Operator-Id'),
            );

            if ($context) {
                app()->instance(OperatorContext::class, $context);
            }
        }

        return $next($request);
    }
}
