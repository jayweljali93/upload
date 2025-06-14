const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoURI = 'mongodb+srv://jayeshweljali93:hPNwYhHN1a0VnEf8@cluster0.cuj8wqb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const conn = mongoose.createConnection(mongoURI, {
  dbName: 'projects',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let gfs;
conn.once('open', () => {
  gfs = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'uploads',
  });
  console.log('✅ MongoDB connected & GridFSBucket ready');
});

// Schema and model
const projectSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  fileId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});
const Project = conn.model('Project', projectSchema);

// Multer file upload to temp directory
const upload = multer({ dest: 'temp/' });

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file || path.extname(req.file.originalname) !== '.zip') {
    fs.unlinkSync(req.file.path); // remove temp file
    return res.status(400).json({ error: 'Only .zip files allowed' });
  }

  const { title, description, price } = req.body;

  const readStream = fs.createReadStream(req.file.path);
  const uploadStream = gfs.openUploadStream(req.file.originalname, {
    contentType: 'application/zip',
  });

  readStream.pipe(uploadStream)
    .on('error', (err) => {
      fs.unlinkSync(req.file.path);
      console.error(err);
      res.status(500).json({ error: 'Upload failed' });
    })
    .on('finish', async () => { // Removed 'uploadedFile' argument
      fs.unlinkSync(req.file.path);
      console.log('File uploaded to MongoDB:', uploadStream.id); // Access _id from uploadStream
      try {
        const project = new Project({
          title,
          description,
          price: parseFloat(price),
          fileId: uploadStream.id, // Use uploadStream.id
        });
        await project.save();

        res.status(200).json({ message: '✅ Uploaded and saved', project });
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Metadata save failed' });
      }
    });
});

// Download endpoint
app.get('/download/:id', async (req, res) => {
  try {
    const fileId = new mongoose.mongo.ObjectId(req.params.id);

    // Find the associated project to get the title
    const project = await Project.findOne({ fileId: fileId }); // Assuming your Project model has 'fileId'

    if (!project) {
      return res.status(404).json({ error: 'Project not found for this file' });
    }

    const downloadStream = gfs.openDownloadStream(fileId);

    if (!downloadStream) {
      return res.status(404).json({ error: 'File not found in GridFS' });
    }

    // Set the Content-Disposition header with the project title as the filename
    res.setHeader('Content-Disposition', `attachment; filename="${project.title}.zip"`); // Assuming you have fileType in your Project model

    // Optionally, set the Content-Type based on GridFS metadata
    const files = await gfs.find({ _id: fileId }).toArray();
    if (files && files.length > 0 && files[0].contentType) {
      res.setHeader('Content-Type', files[0].contentType);
    }

    downloadStream.pipe(res);

    downloadStream.on('error', (err) => {
      console.error('Error during download stream:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });

  } catch (err) {
    console.error('Error in download route:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// List projects
app.get('/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
