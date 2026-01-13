import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ChatMessageObj,
  ErrorPayload,
  FraudGuessResultPayload,
  GameStartedPayload,
  LobbyListItem,
  LobbyState,
  ScoreUpdatePayload,
  VoteRevealPayload,
  VoteStatePayload
} from "./types";
import {
  getOrCreateClientPlayerId,
  getStoredAvatarDataUrl,
  getStoredPlayerName,
  setStoredAvatarDataUrl,
  setStoredPlayerName
} from "../lib/storage";

type RealtimeContextValue = {
  socketConnected: boolean;

  player: {
    clientPlayerId: string;
    playerName: string | null;
    avatarDataUrl: string | null;
    setPlayerName: (name: string) => void;
    setAvatarDataUrl: (dataUrl: string | null) => void;
  };

  lobbyList: LobbyListItem[];
  lobbyStateById: Record<string, LobbyState>;
  gameByLobbyId: Record<string, GameStartedPayload>;
  chatByLobbyId: Record<string, ChatMessageObj[]>;
  voteStateByLobbyId: Record<string, VoteStatePayload>;
  voteRevealByLobbyId: Record<string, VoteRevealPayload>;
  scoreByLobbyId: Record<string, ScoreUpdatePayload>;
  fraudGuessResultByLobbyId: Record<string, FraudGuessResultPayload>;
  lastError: ErrorPayload | null;
  clearError: () => void;

  actions: {
    requestLobbyList: () => void;
    createLobby: (lobbyName: string, isPrivate: boolean) => Promise<{ lobbyId: string }>;
    joinLobby: (args: { lobbyId?: string; lobbyCode?: string }) => Promise<{ lobbyId: string }>;
    leaveLobby: (lobbyId: string) => void;
    updateSettings: (lobbyId: string, partialSettings: unknown) => void;
    startGame: (lobbyId: string) => void;
    startVoting: (lobbyId: string) => void;
    sendChat: (lobbyId: string, message: string) => void;
    submitClue: (lobbyId: string, clueText: string) => void;
    submitVote: (lobbyId: string, targetPlayerId: string) => void;
    endVotingEarly: (lobbyId: string) => void;
    fraudGuess: (lobbyId: string, guessIndex: number) => void;
    transferHost: (lobbyId: string, newHostPlayerId: string) => void;
  };
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime() {
  const v = useContext(RealtimeContext);
  if (!v) throw new Error("RealtimeProvider missing");
  return v;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const [lobbyList, setLobbyList] = useState<LobbyListItem[]>([]);
  const [lobbyStateById, setLobbyStateById] = useState<Record<string, LobbyState>>({});
  const [gameByLobbyId, setGameByLobbyId] = useState<Record<string, GameStartedPayload>>({});
  const [chatByLobbyId, setChatByLobbyId] = useState<Record<string, ChatMessageObj[]>>({});
  const [voteStateByLobbyId, setVoteStateByLobbyId] = useState<Record<string, VoteStatePayload>>({});
  const [voteRevealByLobbyId, setVoteRevealByLobbyId] = useState<Record<string, VoteRevealPayload>>({});
  const [scoreByLobbyId, setScoreByLobbyId] = useState<Record<string, ScoreUpdatePayload>>({});
  const [fraudGuessResultByLobbyId, setFraudGuessResultByLobbyId] = useState<
    Record<string, FraudGuessResultPayload>
  >({});
  const [lastError, setLastError] = useState<ErrorPayload | null>(null);

  const clientPlayerId = useMemo(() => getOrCreateClientPlayerId(), []);
  const [playerName, setPlayerNameState] = useState<string | null>(() => getStoredPlayerName());
  const [avatarDataUrl, setAvatarDataUrlState] = useState<string | null>(() => getStoredAvatarDataUrl());

  function setPlayerName(name: string) {
    const trimmed = name.trim().slice(0, 20);
    setStoredPlayerName(trimmed);
    setPlayerNameState(trimmed);
  }

  function setAvatarDataUrl(dataUrl: string | null) {
    setStoredAvatarDataUrl(dataUrl);
    setAvatarDataUrlState(dataUrl);
  }

  useEffect(() => {
    const socket = io({
      autoConnect: false,
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("LOBBY_LIST", (payload: { lobbies: LobbyListItem[] }) => {
      setLobbyList(payload.lobbies || []);
    });

    socket.on("LOBBY_STATE", (payload: LobbyState) => {
      setLobbyStateById((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("GAME_STARTED", (payload: GameStartedPayload) => {
      setGameByLobbyId((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("CHAT_MESSAGE", (payload: { lobbyId: string; messageObj: ChatMessageObj }) => {
      setChatByLobbyId((prev) => {
        const arr = prev[payload.lobbyId] ? prev[payload.lobbyId].slice() : [];
        arr.push(payload.messageObj);
        // keep last 200
        const trimmed = arr.length > 200 ? arr.slice(arr.length - 200) : arr;
        return { ...prev, [payload.lobbyId]: trimmed };
      });
    });

    socket.on("VOTE_STATE", (payload: VoteStatePayload) => {
      setVoteStateByLobbyId((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("VOTE_REVEAL", (payload: VoteRevealPayload) => {
      setVoteRevealByLobbyId((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("SCORE_UPDATE", (payload: ScoreUpdatePayload) => {
      setScoreByLobbyId((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("FRAUD_GUESS_RESULT", (payload: FraudGuessResultPayload) => {
      setFraudGuessResultByLobbyId((prev) => ({ ...prev, [payload.lobbyId]: payload }));
    });

    socket.on("ERROR", (payload: ErrorPayload) => {
      setLastError(payload);
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function clearError() {
    setLastError(null);
  }

  const actions = useMemo(() => {
    function mustSocket() {
      const s = socketRef.current;
      if (!s) throw new Error("Socket not ready");
      return s;
    }

    return {
      requestLobbyList() {
        mustSocket().emit("LOBBY_LIST_REQUEST", {});
      },

      createLobby(lobbyName: string, isPrivate: boolean) {
        return new Promise<{ lobbyId: string }>((resolve, reject) => {
          mustSocket().emit("LOBBY_CREATE", { lobbyName, isPrivate }, (ack: any) => {
            if (!ack?.ok || !ack?.lobbyId) return reject(new Error("Failed to create lobby"));
            resolve({ lobbyId: String(ack.lobbyId) });
          });
        });
      },

      joinLobby(args: { lobbyId?: string; lobbyCode?: string }) {
        return new Promise<{ lobbyId: string }>((resolve, reject) => {
          const pn = playerName;
          if (!pn) return reject(new Error("Missing player name"));
          mustSocket().emit(
            "LOBBY_JOIN",
            {
              lobbyId: args.lobbyId,
              lobbyCode: args.lobbyCode,
              playerName: pn,
              clientPlayerId,
              avatarDataUrl
            },
            (ack: any) => {
              if (!ack?.ok || !ack?.lobbyId) return reject(new Error("Failed to join lobby"));
              resolve({ lobbyId: String(ack.lobbyId) });
            }
          );
        });
      },

      leaveLobby(lobbyId: string) {
        mustSocket().emit("LOBBY_LEAVE", { lobbyId });
      },

      updateSettings(lobbyId: string, partialSettings: unknown) {
        mustSocket().emit("SETTINGS_UPDATE", { lobbyId, partialSettings });
      },

      startGame(lobbyId: string) {
        mustSocket().emit("GAME_START", { lobbyId });
      },

      startVoting(lobbyId: string) {
        mustSocket().emit("ROUND_END", { lobbyId });
      },

      sendChat(lobbyId: string, message: string) {
        mustSocket().emit("CHAT_SEND", { lobbyId, message });
      },

      submitClue(lobbyId: string, clueText: string) {
        mustSocket().emit("CLUE_SUBMIT", { lobbyId, clueText });
      },

      submitVote(lobbyId: string, targetPlayerId: string) {
        mustSocket().emit("VOTE_SUBMIT", { lobbyId, targetPlayerId });
      },

      endVotingEarly(lobbyId: string) {
        mustSocket().emit("VOTING_END_EARLY", { lobbyId });
      },

      fraudGuess(lobbyId: string, guessIndex: number) {
        mustSocket().emit("FRAUD_GUESS", { lobbyId, guessIndex });
      },

      transferHost(lobbyId: string, newHostPlayerId: string) {
        mustSocket().emit("HOST_TRANSFER", { lobbyId, newHostPlayerId });
      }
    };
  }, [avatarDataUrl, clientPlayerId, playerName]);

  const value: RealtimeContextValue = {
    socketConnected,
    player: { clientPlayerId, playerName, avatarDataUrl, setPlayerName, setAvatarDataUrl },
    lobbyList,
    lobbyStateById,
    gameByLobbyId,
    chatByLobbyId,
    voteStateByLobbyId,
    voteRevealByLobbyId,
    scoreByLobbyId,
    fraudGuessResultByLobbyId,
    lastError,
    clearError,
    actions
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

