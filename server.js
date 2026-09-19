require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('./models/User'); 
const Post = require('./models/Post'); 
const Message = require('./models/Message'); 
const Event = require('./models/Event');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://nexytalk.net');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); 

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Connesso con successo a MongoDB Atlas online!'))
  .catch(err => console.error('🔴 Errore di connessione a MongoDB:', err));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function inviaEmailConferma(emailUtente, nomeUtente) {
    const mailOptions = {
        from: '"NexyTalk" <Ustameta@gmail.com>',
        to: emailUtente,
        subject: 'Benvenuto su NexyTalk! 💬',
        html: `
            <div style="font-family: 'Segoe UI', sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 50px;">💬</span>
                    <h2 style="color: #007bff; margin-top: 10px;">Benvenuto su NexyTalk, ${nomeUtente}!</h2>
                </div>
                <p style="font-size: 16px; line-height: 1.6;">Grazie per esserti registrato sulla nostra piattaforma. Il tuo account è ora attivo, sicuro e pronto all'uso.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://nexytalk.net" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                        Accedi a NexyTalk
                    </a>
                </div>
            </div>
        `
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`🟢 Email di benvenuto inviata a: ${emailUtente}`);
    } catch (error) {
        console.error("🔴 Errore invio email:", error);
    }
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const credenziale = email || username;

    if (!credenziale || !password) {
      return res.status(400).json({ error: 'Inserisci tutti i campi richiesti.' });
    }

    const user = await User.findOne({
        \$or: [{ email: credenziale }, { username: credenziale }]
    });

    if (!user || user.password !== password) {
      return res.status(400).json({ error: 'Nome utente, email o password errati.' });
    }
    
    res.status(200).json({ message: 'Accesso eseguito!', user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { 
    res.status(500).json({ error: '❌ Errore del server durante il login.' }); 
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const credenziale = email || username;

    if (!credenziale || !password) {
      return res.status(400).json({ error: 'Inserisci tutti i campi richiesti.' });
    }

    const user = await User.findOne({
        \$or: [{ email: credenziale }, { username: credenziale }]
    });

    if (!user || user.password !== password) {
      return res.status(400).json({ error: 'Nome utente, email o password errati.' });
    }
    
    res.status(200).json({ message: 'Accesso eseguito!', user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { 
    res.status(500).json({ error: '❌ Errore del server durante il login.' }); 
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ username, email, password });
    await newUser.save();
    await inviaEmailConferma(email, username);
    res.status(201).json({ message: '🎉 Utente registrato con successo!', user: newUser });
  } catch (error) { 
    res.status(500).json({ error: '❌ Errore durante la registrazione.' }); 
  }
});

app.get('/api/users', async (req, res) => {
    try { res.status(200).json(await User.find({}, 'username email')); } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.post('/api/posts', async (req, res) => {
    try {
        const newPost = new Post({ user: req.body.userId, content: req.body.content });
        await newPost.save();
        res.status(201).json({ post: newPost });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get('/api/posts', async (req, res) => {
    try { res.status(200).json(await Post.find().populate('user', 'username').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const nM = new Message({ sender: req.body.senderId, receiver: req.body.receiverId, content: req.body.content });
        await nM.save();
        res.status(201).json(nM);
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const history = await Message.find({
            \$or: [
                { sender: req.params.user1, receiver: req.params.user2 },
                { sender: req.params.user2, receiver: req.params.user1 }
            ]
        }).sort({ createdAt: 1 });
        res.status(200).json(history);
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.post('/api/events', async (req, res) => {
    try {
        const nE = new Event({ title: req.body.title, description: req.body.description, date: req.body.date, time: req.body.time, creator: req.body.creatorId });
        await nE.save();
        res.status(201).json({ event: nE });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get('/api/events', async (req, res) => {
    try { res.status(200).json(await Event.find().populate('creator', 'username').sort({ date: 1, time: 1 })); } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app); 
const io = socketIo(server);
const utentiOnline = new Map(); 

io.on('connection', (socket) => {
  socket.on('utente_connesso', (userId) => { utentiOnline.set(userId, socket.id); });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server NexyTalk attivo sulla porta ${PORT}`));
