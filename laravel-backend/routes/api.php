<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

// ===== MemberMD API Routes =====

// Health check
Route::get('/health', fn () => response()->json(['status' => 'ok', 'app' => 'MemberMD']));

// ===== Auth (Public) =====
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
});

// ===== Authenticated Routes =====
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
});
