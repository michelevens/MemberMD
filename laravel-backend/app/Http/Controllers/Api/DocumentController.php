<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Document::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'uploader']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $documents = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $documents]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient() && !$user->patient, 403);

        $validated = $request->validate([
            'file' => 'required|file|max:20480|mimes:pdf,doc,docx,jpg,jpeg,png,gif,txt,csv,xlsx,xls', // 20MB max
            'patient_id' => 'required|uuid|exists:patients,id',
            'name' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:100',
            'type' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:500',
        ]);

        // Patients can only upload to their own record
        if ($user->isPatient()) {
            abort_if($user->patient->id !== $validated['patient_id'], 403);
        }

        $file = $request->file('file');
        $path = $file->store("documents/{$user->tenant_id}", 'local');

        $document = Document::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'name' => $validated['name'] ?? pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_name' => $file->getClientOriginalName(),
            'category' => $validated['category'] ?? 'general',
            'type' => $validated['type'] ?? 'document',
            'description' => $validated['description'] ?? null,
            'file_path' => $path,
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'uploaded_by' => $user->id,
            'status' => 'active',
        ]);

        return response()->json(['data' => $document], 201);
    }

    public function download(Request $request, string $id)
    {
        $user = $request->user();
        $document = Document::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($document->patient->user_id !== $user->id, 403);
        }

        if (!$document->file_path || !Storage::disk('local')->exists($document->file_path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk('local')->download(
            $document->file_path,
            $document->original_name ?? $document->name
        );
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $document = Document::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Delete the file from storage
        if ($document->file_path && Storage::disk('local')->exists($document->file_path)) {
            Storage::disk('local')->delete($document->file_path);
        }

        $document->delete();

        return response()->json(['data' => ['message' => 'Document deleted.']]);
    }
}
