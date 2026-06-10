import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "react-chessboard/dist/chessboard/types";
import { Chess } from "chess.js";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import {
  IconChessKnight,
  IconExternalLink,
  IconRefresh,
  IconBulb,
  IconCheck,
} from "@tabler/icons-react";
import { Tooltip } from "./Tooltip";
import { chessmaster5500Pieces } from "./chessPieces";

interface PuzzleData {
  game: { id: string };
  puzzle: {
    id: string;
    solution: string[];
    fen: string;
  };
}

type PuzzleStatus = "playing" | "correct" | "wrong" | "solved";

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

const CACHE_KEY = "lichess-puzzle-daily";

function getCachedPuzzle(): PuzzleData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { date, data } = JSON.parse(raw);
    if (date === new Date().toISOString().split("T")[0]) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function cachePuzzle(data: PuzzleData): void {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ date: new Date().toISOString().split("T")[0], data }),
    );
  } catch {
    /* ignore */
  }
}

export const LichessPuzzle: React.FC = () => {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(getCachedPuzzle);
  const [loading, setLoading] = useState(!puzzle);
  const [error, setError] = useState<string | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<PuzzleStatus>("playing");
  const [showHint, setShowHint] = useState(false);
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState<string>("");
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  useEffect(() => {
    if (puzzle) return;
    const controller = new AbortController();
    fetch("https://lichess.org/api/puzzle/daily", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: PuzzleData) => {
        setPuzzle(data);
        cachePuzzle(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Failed to load puzzle");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [puzzle]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setBoardWidth(Math.floor(entry.contentRect.width) - 4);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const resetBoard = useCallback((p: PuzzleData) => {
    const game = new Chess(p.puzzle.fen);
    gameRef.current = game;
    setFen(game.fen());
    setMoveIndex(0);
    setStatus("playing");
    setShowHint(false);
    setLastMove(null);
    setSelectedSquare(null);
  }, []);

  useEffect(() => {
    if (puzzle) resetBoard(puzzle);
  }, [puzzle, resetBoard]);

  const playerColor = useMemo(() => {
    if (!puzzle) return "white" as const;
    return puzzle.puzzle.fen.includes(" b ") ? "black" : "white";
  }, [puzzle]);

  const solution = useMemo(() => puzzle?.puzzle.solution || [], [puzzle]);

  const playOpponentMove = useCallback(
    (index: number) => {
      if (index >= solution.length) {
        setStatus("solved");
        return;
      }
      const move = uciToMove(solution[index]);
      setTimeout(() => {
        const game = gameRef.current;
        const result = game.move(move);
        if (result) {
          setFen(game.fen());
          setLastMove({ from: move.from, to: move.to });
          setMoveIndex(index + 1);
          setShowHint(false);
          if (index + 1 >= solution.length) {
            setStatus("solved");
          }
        }
      }, 400);
    },
    [solution],
  );

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (status === "solved") return false;

      const expected = solution[moveIndex];
      if (!expected) return false;

      const expectedMove = uciToMove(expected);
      const promotion =
        piece[1]?.toLowerCase() === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1")
          ? expectedMove.promotion || "q"
          : undefined;

      const isCorrect =
        sourceSquare === expectedMove.from &&
        targetSquare === expectedMove.to &&
        (!expectedMove.promotion || promotion === expectedMove.promotion);

      if (!isCorrect) {
        setStatus("wrong");
        setTimeout(() => setStatus("playing"), 800);
        return false;
      }

      const game = gameRef.current;
      const result = game.move({ from: sourceSquare, to: targetSquare, promotion });
      if (!result) return false;

      setFen(game.fen());
      setLastMove({ from: sourceSquare, to: targetSquare });
      setStatus("correct");
      setShowHint(false);

      const nextIndex = moveIndex + 1;
      if (nextIndex >= solution.length) {
        setStatus("solved");
        setMoveIndex(nextIndex);
      } else {
        playOpponentMove(nextIndex);
      }

      return true;
    },
    [moveIndex, solution, status, playOpponentMove],
  );

  const playerPrefix = playerColor === "white" ? "w" : "b";

  const handlePieceClick = useCallback(
    (_piece: string, square: Square) => {
      if (status === "solved") return;
      if (_piece[0] !== playerPrefix) return;
      setSelectedSquare(selectedSquare === square ? null : square);
    },
    [status, playerPrefix, selectedSquare],
  );

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!selectedSquare || status === "solved") return;

      const pieceOnSquare = gameRef.current.get(square as any);
      if (pieceOnSquare && pieceOnSquare.color === playerPrefix[0]) {
        setSelectedSquare(square);
        return;
      }

      const selPiece = gameRef.current.get(selectedSquare as any);
      const pieceStr = selPiece
        ? `${selPiece.color === "w" ? "w" : "b"}${selPiece.type.toUpperCase()}`
        : "";
      setSelectedSquare(null);
      onDrop(selectedSquare, square, pieceStr);
    },
    [selectedSquare, status, onDrop, playerPrefix],
  );

  const hintSquare = useMemo(() => {
    if (!showHint || moveIndex >= solution.length) return {};
    const move = uciToMove(solution[moveIndex]);
    return {
      [move.from]: { backgroundColor: "rgba(255, 185, 50, 0.5)" },
      [move.to]: { backgroundColor: "rgba(255, 185, 50, 0.3)" },
    };
  }, [showHint, moveIndex, solution]);

  const lastMoveHighlight = useMemo(() => {
    if (!lastMove) return {};
    return {
      [lastMove.from]: { backgroundColor: "rgba(100, 140, 200, 0.3)" },
      [lastMove.to]: { backgroundColor: "rgba(100, 140, 200, 0.45)" },
    };
  }, [lastMove]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (status === "wrong") {
      const move = uciToMove(solution[moveIndex] || "a1a1");
      styles[move.from] = { backgroundColor: "rgba(207, 34, 46, 0.4)" };
    }

    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(100, 140, 200, 0.55)" };
    }

    return { ...lastMoveHighlight, ...hintSquare, ...styles };
  }, [lastMoveHighlight, hintSquare, status, moveIndex, solution, selectedSquare]);

  const reset = useCallback(() => {
    if (puzzle) resetBoard(puzzle);
  }, [puzzle, resetBoard]);

  if (loading) {
    return (
      <div style={{ marginTop: "2rem", textAlign: "center" }}>
        <Spinner animation="border" variant="secondary" size="sm" />
      </div>
    );
  }

  if (error || !puzzle) {
    return null;
  }

  const statusColor = status === "wrong" ? "#cf222e" : status === "playing" ? "#4A5680" : "#1a7f37";

  const statusText =
    status === "solved"
      ? "Solved"
      : status === "correct"
        ? "Correct!"
        : status === "wrong"
          ? "Wrong move"
          : `${playerColor === "white" ? "White" : "Black"} to play`;

  return (
    <Card className="h-100 summary-card" style={{ borderLeft: "3px solid #7A4040" }}>
      <Card.Body className="p-0">
        <div className="section-header px-3 pt-3 mb-0">
          <Tooltip text="Lichess daily puzzle">
            <span
              className="section-icon-bg"
              style={{ backgroundColor: "#4A568015", color: "#4A5680" }}
            >
              <IconChessKnight size={16} stroke={1.8} />
            </span>
          </Tooltip>
          <span>Puzzle of the Day</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <Tooltip text="Reset puzzle">
              <button
                onClick={reset}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#656d76",
                  padding: "2px",
                  display: "flex",
                }}
              >
                <IconRefresh size={14} />
              </button>
            </Tooltip>
            <Tooltip text="Show hint">
              <button
                onClick={() => setShowHint(!showHint)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: showHint ? "#f0883e" : "#656d76",
                  padding: "2px",
                  display: "flex",
                }}
              >
                <IconBulb size={14} />
              </button>
            </Tooltip>
            <Tooltip text="Open on Lichess">
              <a
                href="https://lichess.org/training/daily"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#656d76", display: "flex", padding: "2px" }}
              >
                <IconExternalLink size={14} />
              </a>
            </Tooltip>
          </span>
        </div>
        <div ref={containerRef} style={{ marginTop: 8, padding: "0 12px 12px" }}>
          {boardWidth > 0 && (
            <div
              style={{
                border: "2px solid #3D4A6B",
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
                display: "inline-block",
                overflow: "hidden",
              }}
            >
              <Chessboard
                position={fen}
                onPieceDrop={(s, t, p) => {
                  setSelectedSquare(null);
                  return onDrop(s, t, p);
                }}
                onPieceClick={handlePieceClick}
                onSquareClick={handleSquareClick}
                boardWidth={boardWidth}
                boardOrientation={playerColor}
                customSquareStyles={customSquareStyles}
                customPieces={chessmaster5500Pieces}
                customDarkSquareStyle={{ backgroundColor: "#4A5680" }}
                customLightSquareStyle={{ backgroundColor: "#E8E2D8" }}
                customBoardStyle={{
                  borderRadius: "2px",
                }}
                customNotationStyle={{
                  fontSize: "0.55rem",
                  fontWeight: 600,
                  color: "#8890A4",
                }}
                showBoardNotation={true}
                animationDuration={200}
                arePiecesDraggable={status !== "solved"}
                isDraggablePiece={({ piece }) =>
                  status !== "solved" && piece[0] === (playerColor === "white" ? "w" : "b")
                }
              />
            </div>
          )}
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: statusColor,
              marginTop: "0.5rem",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            {statusText}
            {status === "solved" && <IconCheck size={14} stroke={2.5} />}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};
