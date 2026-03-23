# PlanEx — Project Management App

A production-ready full-stack project management application built with the MERN stack. Features real-time collaboration, Kanban boards with custom columns, role-based task permissions, analytics, offline support, voice-to-text input, audio comments via AWS S3, async email notifications via AWS SQS, and a comprehensive REST API with MongoDB aggregation pipelines.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [AWS Setup](#aws-setup)
- [Scripts](#scripts)
- [Key Design Decisions](#key-design-decisions)

---

## Features

### Authentication
- JWT-based authentication with 7-day token expiry
- Secure password hashing with bcrypt (12 salt rounds)
- Rate limiting on login/register — 10 attempts per 15 minutes
- Auto-assigned user color based on name
- Theme preference (dark/light) persisted per user

### Task Management
- Full CRUD for tasks with title, description, status, priority, due date
- Drag and drop Kanban board (default + custom columns)
- List view with sorting and filtering
- Subtasks with completion tracking, progress bar, and **"added by" attribution**
- Comments on tasks with real-time updates
- **Voice-to-text** input for task title, description, and comments (Web Speech API)
- **Audio comments** — record voice, choose to send as audio file (stored in S3) or text
- Activity log — tracks every field change with old/new values
- Tags, estimated hours, recurring task support
- Bulk status updates across multiple tasks
- Assignee management with live search picker

### Role-Based Task Access
- **Owner / Creator / Project Admin** — full access to all task fields
- **Assignee** — can update status, add comments, add subtasks, upload attachments
- Assignees cannot: edit title, description, priority, due date, assignees, or delete task/attachments
- Blue info banner shown to assignees explaining their permissions
- Server enforces permissions — UI restrictions cannot be bypassed via API
- `_permission` field returned by `GET /tasks/:id` — client uses server's authoritative answer

### Custom Columns
- Each project supports unlimited custom columns beyond the 4 defaults
- Default columns (To Do, In Progress, In Review, Done) are **locked** — cannot rename or delete
- Custom columns can be renamed, deleted, reordered via drag and drop
- Custom column IDs use `slug_random` format — never clash with defaults
- Deleting a column with tasks → tasks auto-migrated to "To Do"
- Column changes broadcast via Socket.io — all members see update instantly
- Status filter in project page dynamically includes custom columns
- Task creation in custom columns works correctly — validator accepts any status string

### My Tasks
- Personal task view across all projects
- **Two view modes** — List view and Kanban board view
- Tabs: All Active, Personal (no project), Today, This Week, Overdue, Completed
- Real-time updates via socket + Redux fallback
- Toggle task completion inline
- Tab counts update instantly

### Offline Support (IndexedDB)
- Create personal tasks while completely offline
- Tasks saved to browser IndexedDB — persists across browser restarts
- Auto-sync when connection returns (1.5s stability delay)
- Visual "⏳ Pending sync" badge on offline tasks
- Offline tasks are read-only — no checkbox, no detail panel, no edits
- Offline tasks excluded from Analytics and Dashboard stats until synced
- Project dropdown disabled offline (project tasks need real MongoDB IDs)
- Partial sync support — failed tasks stay in queue, retried next session
- Submit button changes to "💾 Save Offline" with yellow color when offline

### Voice to Text
- Mic button on task title, description, and comment fields
- Click to start recording — browser requests mic permission once
- Pulsing red waveform icon while listening
- Speech appends to existing text (doesn't replace)
- Graceful error handling for all cases: permission denied, no mic, no speech, network error, unsupported browser
- Hidden automatically on unsupported browsers (Firefox, older Safari)
- HTTPS check with clear message for production environments

### Audio Comments
- After voice recording in comments, user is offered choice: **Send as Audio** or **Send as Text**
- Audio blob recorded via MediaRecorder API alongside SpeechRecognition transcript
- Audio file uploaded to AWS S3 under `taskflow/voice-comments/{taskId}/`
- Comment stores both `audioUrl` (S3) and `text` (transcript as caption)
- Audio comments render with HTML5 `<audio controls>` player + 🎤 Voice badge
- If S3 upload fails → automatically falls back to sending transcript as text
- Comment deletion also deletes audio file from S3

### Assigned Projects (Sidebar)
- Sidebar split into **My Projects** (owned) and **Assigned** (has tasks there)
- Assigned section shows projects where user has assigned tasks but is NOT the owner
- Each assigned project shows task count badge
- Clicking assigned project → shows only YOUR assigned tasks with blue banner
- Assignee view hides: Add Task button, Manage Columns button
- Server allows read-only project access for users with assigned tasks

### File Attachments (AWS S3)
- Upload images, PDFs, Word documents, text files (max 10MB)
- Upload during task creation or from task detail panel
- Drag and drop upload support with live preview
- Image thumbnails with view/download actions
- Auto-delete from S3 when task is deleted
- Only task owners can delete attachments (assignees can view/download only)

### Projects
- Create and manage multiple projects with custom color and icon
- **Custom Kanban columns** — add, rename, reorder, delete beyond 4 defaults
- Kanban board per project with live stats bar showing all columns including custom
- List view per project with filters (status filter includes custom columns)
- Project members with owner/member roles
- Real-time progress tracking — updates instantly on drag/drop
- Task counts and completion percentage in sidebar
- Dynamic stats bar scrolls horizontally when many custom columns present

### Dashboard (Overview)
- Stats: Total Projects, Active Tasks, Due Today, Overdue
- High Priority Tasks — only urgent and high priority tasks shown
- Task Distribution bar chart — scoped to user's own tasks, deduplicated
- Per-project progress cards with completion percentage
- All stats via MongoDB `$facet` aggregation with `$group` deduplication

### Analytics Page
**Personal Analytics:**
- Completion rate, active tasks, current streak, average days to complete
- Tasks completed over last 30 days (area chart)
- Active tasks by priority breakdown (donut/pie chart)
- Productivity by day of week (bar chart)

**Project Analytics:**
- Project selector dropdown
- Burn down chart — tasks remaining over last 30 days
- Task creation vs completion line chart (velocity)
- Member contribution horizontal bar chart (leaderboard)
- Project stats: total, completed, active, overdue, completion rate

### Notifications
- In-app notifications panel (newest first)
- Instant mark-as-read via Redux — no loading state
- Unread count badge on bell icon
- Persistent storage in user document

### Email Notifications (AWS SQS + Nodemailer)
- Async email queue — never blocks API response
- Task assignment emails with professional HTML template
- Comment notification emails
- Queue worker runs as separate process
- Graceful degradation — app works fine without SQS configured

### Real-time (Socket.io)
- Live task creation, updates, deletion on Kanban board
- Personal `user:id` rooms for My Tasks updates
- Project `project:id` rooms for Kanban updates
- Real-time in-app notifications
- Custom column changes broadcast to all project members
- Socket reconnection with polling fallback

### Security
- Helmet.js — secure HTTP headers
- CORS protection with configurable origin
- Request size limit (10kb)
- Input validation middleware
- ObjectId validation on all `:id` routes
- Role-based authorization on task operations
- Bulk update field whitelist
- Rate limiting on auth routes

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Redux Toolkit | Global state management |
| React Router v6 | Client-side routing |
| Socket.io-client | Real-time communication |
| Axios | HTTP client with JWT interceptor |
| Recharts | Analytics charts |
| @hello-pangea/dnd | Drag and drop Kanban board |
| IndexedDB (native) | Offline task storage |
| Web Speech API (native) | Voice to text |
| MediaRecorder API (native) | Audio recording for voice comments |

### Backend
| Technology | Purpose |
|---|---|
| Node.js v18+ | Runtime |
| Express 4 | Web framework |
| MongoDB + Mongoose | Database + ODM |
| Socket.io | Real-time WebSocket server |
| JWT | Stateless authentication |
| bcryptjs | Password hashing |
| Helmet | Secure HTTP headers |
| express-rate-limit | Brute force protection |
| Multer + multer-s3 | File upload handling |
| Nodemailer | SMTP email sending |

### Cloud & Infrastructure
| Service | Purpose |
|---|---|
| AWS S3 | File, image, and audio storage |
| AWS SQS (FIFO) | Async email message queue |
| Gmail SMTP | Email delivery |

---

## Architecture

```
Browser (React + Redux + IndexedDB + Web Speech API)
        │
        ├── REST API (axios) ──────────────────────→ Express Server
        │                                                   │
        └── WebSocket (socket.io-client) ──────────→ Socket.io Server
                                                            │
                                          ┌─────────────────┼──────────────┐
                                          │                 │              │
                                     Controllers       Middleware      Services
                                          │                 │              │
                                     MongoDB ←──── Mongoose    AWS S3 / SQS
                                                                       │
                                                                 Queue Worker
                                                                       │
                                                                 Gmail SMTP
```

### Permission System
```
Task Creator / Project Owner / Project Admin → 'owner' permission → full access
Task Assignee (not creator/owner)            → 'assignee' permission → restricted
No relation to task                          → 'none' → 403 Forbidden

Server computes permission on every mutating request.
Client receives _permission field from GET /tasks/:id.
UI gates every interactive element based on canEdit / canDelete.
```

### Offline Sync Flow
```
User offline → creates task → IndexedDB (persists across sessions)
                                    ↓
              shown in MyTasks with "⏳ Pending sync" badge
                                    ↓
User comes back online → 1.5s stability delay
                                    ↓
              syncManager loops through pending tasks
                                    ↓
              POST /api/tasks for each → deletes from IndexedDB on success
                                    ↓
              MyTasks re-fetches → real tasks replace pending ones
```

### Voice Comment Flow
```
User clicks mic → getUserMedia (one permission prompt)
                        ↓
        SpeechRecognition + MediaRecorder start simultaneously
                        ↓
              User speaks → stops speaking
                        ↓
        SpeechRecognition.onend fires → stops MediaRecorder
                        ↓
        Both transcript AND audio blob ready
                        ↓
        Choice dialog: "Send as Audio" | "Send as Text" | Discard
                        ↓
        Audio → upload blob to S3 → save audioUrl + transcript in MongoDB
        Text  → save transcript as normal comment
```

---

## Folder Structure

```
planex/
│
├── client/
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── analytics/AnalyticsPage.jsx
│       │   ├── auth/AuthPage.jsx
│       │   ├── common/
│       │   │   ├── MicButton.jsx              # Reusable mic recording button
│       │   │   └── PlanExLogo.jsx
│       │   ├── dashboard/
│       │   │   ├── Dashboard.jsx
│       │   │   └── SearchPage.jsx
│       │   ├── layout/
│       │   │   ├── Header.jsx
│       │   │   └── Sidebar.jsx                # Owned + Assigned project sections
│       │   ├── projects/
│       │   │   ├── CreateProjectModal.jsx
│       │   │   ├── ManageColumnsModal.jsx     # Custom column management
│       │   │   └── ProjectPage.jsx            # Assigned view support
│       │   ├── tasks/
│       │   │   ├── CreateTaskModal.jsx        # Offline aware, voice input
│       │   │   ├── KanbanBoard.jsx            # Dynamic columns, drag and drop
│       │   │   ├── MyTasks.jsx                # List + Kanban, offline sync
│       │   │   ├── TaskDetailPanel.jsx        # Role-gated fields, voice comments
│       │   │   └── TaskList.jsx
│       │   └── ui/Toast.jsx
│       ├── hooks/
│       │   ├── useOfflineSync.js              # Online status + sync trigger
│       │   └── useSpeechToText.js             # Speech + MediaRecorder hook
│       ├── store/slices/
│       │   ├── authSlice.js
│       │   ├── projectsSlice.js               # Owned + assigned project lists
│       │   ├── tasksSlice.js
│       │   └── uiSlice.js
│       ├── styles/globals.css
│       └── utils/
│           ├── api.js
│           ├── helpers.js
│           ├── indexedDB.js                   # IndexedDB CRUD for offline storage
│           ├── socket.js
│           └── syncManager.js                 # Offline→online sync with mutex lock
│
├── server/
│   ├── index.js
│   ├── queueWorker.js
│   ├── constants/index.js
│   ├── controllers/
│   │   ├── analyticsController.js
│   │   ├── authController.js
│   │   ├── dashboardController.js             # $facet + dedup aggregation
│   │   ├── projectController.js               # Custom columns, assigned projects
│   │   ├── taskController.js                  # Permission system, voice comments
│   │   └── userController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── validateObjectId.js
│   ├── models/
│   │   ├── Project.js                         # columns array with defaults
│   │   ├── Task.js                            # addedBy on subtasks, audioUrl on comments
│   │   └── User.js
│   ├── routes/
│   │   ├── analytics.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── notifications.js
│   │   ├── projects.js                        # /assigned route
│   │   ├── tasks.js                           # /comments/voice route
│   │   └── users.js
│   ├── services/
│   │   ├── emailService.js
│   │   ├── queueService.js
│   │   └── s3Service.js                       # upload + uploadAudio configs
│   ├── socket/
│   │   ├── socketHandler.js
│   │   └── socketHelpers.js
│   └── validators/
│       ├── authValidator.js
│       ├── projectValidator.js
│       └── taskValidator.js                   # Status enum removed for custom columns
│
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- MongoDB (local or Atlas)
- AWS Account (optional — for S3 and SQS)
- Gmail account (optional — for email notifications)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/planex.git
cd planex

# 2. Install server dependencies
cd server && npm install

# 3. Install client dependencies
cd ../client && npm install

# 4. Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your values
```

### Run the App

```bash
# Terminal 1 — API Server (port 5000)
cd server && npm run dev

# Terminal 2 — React Client (port 3000)
cd client && npm start

# Terminal 3 — Queue Worker (optional, requires AWS SQS)
cd server && node queueWorker.js
```

Open **http://localhost:3000**

---

## Environment Variables

```env
# ── Core (required) ───────────────────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017/planex
JWT_SECRET=your_super_secret_jwt_key_minimum_32_chars
PORT=5000
CLIENT_URL=http://localhost:3000

# ── AWS S3 — file and audio attachments (optional) ───────────────────────────
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET=your-planex-bucket-name

# ── AWS SQS — async email queue (optional) ───────────────────────────────────
AWS_SQS_QUEUE_URL=https://sqs.eu-north-1.amazonaws.com/ACCOUNT_ID/planex-notifications.fifo

# ── Email via Gmail SMTP (optional) ──────────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=PlanEx <your@gmail.com>
```

---

## API Reference

### Auth
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/auth/me` | Get current user | Yes |
| PUT | `/api/auth/theme` | Update theme preference | Yes |

### Tasks
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/tasks` | Get tasks (`?project=`, `?myTasks=true`, `?status=`, `?priority=`) | Yes |
| POST | `/api/tasks` | Create task | Yes |
| GET | `/api/tasks/:id` | Get task with `_permission` field | Yes |
| PUT | `/api/tasks/:id` | Update task (restricted fields for assignees) | Yes |
| DELETE | `/api/tasks/:id` | Delete task (owner only) | Yes |
| PUT | `/api/tasks/bulk/update` | Bulk update | Yes |
| POST | `/api/tasks/:id/comments` | Add text comment | Yes |
| POST | `/api/tasks/:id/comments/voice` | Upload audio + save voice comment | Yes |
| DELETE | `/api/tasks/:id/comments/:commentId` | Delete comment + S3 audio | Yes |
| POST | `/api/tasks/:id/attachments` | Upload file to S3 | Yes |
| DELETE | `/api/tasks/:id/attachments/:aid` | Delete file from S3 (owner only) | Yes |
| POST | `/api/tasks/:id/subtasks` | Add subtask with addedBy | Yes |
| PUT | `/api/tasks/:id/subtasks/:sid` | Update subtask | Yes |

### Projects
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/projects` | Get owned projects | Yes |
| GET | `/api/projects/assigned` | Get projects with assigned tasks | Yes |
| POST | `/api/projects` | Create project | Yes |
| GET | `/api/projects/:id` | Get project (owners, members, and assignees) | Yes |
| PUT | `/api/projects/:id` | Update project | Yes |
| DELETE | `/api/projects/:id` | Delete project (owner only) | Yes |
| POST | `/api/projects/:id/members` | Add member | Yes |
| GET | `/api/projects/:id/stats` | Get project stats | Yes |
| PUT | `/api/projects/:id/columns` | Update custom columns | Yes |

### Users
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/users` | Get all users | Yes |
| PUT | `/api/users/profile` | Update profile | Yes |
| GET | `/api/users/notifications` | Get notifications | Yes |
| PUT | `/api/users/notifications/read-all` | Mark all read | Yes |
| PUT | `/api/users/notifications/:id/read` | Mark one read | Yes |

### Dashboard & Analytics
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/dashboard` | All dashboard stats | Yes |
| GET | `/api/analytics/personal` | Personal stats + charts | Yes |
| GET | `/api/analytics/project/:id` | Project burn down, velocity, members | Yes |

---

## AWS Setup

### S3 (File + Audio Storage)
1. Create S3 bucket → uncheck "Block all public access"
2. Add bucket policy for public read on `/*`
3. Add CORS config allowing your domain
4. Create IAM user → attach `AmazonS3FullAccess`
5. Generate access keys → add to `.env`

Files stored at:
- Attachments: `taskflow/tasks/{taskId}/{timestamp}-{random}.ext`
- Voice comments: `taskflow/voice-comments/{taskId}/{timestamp}-{random}.webm`

### SQS (Email Queue)
1. Create FIFO queue → name must end in `.fifo`
2. Enable content-based deduplication
3. Attach `AmazonSQSFullAccess` to IAM user
4. Copy Queue URL → add to `.env`
5. Run `node queueWorker.js` in a separate terminal

### Gmail App Password
1. Google Account → Security → 2-Step Verification → enable
2. Security → App passwords → Generate for "Mail"
3. Copy 16-character password → add to `EMAIL_PASS`

---

## Scripts

```bash
# Server
npm run dev      # Start with nodemon
npm start        # Start without nodemon
node queueWorker.js  # Start SQS queue worker

# Client
npm start        # Start React dev server
npm run build    # Production build
```

---

## Key Design Decisions

**Permission system — two layers:** Server computes `getTaskPermission()` on every mutating request using `createdBy`, `project.owner`, and `project.members`. Client receives `_permission` from `GET /tasks/:id` and gates every UI element. Assignees stripping restricted fields from their API call is a UI convenience — the server always re-strips them regardless.

**Custom columns — free-form status:** Removed the Mongoose `enum` validator on `task.status` and the Express validator's status check. This allows any string as a status value, enabling custom column IDs like `blocked_ax7k2`. Default columns are enforced at the application layer in `updateColumns`, not the DB layer.

**Aggregation deduplication:** Dashboard `$facet` pipeline uses `$group` by `_id` between root `$match` and facets. Tasks matching multiple conditions (in your project AND assigned to you) are counted exactly once.

**Offline-first IndexedDB:** Tasks stored with a `localId` (not MongoDB ObjectId) so they're never confused with real tasks. Sync manager uses `isSyncing` mutex to prevent double-syncing on rapid reconnects. Only personal tasks supported offline — project tasks need a real project ObjectId.

**Voice comments — dual recording:** `getUserMedia` called once, stream shared between `SpeechRecognition` (transcript) and `MediaRecorder` (audio blob). Both run simultaneously. On `SpeechRecognition.onend`, `MediaRecorder.stop()` is called — `ondataavailable` fires with final chunk before `onstop`. Choice dialog only shows when both are ready and recording duration ≥ 1 second.

**Assigned projects — read-only access:** `GET /projects/:id` was updated with a two-step lookup — first try owner/member, then check if user has any assigned tasks. This gives assignees read access to project data (columns, name, color) needed to render the Kanban board correctly, without granting any write permissions.

**Socket room strategy:** Two room types — `project:id` for board updates (all members), `user:id` for personal notifications and My Tasks (specific user only). Custom column changes emit `project:updated` to `project:id` room so all members see the new columns instantly.

---

## License

MIT © 2025 Chandan Singh
