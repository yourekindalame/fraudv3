import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRealtime } from "../realtime/RealtimeProvider";
import { Modal } from "../ui/Modal";

export function HomePage() {
  const rt = useRealtime();
  const nav = useNavigate();
  const [hostOpen, setHostOpen] = useState(false);
  const [lobbyName, setLobbyName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!rt.player.playerName) return;
    const name = lobbyName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { lobbyId } = await rt.actions.createLobby(name, isPrivate);
      await rt.actions.joinLobby({ lobbyId });
      setHostOpen(false);
      nav(`/lobby/${lobbyId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <div className="homeCard">
        <div className="homeTitle">A nearly-black deduction game.</div>
        <div className="homeSubtitle">One of you is lying. Everyone else is a Detective.</div>

        <div className="homeActions">
          <button className="btn btnPrimary btnHuge" onClick={() => setHostOpen(true)} disabled={!rt.player.playerName}>
            Host Game
          </button>
          <button className="btn btnSecondary btnHuge" onClick={() => nav("/lobbies")} disabled={!rt.player.playerName}>
            Join Game
          </button>
        </div>

        <div className="homeFoot muted">
          {rt.socketConnected ? "Connected" : "Connecting…"} · Same-origin HTTP + WebSocket
        </div>
      </div>

      <Modal open={hostOpen} title="Host Game" onClose={() => setHostOpen(false)}>
        <div className="stack">
          <label className="label">
            Lobby Name
            <input
              className="input"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder="e.g. Friday Night"
              maxLength={32}
              autoFocus
            />
          </label>

          <label className="toggleRow">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span className="toggleText">
              <span className="toggleTitle">Private Lobby</span>
              <span className="muted small">Private lobbies don’t appear in the public list.</span>
            </span>
          </label>

          <button className="btn btnPrimary" onClick={create} disabled={!lobbyName.trim() || busy}>
            {busy ? "Creating…" : "Create Lobby"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

