import { useMemo } from "react";
import type { LobbyState } from "../realtime/types";

export function LeaderboardPanel({ lobby }: { lobby: LobbyState }) {
  const sorted = useMemo(() => {
    return lobby.players
      .slice()
      .sort((a, b) => (b.points - a.points) || (a.joinedAt - b.joinedAt));
  }, [lobby.players]);

  return (
    <div className="sidePanel">
      <div className="sideHeader">Leaderboard</div>
      <div className="leaderList">
        {sorted.map((p, idx) => (
          <div key={p.id} className="leaderRow">
            <div className="leaderLeft">
              <div className="leaderAvatar">
                {p.avatarDataUrl ? <img src={p.avatarDataUrl} alt="" /> : <div className="avatarFallback" />}
              </div>
              <div className="leaderName">
                {idx === 0 ? <span className="crown" title="Top player">👑</span> : null}
                <span className={p.connected ? "" : "muted"}>{p.name}</span>
              </div>
            </div>
            <div className="leaderPts">{p.points}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

