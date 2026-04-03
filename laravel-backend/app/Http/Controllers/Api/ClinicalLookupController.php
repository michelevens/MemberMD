<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RxNormService;
use App\Services\ICD10Service;
use App\Services\CPTCodeService;
use App\Services\LOINCService;
use App\Services\FDADrugService;
use App\Services\NPILookupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicalLookupController extends Controller
{
    public function searchDrugs(Request $request, RxNormService $rxNorm): JsonResponse
    {
        $request->validate(['q' => 'required|string|min:2|max:100']);

        $results = $rxNorm->searchDrugs($request->q);

        // If no results, try spelling suggestions
        if (empty($results)) {
            $suggestions = $rxNorm->getSuggestions($request->q);
            return response()->json(['data' => [], 'suggestions' => $suggestions]);
        }

        return response()->json(['data' => $results]);
    }

    public function drugInteractions(Request $request, RxNormService $rxNorm): JsonResponse
    {
        $request->validate(['rxcui' => 'required|string']);

        $interactions = $rxNorm->getInteractions($request->rxcui);

        return response()->json(['data' => $interactions]);
    }

    public function drugInfo(Request $request, RxNormService $rxNorm): JsonResponse
    {
        $request->validate(['rxcui' => 'required|string']);

        $ndcs = $rxNorm->getNDCs($request->rxcui);

        return response()->json(['data' => ['ndcs' => $ndcs]]);
    }

    public function searchICD10(Request $request, ICD10Service $icd10): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2|max:100',
            'limit' => 'sometimes|integer|min:1|max:50',
        ]);

        $results = $icd10->search($request->q, $request->input('limit', 20));

        return response()->json(['data' => $results]);
    }

    public function searchCPT(Request $request, CPTCodeService $cpt): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2|max:100',
            'limit' => 'sometimes|integer|min:1|max:50',
        ]);

        $results = $cpt->search($request->q, $request->input('limit', 20));

        return response()->json(['data' => $results]);
    }

    public function searchLOINC(Request $request, LOINCService $loinc): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2|max:100',
            'limit' => 'sometimes|integer|min:1|max:50',
        ]);

        $results = $loinc->search($request->q, $request->input('limit', 20));

        return response()->json(['data' => $results]);
    }

    public function searchFDALabels(Request $request, FDADrugService $fda): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2|max:100',
            'limit' => 'sometimes|integer|min:1|max:10',
        ]);

        $results = $fda->searchLabels($request->q, $request->input('limit', 5));

        return response()->json(['data' => $results]);
    }

    public function searchNPI(Request $request, NPILookupService $npi): JsonResponse
    {
        $request->validate([
            'npi' => 'sometimes|string|digits:10',
            'q' => 'required_without:npi|string|min:2|max:100',
            'state' => 'sometimes|string|size:2',
            'type' => 'sometimes|string|in:individual,organization',
            'limit' => 'sometimes|integer|min:1|max:50',
        ]);

        $limit = $request->input('limit', 10);

        // Search by NPI number
        if ($request->filled('npi')) {
            $results = $npi->searchByNPI($request->npi);
            return response()->json(['data' => $results]);
        }

        $query = trim($request->q);
        $state = $request->input('state');
        $type = $request->input('type', 'individual');

        // Organization search
        if ($type === 'organization') {
            $results = $npi->searchByOrganization($query, $state, $limit);
            return response()->json(['data' => $results]);
        }

        // Individual search — split query into first/last name
        $parts = preg_split('/[\s,]+/', $query, 2);
        if (count($parts) === 2) {
            $firstName = $parts[0];
            $lastName = $parts[1];
        } else {
            // Single term — search as last name with wildcard first name
            $firstName = '*';
            $lastName = $parts[0];
        }

        $results = $npi->searchByName($firstName, $lastName, $state, $limit);

        return response()->json(['data' => $results]);
    }
}
