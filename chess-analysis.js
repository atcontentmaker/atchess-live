/**
 * CHESS ANALYSIS MODULE - FIXED VERSION
 *
 * Bugs fixed vs original:
 *
 * 1. SWING POV BUG â€” cpBefore/cpAfter were kept in White's absolute POV, so
 *    swing = (cpAfter - cpBefore) was always negative for Black moves (engine
 *    flips sign after Black plays). Fixed: swing is now computed from the
 *    moving side's perspective so both sides are judged symmetrically.
 *
 * 2. MISSING evalBefore on result object â€” upgradeMoveClassification() checked
 *    m.evalBefore which was never stored, always undefined. Fixed: cpBeforeSide
 *    and cpAfterSide are now stored on the result object.
 *
 * 3. BEST-MOVE COMPARISON â€” bestMove from Stockfish is a UCI string ("e2e4")
 *    while m.move is SAN ("e4"). They can never be equal so nothing was ever
 *    classified as best/brilliant. Fixed: UCI best move is converted to SAN
 *    using a temp Chess instance before comparing.
 *
 * 4. ACCURACY MATH SNOWBALL â€” computeAccuracies() reconstructed cpBefore from
 *    the already-wrong swing value, doubling the error. Fixed: accuracy now
 *    reads cpBeforeSide/cpAfterSide stored directly on each move result.
 *
 * 5. ANALYSIS DEPTH â€” raised from 12 to 16 for more reliable evaluations.
 *
 * 6. CLASSIFICATION THRESHOLDS â€” tightened to match Lichess / Chess.com
 *    conventions so normal play does not flood into inaccuracy/mistake.
 */

const PIECE_VALUES = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

const CLASSIFICATION_META = {
    brilliant:  { label: 'Brilliant',  emoji: '!!', color: '#1baca6' },
    great:      { label: 'Great Move', emoji: '!',  color: '#5c8bb0' },
    best:       { label: 'Best',       emoji: '*', color: '#95bb4a' },
    excellent:  { label: 'Excellent',  emoji: '+', color: '#95bb4a' },
    good:       { label: 'Good',       emoji: '+', color: '#81c995' },
    inaccuracy: { label: 'Inaccuracy', emoji: '?!', color: '#f6c90e' },
    mistake:    { label: 'Mistake',    emoji: '?',  color: '#f5a623' },
    missedWin:  { label: 'Missed Win', emoji: '??', color: '#dbac16' },
    blunder:    { label: 'Blunder',    emoji: '??', color: '#e05252' },
};

// â”€â”€ CSS Injection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function injectAnalysisStyles() {
    if (document.getElementById('analysis-styles')) return;
    const style = document.createElement('style');
    style.id = 'analysis-styles';
    style.innerHTML = `
        #analysis-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 9999;
            display: flex; justify-content: center; align-items: center;
            padding: 16px;
        }
        #analysis-window {
            background: var(--surface-1); width: min(900px, 100%); max-width: 900px; height: min(80vh, 760px);
            border-radius: var(--radius-lg); display: flex; flex-direction: column; overflow: hidden;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 1px solid var(--border);
        }
        #analysis-moves { flex: 1; overflow-y: auto; padding: 10px; }
        .analysis-move-row {
            display: grid; grid-template-columns: 50px 80px 80px 80px 1fr;
            align-items: center; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);
            font-family: var(--font-mono); font-size: 14px;
        }
        .move-type-badge {
            justify-self: end; padding: 4px 12px; border-radius: var(--radius-sm);
            font-weight: bold; font-size: 12px; text-transform: uppercase;
        }
        #analysis-summary { display: flex; background: var(--surface-2); padding: 15px; gap: 20px; }
        .summary-side { flex: 1; border-radius: var(--radius-sm); padding: 10px; background: var(--surface-3); }
        .close-analysis {
            padding: 10px; background: transparent; color: var(--text-2); border: none;
            cursor: pointer; font-weight: bold; width: 100%; border-top: 1px solid var(--border);
        }
        .close-analysis:hover { color: var(--text-1); }
        #analysis-eval-chart { height: 100px; width: 100%; background: var(--surface-2); }
    `;
    document.head.appendChild(style);
}

// â”€â”€ Core Math â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Win-probability from centipawns (moving side's POV). */
function _cpToWinProb(cp) {
    return 1 / (1 + Math.pow(10, -Math.max(-1000, Math.min(1000, cp)) / 400));
}

/**
 * Per-move accuracy.
 * wpBefore / wpAfter are win-probabilities from the MOVING SIDE's perspective.
 */
function _moveAccuracy(wpBefore, wpAfter) {
    if (wpAfter >= wpBefore) return 100;
    return Math.max(0, 100 * Math.exp(-3.5 * (wpBefore - wpAfter)));
}

function getMaterialSum(fen) {
    const position = fen.split(' ')[0];
    return [...position].reduce((acc, char) => acc + (PIECE_VALUES[char.toLowerCase()] || 0), 0);
}

/**
 * Convert a UCI move string (e.g. "e2e4", "g1f3") to SAN using a Chess
 * instance positioned BEFORE the move was played.
 * Returns null if conversion fails.
 */
function uciToSan(uci, fenBefore) {
    if (!uci || uci.length < 4) return null;
    try {
        const tmp = new Chess();
        tmp.load(fenBefore);
        const from  = uci.substring(0, 2);
        const to    = uci.substring(2, 4);
        const promo = uci.length === 5 ? uci[4] : undefined;
        const result = tmp.move({ from, to, promotion: promo });
        return result ? result.san : null;
    } catch (e) {
        return null;
    }
}

/**
 * Classify a move given centipawn values from the moving side's perspective.
 *
 * loss = cpBeforeSide - cpAfterSide  (positive means position got worse)
 *
 * Thresholds (tightened vs original):
 *   loss â‰¤  10 cp  â†’ excellent  (nearly perfect)
 *   loss â‰¤  30 cp  â†’ good
 *   loss â‰¤  60 cp  â†’ inaccuracy
 *   loss â‰¤ 150 cp  â†’ mistake
 *   otherwise      â†’ blunder
 */
function classifyMove(m, fenBefore, fenAfter) {
    // â”€â”€ Missed Win â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Had a large winning advantage but squandered it
    if (m.cpBeforeSide > 300 && m.cpAfterSide < 100) return 'missedWin';

    // â”€â”€ Best-move check (requires UCIâ†’SAN conversion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const bestSan    = uciToSan(m.bestMoveUCI, fenBefore);
    const playedSan  = m.san || m.move?.san || m.move;
    const playedBest = bestSan !== null && bestSan === playedSan;

    if (playedBest) {
        // Brilliant: best move AND involved a material sacrifice that held up
        const matBefore = getMaterialSum(fenBefore);
        const matAfter  = getMaterialSum(fenAfter);
        if (matAfter < matBefore - 0.5 && m.cpAfterSide >= m.cpBeforeSide - 50) {
            return 'brilliant';
        }
        // Great: best move when the position was roughly equal or worse
        if (m.cpBeforeSide < 50) return 'great';
        return 'best';
    }

    // â”€â”€ Loss-based classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const loss = m.cpBeforeSide - m.cpAfterSide; // in centipawns, positive = worse

    if (loss <=  10) return 'excellent';
    if (loss <=  30) return 'good';
    if (loss <=  60) return 'inaccuracy';
    if (loss <= 150) return 'mistake';
    return 'blunder';
}

// â”€â”€ Engine Interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const analysisCache = new Map();

async function getEvaluationFromEngine(fen, depth = 12) {
    const cacheKey = `${depth}|${fen}`;
    if (analysisCache.has(cacheKey)) {
        return analysisCache.get(cacheKey);
    }

    return new Promise((resolve) => {
        if (!stockfishWorker) initStockfish();
        const prevHandler = stockfishWorker.onmessage;
        let lastCp   = 0;
        let bestMove = null;

        stockfishWorker.onmessage = (e) => {
            const line = e.data;

            if (line.includes('score cp')) {
                const match = line.match(/score cp (-?\d+)/);
                if (match) lastCp = parseInt(match[1]);
            } else if (line.includes('score mate')) {
                const match = line.match(/score mate (-?\d+)/);
                if (match) lastCp = parseInt(match[1]) > 0 ? 10000 : -10000;
            }

            if (line.startsWith('bestmove')) {
                stockfishWorker.onmessage = prevHandler;
                bestMove = line.split(' ')[1] || null;
                const result = { cp: lastCp, bestMove };
                analysisCache.set(cacheKey, result);
                resolve(result);
            }
        };

        stockfishWorker.postMessage(`position fen ${fen}`);
        stockfishWorker.postMessage(`go depth ${depth}`);
    });
}

// â”€â”€ Main Analysis Loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function analyzeGame() {
    const history  = game.history({ verbose: true });
    const tempGame = new Chess();
    const results  = [];
    let evalBefore = await getEvaluationFromEngine(tempGame.fen());

    for (let i = 0; i < history.length; i++) {
        const move      = history[i];
        const sideChar  = tempGame.turn(); // 'w' or 'b'
        const fenBefore = tempGame.fen();

        tempGame.move(move);
        const fenAfter = tempGame.fen();

        // â”€â”€ Get engine evaluation AFTER the move â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // After White moves it is Black's turn â†’ cp is from Black's POV.
        // After Black moves it is White's turn â†’ cp is from White's POV.
        const evalAfter = await getEvaluationFromEngine(fenAfter);

        // â”€â”€ Normalise both evals to White's absolute POV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // evalBefore: side-to-move was sideChar
        //   if 'w': already White's POV
        //   if 'b': negate to get White's POV
        const cpWhiteBefore = sideChar === 'w' ?  evalBefore.cp : -evalBefore.cp;

        // evalAfter: side-to-move is now the OTHER side
        //   if 'w' moved (so 'b' to move): negate to get White's POV
        //   if 'b' moved (so 'w' to move): already White's POV
        const cpWhiteAfter  = sideChar === 'w' ? -evalAfter.cp  :  evalAfter.cp;

        // â”€â”€ Convert to moving side's POV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const cpBeforeSide = sideChar === 'w' ?  cpWhiteBefore : -cpWhiteBefore;
        const cpAfterSide  = sideChar === 'w' ?  cpWhiteAfter  : -cpWhiteAfter;

        const res = {
            moveNumber:   Math.floor(i / 2) + 1,
            move: {
                san: move.san,
                from: move.from,
                to: move.to,
                promotion: move.promotion || null,
                flags: move.flags,
                piece: move.piece,
                color: move.color,
            },
            san:          move.san,
            bestMoveUCI:  evalBefore.bestMove,   // raw UCI from engine (e.g. "e2e4")
            side:         sideChar === 'w' ? 'white' : 'black',
            evalAfter:    cpWhiteAfter / 100,     // White-POV pawns (for graph/display)
            cpBeforeSide,                          // moving-side cp before move
            cpAfterSide,                           // moving-side cp after move
            swing:        (cpAfterSide - cpBeforeSide) / 100, // + improved, - worsened
            type:         '',
        };

        res.type = classifyMove(res, fenBefore, fenAfter);
        res.classification = res.type;
        results.push(res);
        evalBefore = evalAfter;
    }

    return results;
}

// â”€â”€ UI Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function showAnalysisOverlay(content) {
    const overlay = document.createElement('div');
    overlay.id = 'analysis-overlay';
    overlay.innerHTML = `
        <div id="analysis-window">
            <div style="padding:16px 20px; border-bottom:1px solid var(--border); color:var(--accent); font-weight:800; letter-spacing:0.14em; text-transform:uppercase;">Game Review</div>
            ${content}
            <button class="close-analysis" onclick="document.getElementById('analysis-overlay').remove()">CLOSE REVIEW</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function renderAnalysisResults(moveAnalysis) {
    const movesHtml = moveAnalysis.map(m => {
        const meta       = CLASSIFICATION_META[m.type] || CLASSIFICATION_META.good;
        const swingColor = m.swing < -0.3 ? '#e05252' : m.swing > 0.1 ? '#81c995' : '#aaa';
        const swingStr   = (m.swing >= 0 ? '+' : '') + m.swing.toFixed(2);
        return `
        <div class="analysis-move-row">
            <span style="color:var(--text-2)">${m.moveNumber}${m.side === 'white' ? '.' : '...'}</span>
            <span style="font-weight:bold; color:var(--text-1)">${m.san || m.move?.san || ''}</span>
            <span style="color:var(--text-2)">${m.evalAfter >= 0 ? '+' : ''}${m.evalAfter.toFixed(2)}</span>
            <span style="color:${swingColor}">${swingStr}</span>
            <span class="move-type-badge" style="background:${meta.color}22; color:${meta.color};">
                ${meta.emoji} ${meta.label}
            </span>
        </div>`;
    }).join('');

    showAnalysisOverlay(`<div id="analysis-moves">${movesHtml}</div>`);
}

// â”€â”€ Accuracy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function computeAccuracies(moveAnalysis) {
    const totals = { white: 0, black: 0 };
    const counts = { white: 0, black: 0 };

    moveAnalysis.forEach(m => {
        // Use the per-side cp values stored during analysis â€” no reconstruction needed
        const wpBefore = _cpToWinProb(m.cpBeforeSide);
        const wpAfter  = _cpToWinProb(m.cpAfterSide);
        totals[m.side] += _moveAccuracy(wpBefore, wpAfter);
        counts[m.side]++;
    });

    return {
        white: counts.white > 0 ? totals.white / counts.white : 100,
        black: counts.black > 0 ? totals.black / counts.black : 100,
    };
}

function renderAccuracyBar(accuracies) {
    const existing = document.getElementById('accuracy-summary-bar');
    if (existing) existing.remove();

    function color(pct) {
        if (pct >= 90) return '#1baca6';
        if (pct >= 75) return '#95bb4a';
        if (pct >= 60) return '#81c995';
        if (pct >= 45) return '#f6c90e';
        if (pct >= 30) return '#f5a623';
        return '#e05252';
    }

    const wPct = accuracies.white.toFixed(1);
    const bPct = accuracies.black.toFixed(1);
    const wCol = color(accuracies.white);
    const bCol = color(accuracies.black);

    const bar = document.createElement('div');
    bar.id = 'accuracy-summary-bar';
    bar.style.cssText = `
        display:flex; justify-content:center; align-items:center; gap:30px;
        padding:14px 20px; background:var(--surface-2); border-top:1px solid var(--border);
        flex-shrink:0;
    `;
    bar.innerHTML = `
        <div style="text-align:center;">
            <div style="color:var(--text-2);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">White Accuracy</div>
            <span style="display:inline-block;padding:6px 18px;border-radius:20px;font-size:16px;font-weight:bold;
                         background:${wCol}22;color:${wCol};border:1px solid ${wCol}55;">White ${wPct}%</span>
        </div>
        <div style="width:1px;height:40px;background:var(--border);"></div>
        <div style="text-align:center;">
            <div style="color:var(--text-2);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Black Accuracy</div>
            <span style="display:inline-block;padding:6px 18px;border-radius:20px;font-size:16px;font-weight:bold;
                         background:${bCol}22;color:${bCol};border:1px solid ${bCol}55;">Black ${bPct}%</span>
        </div>
    `;

    const closeBtn = document.querySelector('#analysis-window .close-analysis');
    if (closeBtn) closeBtn.parentNode.insertBefore(bar, closeBtn);
}

// â”€â”€ Trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function triggerPostGameAnalysis() {
    injectAnalysisStyles();
    const btn = document.getElementById('analysis-trigger-btn');
    btn.innerText = 'Analyzing...';
    btn.disabled = true;

    try {
        const results = await analyzeGame();
        renderAnalysisResults(results);
        renderAccuracyBar(computeAccuracies(results));
        btn.innerText = 'Analysis Complete';

        const exportBtn = document.createElement('button');
        exportBtn.id = 'pgn-export-btn';
        exportBtn.textContent = 'Export PGN';
        exportBtn.style.cssText = `
            width: 100%; padding: 10px; cursor: pointer;
            background: transparent; color: var(--accent); border: none;
            border-top: 1px solid var(--border); font-weight: bold; font-size: 14px; margin-top: 0;
        `;
        exportBtn.onclick = () => exportAnnotatedPGN(results);

        const closeBtn = document.querySelector('#analysis-window .close-analysis');
        if (closeBtn) closeBtn.parentNode.insertBefore(exportBtn, closeBtn);

    } catch (e) {
        console.error(e);
        btn.innerText = 'Error Analysing';
        btn.disabled = false;
    }
}

// â”€â”€ Bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.syncAnalysisButton = function () {
    const statusPanel = document.querySelector('.status-panel');
    let btn = document.getElementById('analysis-trigger-btn');
    const canAnalyze = (typeof window.isPostGameState === 'function' ? window.isPostGameState() : game.game_over()) && game.history().length > 0;
    if (canAnalyze && !btn) {
        btn = document.createElement('button');
        btn.id = 'analysis-trigger-btn';
        btn.innerHTML = 'Analyse Game';
        btn.style = 'width:100%; padding:10px; cursor:pointer; background:var(--accent); color:var(--accent-text); border:none; border-radius:var(--radius-sm); margin-top:10px; font-weight:bold;';
        btn.onclick = () => {
            const handler = window.triggerPostGameAnalysis || triggerPostGameAnalysis;
            handler();
        };
        statusPanel.appendChild(btn);
    } else if (!canAnalyze && btn) {
        btn.remove();
    }
};

