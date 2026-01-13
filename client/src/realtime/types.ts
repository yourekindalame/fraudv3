export type LobbyListItem = {
  lobbyId: string;
  lobbyName: string;
  playerCount: number;
};

export type CategoryMeta = { id: string; name: string; icon: string };

export type LobbyPlayer = {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  points: number;
  joinedAt: number;
  connected: boolean;
};

export type LobbySettings = {
  fraudCount: number;
  allowedCategoryIds: string[];
  availableCategories: CategoryMeta[];
};

export type Phase = "lobby" | "clues" | "voting" | "fraud_guess";

export type LobbyState = {
  lobbyId: string;
  lobbyName: string;
  lobbyCode: string;
  lobbyCodeHidden: boolean;
  hostPlayerId: string;
  players: LobbyPlayer[];
  settings: LobbySettings;
  phase: Phase;
  roundId: string | null;
  cluesByPlayerId: Record<string, string>;
  votesByVoterId: Record<string, string>;
  phaseStartedAt: number;
};

export type GameStartedPayload = {
  lobbyId: string;
  roundId: string;
  category: CategoryMeta;
  clueBoard16: string[];
  visibleSecretForPlayer: boolean;
  secretIndexIfAllowed?: number;
};

export type ChatMessageObj = {
  id: string;
  at: number;
  playerId: string;
  playerName: string;
  avatarDataUrl: string | null;
  message: string;
};

export type VoteStatePayload = {
  lobbyId: string;
  votesByVoterId: Record<string, string>;
  voteCountsByTargetId: Record<string, number>;
  voterAvatarsByTargetId: Record<
    string,
    { playerId: string; avatarDataUrl: string | null; name: string }[]
  >;
  allSubmitted: boolean;
};

export type VoteRevealPayload = {
  lobbyId: string;
  fraudIds: string[];
  resultsSummary: { eliminatedPlayerId: string | null; eliminatedIsFraud: boolean };
};

export type ScoreUpdatePayload = {
  lobbyId: string;
  leaderboard: { playerId: string; name: string; avatarDataUrl: string | null; points: number }[];
};

export type FraudGuessResultPayload = {
  lobbyId: string;
  isCorrect: boolean;
  guessIndex: number;
  secretIndex: number;
};

export type ErrorPayload = { code: string; message: string };

