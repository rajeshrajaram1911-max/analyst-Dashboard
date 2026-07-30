import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://127.0.0.1:27017/analyticsDB')
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log('MongoDB Error:', err));

const DataSchema = new mongoose.Schema({}, { strict: false });
const DataModel = mongoose.model('MergedData', DataSchema);

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet);

    if (jsonData.length === 0) {
      return res.status(400).send('File is empty.');
    }

    await DataModel.insertMany(jsonData);
    res.status(200).send('Data Uploaded Successfully!');
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).send('Server Error during upload');
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const data = await DataModel.find({}, { _id: 0, __v: 0 });
    res.json(data);
  } catch (error) {
    console.error('Fetch Error:', error);
    res.status(500).send('Error fetching data');
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    await DataModel.deleteMany({});
    res.status(200).send('Data Cleared!');
  } catch (error) {
    res.status(500).send('Error resetting data');
  }
});

app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});