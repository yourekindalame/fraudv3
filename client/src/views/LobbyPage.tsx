import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { LeaderboardPanel } from "../components/LeaderboardPanel";
import { useRealtime } from "../realtime/RealtimeProvider";
import type { LobbyState } from "../realtime/types";

export function LobbyPage() {
  const { lobbyId } = useParams();
  const rt = useRealtime();
  const nav = useNavigate();
  const [codeVisible, setCodeVisible] = useState(false);
  const [joining, setJoining] = useState(false);

  const lobby: LobbyState | undefined = lobbyId ? rt.lobbyStateById[lobbyId] : undefined;
  const isHost = Boolean(lobby && rt.player.clientPlayerId === lobby.hostPlayerId);

  useEffect(() => {
    if (!lobbyId) return;
    if (!rt.player.playerName) return;
    setJoining(true);
    rt.actions
      .joinLobby({ lobbyId })
      .catch(() => {})
      .finally(() => setJoining(false));
  }, [lobbyId, rt.actions, rt.player.playerName]);

  useEffect(() => {
    if (!lobbyId || !lobby) return;
    if (lobby.phase !== "lobby" && lobby.roundId) nav(`/game/${lobbyId}`, { replace: true });
  }, [lobby, lobbyId, nav]);

  const inviteLink = useMemo(() => {
    if (!lobbyId) return "";
    return `${window.location.origin}/lobby/${lobbyId}`;
  }, [lobbyId]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  if (!lobbyId) return <div className="page">Missing lobby id.</div>;
  if (!lobby) return <div className="page muted">{joining ? "Joining…" : "Loading lobby…"}</div>;

  return (
    <div className="triLayout">
      <ChatPanel lobbyId={lobbyId} />

      <div className="centerPanel">
        <div className="panelTitleRow">
          <div>
            <div className="bigTitle">{lobby.lobbyName}</div>
            <div className="muted small">
              Lobby · {lobby.players.filter((p) => p.connected).length} online
            </div>
          </div>
          <div className="row">
            <button className="btn btnGhost btnSmall" onClick={() => rt.actions.leaveLobby(lobbyId)}>
              Leave
            </button>
          </div>
        </div>

        <div className="panelGrid2">
          <div className="panel">
            <div className="panelTitle">Lobby Code</div>
            <div className="codeRow">
              <div className="codeValue">{codeVisible ? lobby.lobbyCode : "••••••"}</div>
              <button className="btn btnGhost btnSmall" onClick={() => setCodeVisible((v) => !v)} title="Hide/Reveal">
                {codeVisible ? "🙈" : "👁️"}
              </button>
              <button className="btn btnSecondary btnSmall" onClick={() => void copy(lobby.lobbyCode)}>
                Copy
              </button>
            </div>
            <div className="muted small">This is the secret join code (6 characters).</div>
          </div>

          <div className="panel">
            <div className="panelTitle">Invite link</div>
            <div className="row">
              <input className="input" value={inviteLink} readOnly />
              <button className="btn btnSecondary btnSmall" onClick={() => void copy(inviteLink)}>
                Copy
              </button>
            </div>
            <div className="muted small">Invite links work even for private lobbies.</div>
          </div>
        </div>

        <div className="panel">
          <div className="rowBetween">
            <div className="panelTitle">Host settings</div>
            <div className="muted small">{isHost ? "You are the host." : "Only the host can change settings."}</div>
          </div>

          <div className="settingsGrid">
            <div className="settingsBlock">
              <div className="settingsLabel">Categories</div>
              <div className="categoriesGrid">
                {lobby.settings.availableCategories.map((c) => {
                  const selected = lobby.settings.allowedCategoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className={`catCard ${selected ? "catOn" : "catOff"}`}
                      disabled={!isHost}
                      onClick={() => {
                        if (!isHost) return;
                        const next = selected
                          ? lobby.settings.allowedCategoryIds.filter((id) => id !== c.id)
                          : lobby.settings.allowedCategoryIds.concat([c.id]);
                        rt.actions.updateSettings(lobbyId, { allowedCategoryIds: next.length ? next : [c.id] });
                      }}
                    >
                      <div className="catIcon">{c.icon}</div>
                      <div className="catName">{c.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settingsBlock">
              <div className="settingsLabel">Host transfer</div>
              <div className="row">
                <select
                  className="input"
                  disabled={!isHost}
                  defaultValue=""
                  onChange={(e) => {
                    const newHost = e.target.value;
                    if (!newHost) return;
                    rt.actions.transferHost(lobbyId, newHost);
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>
                    Select player…
                  </option>
                  {lobby.players
                    .filter((p) => p.connected && p.id !== lobby.hostPlayerId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="muted small">Transfer is immediate.</div>
            </div>
          </div>

          <div className="rowBetween">
            <div className="muted small">Host can start with 0 additional players.</div>
            <button className="btn btnPrimary" disabled={!isHost} onClick={() => rt.actions.startGame(lobbyId)}>
              Start Game
            </button>
          </div>
        </div>
      </div>

      <LeaderboardPanel lobby={lobby} />
    </div>
  );
}

