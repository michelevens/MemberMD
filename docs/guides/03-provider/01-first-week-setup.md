# First-week setup for a new provider

> **For:** Provider · **Time:** 30–45 min · **Frequency:** Once

## Trigger

Your practice admin just added you as a provider. You received a welcome email with a temporary password and a link to `/login`.

## Outcome

Your profile, license info, schedule template, and telehealth identity are all wired in. You can see patients, run telehealth visits, write encounters, and message members.

## Where

- `/login` — first stop
- [Practice Portal](/practice) — your home base
- Your profile page (top-right avatar → "My profile")
- Settings → My Schedule (if your admin didn't pre-fill this)

## Steps

1. **Click the welcome email link** → `/login` → change your temporary password to something you'll remember. Strong password recommended (the platform has a "Generate strong password" button as of `108cd3c`).
2. **Set your photo, bio, and credentials line.** Top-right avatar → My Profile. The photo + bio show on the patient portal's Care Team tab — make it warm and human.
3. **Verify your license info.** Settings → My Profile → Licenses. Confirm each state, license number, and expiration date your admin entered is accurate. **If anything is wrong, fix it immediately** — appointment scheduling enforces this (a patient in a state where you're not licensed can't book with you).
4. **Confirm your telehealth identity is set.** Settings → My Profile → Telehealth. You should see a non-empty LiveKit identity string. If it's blank, ask your admin — telehealth won't work without it.
5. **Set your schedule template.** Settings → My Schedule. Default working hours per day of week (e.g. Mon-Thu 8a–4p, Fri off). This drives appointment availability.
6. **Test one telehealth session yourself.** Appointments → create a test appointment with a test patient (or with another provider as the "patient"). Walk through the full join → admit → camera/mic test → end-session flow. Better to find issues here than in front of a real patient.
7. **Skim the Dashboard.** Get familiar with where today's schedule, your unread messages, and lab results land — those are where most of your day lives.
8. **Optional: customize your encounter note templates.** Settings → My Profile → Encounter Templates. Default templates exist (SOAP, structured visit). Save your own for the visit types you run most.

## Watch-outs

- **Multi-state telehealth.** If your admin entered states where you're licensed but you don't actually intend to see patients there, appointments will route to you that you shouldn't take. Remove unused states.
- **DEA field on your profile.** If you're not authorized to prescribe controlled substances, leave it blank. A wrong DEA causes silent eRx failures later.
- **Photo dimensions.** Square crop at 400×400+. Skip animated GIFs.
- **Bio is patient-facing.** Don't write in third person if you'd address patients in first; mismatched voice feels off.
- **Schedule template ≠ availability.** Patients book against your live availability, which is template - already-booked - blocked time. To take a day off, add a block, don't edit the template.
- **Your Recent Activity tab** is per-provider — it shows what YOU did, not what the practice did. Useful for finding the encounter you started yesterday and didn't finish.

## Related jobs

- [Run a telehealth visit end-to-end](./02-run-telehealth-visit.md)
- [Write and finalize an encounter note](./03-write-encounter.md)
- Practice admin: [Add a provider or staff member](../02-practice-admin/03-add-team.md) — the playbook from your admin's side
