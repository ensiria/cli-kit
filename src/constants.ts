/**
 * Every constant of the kit, in one place: exit codes, tones, glyphs, the spinner, box-drawing symbols, refresh
 * rates and the environment variables the kit reads.
 *
 * @remarks
 * Scripts and the kit's own modules read these instead of writing a code, a colour or a character inline, so a
 * success, a failure or a border looks and behaves the same in every tool. Tone and glyph names follow Kaji UI, so the
 * terminal and the app speak the same language.
 *
 * @see docs/plans/cli-kit-plan.md, "Constants"
 * @module
 */

/** Exit codes shared by every script. */
export const EXIT = {
  /** Done. */
  ok: 0,
  /** The work failed. */
  failure: 1,
  /** The command line was wrong (unknown option, missing or invalid argument). */
  usage: 2,
  /** Stopped by Ctrl+C (SIGINT): 128 + 2, the shell convention. */
  interrupted: 130,
  /** Stopped by SIGTERM: 128 + 15. */
  terminated: 143
} as const;

/**
 * The tones, by meaning, and the `util.styleText` format behind each.
 *
 * Scripts ask for a tone (`success`, `muted`), never for a colour; the formats here are the only place a colour is named.
 */
export const TONES = {
  /** Plain text. */
  neutral: "reset",
  /** Something to notice: steps, info, links. */
  accent: "cyan",
  /** Something went well. */
  success: "green",
  /** Something to look at; the work goes on. */
  warning: "yellow",
  /** Something failed. */
  danger: "red",
  /** Secondary text: hints, details, timings. */
  muted: "gray",
  /** Headings and names. */
  strong: "bold"
} as const;

/** Every glyph of the kit, with its Unicode form and the ASCII form used when Unicode is off. */
export const GLYPHS = {
  /** A finished step, a passed check. */
  success: { unicode: "✓", ascii: "+" },
  /** A failure. */
  error: { unicode: "✗", ascii: "x" },
  /** A warning. */
  warning: { unicode: "!", ascii: "!" },
  /** A neutral piece of information. */
  info: { unicode: "›", ascii: ">" },
  /** A debug line. */
  debug: { unicode: "·", ascii: "." },
  /** A step that starts. */
  step: { unicode: "→", ascii: "->" },
  /** A task not started yet. */
  pending: { unicode: "○", ascii: "o" },
  /** A task that is running (static form; live output uses the spinner). */
  running: { unicode: "◉", ascii: "*" },
  /** A task that was skipped. */
  skipped: { unicode: "–", ascii: "-" },
  /** A list item. */
  bullet: { unicode: "•", ascii: "*" },
  /** The header's default icon. */
  arrow: { unicode: "▸", ascii: ">" },
  /** A question asked by a prompt. */
  question: { unicode: "?", ascii: "?" },
  /** A selected choice in a prompt. */
  selected: { unicode: "◆", ascii: "(*)" },
  /** A choice not selected. */
  unselected: { unicode: "◇", ascii: "( )" },
  /** A ticked box (multiselect). */
  checked: { unicode: "■", ascii: "[x]" },
  /** An empty box (multiselect). */
  unchecked: { unicode: "□", ascii: "[ ]" },
  /** The cursor on the active choice of a prompt. */
  pointer: { unicode: "❯", ascii: ">" },
  /** A tool or package (header icon). */
  package: { unicode: "◈", ascii: "#" },
  /** A check or test run (header icon). */
  check: { unicode: "◎", ascii: "@" },
  /** A generator (header icon). */
  build: { unicode: "✦", ascii: "*" },
  /** Documentation (header icon). */
  docs: { unicode: "≡", ascii: "=" }
} as const;

/**
 * The spinner: Kaji UI's loader, the app icon's waves (a core and the rings leaving it, one wave every 1.8 s), drawn
 * in one terminal cell.
 */
export const SPINNER = {
  /** The frames in a Unicode terminal: the core, then a ring growing out of it and fading. */
  unicode: ["·", "•", "◉", "◎", "○", "◦"],
  /** The frames when Unicode is off. */
  ascii: [".", "o", "O", "0", "o", "."],
  /** Milliseconds per frame: six frames make the 1.8 s wave of the app's loader. */
  interval: 300
} as const;

/** Characters for drawing: separators, ellipsis, box borders, tree branches and bars, each with its ASCII form. */
export const SYMBOLS = {
  /** Between two parts of a line (`build-order — recompute`). */
  separator: { unicode: "—", ascii: "-" },
  /** Between inline values (`3 files · 2 s`). */
  dot: { unicode: "·", ascii: "-" },
  /** Where text was cut. */
  ellipsis: { unicode: "…", ascii: "..." },
  /** Box corners, sides and junctions, as used by `box()` and a bordered `table()`. */
  box: {
    unicode: {
      topLeft: "╭",
      topRight: "╮",
      bottomLeft: "╰",
      bottomRight: "╯",
      horizontal: "─",
      vertical: "│",
      teeDown: "┬",
      teeUp: "┴",
      teeRight: "├",
      teeLeft: "┤",
      cross: "┼"
    },
    ascii: {
      topLeft: "+",
      topRight: "+",
      bottomLeft: "+",
      bottomRight: "+",
      horizontal: "-",
      vertical: "|",
      teeDown: "+",
      teeUp: "+",
      teeRight: "+",
      teeLeft: "+",
      cross: "+"
    }
  },
  /** The rule under a borderless table's header. */
  rule: { unicode: "─", ascii: "-" },
  /** Tree branches, as used by `tree()`. */
  tree: {
    unicode: { branch: "├─ ", last: "└─ ", pipe: "│  ", space: "   " },
    ascii: { branch: "|- ", last: "`- ", pipe: "|  ", space: "   " }
  },
  /** Progress bar cells. */
  bar: {
    unicode: { filled: "█", empty: "░" },
    ascii: { filled: "#", empty: "-" }
  }
} as const;

/** Timings of live output, in milliseconds. */
export const DURATION = {
  /** Longest gap between two redraws of a progress bar (it redraws sooner when the value changes enough). */
  progressRefresh: 100,
  /** How often an indeterminate bar or a running task list moves. */
  liveRefresh: 120,
  /** In a non-interactive log, the shortest gap between two progress lines, so a CI log is not flooded. */
  plainProgressInterval: 2000
} as const;

/** The environment variables the kit reads. */
export const ENV = {
  /** Any non-empty value turns colour off (no-color.org). */
  noColor: "NO_COLOR",
  /** `0` turns colour off, any other non-empty value turns it on even without a terminal. */
  forceColor: "FORCE_COLOR",
  /** `1` turns Unicode glyphs off. */
  ascii: "CLI_KIT_ASCII",
  /** `dumb` turns Unicode glyphs and live output off. */
  term: "TERM",
  /** Set by CI services; live output becomes plain lines. */
  ci: "CI",
  /** `1` makes a script print its JSON description and exit without running (how `cli-kit docs` reads it). */
  describe: "CLI_KIT_DESCRIBE",
  /** `1` turns OSC 8 hyperlinks on, `0` off, whatever the terminal. */
  forceHyperlink: "FORCE_HYPERLINK",
  /** The terminal application (`iTerm.app`, `vscode`…), to tell whether it shows hyperlinks. */
  termProgram: "TERM_PROGRAM",
  /** Set by VTE terminals (GNOME Terminal…); 5000 and later show hyperlinks. */
  vteVersion: "VTE_VERSION"
} as const;

/** ANSI control sequences the live helpers write (hide and show the cursor, clear a line). */
export const ANSI = {
  /** Hides the cursor while a spinner or a progress bar draws. */
  hideCursor: "\u001B[?25l",
  /** Shows the cursor again; also written on Ctrl+C. */
  showCursor: "\u001B[?25h",
  /** Moves to the start of the line and clears it. */
  clearLine: "\r\u001B[2K",
  /** Moves the cursor up one line. */
  cursorUp: "\u001B[1A"
} as const;
