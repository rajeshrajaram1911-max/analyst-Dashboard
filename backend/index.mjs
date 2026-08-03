import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import * as XLSX from 'xlsx';

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const MONGO_URI = process.env.MONGO_URI 

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error('MongoDB Error:', err));

const DataSchema = new mongoose.Schema({}, { strict: false });
const DataModel = mongoose.model('Data', DataSchema);

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const workbook = XLSX.read(req.file.buffer, { 
      type: 'buffer',
      cellDates: true,
      raw: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData || sheetData.length === 0) {
      return res.status(400).send('Uploaded file is empty or invalid.');
    }

    await DataModel.insertMany(sheetData);
    res.status(200).send('File uploaded successfully!');
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send('Error uploading file');
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const data = await DataModel.find();
    res.status(200).json(data);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).send('Error fetching data');
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    await DataModel.deleteMany({});
    res.status(200).send('Data Cleared!');
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).send('Error resetting data');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});