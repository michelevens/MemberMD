# Join a telehealth visit

> **For:** Patient · **Time:** 5 min before + visit length · **Frequency:** Whenever you have a virtual visit

## Trigger

You have an upcoming telehealth appointment. The time is approaching.

## Outcome

You join the video visit from your phone, tablet, or computer. Your provider admits you from the waiting room. You complete the visit and end the session.

## Where

- [Appointments](/patient) — tab on your patient portal
- The appointment row shows a **"Join visit"** button when it's time

## Steps

1. **5–10 minutes before the appointment**, open your patient portal and go to Appointments.
2. **Find today's telehealth visit.** Click **"Join visit."** (The button activates 10 minutes before the start time; before that it shows "Visit hasn't started yet.")
3. **Browser permission prompts.** Your browser asks to access your camera + microphone. Click **Allow**. Without both, the visit can't proceed.
4. **You're in the waiting room.** A screen shows: "Your provider will admit you shortly." Stay on this screen.
5. **Provider admits you.** Video connects. You see your provider; they see you.
6. **During the visit**, use the in-page controls:
   - **Mic mute** — for if a dog barks or someone walks in.
   - **Camera toggle** — same.
   - **Chat** (if your practice has it enabled) — type a note your provider sees.
7. **End the visit.** Your provider clicks "End session." You see a thank-you screen. The visit is over.

## Watch-outs

- **Use a browser, not the email link directly.** The "Join" button on the email shortcuts straight in, but if your camera/mic doesn't work, you've got nowhere to go but back to the portal. Better to start from the portal.
- **Test your camera + mic ahead of time.** Most issues are device-level. Open your phone or computer's settings to confirm video calls work BEFORE the appointment. (A pre-call self-test loopback inside MemberMD is planned but not built yet.)
- **Use Wi-Fi if possible.** Cellular works but eats data fast (~200MB per 30-min visit).
- **Headphones reduce echo.** Especially on speakerphone.
- **Don't share the join link.** Each session is per-appointment. If someone else needs to be in the visit (interpreter, family member, parent of pediatric patient), tell your practice ahead of time so they can plan.
- **Recording is not enabled** in this version of the platform. Your provider can't record the session. If you want a record, take notes or ask for an after-visit summary in [Messages](./07-send-message.md).
- **If you drop**, you can rejoin from the same Appointments tab. The session stays open as long as your provider is in it.
- **iPad / iPhone Safari**: Mobile Safari can be finicky with WebRTC. If video doesn't connect, try Chrome on iPad. (Mobile Safari testing is a known gap — see [project_telehealth_2026_05_04](../../../CLAUDE.md).)
- **State licensure.** Your provider can only see you in a state where they're licensed. If you're traveling, they may need to reschedule for when you're home.

## Related jobs

- [Book, reschedule, or cancel an appointment](./08-manage-appointments.md)
- [View your health records and past visits](./02-view-records.md) — after the visit, your encounter note lands here
- Provider: [Run a telehealth visit end-to-end](../03-provider/02-run-telehealth-visit.md)
