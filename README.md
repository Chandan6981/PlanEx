# PlanEx — Project Management App

[![CodeFactor](https://www.codefactor.io/repository/github/YOUR_USERNAME/planex/badge)](https://www.codefactor.io/repository/github/YOUR_USERNAME/planex)

A production-ready full-stack project management application built with the MERN stack. Features real-time collaboration, Kanban boards, analytics, offline support, file attachments via AWS S3, async email notifications via AWS SQS, and a comprehensive REST API with MongoDB aggregation pipelines.

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
- Drag and drop Kanban board (Todo → In Progress → In Review → Done)
- List view with sorting and filtering
- Subtasks with completion tracking and progress bar
- Comments on tasks with real-time updates
- Activity log — tracks every field change with old/new values
- Tags and estimated hours
- Recurring task support
- Bulk status updates across multiple tasks
- Assignee management with live search picker
- Click to edit task title inline

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
- Offline banner shown in modal and My Tasks page

### File Attachments (AWS S3)
- Upload images, PDFs, Word documents, text files (max 10MB)
- Upload during task creation or from task detail panel
- Drag and drop upload support with live preview
- Image thumbnails with view/download actions
- Auto-delete from S3 when task is deleted
- Files stored at `taskflow/tasks/{taskId}/{timestamp}-{random}.ext`

### Projects
- Create and manage multiple projects with custom color and icon
- Kanban board per project with live stats bar
- List view per project with filters
- Project members with owner/member roles
- Real-time progress tracking (stats computed from Redux — instant on drag)
- Task counts and completion percentage in sidebar
- Project-level stats via MongoDB aggregation

### Dashboard (Overview)
- Stats: Total Projects, Active Tasks, Due Today, Overdue
- **High Priority Tasks** — only urgent and high priority tasks shown
- Task Distribution bar chart (Recharts) — scoped to user's own tasks
- Per-project progress cards with completion percentage
- All stats deduplicated — each task counted exactly once
- Stats computed via MongoDB `$facet` aggregation with `$group` dedup
- Auto-refreshes on window focus

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
- In-app notifications panel (newest first, sorted by createdAt)
- Click individual notification to mark as read — instant UI update
- Mark all as read — instant UI update via Redux
- Unread count badge on bell icon
- Unread notifications shown in bold with accent dot
- Persistent storage in user document

### Email Notifications (AWS SQS + Nodemailer)
- Async email queue — never blocks API response (~5ms vs ~2000ms)
- Task assignment emails with professional HTML template
- Comment notification emails
- Queue worker runs as separate process (`node queueWorker.js`)
- Auto-retry on failure via SQS visibility timeout (30s)
- Graceful degradation — app works fine without SQS configured

### Real-time (Socket.io)
- Live task creation, updates, deletion on Kanban board
- Personal `user:id` rooms for My Tasks updates
- Project `project:id` rooms for Kanban updates
- Real-time in-app notifications with unread badge
- Typing indicators on tasks
- Socket reconnection with polling fallback (`['websocket', 'polling']`)
- Socket logs in browser console for debugging

### Security
- Helmet.js — secure HTTP headers on every response
- CORS protection with configurable origin
- Request size limit (10kb) — blocks large payload attacks
- Input validation middleware (title, status, priority, email format)
- ObjectId validation on all `:id` routes before hitting DB
- Authorization — only task creator can delete, only project owner can delete project
- Bulk update field whitelist — prevents overwriting sensitive fields
- No JWT fallback secret — server crashes loudly if missing
- Rate limiting on auth routes — 10 attempts per 15 minutes

### Code Quality
- MVC pattern — controllers, routes, models, middleware fully separated
- Constants file — no magic strings anywhere
- Centralized error handler — catches Mongoose, JWT, duplicate key errors
- Socket helpers extracted to `socketHelpers.js`
- MongoDB indexes on Task model — `project+createdAt`, `assignees+status`, `dueDate+status`, text index
- Pagination support on task queries (`?page=1&limit=50`)
- Custom React hook — `useOfflineSync`, `useOnlineStatus`

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
| Recharts | Analytics charts (Line, Bar, Area, Pie) |
| @hello-pangea/dnd | Drag and drop Kanban board |
| IndexedDB (native) | Offline task storage |

### Backend
| Technology | Purpose |
|---|---|
| Node.js v18+ | Runtime |
| Express 4 | Web framework |
| MongoDB + Mongoose | Database + ODM |
| Socket.io | Real-time WebSocket server |
| JWT | Stateless authentication tokens |
| bcryptjs | Password hashing (12 rounds) |
| Helmet | Secure HTTP headers |
| express-rate-limit | Brute force protection |
| Multer + multer-s3 | Multipart file upload handling |
| Nodemailer | SMTP email sending |
| Nodemon | Development auto-restart |

### Cloud & Infrastructure
| Service | Purpose |
|---|---|
| AWS S3 | File and image storage |
| AWS SQS (FIFO) | Async email message queue |
| Gmail SMTP | Email delivery |
| MongoDB Atlas (optional) | Cloud database |

---

## Architecture

```
Browser (React + Redux + IndexedDB)
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

### Request Lifecycle
```
Request → helmet → CORS → express.json(10kb) → rate limit (auth only)
       → auth.js (JWT verify) → validateObjectId → validator middleware
       → controller → MongoDB operation → socket emit
       → SQS push (async, non-blocking) → res.json()
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

---

## Folder Structure

```
planex/
│
├── client/                                    # React frontend
│   ├── public/
│   │   └── index.html                         # HTML entry, title: PlanEx
│   └── src/
│       ├── App.jsx                            # Router, socket init, protected layout
│       ├── index.js                           # React DOM entry point
│       │
│       ├── components/
│       │   ├── analytics/
│       │   │   └── AnalyticsPage.jsx          # Personal + project analytics with charts
│       │   ├── auth/
│       │   │   └── AuthPage.jsx               # Login + Register page
│       │   ├── common/
│       │   │   └── PlanExLogo.jsx             # Reusable SVG logo (PlanExIcon + PlanExLogo)
│       │   ├── dashboard/
│       │   │   ├── Dashboard.jsx              # Overview: stats, high priority tasks, charts
│       │   │   └── SearchPage.jsx             # Search tasks and projects
│       │   ├── layout/
│       │   │   ├── Header.jsx                 # Top bar, notifications, theme toggle
│       │   │   └── Sidebar.jsx                # Navigation, projects list, admin link
│       │   ├── projects/
│       │   │   ├── CreateProjectModal.jsx     # Create project with color/icon picker
│       │   │   └── ProjectPage.jsx            # Kanban/List view with live stats bar
│       │   ├── tasks/
│       │   │   ├── CreateTaskModal.jsx        # Create task — offline aware, file queue
│       │   │   ├── KanbanBoard.jsx            # Drag and drop board with columns
│       │   │   ├── MyTasks.jsx                # Personal view — list + kanban, offline sync
│       │   │   ├── TaskDetailPanel.jsx        # Slide-out panel — details, files, comments
│       │   │   └── TaskList.jsx               # Table view with filters
│       │   └── ui/
│       │       └── Toast.jsx                  # Toast notification component
│       │
│       ├── hooks/
│       │   └── useOfflineSync.js              # useOfflineSync + useOnlineStatus hooks
│       │
│       ├── store/
│       │   ├── index.js                       # Redux store configuration
│       │   └── slices/
│       │       ├── authSlice.js               # User auth state, notifications, theme
│       │       ├── projectsSlice.js           # Projects list state
│       │       ├── tasksSlice.js              # Tasks list, selected task, filters
│       │       └── uiSlice.js                 # Modals, panels, toasts, viewMode
│       │
│       ├── styles/
│       │   └── globals.css                    # Full design system — dark + light themes
│       │
│       └── utils/
│           ├── api.js                         # Axios instance with JWT interceptor
│           ├── helpers.js                     # Date helpers, priority config, initials
│           ├── indexedDB.js                   # IndexedDB CRUD for offline task storage
│           ├── socket.js                      # Socket.io client — reconnection + logging
│           └── syncManager.js                 # Offline→online sync logic with lock
│
├── server/                                    # Express backend
│   ├── index.js                               # Entry point, middleware, routes, socket
│   ├── queueWorker.js                         # SQS consumer — separate process
│   ├── .env.example                           # All environment variables documented
│   │
│   ├── constants/
│   │   └── index.js                           # TASK_STATUS, TASK_PRIORITY, NOTIFICATION_TYPE
│   │
│   ├── controllers/
│   │   ├── adminController.js                 # Platform stats, user/project/task management
│   │   ├── analyticsController.js             # Personal + project analytics aggregations
│   │   ├── authController.js                  # register, login, getMe, updateTheme
│   │   ├── dashboardController.js             # getDashboard — $facet + dedup aggregation
│   │   ├── projectController.js               # CRUD + members + stats
│   │   ├── taskController.js                  # CRUD + comments + subtasks + S3 + SQS
│   │   └── userController.js                  # getAllUsers, profile, notifications
│   │
│   ├── middleware/
│   │   ├── auth.js                            # JWT verification, sets req.user + req.io
│   │   ├── errorHandler.js                    # Central error handler
│   │   └── validateObjectId.js                # Validates MongoDB ObjectId in params
│   │
│   ├── models/
│   │   ├── Project.js                         # Project schema with members array
│   │   ├── Task.js                            # Task schema with compound indexes
│   │   └── User.js                            # User schema with bcrypt hooks
│   │
│   ├── routes/
│   │   ├── admin.js                           # Admin-only routes (role check middleware)
│   │   ├── analytics.js                       # GET /personal, GET /project/:id
│   │   ├── auth.js                            # POST /register, /login + rate limit
│   │   ├── dashboard.js                       # GET /dashboard
│   │   ├── notifications.js                   # Notification read routes
│   │   ├── projects.js                        # CRUD + /members + /stats
│   │   ├── tasks.js                           # CRUD + /comments + /attachments + /subtasks
│   │   └── users.js                           # GET / + /profile + /notifications
│   │
│   ├── services/
│   │   ├── emailService.js                    # HTML email templates via nodemailer
│   │   ├── queueService.js                    # pushToQueue() — SQS FIFO producer
│   │   └── s3Service.js                       # multer-s3 upload config + deleteFile()
│   │
│   ├── socket/
│   │   ├── socketHandler.js                   # Socket.io auth + room management
│   │   └── socketHelpers.js                   # emitTask(), emitProject() helpers
│   │
│   └── validators/
│       ├── authValidator.js                   # validateRegister, validateLogin
│       ├── projectValidator.js                # validateCreateProject, validateUpdateProject
│       └── taskValidator.js                   # validateCreateTask, validateUpdateTask
│
└── package.json                               # Root package.json
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

# Terminal 3 — Queue Worker (optional, requires AWS SQS + email config)
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

# ── AWS S3 — file attachments (optional) ─────────────────────────────────────
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET=your-planex-bucket-name

# ── AWS SQS — async email queue (optional) ───────────────────────────────────
AWS_SQS_QUEUE_URL=https://sqs.eu-north-1.amazonaws.com/ACCOUNT_ID/taskflow-notifications.fifo

# ── Email via Gmail SMTP (optional, required for queue worker) ────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=PlanEx <your@gmail.com>
```

> All AWS and email variables are optional. The app runs fully without them — S3 and SQS errors are caught silently.

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
| GET | `/api/tasks` | Get tasks (`?project=`, `?myTasks=true`, `?page=`, `?status=`, `?priority=`) | Yes |
| POST | `/api/tasks` | Create task | Yes |
| GET | `/api/tasks/:id` | Get single task with all populated fields | Yes |
| PUT | `/api/tasks/:id` | Update task | Yes |
| DELETE | `/api/tasks/:id` | Delete task (creator only) | Yes |
| PUT | `/api/tasks/bulk/update` | Bulk update (whitelisted fields only) | Yes |
| POST | `/api/tasks/:id/comments` | Add comment | Yes |
| POST | `/api/tasks/:id/attachments` | Upload file to S3 | Yes |
| DELETE | `/api/tasks/:id/attachments/:aid` | Delete file from S3 | Yes |
| POST | `/api/tasks/:id/subtasks` | Add subtask | Yes |
| PUT | `/api/tasks/:id/subtasks/:sid` | Update subtask | Yes |

### Projects
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/projects` | Get user's projects with task counts | Yes |
| POST | `/api/projects` | Create project | Yes |
| GET | `/api/projects/:id` | Get project details | Yes |
| PUT | `/api/projects/:id` | Update project | Yes |
| DELETE | `/api/projects/:id` | Delete project (owner only) | Yes |
| POST | `/api/projects/:id/members` | Add member to project | Yes |
| GET | `/api/projects/:id/stats` | Get project stats | Yes |

### Users
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/users` | Get all users (for assignee picker) | Yes |
| PUT | `/api/users/profile` | Update profile | Yes |
| GET | `/api/users/notifications` | Get notifications | Yes |
| PUT | `/api/users/notifications/read-all` | Mark all read | Yes |
| PUT | `/api/users/notifications/:id/read` | Mark one read | Yes |

### Dashboard
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/dashboard` | All dashboard stats in one query | Yes |

### Analytics
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/analytics/personal` | Personal stats, charts, productivity | Yes |
| GET | `/api/analytics/project/:id` | Project burn down, velocity, members | Yes |

### Admin
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/admin/stats` | Platform-wide stats | Admin only |
| GET | `/api/admin/users` | All users with task counts | Admin only |
| PUT | `/api/admin/users/:id/role` | Change user role | Admin only |
| DELETE | `/api/admin/users/:id` | Delete user | Admin only |
| GET | `/api/admin/projects` | All projects | Admin only |
| DELETE | `/api/admin/projects/:id` | Delete project + tasks | Admin only |
| GET | `/api/admin/tasks` | All tasks with filters | Admin only |
| DELETE | `/api/admin/tasks/:id` | Delete any task | Admin only |

---

## AWS Setup

### S3 (File Storage)
1. Create S3 bucket → uncheck "Block all public access"
2. Add bucket policy for public read on `/*`
3. Add CORS config allowing your domain
4. Create IAM user → attach `AmazonS3FullAccess`
5. Generate access keys → add to `.env`

### SQS (Email Queue)
1. Create FIFO queue → name must end in `.fifo`
2. Enable **Content-based deduplication**
3. Attach `AmazonSQSFullAccess` to IAM user
4. Copy Queue URL → add to `.env`
5. Run `node queueWorker.js` in a separate terminal

### Gmail App Password
1. Google Account → Security → 2-Step Verification → enable
2. Security → App passwords → Generate for "Mail"
3. Copy 16-character password → add to `EMAIL_PASS` in `.env`

---

## Scripts

```bash
# Server
npm run dev      # Start with nodemon (development)
npm start        # Start without nodemon (production)
npm run worker   # Start SQS queue worker

# Client
npm start        # Start React dev server
npm run build    # Production build
```

---

## Key Design Decisions

**Aggregation deduplication** — The dashboard `$facet` pipeline uses a `$group` by `_id` between the root `$match` and the facets. This ensures tasks matching multiple conditions (in your project AND assigned to you) are counted exactly once.

**Offline-first personal tasks** — IndexedDB chosen over localStorage because it supports structured data, has no 5MB limit, and supports indexes. Tasks stored with a `localId` (not a MongoDB ObjectId) so they're never confused with real tasks. The sync manager uses a mutex lock (`isSyncing`) to prevent double-syncing on rapid reconnects.

**Socket room strategy** — Two room types: `project:id` for Kanban board updates (all project members), `user:id` for personal My Tasks and notifications (only the specific user). This prevents broadcasting sensitive data to the wrong users.

**SQS decoupling** — Email notifications pushed to SQS queue so the API responds in ~5ms instead of waiting ~2000ms for SMTP. The queue worker runs as a completely separate Node.js process and handles retries automatically via SQS visibility timeout.

**Redux + local state split** — Project task lists live in Redux (shared between Kanban/List/Stats). My Tasks maintains its own local state because it spans all projects and would pollute the project-scoped Redux list. The two sync via socket events.

**Defensive array handling** — Every component that consumes API task data uses `Array.isArray()` guards. The Redux slice initializes `state.list = []` on error. This prevents the classic "filtered.filter is not a function" crash when the API response shape changes.

---

## License

MIT © 2025 Chandan Singh