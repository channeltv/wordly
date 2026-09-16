require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('./models/User'); 
const Post = require('./models/Post'); 
const Message = require('./models/Message'); 
const Event = require('./models/Event');
const { GoogleGenAI } = require('@google/generative-ai');

const app = express();
app.use(express.json()); 
app.use(express.static('public')); 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "INCOLLA_QUI_LA_TUA_CHIAVE_DI_GEMINI" });
mongoose.connect(process.env.MONGO_URI).then(() => console.log('🟢 DB Online!')).catch(err => console.error('🔴 Errore:', err));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function inviaEmailConferma(emailUtente, nomeUtente) {
    const mailOptions = {
        from: '"NexyTalk" <no-reply@nexytalk.net>',
        to: emailUtente,
        subject: 'Benvenuto su NexyTalk! 💬',
        html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;">
            <h2 style="color:#007bff;text-align:center;">💬 Benvenuto su NexyTalk, ${nomeUtente}!</h2>
            <p>Il tuo account è ora attivo e pronto per chattare sul nostro nuovo dominio.</p>
            <div style="text-align:center;margin:30px 0;"><a href="https://nexytalk.net" style="background:#007bff;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;font-weight:bold;">Accedi a NexyTalk</a></div>
        </div>`
    };
    try { await transporter.sendMail(mailOptions); console.log('🟢 Email inviata!'); } catch (e) { console.error('🔴 Errore mail:', e); }
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    // Cerca nel database sia per email che per username per non sbagliare mai!
    const user = await User.findOne({ $or: [{ email: email || username }, { username: username || email }] });
    if (!user || user.password !== password) return res.status(400).json({ error: 'Credenziali errate.' });
    res.status(200).json({ message: 'Ok!', user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.password !== password) return res.status(400).json({ error: 'Errati.' });
    res.status(200).json({ message: 'Ok!', user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.get('/api/users', async (req, res) => {
    try { res.status(200).json(await User.find({}, 'username email')); } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.post('/api/posts', async (req, res) => {
    try {
        const { userId, content } = req.body;
        let vec = [];
        try { const r = await ai.models.embedContent({ model: "text-embedding-004", content: { text: content } }); vec = r.embedding.values; } catch (ae) {}
        const p = new Post({ user: userId, content, plot_embedding: vec });
        await p.save();
        res.status(201).json({ post: p });
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.get('/api/posts', async (req, res) => {
    try { res.status(200).json(await Post.find().populate('user', 'username').sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.get('/api/search-ai', async (req, res) => {
    try {
        const { query } = req.query; if (!query) return res.status(400).json([]);
        const r = await ai.models.embedContent({ model: "text-embedding-004", content: { text: query } });
        const resIA = await Post.aggregate([
            { $vectorSearch: { index: "vector_index", path: "plot_embedding", queryVector: r.embedding.values, numCandidates: 100, limit: 10 } },
            { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } }, { $unwind: "$user" },
            { $project: { content: 1, likes: 1, comments: 1, createdAt: 1, "user.username": 1 } }
        ]);
        res.status(200).json(resIA);
    } catch (error) { res.status(500).json([]); }
});

app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const { userId } = req.body; const post = await Post.findById(req.params.id);
        const idx = post.likes.indexOf(userId);
        if (idx > -1) { post.likes.splice(idx, 1); } else { post.likes.push(userId); }
        await post.save(); res.status(200).json({ likesCount: post.likes.length });
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.post('/api/posts/:id/comment', async (req, res) => {
    try {
        const { userId, username, content } = req.body; const post = await Post.findById(req.params.id);
        post.comments.push({ user: userId, username, content }); await post.save();
        res.status(201).json({ comments: post.comments });
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, receiverId, content } = req.body;
        const nM = new Message({ sender: senderId, receiver: receiverId, content }); await nM.save();
        res.status(201).json(nM);
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
    try { res.status(200).json(await Message.find({ $or: [{ sender: req.params.user1, receiver: req.params.user2 }, { sender: req.params.user2, receiver: req.params.user1 }] }).sort({ createdAt: 1 })); } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, description, date, time, creatorId } = req.body;
        const nE = new Event({ title, description, date, time, creator: creatorId }); await nE.save();
        res.status(201).json({ event: nE });
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.get('/api/events', async (req, res) => {
    try { res.status(200).json(await Event.find().populate('creator', 'username').sort({ date: 1, time: 1 })); } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.put('/api/settings/profile', async (req, res) => {
    try {
        const { userId, username, avatar } = req.body;
        if (username && await User.findOne({ username, _id: { $ne: userId } })) return res.status(400).json({ error: '❌ Occupato.' });
        await User.findByIdAndUpdate(userId, { username, avatar }); res.status(200).json({ message: '✅ Ok!' });
    } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

app.put('/api/settings/password', async (req, res) => {
    try { await User.findByIdAndUpdate(req.body.userId, { password: req.body.newPassword }); res.status(200).json({ message: '✅ Ok!' }); } catch (error) { res.status(500).json({ error: '❌ Errore.' }); }
});

const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app); 
const io = socketIo(server);
const utentiOnline = new Map(); 

io.on('connection', (socket) => {
  socket.on('utente_connesso', (userId) => { utentiOnline.set(userId, socket.id); });
  socket.on('invia_messaggio', async (data) => {});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server attivo sulla porta ${PORT}`));
