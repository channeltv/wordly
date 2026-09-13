const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

// Inizializzazione Gemini con la variabile d ambiente inserita su Render
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

// Collegamento a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Database collegato con successo!"))
  .catch(err => console.error("Errore di connessione al database:", err));

// Rotte base per i file HTML del social network
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