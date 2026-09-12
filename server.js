require('dotenv').config(); // Carica le credenziali sicure dal file .env
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User'); 
const Post = require('./models/Post'); 
const Message = require('./models/Message'); 
const Event = require('./models/Event');
const { GoogleGenAI } = require('@google/generative-ai'); // Nuova sintassi ufficiale

const app = express();
app.use(express.json()); 
app.use(express.static('public')); 

// Configurazione dell'IA di Google con la chiave dinamica
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "INCOLLA_QUI_LA_TUA_CHIAVE_DI_GEMINI" });

// Connessione protetta a MongoDB Atlas usando il file .env
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('🟢 Connesso con successo a MongoDB Atlas online!'))
  .catch(err => console.error('🔴 Errore di connessione a MongoDB:', err));

// ==========================================
// 🔐 UTENTI, ACCESSI E LISTE
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ username, email, password });
    await newUser.save();
    res.status(201).json({ message: '🎉 Utente registrato!', user: newUser });
  } catch (error) { res.status(500).json({ error: '❌ Errore registrazione.' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.password !== password) { return res.status(400).json({ error: 'Email o password errati.' }); }
    res.status(200).json({ message: 'Accesso eseguito!', user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { res.status(500).json({ error: '❌ Errore login.' }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username email');
        res.status(200).json(users);
    } catch (error) { res.status(500).json({ error: '❌ Errore utenti.' }); }
});

// ==========================================
// 📝 POST E BACHECA CON INTEGRAZIONE VETTORIALE IA
// ==========================================
app.post('/api/posts', async (req, res) => {
    try {
        const { userId, content } = req.body;
        let coordinateVettoriali = [];
        try {
            const response = await ai.models.embedContent({
                model: "text-embedding-004",
                content: { text: content }
            });
            coordinateVettoriali = response.embedding.values;
        } catch (aiErr) { console.error("Errore embedding IA:", aiErr); }

        const newPost = new Post({ user: userId, content: content, plot_embedding: coordinateVettoriali });
        await newPost.save();
        res.status(201).json({ message: 'Post creato!', post: newPost });
    } catch (error) { res.status(500).json({ error: '❌ Errore post.' }); }
});

app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find().populate('user', 'username').sort({ createdAt: -1 });
        res.status(200).json(posts);
    } catch (error) { res.status(500).json({ error: '❌ Errore post.' }); }
});

app.get('/api/search-ai', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json([]);
        const aiRes = await ai.models.embedContent({
            model: "text-embedding-004",
            content: { text: query }
        });
        const queryVettore = aiRes.embedding.values;

        const risultatiIA = await Post.aggregate([
            { $vectorSearch: { index: "vector_index", path: "plot_embedding", queryVector: queryVettore, numCandidates: 100, limit: 10 } },
            { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
            { $unwind: "$user" },
            { $project: { content: 1, likes: 1, comments: 1, createdAt: 1, "user.username": 1 } }
        ]);
        res.status(200).json(risultatiIA);
    } catch (error) { res.status(500).json([]); }
});

app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const { userId } = req.body;
        const post = await Post.findById(req.params.id);
        const index = post.likes.indexOf(userId);
        if (index > -1) { post.likes.splice(index, 1); } else { post.likes.push(userId); }
        await post.save();
        res.status(200).json({ likesCount: post.likes.length, hasLiked: !post.likes.includes(userId) });
    } catch (error) { res.status(500).json({ error: '❌ Errore like.' }); }
});

app.post('/api/posts/:id/comment', async (req, res) => {
    try {
        const { userId, username, content } = req.body;
        const post = await Post.findById(req.params.id);
        post.comments.push({ user: userId, username, content });
        await post.save();
        res.status(201).json({ message: '✅ Commento aggiunto!', comments: post.comments });
    } catch (error) { res.status(500).json({ error: '❌ Errore commento.' }); }
});

// ==========================================
// 💬 MESSAGGI PRIVATI E 📅 EVENTI
// ==========================================
app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, receiverId, content } = req.body;
        const newMessage = new Message({ sender: senderId, receiver: receiverId, content });
        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) { res.status(500).json({ error: '❌ Errore messaggi.' }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const chatHistory = await Message.find({ $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }] }).sort({ createdAt: 1 });
        res.status(200).json(chatHistory);
    } catch (error) { res.status(500).json({ error: '❌ Errore chat.' }); }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, description, date, time, creatorId } = req.body;
        const newEvent = new Event({ title, description, date, time, creator: creatorId });
        await newEvent.save();
        res.status(201).json({ message: '✅ Evento creato!', event: newEvent });
    } catch (error) { res.status(500).json({ error: '❌ Errore eventi.' }); }
});

app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().populate('creator', 'username').sort({ date: 1, time: 1 });
        res.status(200).json(events);
    } catch (error) { res.status(500).json({ error: '❌ Errore eventi.' }); }
});

// ==========================================
// ⚙️ IMPOSTAZIONI ACCOUNT
// ==========================================
app.put('/api/settings/profile', async (req, res) => {
    try {
        const { userId, username, avatar } = req.body;
        if (username) {
            const existingUser = await User.findOne({ username, _id: { $ne: userId } });
            if (existingUser) return res.status(400).json({ error: '❌ Nome utente occupato.' });
        }
        await User.findByIdAndUpdate(userId, { username, avatar });
        res.status(200).json({ message: '✅ Profilo aggiornato!' });
    } catch (error) { res.status(500).json({ error: '❌ Errore profilo.' }); }
});

app.put('/api/settings/password', async (req, res) => {
    try {
        const { userId, newPassword } = req.body;
        await User.findByIdAndUpdate(userId, { password: newPassword });
        res.status(200).json({ message: '✅ Password aggiornata!' });
    } catch (error) { res.status(500).json({ error: '❌ Errore password.' }); }
});

// ==========================================
// 🔌 SOCKET.IO (CHAT REAL-TIME)
// ==========================================
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app); 
const io = socketIo(server);
const utentiOnline = new Map(); 

io.on('connection', (socket) => {
  socket.on('utente_connesso', (userId) => { utentiOnline.set(userId, socket.id); });
  socket.on('invia_messaggio', async (data) => {
    const { sender, receiver, content } = data;
    try {
      const nuovoMessaggio = new Message({ sender, receiver, content });
      await nuovoMessaggio.save();
      const socketDestinatario = utentiOnline.get(receiver);
      if (socketDestinatario) io.to(socketDestinatario).emit('ricevi_messaggio', nuovoMessaggio);
      socket.emit('messaggio_inviato', nuevoMessaggio);
    } catch (err) { console.error(err); }
  });
  socket.on('disconnect', () => {
    for (let [userId, socketId] of utentiOnline.entries()) { if (socketId === socket.id) { utentiOnline.delete(userId); break; } }
  });
});

const PORT = process.env.PORT || 5000; // Fondamentale per far scegliere la porta a Render!
server.listen(PORT, () => { console.log(`🚀 Server Wordly attivo sulla porta ${PORT}`); });
