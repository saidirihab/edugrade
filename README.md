# EduGrade AI — Prof. Rihab Saidi
## Complete Academic Platform with AI Grading

---

## What's included

```
edugrade/
├── server.js          ← Express backend (API, auth, AI, email)
├── .env.example       ← Configuration template
├── package.json
└── public/
    ├── index.html     ← Landing page
    ├── login.html     ← Student login
    ├── register.html  ← Student registration
    ├── dashboard.html ← Student dashboard (submit TPs, view grades, chatbot)
    ├── courses.html   ← Course overview
    ├── about.html     ← About the platform
    └── style.css      ← Global stylesheet
```

---

## Setup in 5 steps

### 1. Install Node.js
Download from https://nodejs.org (version 18 or higher recommended)

### 2. Install dependencies
```bash
cd edugrade
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Then open `.env` and fill in:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `PROFESSOR_EMAIL` — your email (rihab.saidi@university.tn)
- `SMTP_USER` / `SMTP_PASS` — your Gmail + App Password (see below)
- `JWT_SECRET` — any random string
- `ADMIN_SECRET` — a password for the admin stats endpoint

### 4. Set up Gmail for email sending
1. Go to your Google Account → Security → Enable 2-Step Verification
2. Go to https://myaccount.google.com/apppasswords
3. Create an app password for "Mail"
4. Paste the 16-character password as `SMTP_PASS` in your `.env`

### 5. Start the server
```bash
npm start
```
Open http://localhost:3000 in your browser.

---

## Sharing with students

### Option A — Localhost (same network)
Find your local IP address:
- Mac/Linux: `ifconfig | grep inet`
- Windows: `ipconfig`

Share: `http://YOUR_IP:3000` — students on the same WiFi can access it.

### Option B — Free cloud hosting (recommended for sharing)

**Railway** (easiest, free tier):
1. Create account at https://railway.app
2. Install Railway CLI: `npm install -g @railway/cli`
3. In the edugrade folder: `railway init` → `railway up`
4. Add environment variables in Railway dashboard
5. Share the generated URL with students

**Render** (also free):
1. Push code to GitHub
2. Create account at https://render.com
3. New Web Service → connect GitHub repo
4. Set environment variables
5. Share the URL

**Cyclic / Glitch**:
- Both support Node.js free hosting with file persistence

---

## Features

### For students
- Secure account creation and login (JWT, bcrypt)
- Personal dashboard with grade overview
- Submit TPs as PDF, DOCX, PPTX, Python, C/C++, HTML, JS
- AI feedback in French, English, or Arabic
- Chatbot assistant for course questions
- View full feedback history per TP

### For Prof. Rihab Saidi
- Automatic email when a student completes ALL their TPs
- Email includes: student name, each TP name + score, final average
- Admin stats endpoint: GET /api/admin/stats with header `x-admin-secret: YOUR_SECRET`

### Courses configured
**L1 — Atelier de Programmation (4 TPs)**
- TP 1: Arrays & Tables
- TP 2: Pointers & Memory
- TP 3: String Manipulation
- TP 4: Functions & Procedures

**L2 — Technologies & Web Programming (3 TPs)**
- TP 1: Web Ecosystem & Technologies (Ch. 1)
- TP 2: HTML5 & CSS3 (Ch. 2–3)
- TP 3: CSS Animations & JavaScript (Ch. 6–7)

---

## Customization

### Adding or changing TPs
In `server.js`, find `checkAndSendSummaryEmail` and update `TP_KEYS`.
In `dashboard.html`, find `TP_DATA` and update the arrays.

### Changing the professor email
Update `PROFESSOR_EMAIL` in your `.env` file.

### Changing colors
Edit the `:root` CSS variables at the top of `public/style.css`.

---

## Security notes
- Passwords are hashed with bcrypt (10 rounds)
- JWT tokens expire after 7 days
- File uploads are validated (size limit: 20MB)
- Each student can submit each TP only once
- Admin endpoint is protected by secret header

---

*Built for Prof. Rihab Saidi — Computer Science & Programming*
