import React, { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useRealtime } from "../realtime/RealtimeProvider";
import { Modal } from "./Modal";

const RULES_TEXT = `🕵️ How to Play The Fraud
One of you is lying. Everyone else is a Detective. Figure out who doesn’t belong.

🔍 Setup
Players join a lobby. The Host selects categories and settings.
Most players receive the same secret word.
One (or more) players are The Fraud and don’t know the word.

🗣️ Give Clues
Players take turns giving one-word clues.
Detectives give clear clues that show they know the word.
The Fraud gives vague but believable clues to blend in.

🗳️ Discuss & Vote
Talk it out. Vote for who you think is The Fraud.
If The Fraud is eliminated: Detectives win.
If an innocent is eliminated: The Fraud gets one last chance.

🎯 Final Guess
If still alive, The Fraud can guess the secret word.
Correct guess = bonus points.

🧮 Scoring
Detectives eliminate The Fraud: +1 point each
The Fraud survives a vote: +1 point
The Fraud guesses the word: +1 bonus point

🧠 Pro Tips
Watch for generic clues. Notice hesitation and overthinking.
Fraud tip: listen closely and mirror others.`;

export function AppShell({ children }: { children: React.ReactNode }) {
  const rt = useRealtime();
  const nav = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(rt.player.playerName || "");

  const mustSetName = rt.player.playerName === null;
  const nameModalOpen = mustSetName || editNameOpen;

  const errorBanner = useMemo(() => {
    if (!rt.lastError) return null;
    return (
      <div className="errorBanner" onClick={rt.clearError} role="alert">
        <div className="errorCode">{rt.lastError.code}</div>
        <div className="errorMsg">{rt.lastError.message}</div>
        <div className="errorHint">Click to dismiss</div>
      </div>
    );
  }, [rt.lastError, rt.clearError]);

  async function onAvatarPicked(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    rt.player.setAvatarDataUrl(dataUrl);
  }

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    rt.player.setPlayerName(trimmed);
    setEditNameOpen(false);
    // If user landed directly in join flow, keep them where they are
    if (location.pathname === "/") nav("/", { replace: true });
  }

  return (
    <div className="appRoot">
      <header className="topBar">
        <div className="topBarLeft">
          <Link to="/" className="logoLink" aria-label="The Fraud Home">
            <span className="logoMark">◼</span>
            <span className="logoText">The Fraud</span>
          </Link>
        </div>

        <div className="topBarCenter">
          {rt.player.playerName ? (
            <div className="welcome">
              <span className="welcomeLabel">Welcome,</span>
              <span className="welcomeName">{rt.player.playerName}</span>
              <button
                className="btn btnGhost btnSmall"
                onClick={() => {
                  setNameDraft(rt.player.playerName || "");
                  setEditNameOpen(true);
                }}
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="welcome muted">Set your name to play</div>
          )}
        </div>

        <div className="topBarRight">
          <button className="btn btnGhost btnSmall" onClick={() => setRulesOpen(true)}>
            Rules
          </button>

          <div className="avatarWrap">
            <button
              className="avatarBtn"
              onClick={() => fileRef.current?.click()}
              title="Upload profile image"
              aria-label="Upload profile image"
            >
              {rt.player.avatarDataUrl ? (
                <img className="avatarImg" src={rt.player.avatarDataUrl} alt="Profile" />
              ) : (
                <div className="avatarPlaceholder">+</div>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onAvatarPicked(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </header>

      {errorBanner}

      <main className="mainContent">{children}</main>

      <Modal open={rulesOpen} title="Rules" onClose={() => setRulesOpen(false)}>
        <div className="rulesText">{RULES_TEXT}</div>
      </Modal>

      <Modal
        open={nameModalOpen}
        title={mustSetName ? "Choose your player name" : "Edit your player name"}
        onClose={() => {
          if (!mustSetName) setEditNameOpen(false);
        }}
      >
        <div className="stack">
          <label className="label">
            Player Name
            <input
              className="input"
              value={nameDraft}
              maxLength={20}
              placeholder="e.g. Nicole"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
              }}
              autoFocus
            />
          </label>
          <button className="btn btnPrimary" onClick={saveName} disabled={!nameDraft.trim()}>
            Save
          </button>
          {mustSetName ? <div className="muted">You’ll only do this once.</div> : null}
        </div>
      </Modal>
    </div>
  );
}

