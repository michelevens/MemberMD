<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class ProviderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Provider::where('tenant_id', $user->tenant_id)
            ->with(['user']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereHas('user', function ($uq) use ($search) {
                    $uq->where('first_name', 'ilike', "%{$search}%")
                       ->orWhere('last_name', 'ilike', "%{$search}%")
                       ->orWhere('email', 'ilike', "%{$search}%");
                })
                ->orWhere('credentials', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('accepts_new_patients')) {
            $query->where('accepts_new_patients', filter_var($request->accepts_new_patients, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('telehealth_enabled')) {
            $query->where('telehealth_enabled', filter_var($request->telehealth_enabled, FILTER_VALIDATE_BOOLEAN));
        }

        $providers = $query->orderBy('created_at', 'desc')->get();

        return response()->json(['data' => $providers]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)
            ->with(['user', 'availability'])
            ->findOrFail($id);

        return response()->json(['data' => $provider]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'email' => 'required|email|unique:users,email',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'password' => 'required|string|min:8',
            'phone' => 'nullable|string|max:20',
            'title' => 'nullable|string|max:50',
            'credentials' => 'nullable|string|max:50',
            'bio' => 'nullable|string|max:2000',
            'specialties' => 'nullable|array',
            'languages' => 'nullable|array',
            'npi' => 'nullable|string|max:20',
            'license_number' => 'nullable|string|max:50',
            'license_state' => 'nullable|string|max:2',
            'panel_capacity' => 'nullable|integer|min:0',
            'panel_status' => 'nullable|string|in:open,limited,closed',
            'accepts_new_patients' => 'sometimes|boolean',
            'telehealth_enabled' => 'sometimes|boolean',
            'consultation_fee' => 'nullable|numeric|min:0',
        ]);

        // Create user account for the provider
        $providerUser = User::create([
            'tenant_id' => $user->tenant_id,
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'name' => trim($validated['first_name'] . ' ' . $validated['last_name']),
            'phone' => $validated['phone'] ?? null,
            'role' => 'provider',
            'status' => 'active',
        ]);

        // Create provider record
        $provider = Provider::create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $providerUser->id,
            'title' => $validated['title'] ?? null,
            'credentials' => $validated['credentials'] ?? null,
            'bio' => $validated['bio'] ?? null,
            'specialties' => $validated['specialties'] ?? null,
            'languages' => $validated['languages'] ?? null,
            'npi' => $validated['npi'] ?? null,
            'license_number' => $validated['license_number'] ?? null,
            'license_state' => $validated['license_state'] ?? null,
            'panel_capacity' => $validated['panel_capacity'] ?? null,
            'panel_status' => $validated['panel_status'] ?? 'open',
            'accepts_new_patients' => $validated['accepts_new_patients'] ?? true,
            'telehealth_enabled' => $validated['telehealth_enabled'] ?? false,
            'consultation_fee' => $validated['consultation_fee'] ?? null,
        ]);

        return response()->json([
            'data' => $provider->load('user')
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'title' => 'nullable|string|max:50',
            'credentials' => 'nullable|string|max:50',
            'bio' => 'nullable|string|max:2000',
            'specialties' => 'nullable|array',
            'languages' => 'nullable|array',
            'npi' => 'nullable|string|max:20',
            'license_number' => 'nullable|string|max:50',
            'license_state' => 'nullable|string|max:2',
            'panel_capacity' => 'nullable|integer|min:0',
            'panel_status' => 'nullable|string|in:open,limited,closed',
            'accepts_new_patients' => 'sometimes|boolean',
            'telehealth_enabled' => 'sometimes|boolean',
            'consultation_fee' => 'nullable|numeric|min:0',
        ]);

        $provider->update($validated);

        return response()->json(['data' => $provider->fresh()->load('user')]);
    }

    public function availability(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $availability = $provider->availability()
            ->orderBy('day_of_week', 'asc')
            ->orderBy('start_time', 'asc')
            ->get();

        return response()->json(['data' => $availability]);
    }

    public function updateAvailability(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // If provider role, can only update own availability
        if ($user->isProvider()) {
            abort_if($provider->user_id !== $user->id, 403);
        }

        $validated = $request->validate([
            'availability' => 'required|array',
            'availability.*.day_of_week' => 'required|integer|between:0,6',
            'availability.*.start_time' => 'required|date_format:H:i',
            'availability.*.end_time' => 'required|date_format:H:i|after:availability.*.start_time',
            'availability.*.is_available' => 'sometimes|boolean',
            'availability.*.location' => 'nullable|string|max:100',
        ]);

        // Replace all availability slots
        $provider->availability()->delete();

        foreach ($validated['availability'] as $slot) {
            ProviderAvailability::create([
                'tenant_id' => $user->tenant_id,
                'provider_id' => $provider->id,
                'day_of_week' => $slot['day_of_week'],
                'start_time' => $slot['start_time'],
                'end_time' => $slot['end_time'],
                'is_available' => $slot['is_available'] ?? true,
                'location' => $slot['location'] ?? null,
            ]);
        }

        return response()->json([
            'data' => $provider->availability()->orderBy('day_of_week')->orderBy('start_time')->get()
        ]);
    }

    public function appointments(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $query = $provider->appointments()
            ->with(['patient', 'appointmentType']);

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('scheduled_at', [$request->date_from, $request->date_to]);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $appointments = $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $appointments]);
    }
}
