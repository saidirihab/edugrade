require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'edugrade_secret_rihab_2025';
const PROFESSOR_EMAIL = process.env.PROFESSOR_EMAIL || 'rihab.saidi@university.tn';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── DB SETUP ──
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [], grades: [], sessions: [] }).write();

// ── MULTER (memory) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── MAILER ──
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  });
}

// ── AUTH MIDDLEWARE ──
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── ROUTES: AUTH ──
app.post('/api/register', async (req, res) => {
  const { name, email, password, year, group } = req.body;
  if (!name || !email || !password || !year) return res.status(400).json({ error: 'Missing fields' });
  if (db.get('users').find({ email }).value()) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const id = Date.now().toString();
  db.get('users').push({ id, name, email, password: hash, year: parseInt(year), group: group || '', createdAt: new Date().toISOString() }).write();
  const token = jwt.sign({ id, email, name, year: parseInt(year) }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, name, email, year: parseInt(year), group } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, year: user.year }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, year: user.year, group: user.group } });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.get('users').find({ id: req.user.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, year: user.year, group: user.group });
});

// ── ROUTES: GRADES ──
app.get('/api/grades', authMiddleware, (req, res) => {
  const grades = db.get('grades').filter({ userId: req.user.id }).value();
  res.json(grades);
});

app.post('/api/evaluate', authMiddleware, upload.single('file'), async (req, res) => {
  const { tpKey, tpName, year, note, lang } = req.body;
  const file = req.file;

  if (!file || !tpKey) return res.status(400).json({ error: 'Missing file or TP' });

  // Check if already evaluated
  const existing = db.get('grades').find({ userId: req.user.id, tpKey }).value();
  if (existing) return res.status(409).json({ error: 'You have already submitted this TP.', grade: existing });

  // Build prompt
  const userYear = parseInt(year);
  const levelCtx = userYear === 1
    ? 'This is a 1st-year bachelor (Atelier de programmation). Topics: arrays, pointers, strings, functions. Expect basic programming understanding, correct syntax, clear logic. Reward good thinking; penalize confusion of fundamentals.'
    : 'This is a 2nd-year bachelor (Technologies & Web Programming). Topics include HTML5, CSS3, JavaScript, CSS Animations, Web Ecosystem. Expect proper semantic markup, valid CSS, working JS, responsive design awareness.';

  const langInstr = lang === 'fr' ? 'Respond entirely in French.'
    : lang === 'ar' ? 'Respond entirely in Arabic.'
    : lang === 'en' ? 'Respond entirely in English.'
    : 'Detect language from submission and respond in that language.';

  const systemPrompt = `You are an AI Classroom Assistant Agent for Prof. Rihab Saidi. You evaluate student practical work (TP reports) in Computer Science.

${langInstr}
Student level: ${levelCtx}
This submission is for: ${tpName}

Evaluation Criteria (total /20):
- Understanding of the subject (0–5)
- Methodology and reasoning (0–5)  
- Technical correctness (0–4)
- Clarity and structure (0–3)
- Originality and effort (0–3)

Be constructive, specific, and educational. Reference specific parts of the work. Flag AI/plagiarism concerns carefully without accusing definitively.

Output strictly with these headers:
### SUMMARY
### STRENGTHS
### WEAKNESSES
### DETAILED FEEDBACK
### GRADING BREAKDOWN
(one line per criterion: Criterion | Max | Awarded | Justification)
### FINAL GRADE
(last line must be exactly: FINAL: X/20)`;

  let userContent;
  const ext = file.originalname.split('.').pop().toLowerCase();
  const textExts = ['txt','py','c','cpp','java','js','md','html','css','json'];

  if (textExts.includes(ext)) {
    const text = file.buffer.toString('utf-8').slice(0, 7000);
    userContent = `Please evaluate this student submission.\nFile: ${file.originalname}${note ? '\nStudent note: ' + note : ''}\n\nContent:\n\`\`\`\n${text}\n\`\`\``;
  } else if (ext === 'pdf') {
    const b64 = file.buffer.toString('base64');
    userContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      { type: 'text', text: `Please evaluate this student submission.\nFile: ${file.originalname}${note ? '\nStudent note: ' + note : ''}` }
    ];
  } else {
    userContent = `Please evaluate this student submission.\nFile: ${file.originalname} (${ext.toUpperCase()} format)${note ? '\nStudent note: ' + note : ''}\n\nNote: Binary format — evaluate based on TP context.`;
  }

  try {
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system: systemPrompt, messages: [{ role: 'user', content: userContent }] })
    });

    if (!apiResp.ok) {
      const err = await apiResp.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || 'AI API error' });
    }

    const data = await apiResp.json();
    const feedbackText = data.content.map(b => b.text || '').join('');
    const gradeMatch = feedbackText.match(/FINAL:\s*(\d+(?:[.,]\d+)?)\s*\/\s*20/i);
    const score = gradeMatch ? parseFloat(gradeMatch[1].replace(',', '.')) : null;

    const gradeRecord = {
      id: Date.now().toString(),
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      tpKey,
      tpName,
      year: userYear,
      score,
      feedback: feedbackText,
      fileName: file.originalname,
      submittedAt: new Date().toISOString()
    };

    db.get('grades').push(gradeRecord).write();

    // Check if all TPs for this student's year are done → send summary email
    await checkAndSendSummaryEmail(req.user.id, userYear);

    res.json({ success: true, grade: gradeRecord });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHATBOT ──
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, history } = req.body;
  const user = db.get('users').find({ id: req.user.id }).value();
  const grades = db.get('grades').filter({ userId: req.user.id }).value();

  const gradesSummary = grades.length
    ? grades.map(g => `${g.tpName}: ${g.score}/20`).join(', ')
    : 'No grades yet';

  const systemPrompt = `You are a helpful academic assistant on the EduGrade platform of Prof. Rihab Saidi (Computer Science, University of Tunis). 
You assist students with questions about their courses, TPs, programming concepts, and the platform.
Student: ${user.name}, Year: L${user.year}, Current grades: ${gradesSummary}.
Be supportive, clear, and pedagogically valuable. Respond in the same language the student uses. Keep responses concise (3-5 sentences unless a technical explanation is needed).`;

  const messages = [
    ...(history || []).slice(-6),
    { role: 'user', content: message }
  ];

  try {
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: systemPrompt, messages })
    });
    const data = await apiResp.json();
    const reply = data.content?.map(b => b.text || '').join('') || 'Sorry, I could not process your request.';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── EMAIL SUMMARY ──
async function checkAndSendSummaryEmail(userId, year) {
  const TP_KEYS = year === 1
    ? ['l1_tp1', 'l1_tp2', 'l1_tp3', 'l1_tp4']
    : ['l2_tp1', 'l2_tp2', 'l2_tp3'];

  const userGrades = db.get('grades').filter({ userId }).value();
  const doneKeys = userGrades.map(g => g.tpKey);
  const allDone = TP_KEYS.every(k => doneKeys.includes(k));

  if (!allDone) return;

  // Avoid sending duplicate summary emails
  const alreadySent = db.get('sessions').find({ userId, type: 'summary_email_sent', year }).value();
  if (alreadySent) return;

  const user = db.get('users').find({ id: userId }).value();
  const relevantGrades = userGrades.filter(g => TP_KEYS.includes(g.tpKey));
  const total = relevantGrades.reduce((s, g) => s + (g.score || 0), 0);
  const avg = (total / TP_KEYS.length).toFixed(2);

  const rows = relevantGrades.map(g =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${g.tpName}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:600;color:${(g.score||0)>=10?'#1B8F6A':'#C0392B'}">${g.score}/20</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#555">${new Date(g.submittedAt).toLocaleDateString('fr-TN')}</td></tr>`
  ).join('');

  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#1B8F6A;padding:24px 32px">
    <div style="font-size:22px;font-weight:700;color:#fff">EduGrade AI</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px">Rapport de notes — Prof. Rihab Saidi</div>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin-bottom:6px">Bonjour Prof. Saidi,</p>
    <p style="font-size:14px;color:#555;line-height:1.6">L'étudiant(e) <strong>${user.name}</strong> (${user.email}) — <strong>L${year}</strong> — a complété tous les TPs. Voici le récapitulatif :</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
      <thead><tr style="background:#f0f9f5">
        <th style="padding:10px 12px;text-align:left;color:#1B8F6A;font-weight:600">TP</th>
        <th style="padding:10px 12px;text-align:center;color:#1B8F6A;font-weight:600">Note</th>
        <th style="padding:10px 12px;text-align:left;color:#1B8F6A;font-weight:600">Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="background:#f0f9f5;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:15px;font-weight:600;color:#333">Moyenne finale des TPs</span>
      <span style="font-size:24px;font-weight:700;color:${parseFloat(avg)>=10?'#1B8F6A':'#C0392B'}">${avg} / 20</span>
    </div>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
    Envoyé automatiquement par EduGrade AI · Cours de Prof. Rihab Saidi
  </div>
</div>
</body></html>`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"EduGrade AI" <${process.env.SMTP_USER}>`,
      to: PROFESSOR_EMAIL,
      subject: `[EduGrade] ${user.name} — L${year} — Tous les TPs complétés (Moyenne: ${avg}/20)`,
      html
    });
    db.get('sessions').push({ userId, type: 'summary_email_sent', year, sentAt: new Date().toISOString() }).write();
    console.log(`Summary email sent for ${user.name}`);
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ── PROFESSOR DASHBOARD API ──
app.get('/api/admin/stats', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== (process.env.ADMIN_SECRET || 'prof_rihab_admin')) return res.status(403).json({ error: 'Forbidden' });
  const users = db.get('users').value();
  const grades = db.get('grades').value();
  res.json({ totalStudents: users.length, totalSubmissions: grades.length, users, grades });
});

app.listen(PORT, () => console.log(`EduGrade server running on http://localhost:${PORT}`));
