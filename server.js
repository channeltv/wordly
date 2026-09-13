const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Database collegato con successo!"))
  .catch(err => console.error("Errore di connessione al database:", err));

// --- ROTTA DI REGISTRAZIONE UTENTI ---
app.post("/api/register", async (req, res) => {
  try {
    const User = require("./models/User");
    const { username, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email già registrata" });

    const newUser = new User({ username, email, password });
    await newUser.save();
    res.status(201).json({ message: "Utente registrato con successo!" });
  } catch (err) {
    res.status(500).json({ error: "Errore durante la registrazione: " + err.message });
  }
});

// --- ROTTA DI LOGIN UTENTI ---
app.post("/api/login", async (req, res) => {
  try {
    const User = require("./models/User");
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(400).json({ error: "Credenziali non valide" });
    }
    res.status(200).json({ message: "Login effettuato!", user });
  } catch (err) {
    res.status(500).json({ error: "Errore durante il login" });
  }
});

// Pagine HTML
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));
app.get("/login", (req, res) => res.sendFile(__dirname + "/login.html"));
app.get("/amici", (req, res) => res.sendFile(__dirname + "/amici.html"));
app.get("/chat", (req, res) => res.sendFile(__dirname + "/chat.html"));
app.get("/eventi", (req, res) => res.sendFile(__dirname + "/eventi.html"));
app.get("/home", (req, res) => res.sendFile(__dirname + "/home.html"));
app.get("/impostazioni", (req, res) => res.sendFile(__dirname + "/impostazioni.html"));
app.get("/messaggi", (req, res) => res.sendFile(__dirname + "/messaggi.html"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server acceso sulla porta ${PORT}`));