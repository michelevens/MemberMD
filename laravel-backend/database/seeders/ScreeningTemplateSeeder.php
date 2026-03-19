<?php

namespace Database\Seeders;

use App\Models\ScreeningTemplate;
use Illuminate\Database\Seeder;

class ScreeningTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            // ─── PHQ-9 (Depression) ───
            [
                'code' => 'phq9',
                'name' => 'PHQ-9 (Patient Health Questionnaire-9)',
                'description' => 'A validated 9-item instrument for screening, diagnosing, monitoring, and measuring the severity of depression.',
                'specialty' => null,
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'Little interest or pleasure in doing things',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'Feeling down, depressed, or hopeless',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'Trouble falling or staying asleep, or sleeping too much',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'Feeling tired or having little energy',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'Poor appetite or overeating',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 6,
                        'text' => 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 7,
                        'text' => 'Trouble concentrating on things, such as reading the newspaper or watching television',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 8,
                        'text' => 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 9,
                        'text' => 'Thoughts that you would be better off dead, or of hurting yourself in some way',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 4, 'severity' => 'minimal', 'color' => '#22c55e', 'description' => 'Minimal depression'],
                    ['min' => 5, 'max' => 9, 'severity' => 'mild', 'color' => '#eab308', 'description' => 'Mild depression'],
                    ['min' => 10, 'max' => 14, 'severity' => 'moderate', 'color' => '#f97316', 'description' => 'Moderate depression'],
                    ['min' => 15, 'max' => 19, 'severity' => 'moderately_severe', 'color' => '#ef4444', 'description' => 'Moderately severe depression'],
                    ['min' => 20, 'max' => 27, 'severity' => 'severe', 'color' => '#dc2626', 'description' => 'Severe depression'],
                ],
            ],

            // ─── GAD-7 (Generalized Anxiety) ───
            [
                'code' => 'gad7',
                'name' => 'GAD-7 (Generalized Anxiety Disorder-7)',
                'description' => 'A validated 7-item instrument for screening and measuring the severity of generalized anxiety disorder.',
                'specialty' => null,
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'Feeling nervous, anxious, or on edge',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'Not being able to stop or control worrying',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'Worrying too much about different things',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'Trouble relaxing',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'Being so restless that it is hard to sit still',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 6,
                        'text' => 'Becoming easily annoyed or irritable',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                    [
                        'number' => 7,
                        'text' => 'Feeling afraid, as if something awful might happen',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'Several days'],
                            ['value' => 2, 'label' => 'More than half the days'],
                            ['value' => 3, 'label' => 'Nearly every day'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 4, 'severity' => 'minimal', 'color' => '#22c55e', 'description' => 'Minimal anxiety'],
                    ['min' => 5, 'max' => 9, 'severity' => 'mild', 'color' => '#eab308', 'description' => 'Mild anxiety'],
                    ['min' => 10, 'max' => 14, 'severity' => 'moderate', 'color' => '#f97316', 'description' => 'Moderate anxiety'],
                    ['min' => 15, 'max' => 21, 'severity' => 'severe', 'color' => '#dc2626', 'description' => 'Severe anxiety'],
                ],
            ],

            // ─── ASRS v1.1 (ADHD Screening) ───
            [
                'code' => 'asrs',
                'name' => 'ASRS v1.1 (Adult ADHD Self-Report Scale)',
                'description' => 'A 6-item screening instrument developed by the World Health Organization for adult ADHD.',
                'specialty' => 'psychiatry',
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'How often do you have difficulty getting things in order when you have to do a task that requires organization?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'How often do you have problems remembering appointments or obligations?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                    [
                        'number' => 6,
                        'text' => 'How often do you feel overly active and compelled to do things, like you were driven by a motor?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Rarely'],
                            ['value' => 2, 'label' => 'Sometimes'],
                            ['value' => 3, 'label' => 'Often'],
                            ['value' => 4, 'label' => 'Very Often'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 13, 'severity' => 'unlikely', 'color' => '#22c55e', 'description' => 'ADHD unlikely'],
                    ['min' => 14, 'max' => 17, 'severity' => 'possible', 'color' => '#eab308', 'description' => 'ADHD possible — further evaluation recommended'],
                    ['min' => 18, 'max' => 24, 'severity' => 'likely', 'color' => '#ef4444', 'description' => 'ADHD highly likely — comprehensive evaluation recommended'],
                ],
            ],

            // ─── AUDIT-C (Alcohol Use) ───
            [
                'code' => 'audit_c',
                'name' => 'AUDIT-C (Alcohol Use Disorders Identification Test - Concise)',
                'description' => 'A 3-item alcohol screening instrument that reliably identifies patients who are hazardous drinkers or have active alcohol use disorders.',
                'specialty' => null,
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'How often do you have a drink containing alcohol?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Monthly or less'],
                            ['value' => 2, 'label' => '2-4 times a month'],
                            ['value' => 3, 'label' => '2-3 times a week'],
                            ['value' => 4, 'label' => '4 or more times a week'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'How many drinks containing alcohol do you have on a typical day when you are drinking?',
                        'options' => [
                            ['value' => 0, 'label' => '1 or 2'],
                            ['value' => 1, 'label' => '3 or 4'],
                            ['value' => 2, 'label' => '5 or 6'],
                            ['value' => 3, 'label' => '7 to 9'],
                            ['value' => 4, 'label' => '10 or more'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'How often do you have 6 or more drinks on one occasion?',
                        'options' => [
                            ['value' => 0, 'label' => 'Never'],
                            ['value' => 1, 'label' => 'Less than monthly'],
                            ['value' => 2, 'label' => 'Monthly'],
                            ['value' => 3, 'label' => 'Weekly'],
                            ['value' => 4, 'label' => 'Daily or almost daily'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 2, 'severity' => 'low_risk', 'color' => '#22c55e', 'description' => 'Low risk'],
                    ['min' => 3, 'max' => 7, 'severity' => 'moderate_risk', 'color' => '#f97316', 'description' => 'Moderate risk — brief intervention recommended'],
                    ['min' => 8, 'max' => 12, 'severity' => 'high_risk', 'color' => '#dc2626', 'description' => 'High risk — further evaluation recommended'],
                ],
            ],

            // ─── PCL-5 (PTSD) — Abbreviated 5-item ───
            [
                'code' => 'pcl5',
                'name' => 'PCL-5 (PTSD Checklist — Abbreviated)',
                'description' => 'An abbreviated 5-item version of the PTSD Checklist for DSM-5 used for initial screening of post-traumatic stress disorder.',
                'specialty' => 'psychiatry',
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'Repeated, disturbing, and unwanted memories of a stressful experience?',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'A little bit'],
                            ['value' => 2, 'label' => 'Moderately'],
                            ['value' => 3, 'label' => 'Quite a bit'],
                            ['value' => 4, 'label' => 'Extremely'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'Feeling very upset when something reminded you of a stressful experience?',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'A little bit'],
                            ['value' => 2, 'label' => 'Moderately'],
                            ['value' => 3, 'label' => 'Quite a bit'],
                            ['value' => 4, 'label' => 'Extremely'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'Avoiding memories, thoughts, or feelings related to a stressful experience?',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'A little bit'],
                            ['value' => 2, 'label' => 'Moderately'],
                            ['value' => 3, 'label' => 'Quite a bit'],
                            ['value' => 4, 'label' => 'Extremely'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'Having strong negative beliefs about yourself, other people, or the world?',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'A little bit'],
                            ['value' => 2, 'label' => 'Moderately'],
                            ['value' => 3, 'label' => 'Quite a bit'],
                            ['value' => 4, 'label' => 'Extremely'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'Feeling jumpy or easily startled?',
                        'options' => [
                            ['value' => 0, 'label' => 'Not at all'],
                            ['value' => 1, 'label' => 'A little bit'],
                            ['value' => 2, 'label' => 'Moderately'],
                            ['value' => 3, 'label' => 'Quite a bit'],
                            ['value' => 4, 'label' => 'Extremely'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 5, 'severity' => 'minimal', 'color' => '#22c55e', 'description' => 'Minimal PTSD symptoms'],
                    ['min' => 6, 'max' => 10, 'severity' => 'mild', 'color' => '#eab308', 'description' => 'Mild PTSD symptoms'],
                    ['min' => 11, 'max' => 15, 'severity' => 'moderate', 'color' => '#f97316', 'description' => 'Moderate PTSD symptoms'],
                    ['min' => 16, 'max' => 20, 'severity' => 'severe', 'color' => '#dc2626', 'description' => 'Severe PTSD symptoms'],
                ],
            ],

            // ─── MDQ (Mood Disorder Questionnaire — Bipolar Screening) ───
            [
                'code' => 'mdq',
                'name' => 'MDQ (Mood Disorder Questionnaire)',
                'description' => 'A 13-item self-report screening instrument for bipolar spectrum disorders.',
                'specialty' => 'psychiatry',
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you felt so good or hyper that other people thought you were not your normal self?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were so irritable that you shouted at people or started fights or arguments?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you felt much more self-confident than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you got much less sleep than usual and found you didn\'t really miss it?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were much more talkative or spoke much faster than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 6,
                        'text' => 'Has there ever been a period of time when you were not your usual self and thoughts raced through your head and you couldn\'t slow your mind down?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 7,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were so easily distracted by things around you that you had trouble concentrating?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 8,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you had much more energy than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 9,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were much more active or did many more things than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 10,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were much more social or outgoing than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 11,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you were much more interested in sex than usual?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 12,
                        'text' => 'Has there ever been a period of time when you were not your usual self and you did things that were unusual for you or that other people might have thought were excessive, foolish, or risky?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 13,
                        'text' => 'Has there ever been a period of time when you were not your usual self and spending money got you or your family into trouble?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 6, 'severity' => 'negative', 'color' => '#22c55e', 'description' => 'Negative screen'],
                    ['min' => 7, 'max' => 13, 'severity' => 'positive', 'color' => '#ef4444', 'description' => 'Positive screen — comprehensive evaluation recommended'],
                ],
            ],

            // ─── C-SSRS (Columbia Suicide Severity Rating Scale) — Abbreviated ───
            [
                'code' => 'cssrs',
                'name' => 'C-SSRS (Columbia Suicide Severity Rating Scale — Abbreviated)',
                'description' => 'An abbreviated version of the Columbia Suicide Severity Rating Scale used for rapid screening of suicidal ideation and behavior.',
                'specialty' => 'psychiatry',
                'questions' => [
                    [
                        'number' => 1,
                        'text' => 'Have you wished you were dead or wished you could go to sleep and not wake up?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 2,
                        'text' => 'Have you actually had any thoughts of killing yourself?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 3,
                        'text' => 'Have you been thinking about how you might do this?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 4,
                        'text' => 'Have you had these thoughts and had some intention of acting on them?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 5,
                        'text' => 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                    [
                        'number' => 6,
                        'text' => 'Have you ever done anything, started to do anything, or prepared to do anything to end your life?',
                        'options' => [
                            ['value' => 0, 'label' => 'No'],
                            ['value' => 1, 'label' => 'Yes'],
                        ],
                    ],
                ],
                'scoring_ranges' => [
                    ['min' => 0, 'max' => 0, 'severity' => 'none', 'color' => '#22c55e', 'description' => 'No reported suicidal ideation'],
                    ['min' => 1, 'max' => 2, 'severity' => 'low', 'color' => '#eab308', 'description' => 'Low risk — passive ideation'],
                    ['min' => 3, 'max' => 4, 'severity' => 'moderate', 'color' => '#f97316', 'description' => 'Moderate risk — active ideation, safety plan recommended'],
                    ['min' => 5, 'max' => 6, 'severity' => 'high', 'color' => '#dc2626', 'description' => 'High risk — immediate safety assessment required'],
                ],
            ],
        ];

        foreach ($templates as $template) {
            ScreeningTemplate::updateOrCreate(
                ['code' => $template['code'], 'tenant_id' => null],
                [
                    'name' => $template['name'],
                    'description' => $template['description'],
                    'specialty' => $template['specialty'],
                    'questions' => $template['questions'],
                    'scoring_ranges' => $template['scoring_ranges'],
                    'is_active' => true,
                ]
            );
        }
    }
}
