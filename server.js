require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage } = require('@napi-rs/canvas');


const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

// Ensure required temporary & output directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public/generated')) fs.mkdirSync('public/generated');

// Function: Call Stability AI API to generate background
async function generateAIBackground(occasion) {
    const prompt = `A professional festive greeting background poster for ${occasion}, elegant traditional design, bright decorative lights, cultural elements, high resolution, soft warm lighting, empty center space for text, no human faces, no text`;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'png');

    const response = await axios.post(
        'https://api.stability.ai/v2beta/stable-image/generate/core',
        formData,
        {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
                Accept: 'image/*',
            },
            responseType: 'arraybuffer',
        }
    );

    const bgPath = path.join(__dirname, 'uploads', `bg_${Date.now()}.png`);
    fs.writeFileSync(bgPath, response.data);
    return bgPath;
}

// Main Poster Generation Endpoint
app.post('/generate-poster', upload.single('photo'), async (req, res) => {
    let userPhotoPath = null;
    let bgPath = null;

    try {
        const { username, occasion } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Photo is required.' });
        }
        
        userPhotoPath = req.file.path;

        // Step 1: AI Background Generation
        bgPath = await generateAIBackground(occasion);

        // Step 2: Canvas Composition Setup
        const canvas = createCanvas(1024, 1024);
        const ctx = canvas.getContext('2d');

        // Draw Background
        const bgImage = await loadImage(bgPath);
        ctx.drawImage(bgImage, 0, 0, 1024, 1024);

        // Dark Semi-transparent Banner at Bottom
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 840, 1024, 184);

        // Draw User Photo in Circle (Bottom Left)
        const userImg = await loadImage(userPhotoPath);
        ctx.save();
        ctx.beginPath();
        ctx.arc(110, 932, 65, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(userImg, 45, 867, 130, 130);
        ctx.restore();

        // White Border for Profile Photo
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(110, 932, 65, 0, Math.PI * 2, true);
        ctx.stroke();

        // Overlay Text Details
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Arial';
        ctx.fillText(`Happy ${occasion}!`, 200, 915);

        ctx.fillStyle = '#FBBF24'; // Amber accent color
        ctx.font = '28px Arial';
        ctx.fillText(`Best Wishes: ${username}`, 200, 960);

        // Save Output Image
        const outputFilename = `poster_${Date.now()}.png`;
        const outputPath = path.join(__dirname, 'public/generated', outputFilename);
        const out = fs.createWriteStream(outputPath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);

        out.on('finish', () => {
            // Clean up temp uploads
            if (fs.existsSync(userPhotoPath)) fs.unlinkSync(userPhotoPath);
            if (fs.existsSync(bgPath)) fs.unlinkSync(bgPath);

            res.json({
                success: true,
                imageUrl: `/generated/${outputFilename}`
            });
        });

    } catch (error) {
        console.error('Generation Error:', error?.response?.data ? error.response.data.toString() : error.message);

        // Clean up on error
        if (userPhotoPath && fs.existsSync(userPhotoPath)) fs.unlinkSync(userPhotoPath);
        if (bgPath && fs.existsSync(bgPath)) fs.unlinkSync(bgPath);

        res.status(500).json({ 
            success: false, 
            message: 'Image generation failed. Check API key or logs.' 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
