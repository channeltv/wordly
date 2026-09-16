require('dotenv').config(); // Carica le credenziali sicure dal file .env
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer'); // Servizio per l'invio delle email
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
// 📬 CONFIGURAZIONE INVIO EMAIL (NODEMAILER)
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usa Gmail (richiede Password per le App) o parametri SMTP del tuo provider
    auth: {
        user: process.env.EMAIL_USER, // Configurato su Render
        pass: process.env.EMAIL_PASS  // Configurato su Render
    }
});

// Funzione grafica per l'invio dell'email di benvenuto NexyTalk
async function inviaEmailConferma(emailUtente, nomeUtente) {
    const mailOptions = {
        from: '"NexyTalk" <no-reply@nexytalk.net>',
        to: emailUtente,
        subject: 'Benvenuto su NexyTalk! Conferma la tua registrazione 💬',
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 50px;">💬</span>
                    <h2 style="color: #007bff; margin-top: 10px; font-size: 28px;">Benvenuto su NexyTalk, ${nomeUtente}!</h2>
                </div>
                <p style="font-size: 16px; line-height: 1.6; color: #555;">Grazie per esserti registrato sulla nostra piattaforma. Il tuo account è ora attivo, sicuro e pronto all'uso.</p>
                <p style="font-size: 16px; line-height: 1.6; color: #555;">Da adesso puoi connetterti e chattare utilizzando il nostro nuovo dominio personalizzato.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://nexytalk.net" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,123,255,0.2);">
                        Accedi a NexyTalk
                    </a>
                </div>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #999; text-align: center;">Questa è un'email di notifica automatica dal server NexyTalk, si prega di non rispondere direttamente.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`🟢 Email di benvenuto inviata correttamente a: ${emailUtente}`);
    } catch (error) {
        console.error("🔴 Errore durante l'invio dell'email:", error);
    }
}

// ==========================================
// 🔐 UTENTI, ACCESSI E LISTE
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ username, email, password });
    await newUser.save();

    // Invio automatico dell'email in background dopo il salvataggio sul DB
    await inviaEmailConferma(email, username);

    res.status(201).json({ message: '🎉 Utente registrato ed email inviata!', user: newUser });
  } catch (error) { 
    console.error("Errore registrazione:", error);
    res.status(500).json({ error: '❌ Errore registrazione.' }); 
  }
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


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server acceso sulla porta ${PORT}`));
