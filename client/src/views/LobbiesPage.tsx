import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRealtime } from "../realtime/RealtimeProvider";

export function LobbiesPage() {
  const rt = useRealtime();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rt.actions.requestLobbyList();
    const t = window.setInterval(() => rt.actions.requestLobbyList(), 4000);
    return () => window.clearInterval(t);
  }, [rt.actions]);

  const sorted = useMemo(() => rt.lobbyList.slice().sort((a, b) => b.playerCount - a.playerCount), [rt.lobbyList]);

  async function joinById(lobbyId: string) {
    setBusy(true);
    try {
      await rt.actions.joinLobby({ lobbyId });
      nav(`/lobby/${lobbyId}`);
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode() {
    const lobbyCode = code.trim().toUpperCase();
    if (!lobbyCode) return;
    setBusy(true);
    try {
      const { lobbyId } = await rt.actions.joinLobby({ lobbyCode });
      nav(`/lobby/${lobbyId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div className="pageTitle">Public Lobbies</div>
        <div className="pageSub muted">Click a lobby to join by Lobby ID (no code required).</div>
      </div>

      <div className="panel">
        <div className="rowBetween">
          <div className="panelTitle">Join by code</div>
          <div className="muted small">Works for public and private lobbies</div>
        </div>
        <div className="row">
          <input
            className="input"
            placeholder="Lobby Code"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void joinByCode();
            }}
          />
          <button className="btn btnPrimary" onClick={joinByCode} disabled={!code.trim() || busy}>
            Join
          </button>
        </div>
      </div>

      <div className="lobbyList">
        {sorted.length === 0 ? (
          <div className="panel muted">No public lobbies right now.</div>
        ) : (
          sorted.map((l) => (
            <button key={l.lobbyId} className="lobbyRow" onClick={() => void joinById(l.lobbyId)} disabled={busy}>
              <div className="lobbyRowName">{l.lobbyName}</div>
              <div className="lobbyRowMeta muted">
                {l.playerCount} {l.playerCount === 1 ? "player" : "players"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

