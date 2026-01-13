const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");

const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 8080);

function loadBannedWords() {
  const filePath = path.join(__dirname, "..", "data", "bannedWords.txt");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

function loadCategories() {
  const filePath = path.join(__dirname, "..", "data", "categories.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const categories = raw?.categories ?? [];
  for (const c of categories) {
    if (!c.id || !c.name || !c.icon || !Array.isArray(c.clues16) || c.clues16.length !== 16) {
      throw new Error("Invalid categories.json: each category must have id,name,icon,clues16[16]");
    }
  }
  return categories;
}

const bannedTokens = loadBannedWords();
const categories = loadCategories();

function includesBannedToken(lobbyName) {
  const hay = String(lobbyName || "").toLowerCase();
  return bannedTokens.some((t) => hay.includes(t.toLowerCase()));
}

function randomCode6() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing chars
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomLobbyId() {
  // stable invite/routing id (not secret)
  return crypto.randomUUID();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function now() {
  return Date.now();
}

/** @type {Map<string, any>} */
const lobbies = new Map();
/** socketId -> { lobbyId, playerId } */
const socketIndex = new Map();

function listPublicLobbies() {
  const out = [];
  for (const lobby of lobbies.values()) {
    if (lobby.isPrivate) continue;
    const connectedCount = lobby.players.filter((p) => p.connected).length;
    out.push({
      lobbyId: lobby.lobbyId,
      lobbyName: lobby.lobbyName,
      playerCount: connectedCount
    });
  }
  out.sort((a, b) => a.lobbyName.localeCompare(b.lobbyName));
  return out;
}

function emitLobbyList(io) {
  io.emit("LOBBY_LIST", { lobbies: listPublicLobbies() });
}

function serializeLobbyState(lobby) {
  const gs = lobby.gameState;
  return {
    lobbyId: lobby.lobbyId,
    lobbyName: lobby.lobbyName,
    lobbyCode: lobby.lobbyCode,
    lobbyCodeHidden: true,
    hostPlayerId: lobby.hostPlayerId,
    players: lobby.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarDataUrl: p.avatarDataUrl || null,
      points: p.points,
      joinedAt: p.joinedAt,
      connected: p.connected
    })),
    settings: {
      fraudCount: lobby.settings.fraudCount,
      allowedCategoryIds: lobby.settings.allowedCategoryIds,
      availableCategories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))
    },
    phase: gs.phase,
    roundId: gs.roundId,
    cluesByPlayerId: { ...gs.cluesByPlayerId },
    votesByVoterId: { ...gs.votesByVoterId },
    phaseStartedAt: gs.phaseStartedAt
  };
}

function broadcastLobbyState(io, lobby) {
  io.to(lobby.lobbyId).emit("LOBBY_STATE", serializeLobbyState(lobby));
}

function emitError(socket, code, message) {
  socket.emit("ERROR", { code, message });
}

function ensureLobbyExists(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  return lobby || null;
}

function findLobbyByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  for (const lobby of lobbies.values()) {
    if (lobby.lobbyCode === normalized) return lobby;
  }
  return null;
}

function computeVoteState(lobby) {
  const votesByVoterId = lobby.gameState.votesByVoterId;
  const voteCountsByTargetId = {};
  const voterAvatarsByTargetId = {};
  const playersById = new Map(lobby.players.map((p) => [p.id, p]));

  for (const [voterId, targetId] of Object.entries(votesByVoterId)) {
    if (!targetId) continue;
    voteCountsByTargetId[targetId] = (voteCountsByTargetId[targetId] || 0) + 1;
    const voter = playersById.get(voterId);
    if (!voter) continue;
    if (!voterAvatarsByTargetId[targetId]) voterAvatarsByTargetId[targetId] = [];
    voterAvatarsByTargetId[targetId].push({
      playerId: voter.id,
      avatarDataUrl: voter.avatarDataUrl || null,
      name: voter.name
    });
  }

  const connected = lobby.players.filter((p) => p.connected);
  const allSubmitted = connected.length > 0 && connected.every((p) => Boolean(votesByVoterId[p.id]));

  return { votesByVoterId: { ...votesByVoterId }, voteCountsByTargetId, voterAvatarsByTargetId, allSubmitted };
}

function emitVoteState(io, lobby) {
  const vs = computeVoteState(lobby);
  io.to(lobby.lobbyId).emit("VOTE_STATE", { lobbyId: lobby.lobbyId, ...vs });
}

function leaderboard(lobby) {
  const arr = lobby.players
    .slice()
    .sort((a, b) => (b.points - a.points) || (a.joinedAt - b.joinedAt))
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      avatarDataUrl: p.avatarDataUrl || null,
      points: p.points
    }));
  return arr;
}

function emitScore(io, lobby) {
  io.to(lobby.lobbyId).emit("SCORE_UPDATE", { lobbyId: lobby.lobbyId, leaderboard: leaderboard(lobby) });
}

function setPhase(lobby, phase) {
  lobby.gameState.phase = phase;
  lobby.gameState.phaseStartedAt = now();
}

function startNewRound(io, lobby) {
  const allowed = new Set(lobby.settings.allowedCategoryIds);
  const usable = categories.filter((c) => allowed.has(c.id));
  const category = pickRandom(usable.length ? usable : categories);

  lobby.gameState.roundId = crypto.randomUUID();
  lobby.gameState.category = category;
  lobby.gameState.clueBoard16 = category.clues16.slice();
  lobby.gameState.secretIndex = Math.floor(Math.random() * 16);
  lobby.gameState.cluesByPlayerId = {};
  lobby.gameState.votesByVoterId = {};
  lobby.gameState.fraudGuess = null;

  const connected = lobby.players.filter((p) => p.connected);
  let fraudIds = [];
  const desired = Math.max(0, Math.min(lobby.settings.fraudCount, connected.length));
  if (connected.length >= 2) {
    const fraudCount = Math.max(1, desired || 1);
    const shuffled = connected.slice().sort(() => Math.random() - 0.5);
    fraudIds = shuffled.slice(0, Math.min(fraudCount, connected.length)).map((p) => p.id);
  } else {
    fraudIds = [];
  }
  lobby.gameState.fraudIds = fraudIds;

  setPhase(lobby, "clues");
  broadcastLobbyState(io, lobby);
  emitVoteState(io, lobby);

  // Per-player GAME_STARTED (never leak secret index to frauds)
  for (const p of connected) {
    const isFraud = fraudIds.includes(p.id);
    const payload = {
      lobbyId: lobby.lobbyId,
      roundId: lobby.gameState.roundId,
      category: { id: category.id, name: category.name, icon: category.icon },
      clueBoard16: lobby.gameState.clueBoard16,
      visibleSecretForPlayer: !isFraud,
      ...(isFraud ? {} : { secretIndexIfAllowed: lobby.gameState.secretIndex })
    };
    if (p.socketId) io.to(p.socketId).emit("GAME_STARTED", payload);
  }
}

function endVoting(io, lobby) {
  if (lobby.gameState.phase !== "voting") return;
  const fraudIds = lobby.gameState.fraudIds || [];
  const { voteCountsByTargetId } = computeVoteState(lobby);

  let eliminatedId = null;
  let top = -1;
  for (const [targetId, count] of Object.entries(voteCountsByTargetId)) {
    if (count > top) {
      top = count;
      eliminatedId = targetId;
    } else if (count === top && top !== -1) {
      // tie-break random
      eliminatedId = Math.random() < 0.5 ? eliminatedId : targetId;
    }
  }

  const eliminatedIsFraud = eliminatedId ? fraudIds.includes(eliminatedId) : false;

  // scoring
  if (eliminatedIsFraud) {
    for (const p of lobby.players) {
      if (!p.connected) continue;
      if (fraudIds.includes(p.id)) continue;
      const voted = lobby.gameState.votesByVoterId[p.id];
      if (voted && voted === eliminatedId) p.points += 1;
    }
  } else {
    for (const fid of fraudIds) {
      const fp = lobby.players.find((p) => p.id === fid);
      if (fp && fp.connected) fp.points += 1;
    }
  }

  emitScore(io, lobby);

  io.to(lobby.lobbyId).emit("VOTE_REVEAL", {
    lobbyId: lobby.lobbyId,
    fraudIds,
    resultsSummary: {
      eliminatedPlayerId: eliminatedId,
      eliminatedIsFraud
    }
  });

  if (!fraudIds.length || eliminatedIsFraud) {
    // no fraud left / fraud eliminated -> next round after 10s
    setPhase(lobby, "clues");
    broadcastLobbyState(io, lobby);
    setTimeout(() => {
      if (!lobbies.has(lobby.lobbyId)) return;
      startNewRound(io, lobby);
    }, 10_000);
    return;
  }

  // fraud guess phase
  setPhase(lobby, "fraud_guess");
  lobby.gameState.fraudGuess = {
    guessIndex: null,
    completedAt: null,
    deadlineAt: now() + 60_000
  };
  broadcastLobbyState(io, lobby);

  // timer
  if (lobby._fraudGuessTimer) clearTimeout(lobby._fraudGuessTimer);
  lobby._fraudGuessTimer = setTimeout(() => {
    if (!lobbies.has(lobby.lobbyId)) return;
    if (lobby.gameState.phase !== "fraud_guess") return;
    // timeout -> incorrect
    io.to(lobby.lobbyId).emit("FRAUD_GUESS_RESULT", {
      lobbyId: lobby.lobbyId,
      isCorrect: false,
      guessIndex: -1,
      secretIndex: lobby.gameState.secretIndex
    });
    setTimeout(() => {
      if (!lobbies.has(lobby.lobbyId)) return;
      startNewRound(io, lobby);
    }, 10_000);
  }, 60_000);
}

function maybeStartVoting(io, lobby) {
  if (lobby.gameState.phase !== "clues") return;
  setPhase(lobby, "voting");
  lobby.gameState.votesByVoterId = {};
  broadcastLobbyState(io, lobby);
  emitVoteState(io, lobby);
}

function migrateHostIfNeeded(io, lobby) {
  const host = lobby.players.find((p) => p.id === lobby.hostPlayerId);
  if (host && host.connected) return;
  const candidates = lobby.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt);
  if (!candidates.length) return;
  lobby.hostPlayerId = candidates[0].id;
  io.to(lobby.lobbyId).emit("HOST_CHANGED", { lobbyId: lobby.lobbyId, hostPlayerId: lobby.hostPlayerId });
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// static client build (prod)
const publicDir = path.join(__dirname, "..", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// SPA fallback (avoid shadowing /health)
app.get(/^(?!\/health).*/, (req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath) && req.method === "GET" && !req.path.startsWith("/health")) {
    return res.sendFile(indexPath);
  }
  return res.status(404).send("Not found");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});

io.on("connection", (socket) => {
  socket.on("LOBBY_LIST_REQUEST", () => {
    socket.emit("LOBBY_LIST", { lobbies: listPublicLobbies() });
  });

  socket.on("LOBBY_CREATE", (payload, ack) => {
    try {
      const lobbyName = String(payload?.lobbyName || "").trim();
      const isPrivate = Boolean(payload?.isPrivate);
      if (!lobbyName || lobbyName.length < 2 || lobbyName.length > 32) {
        emitError(socket, "LOBBY_NAME_INVALID", "Lobby Name must be 2–32 characters.");
        return;
      }
      if (includesBannedToken(lobbyName)) {
        emitError(socket, "LOBBY_NAME_BANNED", "That lobby name isn't allowed.");
        return;
      }
      const lobbyId = randomLobbyId();
      const lobbyCode = randomCode6();

      const lobby = {
        lobbyId,
        lobbyName,
        lobbyCode,
        isPrivate,
        hostPlayerId: null,
        players: [],
        settings: {
          fraudCount: 1,
          allowedCategoryIds: categories.map((c) => c.id)
        },
        gameState: {
          phase: "lobby",
          roundId: null,
          category: null,
          clueBoard16: [],
          secretIndex: null,
          fraudIds: [],
          cluesByPlayerId: {},
          votesByVoterId: {},
          fraudGuess: null,
          phaseStartedAt: now()
        },
        _fraudGuessTimer: null
      };

      lobbies.set(lobbyId, lobby);
      emitLobbyList(io);
      if (typeof ack === "function") ack({ ok: true, lobbyId });
    } catch (e) {
      emitError(socket, "LOBBY_CREATE_FAILED", "Failed to create lobby.");
    }
  });

  socket.on("LOBBY_JOIN", (payload, ack) => {
    const clientPlayerId = String(payload?.clientPlayerId || "").trim();
    const playerName = String(payload?.playerName || "").trim();
    const lobbyId = payload?.lobbyId ? String(payload.lobbyId) : null;
    const lobbyCode = payload?.lobbyCode ? String(payload.lobbyCode).trim().toUpperCase() : null;

    if (!clientPlayerId) {
      emitError(socket, "PLAYER_ID_REQUIRED", "Missing clientPlayerId.");
      if (typeof ack === "function") ack({ ok: false });
      return;
    }
    if (!playerName) {
      emitError(socket, "PLAYER_NAME_REQUIRED", "Missing playerName.");
      if (typeof ack === "function") ack({ ok: false });
      return;
    }

    let lobby = null;
    if (lobbyId) lobby = ensureLobbyExists(lobbyId);
    if (!lobby && lobbyCode) lobby = findLobbyByCode(lobbyCode);

    if (!lobby) {
      emitError(socket, "LOBBY_NOT_FOUND", "Lobby not found.");
      if (typeof ack === "function") ack({ ok: false });
      return;
    }

    // joining private via lobbyId is allowed (invite link)
    // joining via lobbyCode always allowed if correct
    if (lobby.isPrivate && lobbyCode && lobby.lobbyCode !== lobbyCode) {
      emitError(socket, "LOBBY_CODE_INVALID", "Invalid lobby code.");
      if (typeof ack === "function") ack({ ok: false, lobbyId: lobby.lobbyId });
      return;
    }

    // attach socket to lobby room
    socket.join(lobby.lobbyId);

    // find existing player (reconnect)
    let player = lobby.players.find((p) => p.id === clientPlayerId);
    if (!player) {
      player = {
        id: clientPlayerId,
        name: playerName,
        avatarDataUrl: payload?.avatarDataUrl ? String(payload.avatarDataUrl) : null,
        points: 0,
        joinedAt: now(),
        connected: true,
        socketId: socket.id
      };
      lobby.players.push(player);
    } else {
      player.name = playerName;
      player.avatarDataUrl = payload?.avatarDataUrl ? String(payload.avatarDataUrl) : player.avatarDataUrl;
      player.connected = true;
      player.socketId = socket.id;
    }

    socketIndex.set(socket.id, { lobbyId: lobby.lobbyId, playerId: player.id });

    if (!lobby.hostPlayerId) lobby.hostPlayerId = player.id;
    migrateHostIfNeeded(io, lobby);

    broadcastLobbyState(io, lobby);
    emitLobbyList(io);

    if (typeof ack === "function") ack({ ok: true, lobbyId: lobby.lobbyId });
  });

  socket.on("LOBBY_LEAVE", (payload) => {
    const info = socketIndex.get(socket.id);
    const lobbyId = payload?.lobbyId ? String(payload.lobbyId) : info?.lobbyId;
    if (!lobbyId) return;
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const playerId = info?.playerId;
    if (!playerId) return;
    lobby.players = lobby.players.filter((p) => p.id !== playerId);
    socketIndex.delete(socket.id);
    socket.leave(lobby.lobbyId);

    if (lobby.players.length === 0) {
      lobbies.delete(lobby.lobbyId);
      emitLobbyList(io);
      return;
    }

    if (lobby.hostPlayerId === playerId) migrateHostIfNeeded(io, lobby);
    broadcastLobbyState(io, lobby);
    emitLobbyList(io);
  });

  socket.on("SETTINGS_UPDATE", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (info.playerId !== lobby.hostPlayerId) {
      emitError(socket, "FORBIDDEN", "Only the host can change settings.");
      return;
    }

    const partial = payload?.partialSettings || {};
    if (Array.isArray(partial.allowedCategoryIds)) {
      const allowed = partial.allowedCategoryIds.map(String);
      lobby.settings.allowedCategoryIds = allowed;
    }
    if (typeof partial.fraudCount === "number") {
      lobby.settings.fraudCount = Math.max(1, Math.min(3, Math.floor(partial.fraudCount)));
    }
    broadcastLobbyState(io, lobby);
  });

  socket.on("HOST_TRANSFER", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (info.playerId !== lobby.hostPlayerId) {
      emitError(socket, "FORBIDDEN", "Only the host can transfer host.");
      return;
    }
    const newHostId = String(payload?.newHostPlayerId || "");
    const candidate = lobby.players.find((p) => p.id === newHostId && p.connected);
    if (!candidate) {
      emitError(socket, "PLAYER_NOT_FOUND", "That player isn't available.");
      return;
    }
    lobby.hostPlayerId = candidate.id;
    io.to(lobby.lobbyId).emit("HOST_CHANGED", { lobbyId: lobby.lobbyId, hostPlayerId: lobby.hostPlayerId });
    broadcastLobbyState(io, lobby);
  });

  socket.on("GAME_START", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (info.playerId !== lobby.hostPlayerId) {
      emitError(socket, "FORBIDDEN", "Only the host can start the game.");
      return;
    }
    startNewRound(io, lobby);
  });

  socket.on("ROUND_END", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (info.playerId !== lobby.hostPlayerId) {
      emitError(socket, "FORBIDDEN", "Only the host can do that.");
      return;
    }
    // host can advance from clues -> voting
    if (lobby.gameState.phase === "clues") maybeStartVoting(io, lobby);
  });

  socket.on("CHAT_SEND", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    const player = lobby.players.find((p) => p.id === info.playerId);
    if (!player) return;
    const message = String(payload?.message || "").trim();
    if (!message) return;
    const messageObj = {
      id: crypto.randomUUID(),
      at: now(),
      playerId: player.id,
      playerName: player.name,
      avatarDataUrl: player.avatarDataUrl || null,
      message
    };
    io.to(lobby.lobbyId).emit("CHAT_MESSAGE", { lobbyId: lobby.lobbyId, messageObj });
  });

  socket.on("CLUE_SUBMIT", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (!["clues", "voting"].includes(lobby.gameState.phase)) return;
    const clueTextRaw = String(payload?.clueText || "").trim();
    const clueText = clueTextRaw.split(/\s+/g)[0]?.slice(0, 24) || "";
    lobby.gameState.cluesByPlayerId[info.playerId] = clueText;
    broadcastLobbyState(io, lobby);
  });

  socket.on("VOTE_SUBMIT", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (lobby.gameState.phase !== "voting") return;
    const targetPlayerId = String(payload?.targetPlayerId || "");
    const target = lobby.players.find((p) => p.id === targetPlayerId && p.connected);
    if (!target) return;
    lobby.gameState.votesByVoterId[info.playerId] = targetPlayerId;
    emitVoteState(io, lobby);
    broadcastLobbyState(io, lobby);

    const vs = computeVoteState(lobby);
    if (vs.allSubmitted) endVoting(io, lobby);
  });

  socket.on("VOTING_END_EARLY", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (info.playerId !== lobby.hostPlayerId) {
      emitError(socket, "FORBIDDEN", "Only the host can do that.");
      return;
    }
    endVoting(io, lobby);
  });

  socket.on("FRAUD_GUESS", (payload) => {
    const lobbyId = String(payload?.lobbyId || "");
    const lobby = ensureLobbyExists(lobbyId);
    if (!lobby) return;
    const info = socketIndex.get(socket.id);
    if (!info || info.lobbyId !== lobbyId) return;
    if (lobby.gameState.phase !== "fraud_guess") return;
    const isFraud = (lobby.gameState.fraudIds || []).includes(info.playerId);
    if (!isFraud) return;
    if (lobby.gameState.fraudGuess?.completedAt) return;

    const guessIndex = Number(payload?.guessIndex);
    if (!Number.isFinite(guessIndex) || guessIndex < 0 || guessIndex > 15) return;

    const isCorrect = guessIndex === lobby.gameState.secretIndex;
    lobby.gameState.fraudGuess = {
      guessIndex,
      completedAt: now(),
      deadlineAt: lobby.gameState.fraudGuess?.deadlineAt || now()
    };

    if (lobby._fraudGuessTimer) clearTimeout(lobby._fraudGuessTimer);

    if (isCorrect) {
      const fp = lobby.players.find((p) => p.id === info.playerId);
      if (fp && fp.connected) fp.points += 1;
      emitScore(io, lobby);
      broadcastLobbyState(io, lobby);
    }

    io.to(lobby.lobbyId).emit("FRAUD_GUESS_RESULT", {
      lobbyId: lobby.lobbyId,
      isCorrect,
      guessIndex,
      secretIndex: lobby.gameState.secretIndex
    });

    setTimeout(() => {
      if (!lobbies.has(lobby.lobbyId)) return;
      startNewRound(io, lobby);
    }, 10_000);
  });

  socket.on("disconnect", () => {
    const info = socketIndex.get(socket.id);
    if (!info) return;
    const lobby = ensureLobbyExists(info.lobbyId);
    if (!lobby) {
      socketIndex.delete(socket.id);
      return;
    }

    const player = lobby.players.find((p) => p.id === info.playerId);
    if (player) {
      player.connected = false;
      player.socketId = null;
    }
    socketIndex.delete(socket.id);

    migrateHostIfNeeded(io, lobby);
    broadcastLobbyState(io, lobby);
    emitLobbyList(io);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${PORT}`);
});

