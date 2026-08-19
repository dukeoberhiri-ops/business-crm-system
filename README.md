# Meridian CRM

A premium, production-ready Business CRM built with **plain HTML, CSS, and vanilla
JavaScript** — no frameworks, no build step — backed entirely by **Firebase**
(Authentication, Firestore, Storage, Security Rules).

It's designed to look and behave like the sales tooling teams already know
(HubSpot / Salesforce / Zoho): a collapsible sidebar, global search, live
notifications, drag-and-drop pipeline, dashboards with real charts, dark mode,
and role-based permissions for five staff roles.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Markup / styling | HTML5, CSS (custom design system, no framework) |
| Logic | Vanilla JavaScript (ES Modules), no React/Vue/Angular |
| Auth | Firebase Authentication (email/password) |
| Database | Cloud Firestore (real-time listeners throughout) |
| File storage | Firebase Storage |
| Charts | Chart.js (loaded from CDN) |
| Hosting | Any static host — instructions below use Netlify |

No Node.js server, Express, or backend of any kind is required. The app runs
as static files that talk directly to Firebase from the browser.

---

## 2. Project structure

```
crm/
├── index.html              Login
├── register.html           Registration (with role picker)
├── forgot-password.html    Password reset request
├── dashboard.html          Main dashboard
├── leads.html               Lead management
├── customers.html           Customer management
├── pipeline.html             Drag-and-drop sales pipeline
├── tasks.html                Task management
├── calendar.html             Calendar (meetings/calls/deadlines)
├── reports.html               Reports + CSV/PDF export
├── settings.html               Profile, team & role management
├── seed.html                    Sample data generator (admin only)
├── css/
│   ├── variables.css        Design tokens (color, type, spacing) — light & dark
│   ├── styles.css           Layout shell: sidebar, topbar, page structure
│   ├── components.css       Buttons, forms, tables, modals, toasts, kanban…
│   └── auth.css             Login/Register/Forgot-password screens
├── js/
│   ├── firebase-config.js   🔧 PASTE YOUR FIREBASE CONFIG HERE
│   ├── auth.js               Register / login / logout / reset / route guard
│   ├── roles.js               Role + permission matrix
│   ├── app-shell.js           Sidebar/topbar, search, notifications, theme
│   ├── utils.js                Toasts, modals, confirm dialogs, formatters
│   ├── dashboard.js            Dashboard widgets + charts
│   ├── leads.js                 Lead CRUD, notes, files
│   ├── customers.js             Customer CRUD, history, notes, files
│   ├── pipeline.js              Kanban drag-and-drop
│   ├── tasks.js                  Task CRUD + reminders (notifications)
│   ├── calendar.js                Month calendar + events
│   ├── reports.js                  Reports, charts, CSV/PDF export
│   ├── settings.js                 Profile + team/role management
│   └── seed.js                      Sample data generator
├── firestore.rules          Firestore security rules
├── storage.rules             Firebase Storage security rules
├── firestore.indexes.json     Required composite indexes
└── README.md
```

---

## 3. Firebase setup (from scratch)

### 3.1 Create the project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it (e.g. `meridian-crm`) and finish the wizard.

### 3.2 Enable Authentication
1. **Build → Authentication → Get started**.
2. Enable the **Email/Password** provider.
3. (Optional) Under **Templates**, customize the verification & reset email copy.

### 3.3 Create Firestore
1. **Build → Firestore Database → Create database**.
2. Start in **Production mode** (we ship real security rules below).
3. Choose a region close to your users.

### 3.4 Enable Storage
1. **Build → Storage → Get started**.
2. Use the default bucket, production mode.

### 3.5 Register a Web App & get your config
1. Project Settings (gear icon) → **Your apps** → **Web** (`</>`).
2. Give it a nickname, skip Firebase Hosting (we deploy via Netlify).
3. Copy the `firebaseConfig` object shown.

### 3.6 🔧 Paste your config — the ONLY place you need to edit
Open **`js/firebase-config.js`** and replace the placeholder object:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

That's it — every other file imports `auth`, `db`, and `storage` from this
one module, so nothing else needs editing.

### 3.7 Deploy security rules & indexes
Using the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage   # point at this folder, reuse existing project
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

Or paste `firestore.rules` into **Firestore → Rules** and `storage.rules`
into **Storage → Rules** in the console directly, and manually create the
composite indexes listed in `firestore.indexes.json` (Firestore will also
prompt you with a direct link the first time a query needs one).

### 3.8 Create your first Super Admin
Registration only offers Sales Rep / Sales Manager / Support / Admin (Super
Admin is intentionally not self-service). To create one:

1. Register a normal account from `register.html`.
2. In **Firestore → users/{uid}**, change `role` from `admin` to `super_admin`.

---

## 4. Firestore data structure

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | Staff profiles | `name, email, role, status, avatarColor, monthlyTarget` |
| `leads` | Incoming leads | `name, email, company, phone, stage, value, assignedTo, source, notes` |
| `customers` | Accounts | `companyName, contactPerson, phone, email, address, industry, website, customerType, assignedStaff, notes` |
| `deals` | Pipeline opportunities | `title, value, stage, customerId, ownerId, expectedCloseDate, closedAt` |
| `tasks` | To-dos | `title, description, priority, relatedType, dueDate, assignedTo, status` |
| `events` | Calendar | `title, type, location, startTime, endTime, notes` |
| `notes` | Polymorphic notes | `entityId, entityType, text, authorId, authorName, createdAt` |
| `files` | Storage file metadata | `entityId, entityType, name, url, path, uploadedBy, uploadedAt` |
| `communications` | Call/email/meeting log | `customerId, type, summary, createdAt` |
| `notifications` | Per-user alerts | `userId, title, message, type, read, createdAt` |
| `activity_log` | Recent activity feed | `description, actorName, createdAt` |

**Lead stages:** `new → contacted → qualified → proposal_sent → negotiation → won / lost`
**Deal (pipeline) stages:** `new_lead → contacted → qualified → proposal → negotiation → closed_won / closed_lost`

### Roles & permissions (see `js/roles.js`)
| Role | Highlights |
|---|---|
| `super_admin` | Full access, including system settings |
| `admin` | Manage staff/roles, all records, reports |
| `sales_manager` | Full leads/deals visibility, assign work, view reports |
| `sales_rep` | Own leads/deals/tasks only |
| `support` | Customers + own tasks, no lead/deal deletion |

Permissions are enforced **twice**: in the UI (`js/roles.js`) for a clean
experience, and again in `firestore.rules` server-side, which is the real
security boundary.

---

## 5. Sample data

There are two separate ways to populate data, for two different purposes:

**Demo accounts (for showing the product to prospects):** two permanent
accounts self-provision the first time anyone clicks their login button on
the sign-in page — **Login as Demo Admin** (`admin@example.com`) and
**Login as Demo User** (`user@example.com`), both password `Demo123!`. No
setup needed; the first click creates the account automatically. Demo
accounts see a dismissible "Welcome to the demo!" banner once per session,
and only `admin@example.com` sees a **Demo Controls** tab in Settings with
**Seed Demo Data** and **Reset Demo Data**. Seeding splits realistic
customers, leads, deals, tasks, events, notes, and even a couple of sample
team messages between the two demo accounts, so Admin genuinely sees what
User does (and vice versa) in real time — a visitor can log in as either
account and immediately see a populated, two-person CRM in action.

**Generic sample data (for your own real Firebase project):** open
`seed.html` (not linked in the sidebar) while signed in as any Admin/Super
Admin to populate your own instance with sample records for testing. This
is separate from the demo-account seeder above and assigns everything to
whichever admin runs it.

---

## 6. Running locally

Because this project uses ES Modules (`<script type="module">`), open it
through a local web server rather than `file://`:

```bash
# Option A — Python
cd crm
python3 -m http.server 5500

# Option B — Node
npx serve crm

# Option C — VS Code "Live Server" extension
```

Then visit `http://localhost:5500`.

---

## 7. Deploying to Netlify

**Drag-and-drop (fastest):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the entire `crm/` folder in. Netlify deploys it instantly as a static site.

**Git-based (recommended for ongoing work):**
1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**.
3. Build command: *(none)* — leave blank.
4. Publish directory: `/` (the project root, since these are static files).
5. Deploy.

**Firebase Auth domain allowlist:** after deploying, copy your Netlify URL
(e.g. `meridian-crm.netlify.app`) and add it under **Firebase Console →
Authentication → Settings → Authorized domains**, or sign-in requests from
that domain will be rejected.

---

## 8. Feature checklist

- [x] Registration, login, forgot password, email verification, logout
- [x] Persistent login (Firebase local persistence) + protected routes
- [x] Two self-provisioning demo accounts with one-click login, a dismissible
      welcome banner, and admin-only Seed/Reset Demo Data controls
- [x] 5 roles with distinct permissions, enforced client + server side
- [x] Dashboard: 8 live stat cards, revenue chart, pipeline chart, sales
      target progress, tasks due today, upcoming meetings, activity feed
- [x] Leads: add/edit/delete/assign/status change, notes, file upload,
      search, filters, sorting, pagination
- [x] Customers: full profile fields, communication history, notes, files
- [x] Drag-and-drop sales pipeline across 7 stages
- [x] Tasks: priorities, deadlines, assignment, completion, reminders
      (in-app notifications)
- [x] Calendar: month view, 5 event types, add/edit/delete
- [x] File management via Firebase Storage with security rules
- [x] Unlimited notes with author + timestamp on leads/customers
- [x] Communication log tied to customer history
- [x] Reports: sales, revenue, customer growth, conversion, staff
      performance, annual — with CSV and print-to-PDF export
- [x] Real-time notifications (lead assigned, task due, deal won/lost, etc.)
- [x] Global search across leads/customers/deals/tasks (⌘K)
- [x] Light/dark mode, responsive layout, skeleton loaders, toasts,
      confirmation dialogs, empty states

## 9. Known limitations

- **Pipeline drag-and-drop** uses the HTML5 Drag and Drop API, which desktop
  browsers support well but mobile browsers do not. On phones/tablets, open
  a deal card and change its **Stage** from the edit modal instead.
- **PDF export** on the Reports page uses the browser's native print dialog
  against a print-tuned stylesheet ("Save as PDF" in the print destination
  picker) rather than a server-rendered PDF, to stay within the
  Firebase-only stack requested.

## 10. Notes on scope

This is a complete, working reference implementation, not a mockup — every
screen reads and writes real Firestore data. Two things you'll likely want
to add before a paying customer relies on it in production:

- **Email delivery for reminders/meeting invites** — Firestore write triggers
  (Cloud Functions) are the natural next step for outbound email, but Cloud
  Functions were intentionally left out here to keep the stack Firebase
  client-SDK-only per the brief.
- **Server-side PDF generation** — the current PDF export uses the browser
  print dialog against a print-tuned stylesheet; swap in a service or
  library of your choice if you need pixel-perfect branded PDFs.
