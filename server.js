const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const Message = require("./models/Message");

dotenv.config();

const app = express();

// =======================
// MIDDLEWARES
// =======================
app.use(cors());
app.use(express.json());

// =======================
// CREATE HTTP SERVER
// =======================
const server = http.createServer(app);

// =======================
// SOCKET SETUP
// =======================
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// =======================
// SOCKET AUTH MIDDLEWARE
// =======================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, "supersecretkey");
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

// =======================
// SOCKET CONNECTION
// =======================
io.on("connection", (socket) => {
  const userId = socket.user.userId;
  console.log("Authenticated user connected:", userId);

  // Join private room
  socket.on("joinRoom", (otherUserId) => {
    const room = [userId, otherUserId].sort().join("_");
    socket.join(room);
  });

  // Send message
  socket.on("sendMessage", async ({ receiver, text }) => {
    try {
      const room = [userId, receiver].sort().join("_");

      const newMessage = await Message.create({
        sender: userId,
        receiver,
        text,
        room,
      });

      io.to(room).emit("receiveMessage", newMessage);
    } catch (error) {
      console.log("Message error:", error);
    }
  });

  // Load previous messages
  socket.on("loadMessages", async (otherUserId) => {
    const room = [userId, otherUserId].sort().join("_");

    const messages = await Message.find({ room }).sort({
      createdAt: 1,
    });

    socket.emit("conversation", messages);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", userId);
  });
});

// =======================
// ROUTES
// =======================
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Backend running successfully" });
});

// Auth routes
app.use("/api/auth", authRoutes);

// Protected route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed protected route",
    user: req.user,
  });
});

// =======================
// DATABASE CONNECTION
// =======================
mongoose
  .connect("mongodb://127.0.0.1:27017/chat-app")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("Mongo Error:", err));

// =======================
// START SERVER
// =======================
const PORT = 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});