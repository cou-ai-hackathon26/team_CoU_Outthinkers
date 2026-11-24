# MaternaCare AI

MaternaCare AI is a Bengali-first maternal and newborn care platform built by team `CoU_Outthinkers` for the **CoU Technova AI Hackathon**.

The platform is designed for rural mothers and families with limited technical experience. It connects patients with nurses/community health workers through voice-based intake, Bengali AI assistance, structured care workflows, follow-up tracking and facility referral support.

> AI assists with information organization and general guidance. Health workers remain responsible for verification and care decisions.

## Contributors

- Abdullah Mohammad Mahin
- Hemayet Uddin Himu
- Rakibul Hasan

## Problem Background

Many rural mothers face barriers when trying to access timely maternal healthcare:

- Limited access to doctors and trained healthcare professionals
- Long distances to hospitals and health facilities
- Difficulty explaining symptoms through complex digital forms
- Low digital literacy
- Delayed communication between patients and community health workers
- Fragmented follow-up and referral processes
- Language barriers in existing digital health systems
- Difficulty identifying nearby facilities during urgent situations

A patient may experience bleeding, severe pain, fever or reduced fetal movement but may not know how urgent the situation is or how to communicate the problem clearly to a healthcare worker.

## Our Solution

MaternaCare AI provides a simple Bengali digital care journey:

1. A patient registers using Bengali forms.
2. The patient logs in using OTP authentication.
3. She records her concern in Bengali or completes a manual care-intake form.
4. Voice recordings are saved in the browser's IndexedDB on the same device. If offline, they wait locally until the connection returns.
5. Faster-Whisper transcribes the recording when the service is reachable; the patient can review and edit the transcript before sending it.
6. The care request is saved with an idempotency key so a retry does not create a duplicate.
7. Gemini structures the transcript into useful intake information.
8. Deterministic safety rules identify potential red-flag symptoms.
9. The nurse receives the intake in an inbox and reviews, edits and verifies the AI-generated information.
10. The nurse creates follow-ups and referrals.
11. The system suggests nearby facilities using live location or registered upazila. Referral progress and follow-up outcomes are recorded.

## Project Impact

MaternaCare AI aims to:

- Make maternal healthcare technology accessible to rural Bengali-speaking patients
- Reduce the communication gap between patients and healthcare workers
- Help nurses prioritize incoming care requests
- Preserve patient voice and context during intake
- Improve visibility of urgent symptoms
- Make referral and follow-up workflows trackable
- Reduce dependence on technical literacy
- Help patients identify nearby healthcare facilities
- Support earlier human intervention without replacing clinical judgment

## AI and Innovation Workflows

### Bengali Voice Intake

Patients can describe symptoms naturally in Bengali instead of filling out complex medical forms.

```text
Patient Bengali voice
        ↓
Save audio in browser IndexedDB
        ↓
┌───────────────────┴───────────────────┐
Offline                                Online
Wait on this device              Upload audio to API
└───────────────────┬───────────────────┘
                    ↓
             Faster-Whisper
                    ↓
          Editable Bengali transcript
        ↓
Patient reviews and sends
        ↓
Nurse inbox
```

The original recording stays on the device while transcription or submission is pending. When the connection returns, the open intake page resumes transcription automatically. Failed transcriptions keep the recording for retry. The patient can edit the transcript before sending it to the nurse, or delete an unneeded local transcript and its recording after confirmation. Idempotency keys protect against duplicate requests during retries.

### AI-Assisted Structured Extraction

Gemini converts transcripts into structured information:

- Reported symptoms
- Observations
- Dates and duration
- Access barriers
- Uncertain information
- Possible safety indicators

The nurse can edit and verify generated information before it becomes part of the care workflow.

### RAG Based Knowledge Source-Aware Bengali Chatbot

Patients can ask health-related questions in Bengali. The chatbot:

- Classifies question intent
- Retrieves approved maternal-health knowledge
- Uses official knowledge sources
- Provides source references where available
- Refuses unsupported medical claims
- Avoids diagnosis and prescription
- Escalates uncertain or high-risk questions to a nurse
- Streams responses progressively when possible

The knowledge corpus includes reviewed UNICEF and maternal nutrition resources.

### Deterministic Safety Alerts

Transparent rules identify possible red-flag symptoms such as:

- Bleeding
- Severe abdominal pain
- Reduced fetal movement
- Fever
- Breathing difficulty
- Loss of consciousness

These alerts are suggestions for health-worker attention, not diagnoses.

### Human-in-the-Loop Verification

AI output is never treated as final clinical truth. Nurses can:

- Review the original transcript
- Edit the AI summary
- Verify the intake
- Reject incorrect information
- Request clarification
- Record reviewer identity and verification time

### Location-Based Facility Suggestions

The platform uses:

1. Patient live location
2. Registered patient upazila fallback
3. Nurse assigned-area fallback

Google Places and Routes services find nearby hospitals and clinics, estimate route time and provide directions.

Facilities are separated into:

- Admin-verified trusted facilities
- Google-discovered unverified facilities

The system does not claim live bed, blood, ambulance or service availability without a trusted live source.

### Closed-Loop Referral Workflow

```text
Draft → Sent → Acknowledged → In transit → Arrived → Accepted / Transferred → Completed
```

`Unresolved` is available as an exception state when progress stops.

### Follow-Up and Care-Gap Workflow

The system supports follow-up task creation, due dates, priority levels, worker notes, contact attempts, outcome recording, next actions, care-gap rules and supervisor visibility.

## Main User Roles

### Patient

- Bengali registration and OTP login
- Voice or manual care intake
- Editable transcript review
- Bengali AI chatbot
- Care request tracking
- Follow-up visibility
- Emergency facility suggestions
- Google Maps directions

### Nurse / Community Health Worker

- Password login
- Intake inbox
- Patient search and case view
- Voice and manual intake creation
- Transcript verification
- AI summary editing
- Safety alert review
- Follow-up management
- Referral creation and tracking
- Facility suggestions

### Admin

- Admin authentication
- Nurse account management
- Patient directory
- Facility directory management
- Facility verification and deactivation
- Knowledge-source review
- Care-gap rule management
- Supervision dashboard
- Audit-log access

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Axios
- Lucide React
- Bengali-first responsive UI

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Nodemailer/Brevo SMTP
- Authenticated role-based API access
- Rate limiting

### AI Service

- Python
- FastAPI
- Faster-Whisper
- Hugging Face Transformers
- PyTorch
- Gemini API
- Optional Ollama fallback
- Sentence Transformers for semantic retrieval
- Pydantic

### External Services

- Gemini API
- Google Places API
- Google Routes API
- SMTP email provider
- PostgreSQL

## Repository Structure

```text
maternacare-ai/
├── client/                         # React + TypeScript patient, nurse and admin UI
│   ├── public/                     # Static public assets and icons
│   ├── src/
│   │   ├── App.tsx                 # Main route registration and shared layouts
│   │   ├── LandingPage.tsx         # Public project title/landing page
│   │   ├── Registration.tsx        # Bengali patient registration
│   │   ├── PasswordReset.tsx       # Staff password recovery screens
│   │   ├── PatientChat.tsx         # Bengali AI chatbot and facility suggestions
│   │   ├── PatientRequests.tsx     # Patient care-request tracking
│   │   ├── PatientFollowUps.tsx    # Patient follow-up view
│   │   ├── PatientOfflineIntake.tsx # Local voice/manual queue, transcription and review
│   │   ├── offline-intake.ts       # IndexedDB storage and queue types
│   │   ├── WorkerNavbar.tsx        # Shared nurse navigation
│   │   ├── Worker*.tsx             # Nurse intake, patient, referral and follow-up workflows
│   │   ├── Admin*.tsx              # Admin management and governance workflows
│   │   ├── RouteTimeButton.tsx     # Travel-time calculation UI
│   │   ├── lib/                    # API client and location helpers
│   │   ├── assets/                 # Frontend visual assets
│   │   └── *.css                   # Shared responsive design system
│   └── package.json
│
├── server/                         # Node.js/Express application server
│   ├── src/
│   │   ├── index.ts                # API process entry point
│   │   ├── app.ts                  # Express app, middleware and route mounting
│   │   ├── lib/
│   │   │   ├── prisma.ts           # PostgreSQL/Prisma client
│   │   │   ├── ai-client.ts        # Authenticated AI-service requests
│   │   │   └── rate-limit.ts       # API abuse protection
│   │   ├── routes/
│   │   │   └── voice.ts            # Authenticated voice-upload proxy
│   │   └── modules/
│   │       ├── auth/               # OTP, staff login, password reset and tokens
│   │       ├── patients/           # Patient profile, chat and intake requests
│   │       ├── staff/              # Nurse inbox, verification, referrals and follow-ups
│   │       ├── admin/              # Admin overview, facilities and supervision
│   │       ├── facilities/         # Google Places/Routes and facility matching
│   │       ├── locations/          # Bangladesh division/district/upazila APIs
│   │       ├── notifications/      # Email and in-app notification delivery
│   │       └── workflow/           # Care gaps, tasks, events and workflow services
│   ├── prisma/
│   │   ├── schema.prisma           # Complete application data model
│   │   ├── migrations/             # Versioned database migrations
│   │   ├── seed.ts                 # Combined development seed
│   │   └── seeders/                # Admin, location and care-gap seed data
│   ├── .env.example
│   └── package.json
│
├── ai-service/                     # Python/FastAPI AI application
│   ├── app/
│   │   ├── main.py                 # FastAPI app and route registration
│   │   ├── config.py               # AI, model, cache and provider configuration
│   │   ├── dependencies.py         # Model lifecycle and service authentication
│   │   ├── routers/
│   │   │   ├── transcription.py    # Bengali audio transcription endpoint
│   │   │   ├── extraction.py       # Structured intake extraction endpoint
│   │   │   ├── chatbot.py          # Bengali chatbot and streaming endpoint
│   │   │   └── health.py           # AI-service health endpoint
│   │   ├── services/
│   │   │   ├── whisper_service.py  # Faster-Whisper processing
│   │   │   ├── gemini_service.py   # Gemini requests, retry and fallback
│   │   │   ├── extraction_service.py # Intake extraction and safe fallback
│   │   │   ├── chatbot_service.py  # Chat orchestration
│   │   │   ├── knowledge_service.py # Approved-corpus retrieval
│   │   │   ├── intent_service.py   # Bengali question classification
│   │   │   ├── diet_service.py     # Diet-plan clarification flow
│   │   │   ├── safety_service.py   # Deterministic red-flag detection
│   │   │   └── response_validator.py # Source and safety validation
│   │   ├── schemas/                # Pydantic request/response models
│   │   └── prompts/                # Extraction and chatbot prompts
│   ├── knowledge/
│   │   ├── sources_manifest.json   # Knowledge-source metadata and review status
│   │   ├── *.md                    # Bengali reviewed guidance
│   │   └── sources/                # Official source PDFs and extracted text
│   ├── scripts/                    # Corpus review and maintenance tools
│   ├── tests/                      # AI behavior and medical-assistant tests
│   └── requirements.txt
│
├── docs/                           # Product plans and implementation notes
├── deploy/                         # Deployment configuration and operational files
├── .gitignore                      # Secret, build and local-runtime exclusions
└── README.md
```

## System Architecture

```text
                         ┌─────────────────────────────┐
                         │        Patient Browser       │
                         │ voice, form, IndexedDB, chat │
                         └──────────────┬──────────────┘
                                        │ HTTPS/JSON/SSE
                         ┌──────────────▼──────────────┐
                         │       React Web Client       │
                         │ patient · nurse · admin UI  │
                         └──────────────┬──────────────┘
                                        │ REST API
                         ┌──────────────▼──────────────┐
                         │    Express/TypeScript API    │
                         │ auth, workflows, RBAC, audit │
                         └───────┬───────────┬─────────┘
                                 │           │
                    Prisma/SQL   │           │ AI requests
                                 │           │
              ┌──────────────────▼───┐   ┌──▼────────────────────┐
              │      PostgreSQL       │   │   FastAPI AI Service   │
              │ users, care, referral │   │ Whisper, Gemini, RAG  │
              │ tasks, audit, facility│   │ safety and validation  │
              └──────────────────────┘   └──────────┬─────────────┘
                                                    │
                                  ┌─────────────────▼──────────────┐
                                  │ External AI and location APIs  │
                                  │ Gemini · Google Places/Routes   │
                                  │ SMTP email delivery             │
                                  └────────────────────────────────┘
```

### Main Request Flows

#### Patient Voice Intake

```text
Patient records Bengali audio
        ↓
Save recording in IndexedDB with a unique local ID
        ↓
If offline: wait locally ──────┐
If online/reconnected: upload  ◄┘
        ↓
Express forwards multipart audio to FastAPI
        ↓
Faster-Whisper returns Bengali transcript
        ↓
Save editable transcript locally for patient review
        ↓ patient submits
Express saves care request in PostgreSQL with idempotency key
        ↓
Nurse sees the request in the inbox
```

If transcription fails, the client keeps the original audio and exposes a retry action. The local queue also recovers interrupted uploads when the patient returns to the page. After the care request is accepted, the client marks the item as sent and removes its local audio copy. The patient can delete an unsubmitted transcript and its local audio from the queue.

#### AI Chatbot

```text
Patient Bengali question
        ↓
Express authenticates and stores message
        ↓
FastAPI classifies intent and retrieves approved sources
        ↓
Safety rules check for red flags
        ↓
Gemini generates a source-aware response
        ↓
Response is validated and streamed to the patient
        ↓
Message, sources and review metadata are stored
```

#### Facility and Referral Flow

```text
Live location permission
        ↓ permission denied
Registered upazila / assigned area fallback
        ↓
Google Places nearby search + curated verified facilities
        ↓
Capability and distance filtering
        ↓
Patient/nurse selects facility
        ↓
Referral stores facility source, coordinates and trust status
        ↓
Referral lifecycle and follow-up events are recorded
```

### AI Service Structure

```text
ai-service/app/
├── main.py
├── config.py
├── dependencies.py
├── routers/
│   ├── transcription.py
│   ├── extraction.py
│   ├── chatbot.py
│   └── health.py
├── services/
│   ├── whisper_service.py
│   ├── gemini_service.py
│   ├── extraction_service.py
│   ├── chatbot_service.py
│   ├── knowledge_service.py
│   ├── safety_service.py
│   └── response_validator.py
├── schemas/
└── prompts/
```

## Local Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL
- Git
- Gemini API key
- Google Maps API key
- SMTP credentials for email OTP/password recovery

### Clone the Repository

```bash
git clone https://github.com/mahin-pgg/maternacare-ai.git
cd maternacare-ai
```

### Configure the Database and Server

Create a PostgreSQL database, then configure `server/.env` using `server/.env.example`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/maternacare_db?schema=public"
PORT=5050
CLIENT_URL=http://localhost:5173
AI_SERVICE_URL=http://127.0.0.1:8000
AUTH_TOKEN_SECRET=replace-with-a-random-secret-at-least-32-characters
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=your-gemini-model
GOOGLE_MAPS_SERVER_API_KEY=your-server-restricted-google-key
```

Configure SMTP variables if email delivery is enabled.

```bash
cd server
npm install
npx prisma migrate deploy
npm run db:seed
npm run db:seed:locations
npm run db:seed:care-gaps
npm run db:seed:admin
npm run dev
```

The backend runs on `http://localhost:5050`.

### Configure and Start the AI Service

```bash
cd ai-service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The AI health endpoint is `http://127.0.0.1:8000/health`.

The Bengali Whisper model may download on first startup and requires significant disk space and memory.

### Start the Frontend

```bash
cd client
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Testing

### Frontend Build

```bash
cd client
npm run build
```

### Backend Build

```bash
cd server
npm run build
```

### Backend Tests

```bash
cd server
npm test
```

Current tests cover API health, authentication tokens, registration validation, OTP validation, protected routes and referral lifecycle transitions.

## Safety and Governance

MaternaCare AI is a human-in-the-loop support system.

The platform:

- Does not replace doctors or nurses
- Does not provide definitive diagnosis
- Does not automatically prescribe medication
- Does not claim facility availability without trusted data
- Requires nurse verification for AI-generated intake information
- Uses approved knowledge sources for patient-facing guidance
- Keeps emergency escalation separate from routine care-gap scoring

## Current Prototype Limitations

- Bengali transcription quality depends on audio quality, dialect and background noise
- Voice transcription is post-recording rather than fully real-time
- Gemini free-tier quota may be exhausted
- Google facility results may be unverified
- Live hospital bed, blood and ambulance availability are not available
- Offline voice drafts and retry synchronization work in the same browser/device; browser storage can still be removed by the user or operating system
- Automatic synchronization resumes while the intake page is open or when the patient returns to it; background synchronization while the browser is closed is not implemented
- Production backup, retention and disaster recovery need further work
- Clinical validation and supervised pilot testing are still required
- Browser, accessibility and mobile-device testing should be expanded
- External facility acknowledgment is not fully implemented

## Future Roadmap

- Installable PWA support and background synchronization
- Complete facility verification history
- Semantic retrieval optimization
- Expanded Bengali clinical evaluation set
- More detailed supervisor analytics
- Facility acknowledgment workflow
- Stronger audit and privacy controls
- Clinical pilot and healthcare-partner validation
- Production image captured with consent from real participants

## Prototype Image Attribution

The prototype landing page uses a UNFPA Bangladesh image for demonstration purposes. The image should be replaced with an original, consented photograph before production deployment.


