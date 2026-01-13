import { Navigate, Route, Routes } from "react-router-dom";
import { RealtimeProvider } from "./realtime/RealtimeProvider";
import { AppShell } from "./ui/AppShell";
import { HomePage } from "./views/HomePage";
import { LobbiesPage } from "./views/LobbiesPage";
import { LobbyPage } from "./views/LobbyPage";
import { GamePage } from "./views/GamePage";

export default function App() {
  return (
    <RealtimeProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobbies" element={<LobbiesPage />} />
          <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
          <Route path="/game/:lobbyId" element={<GamePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </RealtimeProvider>
  );
}
