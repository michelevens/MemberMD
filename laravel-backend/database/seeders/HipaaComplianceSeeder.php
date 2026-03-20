<?php

namespace Database\Seeders;

use App\Models\ComplianceRequirement;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class HipaaComplianceSeeder extends Seeder
{
    public function run(): void
    {
        $seeded = 0;
        $requirements = [
            // ─── Administrative Safeguards ───
            [
                'category' => 'administrative',
                'title' => 'Security Risk Analysis',
                'description' => 'Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of ePHI held by the practice.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 1,
            ],
            [
                'category' => 'administrative',
                'title' => 'Workforce Security & Access Management',
                'description' => 'Implement policies and procedures to ensure that all members of the workforce have appropriate access to ePHI and to prevent unauthorized access.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 2,
            ],
            [
                'category' => 'administrative',
                'title' => 'Security Awareness & Training',
                'description' => 'Implement a security awareness and training program for all members of the workforce including management, covering phishing, password management, and incident reporting.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 3,
            ],
            [
                'category' => 'administrative',
                'title' => 'Incident Response Procedures',
                'description' => 'Implement policies and procedures to address security incidents including identification, response, mitigation, documentation, and breach notification within 60 days.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 4,
            ],
            [
                'category' => 'administrative',
                'title' => 'Contingency Plan & Data Backup',
                'description' => 'Establish and implement policies for responding to an emergency or other occurrence that damages systems containing ePHI, including data backup, disaster recovery, and emergency mode operation plans.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 5,
            ],
            [
                'category' => 'administrative',
                'title' => 'Business Associate Agreements (BAAs)',
                'description' => 'Maintain signed Business Associate Agreements with all vendors and subcontractors who create, receive, maintain, or transmit ePHI on behalf of the practice.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 6,
            ],

            // ─── Physical Safeguards ───
            [
                'category' => 'physical',
                'title' => 'Facility Access Controls',
                'description' => 'Implement policies and procedures to limit physical access to electronic information systems and the facilities in which they are housed, while ensuring that authorized access is allowed.',
                'severity' => 'medium',
                'is_required' => true,
                'sort_order' => 7,
            ],
            [
                'category' => 'physical',
                'title' => 'Workstation & Device Security',
                'description' => 'Implement policies governing the proper use, physical safeguards, and secure disposal of electronic media and workstations that access ePHI.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 8,
            ],

            // ─── Technical Safeguards ───
            [
                'category' => 'technical',
                'title' => 'Access Controls & Unique User Identification',
                'description' => 'Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to authorized persons, with unique user identification for tracking.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 9,
            ],
            [
                'category' => 'technical',
                'title' => 'Audit Controls & Activity Logging',
                'description' => 'Implement hardware, software, and procedural mechanisms that record and examine activity in information systems that contain or use ePHI.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 10,
            ],
            [
                'category' => 'technical',
                'title' => 'Data Integrity Controls',
                'description' => 'Implement policies and procedures to protect ePHI from improper alteration or destruction, including mechanisms to authenticate and verify data integrity.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 11,
            ],
            [
                'category' => 'technical',
                'title' => 'Transmission Security & Encryption',
                'description' => 'Implement technical security measures to guard against unauthorized access to ePHI being transmitted over electronic communications networks, including encryption.',
                'severity' => 'critical',
                'is_required' => true,
                'sort_order' => 12,
            ],

            // ─── Organizational Requirements ───
            [
                'category' => 'organizational',
                'title' => 'Notice of Privacy Practices',
                'description' => 'Maintain and distribute a Notice of Privacy Practices that describes how the practice may use and disclose PHI, and the patient\'s rights regarding their health information.',
                'severity' => 'medium',
                'is_required' => true,
                'sort_order' => 13,
            ],
            [
                'category' => 'organizational',
                'title' => 'Patient Rights & Access to Records',
                'description' => 'Implement procedures to allow patients to access, request amendments to, and receive an accounting of disclosures of their PHI within required timeframes.',
                'severity' => 'high',
                'is_required' => true,
                'sort_order' => 14,
            ],
            [
                'category' => 'organizational',
                'title' => 'Minimum Necessary Standard',
                'description' => 'Implement policies to ensure that uses and disclosures of, and requests for, PHI are limited to the minimum necessary to accomplish the intended purpose.',
                'severity' => 'medium',
                'is_required' => true,
                'sort_order' => 15,
            ],
        ];

        foreach ($requirements as $requirement) {
            try {
                $existing = ComplianceRequirement::where('title', $requirement['title'])
                    ->whereNull('tenant_id')
                    ->first();

                $data = [
                    'category' => $requirement['category'],
                    'description' => $requirement['description'],
                    'severity' => $requirement['severity'],
                    'is_required' => $requirement['is_required'],
                    'sort_order' => $requirement['sort_order'],
                ];

                if ($existing) {
                    $existing->update($data);
                } else {
                    ComplianceRequirement::create(array_merge($data, [
                        'title' => $requirement['title'],
                        'tenant_id' => null,
                    ]));
                }

                $seeded++;
            } catch (\Throwable $e) {
                $this->command->error("Failed to seed HIPAA requirement [{$requirement['title']}]: " . $e->getMessage());
                Log::error('HipaaComplianceSeeder failed', ['title' => $requirement['title'], 'error' => $e->getMessage()]);
            }
        }

        $this->command->info("Seeded {$seeded} HIPAA compliance requirements.");
    }
}
