import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import serverless from 'serverless-http';
import admin from 'firebase-admin';

// Initialize Firebase Admin
// For Netlify deployment, you should set the FIREBASE_SERVICE_ACCOUNT environment variable
// with the contents of your service account JSON file.
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'ieee-its-b6c77'
    });
  } else {
    // Fallback for local development or if running in a Google Cloud environment
    admin.initializeApp({
      projectId: 'ieee-its-b6c77'
    });
  }
}

const db = admin.firestore();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;
const ADMIN_EMAILS = ['ieeeitsvitvellore@gmail.com', 'liki123456m@gmail.com'];
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAgZcW5nvWhPSTtoiMeD06cSMA3FmX4qHOJtdADOBJuQX1rK63QESjxg8-mkdWaQ5Brg/exec';

app.use(express.json());
app.use(cookieParser());

// Update CORS to support the app URL
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware to check authentication
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ success: true, user: decodedToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.json({ user: null });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.json({ user: decodedToken });
  } catch (error) {
    res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('access_token');
  res.json({ success: true });
});

// Sync entries to Google Apps Script
const syncToAppsScript = async () => {
  if (!APPS_SCRIPT_URL) return;

  try {
    const datesSnapshot = await db.collection('dates').orderBy('date_string', 'desc').get();
    const usersSnapshot = await db.collection('users').orderBy('name', 'asc').get();
    const attendanceSnapshot = await db.collection('attendance').get();

    const payload = {
      dates: datesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      users: usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      attendance: attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };

    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

  } catch (error) {
    console.error('Apps Script Sync Error:', error);
  }
};

// Date Routes
app.get('/api/dates', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection('dates').orderBy('date_string', 'desc').get();
    const dates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(dates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dates' });
  }
});

app.post('/api/dates', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { date_string } = req.body;
  try {
    // Check if exists
    const existing = await db.collection('dates').where('date_string', '==', date_string).get();
    if (!existing.empty) return res.status(400).json({ error: 'Date already exists' });

    const docRef = await db.collection('dates').add({ date_string });
    syncToAppsScript();
    res.json({ id: docRef.id, date_string });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add date' });
  }
});

app.delete('/api/dates/:id', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await db.collection('dates').doc(req.params.id).delete();
    // Also delete associated attendance
    const attendanceSnapshot = await db.collection('attendance').where('date_id', '==', req.params.id).get();
    const batch = db.batch();
    attendanceSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete date' });
  }
});

// Users Routes (Master Data)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection('users').orderBy('name', 'asc').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { users } = req.body;
  if (!Array.isArray(users)) return res.status(400).json({ error: 'Expected users array' });

  try {
    const batch = db.batch();
    for (const u of users) {
      if (!u.email || !u.name) continue;
      // Use email as ID for users to avoid duplicates
      const userRef = db.collection('users').doc(u.email);
      batch.set(userRef, {
        name: u.name,
        reg_no: u.reg_no || '',
        email: u.email
      }, { merge: true });
    }
    await batch.commit();
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save users' });
  }
});

app.patch('/api/users/:id', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { field, value } = req.body;
  try {
    await db.collection('users').doc(req.params.id).update({ [field]: value });
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await db.collection('users').doc(req.params.id).delete();
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Entry Routes
app.get('/api/dates/:dateId/entries', authenticate, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').orderBy('name', 'asc').get();
    const attendanceSnapshot = await db.collection('attendance').where('date_id', '==', req.params.dateId).get();
    
    const attendanceMap = new Map();
    attendanceSnapshot.docs.forEach(doc => {
      attendanceMap.set(doc.data().user_id, doc.data());
    });

    const entries = usersSnapshot.docs.map(doc => {
      const userData = doc.data();
      const att = attendanceMap.get(doc.id) || {};
      return {
        id: doc.id,
        name: userData.name,
        reg_no: userData.reg_no,
        email: userData.email,
        coming: att.coming || 'NOT COMING',
        applied: att.applied || 'NOT APPLIED',
        attendance_1: att.attendance_1 || 'ABSENT',
        attendance_2: att.attendance_2 || 'ABSENT',
        is_locked: att.is_locked || 0
      };
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

app.patch('/api/dates/:dateId/users/:userId', authenticate, async (req: any, res: any) => {
  const { dateId, userId } = req.params;
  const { field, value } = req.body;
  const userEmail = req.user.email;
  const isOwner = ADMIN_EMAILS.includes(userEmail);

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const user = userDoc.data() as any;

    const isTargetUser = userEmail.toLowerCase() === user.email.toLowerCase();

    const attId = `${userId}_${dateId}`;
    const attDoc = await db.collection('attendance').doc(attId).get();
    let attendance = attDoc.exists ? attDoc.data() as any : { 
      coming: 'NOT COMING', 
      applied: 'NOT APPLIED', 
      attendance_1: 'ABSENT', 
      attendance_2: 'ABSENT', 
      is_locked: 0,
      user_id: userId,
      date_id: dateId
    };

    if (!isOwner) {
      if (!isTargetUser || (field !== 'coming' && field !== 'applied')) {
        return res.status(403).json({ error: 'Access Denied: You can only edit your own row (Coming/Applied).' });
      }
      if (attendance.is_locked === 1) {
        return res.status(403).json({ error: 'Submission Locked: You have already used your one chance to edit.' });
      }
    }

    let updates: any = { [field]: value };

    if (!isOwner || (isOwner && ['coming', 'applied'].includes(field))) {
      if (field === 'coming') {
        updates.applied = 'NOT APPLIED';
        updates.attendance_1 = 'ABSENT';
        updates.attendance_2 = 'ABSENT';
      }

      if (field === 'applied') {
        const comingVal = field === 'coming' ? value : attendance.coming;
        const appliedVal = field === 'applied' ? value : attendance.applied;

        if (comingVal.toUpperCase() === 'COMING' && appliedVal.toUpperCase() === 'APPLIED') {
          updates.attendance_1 = 'PRESENT';
          updates.attendance_2 = 'PRESENT';
        } else {
          updates.attendance_1 = 'ABSENT';
          updates.attendance_2 = 'ABSENT';
        }
        if (!isOwner) {
          updates.is_locked = 1;
        }
      }
    }

    const finalData = { ...attendance, ...updates };
    await db.collection('attendance').doc(attId).set(finalData, { merge: true });
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

app.post('/api/dates/:dateId/reset', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const snapshot = await db.collection('attendance').where('date_id', '==', req.params.dateId).get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset entries' });
  }
});

app.post('/api/sync', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await syncToAppsScript();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Export for Netlify
export const handler = serverless(app);

// Start server for local development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'production' || !process.env.NETLIFY) {
  startServer();
}
