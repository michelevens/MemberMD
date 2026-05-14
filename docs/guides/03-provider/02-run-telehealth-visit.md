# Run a telehealth visit end-to-end

> **For:** Provider · **Time:** Visit duration + 5 min on each side · **Frequency:** Daily (for telehealth-heavy practices)

## Trigger

A patient has a scheduled telehealth appointment, and the time is approaching (or they just joined the waiting room).

## Outcome

You ran a HIPAA-compliant video visit, the patient was admitted from the queue, you took notes during/after, and you finalized the encounter so billing fires correctly.

## Where

- [Appointments](/practice?tab=appointments) — find today's appointment
- [Telehealth](/practice?tab=telehealth) — the live session UI
- Encounter editor — opens from the session or from Encounters tab

## Steps

1. **5 minutes before the appointment**, open [Telehealth](/practice?tab=telehealth). The patient's appointment shows in the queue with "Waiting" or "Not yet joined" status.
2. **Review the patient's intake** for this appointment (right-side panel: chief complaint, current meds, allergies, recent vitals if logged). Don't enter the session cold.
3. **When the patient appears in the waiting room**, you'll see a yellow "Admit" button on their row. Click **Admit**.
4. **You're in the session.** LiveKit-backed video. Top bar shows: patient name, appointment type, mic mute, camera toggle, share screen, end session.
5. **During the visit**, you can open the encounter editor in a side panel without leaving the session — type notes while you talk.
6. **Wrap up the visit.** Walk through your closing protocol (next steps, follow-up timing, what to expect). Click **"End session"**. The video closes; the patient sees a thank-you screen.
7. **Finalize the encounter.** The encounter editor stays open. Complete the structured note (see [Write and finalize an encounter note](./03-write-encounter.md)), enter ICD-10 codes if applicable, sign and finalize.
8. **Billing fires automatically.** If this appointment is covered by the patient's entitlements (e.g. "1 telehealth visit this month"), the entitlement decrements. If it's out-of-bucket à-la-carte, an à-la-carte charge fires through Stripe Connect to the patient's card on file.

## Watch-outs

- **The "Admit" workflow is one-direction.** Once you admit, the patient is in. There's no "un-admit" if you change your mind. End the session if needed.
- **Don't run a session with no camera.** State boards generally require audio + video for telehealth to bill. If the patient's camera doesn't work, document it and decide whether to convert to a phone visit (still bill as telehealth in most states, but check yours).
- **Sessions auto-close after 90 min** of inactivity (default; configurable). If you have long-running encounter notes to finish, do them outside the session — the editor preserves draft state.
- **BYOV (bring your own video) pattern.** Some practices use Zoom or Doxy instead of native LiveKit. If your practice is BYOV, the Telehealth tab gives the patient an external link instead of the in-app session. Documentation still happens in Encounters.
- **Recording is not available yet.** LiveKit egress + per-state consent rules are tabled work — see [project_telehealth_2026_05_04](../../../CLAUDE.md). Don't promise patients you'll record the session.
- **Group visits (3+ participants)** UI is not finalized. Currently optimized for 1:1. If you need 3+ (interpreter, family member, etc.), it works but the layout isn't great.
- **Pre-call self-test loopback** isn't in the app yet — tell new patients to test camera/mic in their browser settings before the visit.
- **Audit trail.** The session start, admit moment, and end are logged with timestamps + participants. You don't need to log session details to the encounter; the metadata is captured automatically.

## Related jobs

- [Write and finalize an encounter note](./03-write-encounter.md)
- [Prescribe a medication](./04-prescribe.md) — common follow-up to a visit
- Patient: [Join a telehealth visit](../05-patient/03-join-telehealth.md)
