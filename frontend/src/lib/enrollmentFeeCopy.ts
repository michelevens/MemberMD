// Shared "what does the enrollment fee cover" copy.
//
// Practices can override via `membership_plans.enrollment_fee_explanation`
// on each plan; this is the fallback that ships out-of-the-box so a
// brand-new tenant has a reasonable answer the moment a patient asks
// "what's this charge for?"
//
// Generic but specific. Every word earns its place — patients read
// this mid-checkout and bounce on length. If a practice needs a
// longer explanation they should override the field per-plan.

const DEFAULT_ENROLLMENT_FEE_EXPLANATION =
  "Covers your initial assessment — the intake visit where your provider " +
  "reviews your history, sets up your chart, and tailors your care plan. " +
  "One-time charge billed today alongside your first month.";

/** Returns the practice-specific explanation when set, else the default. */
export function enrollmentFeeExplanation(planExplanation?: string | null): string {
  const trimmed = (planExplanation ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_ENROLLMENT_FEE_EXPLANATION;
}
