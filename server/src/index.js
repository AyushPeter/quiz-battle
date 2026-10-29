import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomInt } from "node:crypto";
import { QUESTIONS } from "./questions.js";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN }));
app.get("/", (_req, res) => res.json({ name: "Quiz Battle API", status: "ok", websocket: true }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN, methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000
});

const rooms = new Map();
const QUESTION_MS = 20_000;
const QUESTION_COUNT = 10;
const MAX_PLAYERS = 8;

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[randomInt(chars.length)];
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, answered: p.answered,
      connected: p.connected
    })),
    questionNumber: room.questionIndex + 1,
    questionCount: QUESTION_COUNT,
    deadline: room.deadline,
    question: room.status === "question" ? {
      category: room.currentQuestion.category,
      question: room.currentQuestion.question,
      options: room.currentQuestion.options
    } : null,
    result: room.status === "reveal" ? {
      correctIndex: room.currentQuestion.correctIndex,
      answers: [...room.players.values()].map(p => ({
        id: p.id, name: p.name, selectedIndex: p.selectedIndex,
        pointsEarned: p.lastPoints
      }))
    } : null,
    finalQuestions: room.status === "finished" ? room.finalQuestions : undefined
  };
}
function broadcast(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function cleanName(name) {
  const s = String(name || "").trim().replace(/\s+/g, " ").slice(0, 18);
  return s || "Player";
}
function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function stopTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function showReveal(room) {
  if (!room || room.status !== "question") return;
  stopTimer(room);
  room.status = "reveal";
  broadcast(room);
  room.timer = setTimeout(() => nextQuestion(room), 3500);
}
function nextQuestion(room) {
  if (!rooms.has(room.code)) return;
  stopTimer(room);
  room.questionIndex += 1;
  if (room.questionIndex >= QUESTION_COUNT) {
    room.status = "finished";
    room.finalQuestions = QUESTION_COUNT;
    broadcast(room);
    return;
  }
  room.currentQuestion = room.questionDeck[room.questionIndex];
  room.players.forEach(p => {
    p.answered = false;
    p.selectedIndex = null;
    p.lastPoints = 0;
  });
  room.status = "question";
  room.deadline = Date.now() + QUESTION_MS;
  broadcast(room);
  room.timer = setTimeout(() => showReveal(room), QUESTION_MS);
}
function makeRoom(hostSocket, name) {
  let code;
  do { code = roomCode(); } while (rooms.has(code));
  const room = {
    code, hostId: hostSocket.id, status: "lobby", players: new Map(),
    questionIndex: -1, questionDeck: shuffle(QUESTIONS).slice(0, QUESTION_COUNT),
    currentQuestion: null, deadline: null, timer: null
  };
  room.players.set(hostSocket.id, { id: hostSocket.id, name, score: 0, answered: false, selectedIndex: null, lastPoints: 0, connected: true });
  rooms.set(code, room);
  hostSocket.join(code);
  return room;
}
function findPlayerRoom(socketId) {
  for (const room of rooms.values()) if (room.players.has(socketId)) return room;
  return null;
}

io.on("connection", socket => {
  socket.emit("server:ready", { id: socket.id });

  socket.on("room:create", ({ name } = {}, ack = () => {}) => {
    if (findPlayerRoom(socket.id)) return ack({ ok: false, error: "You are already in a room." });
    const room = makeRoom(socket, cleanName(name));
    ack({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name } = {}, ack = () => {}) => {
    const normalized = String(code || "").trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return ack({ ok: false, error: "Room not found. Check the code and try again." });
    if (room.status !== "lobby") return ack({ ok: false, error: "That match has already started." });
    if (room.players.size >= MAX_PLAYERS) return ack({ ok: false, error: "This room is full (8 players maximum)." });
    if (findPlayerRoom(socket.id)) return ack({ ok: false, error: "You are already in a room." });
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), score: 0, answered: false, selectedIndex: null, lastPoints: 0, connected: true });
    socket.join(room.code);
    ack({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("game:start", ({ code } = {}, ack = () => {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) return ack({ ok: false, error: "Room not found." });
    if (room.hostId !== socket.id) return ack({ ok: false, error: "Only the host can start the game." });
    if (room.status !== "lobby") return ack({ ok: false, error: "The game has already started." });
    if (room.players.size < 2) return ack({ ok: false, error: "At least 2 players are needed to start." });
    room.players.forEach(p => { p.score = 0; p.answered = false; p.lastPoints = 0; });
    room.questionIndex = -1;
    room.questionDeck = shuffle(QUESTIONS).slice(0, QUESTION_COUNT);
    ack({ ok: true });
    nextQuestion(room);
  });

  socket.on("answer:submit", ({ code, selectedIndex } = {}, ack = () => {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.status !== "question") return ack({ ok: false, error: "This question is no longer active." });
    const player = room.players.get(socket.id);
    if (!player) return ack({ ok: false, error: "You are not in this room." });
    if (player.answered) return ack({ ok: false, error: "Your answer has already been submitted." });
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) return ack({ ok: false, error: "Invalid answer." });
    const now = Date.now();
    if (now >= room.deadline) {
      showReveal(room);
      return ack({ ok: false, error: "Time is up." });
    }
    player.answered = true;
    player.selectedIndex = selectedIndex;
    if (selectedIndex === room.currentQuestion.correctIndex) {
      const remainingRatio = Math.max(0, (room.deadline - now) / QUESTION_MS);
      player.lastPoints = Math.round(1000 + 1000 * remainingRatio);
      player.score += player.lastPoints;
    } else {
      player.lastPoints = 0;
    }
    ack({ ok: true, pointsEarned: player.lastPoints });
    broadcast(room);
    if ([...room.players.values()].every(p => p.answered)) showReveal(room);
  });

  socket.on("room:leave", ({ code } = {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || !room.players.has(socket.id)) return;
    socket.leave(room.code);
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      stopTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (room.status === "lobby") {
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        stopTimer(room);
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    } else if (player) {
      player.connected = false;
      // Keep the player and their score in the room; this is a basic disconnect grace behavior.
    }
    broadcast(room);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Quiz Battle server listening on port ${PORT}`);
});
