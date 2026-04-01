/**
 * pgn-export.js
 * Professional annotated PGN export for the chess analysis app.
 *
 * Public API:
 *   exportAnnotatedPGN(moveAnalysis)
 *
 * Dependencies (must be loaded before this file):
 *   - chess.js  (Chess constructor in global scope)
 *   - window.game  (the live Chess() instance — read-only, never mutated)
 *   - CLASSIFICATION_META  (from chess-analysis.js)
 *
 * Zero side-effects: the live `game` object is never touched.
 */

(function () {
    'use strict';

    // ── Win-probability model (identical to chess-analysis.js) ───────────────

    /**
     * Converts centipawns to a win probability in [0, 1].
     * Clamped to ±1000 cp to prevent extreme floats.
     *
     * @param {number} cp - Centipawns from the moving side's perspective.
     * @returns {number}
     */
    function cpToWinProb(cp) {
        const clamped = Math.max(-1000, Math.min(1000, cp));
        return 1 / (1 + Math.pow(10, -clamped / 400));
    }

    /**
     * Per-move accuracy: exponential drop model.
     * Returns 100 when the move held or improved the position.
     *
     * @param {number} wpBefore - Win probability before the move (moving side POV).
     * @param {number} wpAfter  - Win probability after the move (moving side POV).
     * @returns {number} Accuracy percentage in [0, 100].
     */
    function movePctAccuracy(wpBefore, wpAfter) {
        if (wpAfter >= wpBefore) return 100;
        return Math.max(0, 100 * Math.exp(-4 * (wpBefore - wpAfter)));
    }

    // ── Evaluation formatting ────────────────────────────────────────────────

    /**
     * Formats a pawn-unit evaluation for display.
     *
     * evalAfter is stored from White's POV in `moveAnalysis`.
     * A mate score of ±100 (stored internally as ±10 000 cp / 100) is shown as #N.
     *
     * @param {number} evalAfterPawns - White-POV evaluation in pawns.
     * @param {string} side           - 'white' | 'black'
     * @returns {string}
     */
    function formatEval(evalAfterPawns, side) {
        const absVal = Math.abs(evalAfterPawns);

        // Mate score detection: internal representation stores ±100 for mate
        if (absVal >= 99) {
            const mateIn = Math.round(absVal - 99) + 1; // rough mate distance
            const mateSign = evalAfterPawns > 0 ? '+' : '-';
            return `${mateSign}M${mateIn}`;
        }

        const sign = evalAfterPawns >= 0 ? '+' : '';
        return `${sign}${evalAfterPawns.toFixed(1)}`;
    }

    // ── Per-move accuracy from moveAnalysis data ─────────────────────────────

    /**
     * Derives win probabilities from a move record and returns the accuracy.
     *
     * evalAfter  = White-POV pawns after move
     * swing      = moving-side-POV change in pawns
     * Therefore: evalBefore (moving-side POV) = evalAfter * sideSign - swing
     *
     * @param {Object} m - Single moveAnalysis record.
     * @returns {number} Accuracy in [0, 100].
     */
    function getMoveAccuracy(m) {
        const sideSign = m.side === 'white' ? 1 : -1;

        // Convert stored values to centipawns from the moving side's POV
        const cpAfter  = m.evalAfter * 100 * sideSign;
        const cpBefore = cpAfter - (m.swing * 100);

        const wpBefore = cpToWinProb(cpBefore);
        const wpAfter  = cpToWinProb(cpAfter);

        return movePctAccuracy(wpBefore, wpAfter);
    }

    // ── Classification label lookup ──────────────────────────────────────────

    /**
     * Returns the human-readable label for a move type.
     * Falls back gracefully if CLASSIFICATION_META is unavailable.
     *
     * @param {string} type - e.g. 'blunder', 'best', 'brilliant'
     * @returns {string}
     */
    function getClassificationLabel(type) {
        if (
            typeof CLASSIFICATION_META !== 'undefined' &&
            CLASSIFICATION_META[type] &&
            CLASSIFICATION_META[type].label
        ) {
            return CLASSIFICATION_META[type].label;
        }
        // Safe fallback: capitalise the key
        return type
            ? type.charAt(0).toUpperCase() + type.slice(1)
            : 'Unknown';
    }

    // ── Date helper ──────────────────────────────────────────────────────────

    /**
     * Returns today's date in PGN format: YYYY.MM.DD
     * @returns {string}
     */
    function getPGNDate() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const dd   = String(d.getDate()).padStart(2, '0');
        return `${yyyy}.${mm}.${dd}`;
    }

    /**
     * Returns today's date as YYYYMMDD for use in the filename.
     * @returns {string}
     */
    function getFileDateSuffix() {
        return getPGNDate().replace(/\./g, '');
    }

    // ── Game result helper ───────────────────────────────────────────────────

    /**
     * Derives the PGN result tag from the live game state.
     * @returns {string} '1-0' | '0-1' | '1/2-1/2' | '*'
     */
    function getGameResult() {
        if (typeof game === 'undefined') return '*';

        if (game.in_checkmate()) {
            // The side that just moved delivered checkmate;
            // game.turn() is now the LOSING side.
            return game.turn() === 'b' ? '1-0' : '0-1';
        }
        if (game.in_draw() || game.in_stalemate() ||
            game.in_threefold_repetition() || game.insufficient_material()) {
            return '1/2-1/2';
        }
        return '*'; // game still in progress / unknown
    }

    // ── Comment builder ──────────────────────────────────────────────────────

    /**
     * Builds a PGN move comment string from a moveAnalysis record.
     *
     * Format: {Label | Eval: +0.3 | Accuracy: 98.4%}
     *
     * @param {Object} m - Single moveAnalysis record.
     * @returns {string}
     */
    function buildComment(m) {
        const label    = getClassificationLabel(m.type);
        const evalStr  = formatEval(m.evalAfter, m.side);
        const accuracy = getMoveAccuracy(m);
        return `${label} | Eval: ${evalStr} | Accuracy: ${accuracy.toFixed(1)}%`;
    }

    // ── Global accuracy summary ──────────────────────────────────────────────

    /**
     * Computes overall white and black accuracies from the full moveAnalysis array.
     * Uses the same averaging method as computeAccuracies() in chess-analysis.js.
     *
     * @param {Object[]} moveAnalysis
     * @returns {{ white: number, black: number }}
     */
    function computeOverallAccuracies(moveAnalysis) {
        const totals = { white: 0, black: 0 };
        const counts = { white: 0, black: 0 };

        for (const m of moveAnalysis) {
            const acc = getMoveAccuracy(m);
            totals[m.side] += acc;
            counts[m.side]++;
        }

        return {
            white: counts.white > 0 ? totals.white / counts.white : 100,
            black: counts.black > 0 ? totals.black / counts.black : 100,
        };
    }

    // ── Core PGN builder ────────────────────────────────────────────────────

    /**
     * Manually serialises a Chess() instance to PGN with inline comments.
     *
     * chess.js 0.10.x has limited comment support and its pgn() method does
     * not include comments set via setComment(). We therefore build the PGN
     * string ourselves from the header map and the verbose move history,
     * embedding comments directly after each move.
     *
     * This approach is:
     *   - Pure client-side
     *   - Non-destructive (uses a temporary Chess instance)
     *   - Compliant with PGN spec (comments in curly braces after SAN)
     *
     * @param {Chess}    tempGame     - Fully-replayed temporary Chess instance.
     * @param {Map}      headers      - Ordered map of header key → value.
     * @param {string[]} moveComments - Comment for each half-move (index = ply).
     * @param {string}   finalComment - Optional final game-level comment.
     * @returns {string} Complete PGN string.
     */
    function buildPGNString(tempGame, headers, moveComments, finalComment) {
        // ── Header section ──
        let pgn = '';
        for (const [key, value] of headers) {
            pgn += `[${key} "${value}"]\n`;
        }
        pgn += '\n';

        // ── Move text section ──
        const history = tempGame.history({ verbose: false }); // SAN strings
        let   moveText = '';

        for (let ply = 0; ply < history.length; ply++) {
            const isWhiteMove = ply % 2 === 0;

            // Move number prefix for white moves (and for black's first move
            // after a comment, we need to re-state the move number with "...")
            if (isWhiteMove) {
                const moveNum = Math.floor(ply / 2) + 1;
                moveText += `${moveNum}. `;
            }

            // SAN
            moveText += history[ply];

            // Inline comment
            const comment = moveComments[ply];
            if (comment) {
                moveText += ` {${comment}}`;
            }

            // Separator (space), but not after the very last move
            if (ply < history.length - 1) {
                moveText += ' ';

                // After a comment on a white move, black's move needs move
                // number with "..." so the PGN is unambiguous (PGN spec §8.2.2)
                if (comment && isWhiteMove) {
                    const moveNum = Math.floor(ply / 2) + 1;
                    moveText += `${moveNum}... `;
                }
            }
        }

        // ── Game termination marker ──
        const result = headers.get('Result') || '*';
        moveText += ` ${result}`;

        // ── Optional final game comment (appended before result in a
        //    separate comment block that follows the last move) ──
        if (finalComment) {
            // Insert the comment between the last move and the result token
            const lastMoveEnd = moveText.lastIndexOf(` ${result}`);
            if (lastMoveEnd !== -1) {
                moveText =
                    moveText.slice(0, lastMoveEnd) +
                    ` {${finalComment}}` +
                    moveText.slice(lastMoveEnd);
            }
        }

        pgn += moveText + '\n';
        return pgn;
    }

    // ── Downloader ──────────────────────────────────────────────────────────

    /**
     * Triggers a browser download for the given text content.
     *
     * @param {string} content  - File contents.
     * @param {string} filename - Suggested filename.
     * @param {string} mimeType - MIME type.
     */
    function downloadTextFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url  = URL.createObjectURL(blob);

        const anchor      = document.createElement('a');
        anchor.href       = url;
        anchor.download   = filename;
        anchor.style.display = 'none';

        document.body.appendChild(anchor);
        anchor.click();

        // Clean up after the click event has been processed
        setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // ── Main export function ─────────────────────────────────────────────────

    /**
     * exportAnnotatedPGN(moveAnalysis)
     *
     * Generates and downloads a fully-annotated PGN file.
     * Safe to call at any point after analyzeGame() has completed.
     *
     * @param {Object[]} moveAnalysis - Array of move records from analyzeGame().
     *   Each record: { moveNumber, move, bestMove, side, evalAfter, swing, type }
     */
    function exportAnnotatedPGN(moveAnalysis) {

        // ── Guard: nothing to export ──────────────────────────────────────────
        if (!moveAnalysis || moveAnalysis.length === 0) {
            console.warn('[pgn-export] exportAnnotatedPGN called with empty data.');
            return;
        }

        // ── Guard: chess.js unavailable ───────────────────────────────────────
        if (typeof Chess === 'undefined') {
            console.error('[pgn-export] chess.js (Chess constructor) not found.');
            return;
        }

        // ── Step 1: Replay game in an isolated temporary instance ─────────────
        //
        //    We need to replay all moves so we can call .history() on a clean
        //    instance and know the full move list.  We do NOT touch window.game.
        //
        const tempGame = new Chess();

        for (let i = 0; i < moveAnalysis.length; i++) {
            const moveRecord = moveAnalysis[i];
            const san = moveRecord.san || moveRecord.move?.san || moveRecord.move;
            const result = tempGame.move(san);

            if (!result) {
                // Move failed to apply — the moveAnalysis array may have been
                // built from a game that used UCI notation.  Try to apply the
                // move from the original game's verbose history as a fallback.
                console.warn(
                    `[pgn-export] Could not replay move ${i + 1} ("${san}"). ` +
                    'Falling back to verbose history from window.game.'
                );

                if (typeof game !== 'undefined') {
                    const verboseHistory = game.history({ verbose: true });
                    if (verboseHistory[i]) {
                        const fallback = tempGame.move({
                            from:      verboseHistory[i].from,
                            to:        verboseHistory[i].to,
                            promotion: verboseHistory[i].promotion || 'q',
                        });
                        if (!fallback) {
                            console.error(`[pgn-export] Fallback also failed at move ${i + 1}. Aborting.`);
                            return;
                        }
                    } else {
                        console.error(`[pgn-export] No fallback available at move ${i + 1}. Aborting.`);
                        return;
                    }
                } else {
                    console.error('[pgn-export] window.game unavailable for fallback. Aborting.');
                    return;
                }
            }
        }

        // ── Step 2: Build headers ─────────────────────────────────────────────
        //
        //    Use an ordered Map so headers appear in a deterministic, logical
        //    order in the exported file.
        //
        const result  = getGameResult();
        const headers = new Map([
            ['Event',  'Game Analysis'],
            ['Site',   'My Chess App'],
            ['Date',   getPGNDate()],
            ['Round',  '-'],
            ['White',  'White'],
            ['Black',  'Black'],
            ['Result', result],
        ]);

        // ── Step 3: Build per-move comments ───────────────────────────────────
        //
        //    moveAnalysis[i] corresponds to ply i (half-move i).
        //
        const moveComments = moveAnalysis.map(m => buildComment(m));

        // ── Step 4: Build optional final accuracy comment ─────────────────────
        const overallAccuracies = computeOverallAccuracies(moveAnalysis);
        const finalComment =
            `White Accuracy: ${overallAccuracies.white.toFixed(1)}% | ` +
            `Black Accuracy: ${overallAccuracies.black.toFixed(1)}%`;

        // ── Step 5: Serialise to PGN string ──────────────────────────────────
        const pgnString = buildPGNString(tempGame, headers, moveComments, finalComment);

        // ── Step 6: Download ──────────────────────────────────────────────────
        const filename = `game-analysis-${getFileDateSuffix()}.pgn`;
        downloadTextFile(pgnString, filename, 'application/x-chess-pgn');
    }

    // ── Expose public API ────────────────────────────────────────────────────
    window.exportAnnotatedPGN = exportAnnotatedPGN;

})();
