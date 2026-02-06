const express = require('express');
const { create } = require('venom-bot');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let whatsappClient = null;
let pairCode = null;

// WhatsApp Bot Start (Simplified)
async function startWhatsAppBot() {
    try {
        whatsappClient = await create({
            session: 'downloader-bot',
            multidevice: true,
            headless: true,
            useChrome: false,
            debug: false,
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        // Generate Pair Code
        whatsappClient.onStateChange((state) => {
            console.log('State changed:', state);
            
            if (state === 'pairingCode') {
                whatsappClient.getPairingCode().then((code) => {
                    pairCode = code;
                    console.log('📱 Pair Code:', pairCode);
                });
            }
            
            if (state === 'CONNECTED') {
                console.log('✅ WhatsApp Connected!');
            }
        });

        // Handle Messages
        whatsappClient.onMessage(async (message) => {
            if (message.isGroupMsg) return;
            
            const text = message.body;
            const sender = message.from;
            
            console.log(`Message from ${sender}: ${text}`);
            
            // Help Command
            if (text === '!help' || text === '/help') {
                whatsappClient.sendText(
                    sender,
                    `🤖 *Social Media Downloader Bot*\n\n*Commands:*\n• Send YouTube link to download\n• !help - Show help\n\n*Note:* Currently supports YouTube only`
                );
            }
            
            // YouTube URL Detection
            if (text.includes('youtube.com') || text.includes('youtu.be')) {
                try {
                    await handleYouTubeDownload(message);
                } catch (error) {
                    console.error('Error:', error);
                    whatsappClient.sendText(sender, '❌ Error downloading video');
                }
            }
        });

    } catch (error) {
        console.error('Bot error:', error);
    }
}

// YouTube Download Handler
async function handleYouTubeDownload(message) {
    const url = message.body;
    const sender = message.from;
    
    // Send processing message
    whatsappClient.sendText(sender, '⏳ Processing YouTube link...');
    
    // Get video info
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const duration = info.videoDetails.lengthSeconds;
    
    // Send video info
    whatsappClient.sendText(
        sender,
        `📺 *Video Found:*\n${title}\n⏱️ Duration: ${Math.floor(duration/60)}:${duration%60}\n\n⬇️ Downloading in 360p...`
    );
    
    // Download and send
    const tempPath = path.join('/tmp', `video_${Date.now()}.mp4`);
    
    const videoStream = ytdl(url, {
        quality: 'lowest',
        filter: 'audioandvideo'
    });
    
    const writeStream = fs.createWriteStream(tempPath);
    videoStream.pipe(writeStream);
    
    writeStream.on('finish', async () => {
        try {
            // Send video
            await whatsappClient.sendFile(
                sender,
                tempPath,
                'video.mp4',
                `✅ ${title}`
            );
            
            // Clean up
            fs.unlinkSync(tempPath);
        } catch (error) {
            console.error('Send error:', error);
        }
    });
    
    writeStream.on('error', (error) => {
        console.error('Write error:', error);
        whatsappClient.sendText(sender, '❌ Download failed');
    });
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pair-code', (req, res) => {
    res.json({
        pairCode: pairCode || 'Generating...',
        status: whatsappClient ? 'Connected' : 'Disconnected'
    });
});

app.get('/start-bot', async (req, res) => {
    if (!whatsappClient) {
        await startWhatsAppBot();
        res.json({ message: 'Bot starting...' });
    } else {
        res.json({ message: 'Bot already running' });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to see dashboard`);
    
    // Start bot automatically
    startWhatsAppBot();
});
