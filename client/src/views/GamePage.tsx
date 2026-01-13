import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { LeaderboardPanel } from "../components/LeaderboardPanel";
import { useRealtime } from "../realtime/RealtimeProvider";
import type { LobbyState, VoteStatePayload } from "../realtime/types";
import { Modal } from "../ui/Modal";

type RoleRevealState = "hidden" | "ready" | "revealed";

export function GamePage() {
  const { lobbyId } = useParams();
  const rt = useRealtime();
  const nav = useNavigate();

  const lobby: LobbyState | undefined = lobbyId ? rt.lobbyStateById[lobbyId] : undefined;
  const game = lobbyId ? rt.gameByLobbyId[lobbyId] : undefined;
  const voteState: VoteStatePayload | undefined = lobbyId ? rt.voteStateByLobbyId[lobbyId] : undefined;
  const voteReveal = lobbyId ? rt.voteRevealByLobbyId[lobbyId] : undefined;
  const fraudGuessResult = lobbyId ? rt.fraudGuessResultByLobbyId[lobbyId] : undefined;

  const [joining, setJoining] = useState(false);
  const [roleRevealState, setRoleRevealState] = useState<RoleRevealState>("hidden");
  const [stepAOpen, setStepAOpen] = useState(false);
  const [stepBOpen, setStepBOpen] = useState(false);
  const [stepAStarted, setStepAStarted] = useState(false);
  const [stepACount, setStepACount] = useState(3);
  const [stepBCount, setStepBCount] = useState(3);

  const [clueDraft, setClueDraft] = useState("");
  const clueDebounceRef = useRef<number | null>(null);
  const lastRoundRef = useRef<string | null>(null);
  const [tick, setTick] = useState(0);

  const isHost = Boolean(lobby && rt.player.clientPlayerId === lobby.hostPlayerId);
  const isDetective = Boolean(game?.visibleSecretForPlayer);
  const isFraud = Boolean(game && !game.visibleSecretForPlayer);

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
    if (lobby.phase === "lobby") nav(`/lobby/${lobbyId}`, { replace: true });
  }, [lobby, lobbyId, nav]);

  // lightweight timer tick (fraud guess countdown)
  useEffect(() => {
    if (!lobby) return;
    if (lobby.phase !== "fraud_guess") return;
    const t = window.setInterval(() => setTick((x) => x + 1), 250);
    return () => window.clearInterval(t);
  }, [lobby?.phase]);

  // round change -> reset role reveal + local UI
  useEffect(() => {
    if (!lobby?.roundId) return;
    if (lastRoundRef.current === lobby.roundId) return;
    lastRoundRef.current = lobby.roundId;

    setRoleRevealState("ready");
    setStepAOpen(true);
    setStepBOpen(false);
    setStepAStarted(false);
    setStepACount(3);
    setStepBCount(3);
    setClueDraft("");
  }, [lobby?.roundId]);

  // keep input synced with server (e.g. on reconnect)
  useEffect(() => {
    if (!lobbyId || !lobby) return;
    const mine = lobby.cluesByPlayerId[rt.player.clientPlayerId] || "";
    if (!clueDraft && mine) setClueDraft(mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.cluesByPlayerId, lobbyId, rt.player.clientPlayerId]);

  function revealMyRole() {
    setStepAStarted(true);
    setStepACount(3);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, 3 - Math.floor(elapsed / 1000));
      setStepACount(left);
      if (elapsed >= 3000) {
        setStepAOpen(false);
        setRoleRevealState("revealed");
        setStepBOpen(true);
        autoCloseStepB();
      } else {
        window.setTimeout(tick, 120);
      }
    };
    tick();
  }

  function autoCloseStepB() {
    setStepBCount(3);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, 3 - Math.floor(elapsed / 1000));
      setStepBCount(left);
      if (elapsed >= 3000) {
        setStepBOpen(false);
      } else {
        window.setTimeout(tick, 120);
      }
    };
    tick();
  }

  function submitClueDebounced(next: string) {
    if (!lobbyId) return;
    if (!lobby) return;
    if (!["clues", "voting"].includes(lobby.phase)) return;
    if (clueDebounceRef.current) window.clearTimeout(clueDebounceRef.current);
    clueDebounceRef.current = window.setTimeout(() => {
      rt.actions.submitClue(lobbyId, next);
    }, 250);
  }

  const phaseLabel = useMemo(() => {
    if (!lobby) return "";
    if (lobby.phase === "clues") return "Give clues";
    if (lobby.phase === "voting") return "Vote";
    if (lobby.phase === "fraud_guess") return "Final guess";
    return "Lobby";
  }, [lobby]);

  const timeLeftGuess = useMemo(() => {
    if (!lobby) return null;
    if (lobby.phase !== "fraud_guess") return null;
    const elapsed = Date.now() - lobby.phaseStartedAt;
    return Math.max(0, 60 - Math.floor(elapsed / 1000));
  }, [lobby, tick]);

  function highlightIndex(i: number) {
    if (!game) return false;
    if (!game.visibleSecretForPlayer) return false;
    if (roleRevealState !== "revealed") return false;
    return game.secretIndexIfAllowed === i;
  }

  if (!lobbyId) return <div className="page">Missing lobby id.</div>;
  if (!lobby) return <div className="page muted">{joining ? "Joining…" : "Loading game…"}</div>;

  return (
    <div className="triLayout">
      <ChatPanel lobbyId={lobbyId} />

      <div className="centerPanel">
        <div className="panelTitleRow">
          <div>
            <div className="bigTitle">{lobby.lobbyName}</div>
            <div className="muted small">
              {phaseLabel} · Round {lobby.roundId ? lobby.roundId.slice(0, 6) : "—"}
            </div>
          </div>
          <div className="row">
            {isHost && lobby.phase === "clues" ? (
              <button className="btn btnSecondary" onClick={() => rt.actions.startVoting(lobbyId)}>
                Start voting
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="rowBetween">
            <div className="panelTitle">
              {game ? (
                <>
                  {game.category.icon} {game.category.name}
                </>
              ) : (
                "Loading round…"
              )}
            </div>
            <div className="muted small">
              {isFraud ? "You are the Fraud (no highlight)." : isDetective ? "Detective" : ""}
            </div>
          </div>

          <div className="grid16">
            {(game?.clueBoard16 || Array.from({ length: 16 }).map(() => "…")).map((c, i) => (
              <button
                key={i}
                className={`gridCell ${highlightIndex(i) ? "gridSecret" : ""}`}
                disabled={lobby.phase !== "fraud_guess" || !isFraud}
                onClick={() => rt.actions.fraudGuess(lobbyId, i)}
                title={lobby.phase === "fraud_guess" && isFraud ? "Select your guess" : ""}
              >
                <div className="gridCellText">{c}</div>
              </button>
            ))}
          </div>

          {lobby.phase === "fraud_guess" ? (
            <div className="muted small">
              Fraud guess timer: <span className="mono">{timeLeftGuess ?? 60}s</span>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panelTitle">Clues</div>
          <div className="row">
            <input
              className="input"
              placeholder="One-word clue"
              value={clueDraft}
              disabled={!["clues", "voting"].includes(lobby.phase)}
              onChange={(e) => {
                const next = e.target.value;
                setClueDraft(next);
                submitClueDebounced(next);
              }}
            />
            <button
              className="btn btnSecondary"
              disabled={!clueDraft.trim() || !["clues", "voting"].includes(lobby.phase)}
              onClick={() => rt.actions.submitClue(lobbyId, clueDraft)}
            >
              Update
            </button>
          </div>

          <div className="clueList">
            {lobby.players.map((p) => (
              <div key={p.id} className="clueRow">
                <div className="clueName">{p.name}:</div>
                <div className={`clueText ${lobby.cluesByPlayerId[p.id] ? "" : "muted"}`}>
                  {lobby.cluesByPlayerId[p.id] ? `“${lobby.cluesByPlayerId[p.id]}”` : "No clue yet"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="rowBetween">
            <div className="panelTitle">Voting</div>
            {isHost ? <HoldToConfirm onConfirm={() => rt.actions.endVotingEarly(lobbyId)} /> : <div className="muted small" />}
          </div>

          {lobby.phase !== "voting" ? (
            <div className="muted small">Voting begins when the host starts it.</div>
          ) : (
            <div className="voteGrid">
              {lobby.players
                .filter((p) => p.connected)
                .map((p) => {
                  const myVote = voteState?.votesByVoterId?.[rt.player.clientPlayerId];
                  const votedForThis = myVote === p.id;
                  const avatars = voteState?.voterAvatarsByTargetId?.[p.id] || [];
                  return (
                    <button
                      key={p.id}
                      className={`voteRow ${votedForThis ? "voteRowOn" : ""}`}
                      onClick={() => rt.actions.submitVote(lobbyId, p.id)}
                    >
                      <div className="voteName">{p.name}</div>
                      <div className="voteAvatars">
                        {avatars.slice(0, 6).map((a) => (
                          <span key={a.playerId} className="voteAvatar" title={a.name}>
                            {a.avatarDataUrl ? <img src={a.avatarDataUrl} alt="" /> : <span className="voteDot" />}
                          </span>
                        ))}
                      </div>
                      <div className="voteCount mono">{voteState?.voteCountsByTargetId?.[p.id] || 0}</div>
                    </button>
                  );
                })}
            </div>
          )}

          {voteReveal ? (
            <div className="resultBanner">
              <div className="resultTitle">Vote reveal</div>
              <div className="muted small">
                Eliminated:{" "}
                {voteReveal.resultsSummary.eliminatedPlayerId
                  ? lobby.players.find((p) => p.id === voteReveal.resultsSummary.eliminatedPlayerId)?.name || "Unknown"
                  : "No one"}{" "}
                · Fraud(s):{" "}
                {voteReveal.fraudIds.length
                  ? voteReveal.fraudIds.map((id) => lobby.players.find((p) => p.id === id)?.name || "Unknown").join(", ")
                  : "None"}
              </div>
            </div>
          ) : null}

          {fraudGuessResult ? (
            <div className="resultBanner">
              <div className="resultTitle">Fraud guess</div>
              <div className="muted small">
                {fraudGuessResult.isCorrect ? "Correct!" : "Incorrect."} Guess:{" "}
                {fraudGuessResult.guessIndex >= 0 ? game?.clueBoard16?.[fraudGuessResult.guessIndex] : "—"} · Secret:{" "}
                {game?.clueBoard16?.[fraudGuessResult.secretIndex] || "—"}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <LeaderboardPanel lobby={lobby} />

      <Modal open={stepAOpen} title="Ready to see your role?" onClose={() => {}}>
        <div className="stack">
          <button className="btn btnPrimary btnHuge" onClick={revealMyRole} disabled={stepAStarted}>
            Reveal My Role
          </button>
          {stepAStarted ? (
            <div className="muted">
              Revealing in <span className="mono">{stepACount}s</span>…
            </div>
          ) : null}
          <div className="muted small">You control when you reveal (then it counts down).</div>
        </div>
      </Modal>

      <Modal open={stepBOpen} title="Your role" onClose={() => setStepBOpen(false)}>
        <div className="stack">
          {isFraud ? (
            <div className="roleBlock">
              <div className="roleTitle">
                🎭 You are <b>THE FRAUD!</b>
              </div>
              <div className="muted">
                You don’t know the secret clue. Blend in with believable one-word clues, then try to survive the vote.
              </div>
            </div>
          ) : (
            <div className="roleBlock">
              <div className="roleTitle">
                🕵️ You are a <b>Detective!</b>
              </div>
              <div className="muted">Once revealed, you’ll see the highlighted secret clue on the board.</div>
            </div>
          )}

          <button className="btn btnSecondary" onClick={() => setStepBOpen(false)}>
            Continue <span className="mono">({stepBCount}s)</span>
          </button>
          <div className="muted small">This closes automatically.</div>
        </div>
      </Modal>
    </div>
  );
}

function HoldToConfirm({ onConfirm }: { onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const tRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  function stop() {
    setHolding(false);
    setProgress(0);
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = null;
  }

  function tick() {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(1, elapsed / 3000);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm();
    } else {
      tRef.current = window.setTimeout(tick, 60);
    }
  }

  function start() {
    if (holding) return;
    setHolding(true);
    startRef.current = Date.now();
    tick();
  }

  return (
    <button
      className={`btn btnGhost btnSmall holdBtn ${holding ? "holdOn" : ""}`}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      title="Hold 3 seconds to end voting early"
    >
      End voting early{" "}
      <span className="holdBar" aria-hidden>
        <span className="holdFill" style={{ transform: `scaleX(${progress})` }} />
      </span>
    </button>
  );
}

