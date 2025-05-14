const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Grid = require('gridfs-stream');
const { GridFsStorage } = require('multer-gridfs-storage');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB URI
const mongoURI = 'mongodb+srv://jayeshweljali93:hPNwYhHN1a0VnEf8@cluster0.cuj8wqb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Init GridFS
let gfs;
conn.once('open', () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
  console.log('✅ MongoDB connected and GridFS initialized');
});

// MongoDB schema for project metadata
const projectSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  fileId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});
const Project = mongoose.model('Project', projectSchema);

// Storage engine using multer-gridfs-storage
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    if (path.extname(file.originalname) !== '.zip') {
      return null;
    }
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: 'uploads',
    };
  },
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  const { title, description, price } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: 'Only ZIP files are allowed.' });
  }

  try {
    const project = new Project({
      title,
      description,
      price: parseFloat(price),
      fileId: req.file.id,
    });
    await project.save();
    res.status(200).json({ message: '✅ File uploaded and saved to MongoDB', project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save project metadata.' });
  }
});

// Download by file ID
app.get('/download/:id', async (req, res) => {
  try {
    const file = await gfs.files.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const readstream = gfs.createReadStream(file.filename);
    res.set('Content-Type', file.contentType || 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    readstream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// List all uploaded projects
app.get('/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
