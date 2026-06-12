const PIECE_KEYS = ["wP", "wR", "wN", "wB", "wQ", "wK", "bP", "bR", "bN", "bB", "bQ", "bK"];

export const kosalPieces: Record<string, (args: { squareWidth: number }) => React.JSX.Element> =
  Object.fromEntries(
    PIECE_KEYS.map((key) => [
      key,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`/pieces/kosal/${key}.svg`}
          width={squareWidth}
          height={squareWidth}
          style={{ display: "block" }}
          alt={key}
        />
      ),
    ]),
  );
