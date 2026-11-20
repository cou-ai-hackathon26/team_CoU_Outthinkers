# MaternaCare AI - Incremental Implementation Plan

## 1. Product direction

MaternaCare AI is a Bangla-first, human-supervised coordination tool for community health workers, nurses, midwives, and facility coordinators in Bangladesh.

The core product is not a diagnostic chatbot. It should help a worker move from a community observation to a completed, traceable care journey:

1. Capture a mother/newborn concern in Bangla voice or simple form.
2. Review and confirm the structured information extracted from the note.
3. Surface transparent care gaps and overdue follow-up.
4. Apply clinician-approved danger-sign rules and escalate urgently when triggered.
5. Match the case to a curated facility directory.
6. Track referral acknowledgment, travel/arrival, acceptance/transfer, outcome, and follow-up.

The prototype must use synthetic/demo data and clearly label unverified facility information. It must not diagnose, prescribe, claim that a patient is safe, or claim reductions in mortality or other health outcomes.

## 2. Current repository baseline

- `client/`: React 19 + TypeScript + Vite + Tailwind, currently a backend-health placeholder.
- `server/`: Express + TypeScript, health endpoint and a voice-intake proxy route.
- `server/prisma/schema.prisma`: only a minimal `Patient` model exists.
- `ai-service/`: FastAPI, Faster-Whisper transcription, and Ollama-based structured extraction.
- `deploy/`: reserved for deployment configuration; no production workflow is defined yet.

The existing voice route and AI service are useful scaffolding, but the product should first establish the workflow, data model, safety rules, and Bengali UI before adding more AI behavior.

## 3. Build phases

### Phase 0 - Product foundation and safety contract

Goal: make later modules agree on the same domain language.

- Define roles: community health worker, nurse/midwife, facility coordinator, supervisor/admin.
- Define case states and referral states as enums, not free text.
- Define what is confirmed, reported, uncertain, rule-triggered, and human-verified.
- Create a Bengali/English translation catalogue; Bengali is the default UI language.
- Create the safety contract: AI may transcribe and organize reported information, but only deterministic clinician-approved rules may trigger urgent escalation.
- Add audit fields to all clinically meaningful records: creator, timestamp, source, verification state, and last reviewer.
- Add a synthetic demo-data seed script and a small end-to-end acceptance scenario.

### Phase 1 - Identity, registration, and authentication

Goal: establish a secure identity foundation before building patient care workflows.

The system will support three account types: patient, nurse/community health worker, and admin. Patients use passwordless OTP authentication. Nurses and admins use password authentication with email-based password recovery. Public registration must never create nurse or admin accounts.

- Create a shared `User` account model with role, active status, email, phone, password hash, and timestamps.
- Keep patient and staff profile data in separate profile models rather than mixing authentication and personal information.
- Use internal UUID/CUID primary keys. Generate separate eight-digit public identifiers transactionally:
  - Patient ID: `00000001`, `00000002`, ...
  - Employee ID: `00000001`, `00000002`, ...
- Never use the formatted public ID as the database primary key; use a sequence/counter with a database transaction to prevent duplicates under concurrent registration.
- Seed the first admin through code or a controlled seed script. Do not expose public admin registration.
- Allow only an authenticated admin endpoint to create nurses and additional admins.
- Patient registration fields: name, optional email, date of birth, own contact number, emergency contact number, division, district, upazila, address, and audit metadata.
- Nurse registration fields: employee ID, name, email, contact number, division, district, upazila, address, password hash, and audit metadata.
- Support patient login by patient ID, registered phone number, or registered email. Send OTP only to an already registered destination.
- Support nurse login by email or employee ID plus password. Support admin login by email plus password.
- Prefer a dedicated staff/admin login flow instead of exposing a selectable admin role to ordinary users. If one shared form is retained, admin must be inferred from the authenticated account rather than trusting a client-selected role.
- Store OTPs and password-reset tokens as hashes, never plaintext. Add expiry, attempt limits, resend cooldowns, rate limiting, single-use consumption, and generic error messages that do not reveal whether an account exists.
- Use Argon2id or bcrypt for password hashing; never store recoverable passwords.
- Add role-based authorization middleware on every protected endpoint. The client role dropdown must never be treated as authorization.
- Create immutable audit logs for registration, login success/failure, OTP request/verification/expiry, password reset, account creation, account activation/deactivation, profile changes, and administrative actions.
- Build Bengali registration and login UX with one main action per screen, clear OTP instructions, date-calendar input, dependent location dropdowns, duplicate-contact feedback, and plain error messages.
- Add tests for concurrent public-ID allocation, role protection, OTP expiry/replay, password recovery, duplicate contacts, and admin-only creation.

### Phase 2 - Bengali-first shell and design system

Goal: replace the starter screen with a usable shell that can be tested by non-technical users.

- Add route structure for dashboard, new intake, patient timeline, referrals, facilities, follow-up tasks, and settings.
- Establish design tokens: warm off-white background, deep navy text, teal primary action, orange safety accent, green success, red emergency.
- Use a Bengali-capable font such as Noto Sans Bengali with a robust fallback stack.
- Build reusable components: large action card, status badge, step indicator, voice button, confirmation card, timeline, empty state, offline banner, and emergency banner.
- Default to large text, high contrast, generous spacing, full-width actions on mobile, and icons paired with Bengali labels.
- Add a persistent language toggle only if English is needed for staff; never make English the fallback for missing Bengali strings.
- Add accessible focus states, keyboard support, screen-reader labels, and touch targets of at least 44px.

### Phase 3 - Worker dashboard and case discovery

Goal: answer “কোন মায়ের/শিশুর জন্য এখন আমার কাজ আছে?” within seconds.

- Dashboard cards: urgent cases, overdue follow-ups, referrals awaiting acknowledgment, unresolved referrals, and today’s visits.
- Show only actionable summaries; avoid dense tables as the primary view.
- Provide filters by urgency, village/area, worker, maternal/newborn, and referral status.
- Make every priority explainable: “এই কাজটি দেখানো হয়েছে কারণ…” followed by recorded facts and timestamps.
- Include a safe, clearly labelled demo mode for synthetic cases.

### Phase 4 - Voice-assisted intake and human confirmation

Goal: capture a short Bangla voice note without requiring typing.

- Implement microphone permission and recording states with plain Bengali instructions.
- Send audio to the AI service for transcription; display the original transcript for review.
- Extract only reported symptoms, observations, dates, access barriers, and uncertain fields.
- Show extracted fields as editable confirmation cards, each marked confirmed/unconfirmed.
- Preserve the original voice note and transcript; never silently overwrite worker input.
- Support manual form entry when audio fails, connectivity is poor, or the worker prefers typing.
- Handle uncertainty explicitly: “এটি নিশ্চিত নয় - যাচাই করুন”.
- Add retry, cancel, slow-network, unsupported-audio, and service-unavailable states.

### Phase 5 - Patient/case timeline

Goal: give the worker one understandable view of continuity of care.

- Model pregnancy registration, antenatal contacts, screening, delivery information, postnatal contacts, newborn records, and follow-up tasks.
- Start with the proposal’s prototype scope: basic maternal and newborn timeline.
- Use a chronological visual timeline with Bengali event labels and source/verification status.
- Show missing or overdue items as tasks, not as medical conclusions.
- Keep maternal and newborn records linked but distinguishable.

### Phase 6 - Rule-based danger-sign escalation

Goal: provide fast, governed escalation for predefined danger-sign responses.

- Store clinician-approved rules and version them.
- Evaluate rules synchronously when relevant answers are saved; do not wait for an LLM.
- Show a high-contrast emergency panel with the reason, required next action, and who to contact.
- Require human acknowledgment for the escalation and record it in the audit trail.
- Create a referral draft from the escalation, but do not diagnose or prescribe.
- Add test cases for every rule, including missing, uncertain, contradictory, and translated inputs.

### Phase 7 - Care-gap prioritization

Goal: make routine follow-up work visible and explainable.

- Implement configurable, transparent rules for overdue contacts, incomplete screening, missing outcome, access barriers, and unresolved referrals.
- Keep emergency escalation separate and higher priority than routine scoring.
- Generate follow-up tasks with reason, due date, owner, and source facts.
- Allow supervisors to review or change rule configuration without changing application code later.
- Include an explanation panel on every priority task.

### Phase 8 - Facility directory and matching

Goal: help the worker choose an appropriate destination from trusted data.

- Create a curated facility directory with name, location, services, contact details, verification date, and data owner.
- Represent capabilities as structured data: maternity, newborn care, referral acceptance, operating hours, etc.
- Match by required service and estimated travel distance/time where available.
- Display “শেষ যাচাই” and “ডেমো তথ্য” prominently; never imply live bed, blood, ambulance, or service availability without a trusted live source.
- Add supervisor/admin workflows for facility verification and deactivation.

### Phase 9 - Closed-loop referral tracking

Goal: make a referral a workflow, not a one-time form.

- Implement the lifecycle: Draft -> Sent -> Acknowledged -> In transit -> Arrived -> Accepted/Transferred -> Completed, with Unresolved as a visible exception state.
- Record who performed each transition and when.
- Provide simple acknowledgment actions for the receiving facility or accompanying worker.
- Allow arrival and outcome evidence to be entered manually with source notes.
- Generate follow-up tasks when acknowledgment, arrival, acceptance, or outcome is missing.
- Make unresolved referrals visible to both responsible workers and supervisors.

### Phase 10 - Follow-up, reminders, and supervision

Goal: close the loop after the referral and support operational accountability.

- Task inbox for overdue and upcoming follow-ups.
- Worker notes and contact attempts with timestamps.
- Supervisor view for unresolved cases, aging referrals, and workload distribution.
- Optional notification adapters later; start with in-app reminders and an auditable notification interface.
- Do not send medical instructions automatically without an approved content and governance process.

### Phase 11 - Offline-first and low-connectivity behavior

Goal: keep the most important field workflow usable when connectivity is unreliable.

- Convert the client into an installable PWA.
- Cache the app shell and safe reference data.
- Queue intake drafts, notes, and referral updates locally with visible sync status.
- Make conflict resolution explicit; never silently replace a newer human-entered update.
- Allow voice recording and manual intake to be saved locally when AI processing is unavailable, then offer “পরে প্রক্রিয়া করুন”.
- Add an offline/online indicator that uses plain Bengali.

### Phase 12 - Reporting, governance, and pilot readiness

Goal: measure workflow performance without overstating health impact.

- Dashboard indicators from the proposal: acknowledgment rate, verified arrival/outcome rate, unresolved referral count, time to acknowledgment, and completed follow-up tasks.
- Keep operational analytics separate from patient-facing screens.
- Add export controls, retention rules, access logging, and data minimization.
- Add role-based access control, encrypted transport, secure secrets, backup/restore, and incident logging.
- Prepare a supervised pilot checklist covering clinical review, facility-data ownership, training, support, ethics/privacy review, and rollback.

## 4. Recommended data modules

Use separate models/modules for:

- Identity and access: `User`, `Role`, `PatientProfile`, `StaffProfile`, `WorkerAssignment`, `OtpChallenge`, `PasswordReset`, `AuditLog`.
- Bangladesh geography: `Division`, `District`, `Upazila`.
- People and cases: `PregnancyCase`, `Newborn`, `HouseholdContact`.
- Care records: `CareEvent`, `Observation`, `VoiceNote`, `Transcript`, `ExtractedField`, `VerificationReview`.
- Clinical governance: `DangerSignRule`, `Escalation`, `PriorityRule`, `FollowUpTask`.
- Referrals: `Referral`, `ReferralEvent`, `ReferralOutcome`, `ReferralParticipant`.
- Facilities: `Facility`, `FacilityCapability`, `FacilityVerification`, `FacilityContact`.
- Operations: `SyncQueueItem`, `Notification`, `DemoDataset`, `ExportJob`.

Every user-entered or AI-extracted fact should have a source and verification state. Clinical rules should be versioned and referenced by the escalation that they produced.

### Authentication-specific data rules

- Keep `public_id` and `employee_id` unique, non-reusable, and generated only on the server.
- Keep email and phone uniqueness rules explicit. A phone number should not silently belong to multiple active accounts unless a future household-account policy intentionally allows it.
- Store contact destinations in normalized form for lookup and OTP delivery.
- Store only `password_hash`, never a password or reversible password-encryption key.
- Store only `code_hash` for OTP challenges and `token_hash` for password reset records.
- Add `created_at`, `updated_at`, `expires_at`, `consumed_at`, `attempts`, and purpose fields to temporary authentication records.
- Make `AuditLog` append-only from the application’s perspective; administrative users may view it but must not edit or delete it through normal APIs.

### Bangladesh location data

- Seed `Division`, `District`, and `Upazila` from a reviewed Bangladesh administrative dataset.
- Store Bengali and English names, stable codes, parent relationships, and an explicit sort name.
- Return divisions alphabetically. Return districts filtered by division and sorted alphabetically. Return upazilas filtered by district and sorted alphabetically.
- Keep the location dataset versioned and reviewable rather than hardcoding options in React.
- Default the UI to Bengali; retain English names for staff/admin search, interoperability, and data maintenance.

## 5. API/service boundaries

### Client

React routes and feature components; Bengali copy; local draft and sync state; no clinical rule logic embedded in components.

### Server

Authentication/authorization, registration, OTP/password recovery, location APIs, case and timeline APIs, referral state machine, facility directory, task generation, audit trail, sync queue, and analytics endpoints.

Recommended authentication endpoints:

```text
POST /auth/patient/request-otp
POST /auth/patient/verify-otp
POST /auth/staff/login
POST /auth/staff/forgot-password
POST /auth/staff/reset-password
POST /admin/patients
POST /admin/nurses
POST /admin/admins
GET  /locations/divisions
GET  /locations/districts?divisionId=
GET  /locations/upazilas?districtId=
```

The server, not the client, must decide whether the caller is allowed to perform an action.

### AI service

Transcription and constrained information extraction only. Return structured, schema-validated data with uncertainty. Keep prompts and model configuration versioned. The AI service must not own clinical decisions or referral state transitions.

### Rules module

Deterministic, testable server-side rule evaluation for danger signs and routine care gaps. This should be callable without the AI service.

## 6. Suggested first implementation increments

Build the authentication module in these increments before starting the broader care workflow:

1. Prisma schema for users, patient/staff profiles, OTP/reset records, audit logs, and locations.
2. Bangladesh location seed data with dependent, alphabetically sorted lookup endpoints.
3. Seeded admin login and admin-protected nurse/admin creation.
4. Patient registration and passwordless OTP login.
5. Nurse login and email-based password recovery.
6. Bengali authentication screens, validation, loading/error/offline states, and role-aware routing.
7. Security and integration tests for authorization, OTP lifecycle, password recovery, audit logging, and public-ID allocation.

## 7. Suggested first care-workflow vertical slice

Build one complete, demoable journey before expanding breadth:

1. Worker opens Bengali dashboard.
2. Worker records a Bangla voice note.
3. System transcribes and extracts candidate facts.
4. Worker confirms the facts.
5. A deterministic rule or care-gap rule creates an explained task.
6. Worker selects a verified demo facility.
7. Worker sends a referral.
8. Another demo role acknowledges it and records arrival/outcome.
9. Dashboard stops showing the referral as unresolved.

This vertical slice validates the project’s real differentiator: traceable continuity of care.

## 8. UX principles for the target users

- Design for a first-time user who may not read much English, may share a phone, and may be working outdoors.
- One main action per screen; use progressive disclosure for details.
- Prefer Bengali sentences over labels such as “status”, “workflow”, or “triage”.
- Pair every important icon with text and, for key actions, an optional voice hint.
- Use familiar illustrations and human language; avoid hospital-control-room density.
- Confirm destructive or high-consequence actions in Bengali with the consequence stated plainly.
- Make uncertainty visible without blame. Use “যাচাই বাকি” rather than implying user error.
- Show success as a completed next step, not as decorative animation.
- Test with real community health workers before adding more features. Measure task completion, hesitation, mis-taps, and comprehension.

## 9. Definition of done for each module

Every module is complete only when it has:

- Bengali copy and empty/loading/error/offline states.
- Mobile layout tested on a low-end viewport.
- Permission and role checks.
- Auditability for meaningful data changes.
- Unit tests for rules/state transitions and API validation.
- At least one end-to-end acceptance scenario using synthetic data.
- A clear statement of what the module does not infer or claim.

