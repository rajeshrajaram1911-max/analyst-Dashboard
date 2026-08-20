import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const upload = multer({ storage: multer.memoryStorage() });
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) throw new Error('MONGO_URI must be set in your environment variables.');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in your environment variables.');

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

const DataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { strict: false, timestamps: true });

const UserModel = mongoose.model('User', UserSchema);
const DataModel = mongoose.model('Data', DataSchema);

const createToken = (user) => jwt.sign(
  { userId: user._id.toString(), email: user.email },
  JWT_SECRET,
  { expiresIn: '7d' },
);

const requireAuth = (req, res, next) => {
  const value = req.headers.authorization;
  const token = value?.startsWith('Bearer ') ? value.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication token is required.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const normalizedEmail = email.trim().toLowerCase();
    if (await UserModel.exists({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = await UserModel.create({ name, email: normalizedEmail, password: await bcrypt.hash(password, 12) });
    return res.status(201).json({
      token: createToken(user),
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const user = await UserModel.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    return res.json({
      token: createToken(user),
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Could not sign in.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId).select('name email');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ id: user._id, name: user.name, email: user.email });
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ message: 'Could not retrieve profile.' });
  }
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true, raw: false });
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    if (!sheetData?.length) return res.status(400).send('Uploaded file is empty or invalid.');

    const mode = req.body.mode === 'replace' ? 'replace' : 'merge';

    if (mode === 'replace') {
      await DataModel.deleteMany({ userId: req.user.userId });
    }

    await DataModel.insertMany(sheetData.map((row) => ({ ...row, userId: req.user.userId })));
    return res.status(200).json({ message: 'File uploaded successfully!', rows: sheetData.length, mode });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).send('Error uploading file');
  }
});

app.get('/api/data', requireAuth, async (req, res) => {
  try {
    return res.status(200).json(await DataModel.find({ userId: req.user.userId }));
  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).send('Error fetching data');
  }
});

app.post('/api/reset', requireAuth, async (req, res) => {
  try {
    await DataModel.deleteMany({ userId: req.user.userId });
    return res.status(200).send('Data Cleared!');
  } catch (error) {
    console.error('Reset error:', error);
    return res.status(500).send('Error resetting data');
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Unable to connect to MongoDB. Check MONGO_URI in backend/.env.');
    console.error(error.message);
    process.exit(1);
  }
};

startServer();
