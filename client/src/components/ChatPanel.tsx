import { useMemo, useRef, useState } from "react";
import { useRealtime } from "../realtime/RealtimeProvider";

export function ChatPanel({ lobbyId }: { lobbyId: string }) {
  const rt = useRealtime();
  const [msg, setMsg] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(() => rt.chatByLobbyId[lobbyId] || [], [rt.chatByLobbyId, lobbyId]);

  function send() {
    const t = msg.trim();
    if (!t) return;
    rt.actions.sendChat(lobbyId, t);
    setMsg("");
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 50);
  }

  return (
    <div className="sidePanel">
      <div className="sideHeader">Chat</div>
      <div className="chatList" ref={listRef}>
        {messages.length === 0 ? <div className="muted small">Say hello.</div> : null}
        {messages.map((m) => (
          <div key={m.id} className="chatMsg">
            <div className="chatAvatar">
              {m.avatarDataUrl ? <img src={m.avatarDataUrl} alt="" /> : <div className="avatarFallback" />}
            </div>
            <div className="chatBody">
              <div className="chatMeta">
                <span className="chatName">{m.playerName}</span>
                <span className="chatTime muted">
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="chatText">{m.message}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chatInputRow">
        <input
          className="input"
          placeholder="Message"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button className="btn btnSecondary" onClick={send} disabled={!msg.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

