/**
 * REVIEW MODE MODULE - OPTIMIZED & THEME MATCHED
 * Split-screen post-game analysis viewer.
 * Non-destructive — does not touch game or gameplay logic.
 */

(() => {
    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────
    let reviewMoves   = [];   
    let replayGame    = null; 
    let currentIndex  = -1;  
    let fenHistory    = [];   

    function getMoveSan(moveRecord) {
        return moveRecord?.san || moveRecord?.move?.san || moveRecord?.move || '';
    }

    function getClassification(moveRecord) {
        return moveRecord?.classification || moveRecord?.type || 'good';
    }

    const reviewPieceIcons = {
        p: 'fa-chess-pawn', r: 'fa-chess-rook', n: 'fa-chess-knight',
        b: 'fa-chess-bishop', q: 'fa-chess-queen', k: 'fa-chess-king'
    };

    // ─────────────────────────────────────────────
    //  STYLES (Matched to index.html)
    // ─────────────────────────────────────────────
    function injectReviewStyles() {
        if (document.getElementById('review-mode-styles')) return;
        const style = document.createElement('style');
        style.id = 'review-mode-styles';
        style.textContent = `
            #review-overlay {
                position: fixed; inset: 0;
                background: var(--bg, #0d0d0f);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                font-family: var(--font-ui, 'Syne', sans-serif);
                color: #d4cfc9;
            }
            #review-topbar {
                display: flex; align-items: center; justify-content: space-between;
                padding: 12px 24px;
                background: var(--surface-1, #111114);
                border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
                flex-shrink: 0;
            }
            #review-topbar h2 {
                margin: 0; font-size: 14px; font-weight: 800;
                color: var(--accent, #4ecca3);
                letter-spacing: 0.12em; text-transform: uppercase;
            }
            #review-actions { display: flex; align-items: center; gap: 10px; }
            #review-export-btn {
                padding: 8px 16px; background: transparent;
                border: 1px solid var(--border); color: var(--accent, #4ecca3);
                border-radius: var(--radius-sm, 4px); cursor: pointer;
                font-size: 11px; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.06em; transition: all 0.2s ease;
            }
            #review-export-btn:hover {
                background: var(--accent, #4ecca3);
                color: #0d1a14;
                border-color: transparent;
            }
            #review-exit-btn {
                padding: 8px 20px; background: var(--surface-3, #1e1e24);
                border: 1px solid var(--border); color: white;
                border-radius: var(--radius-sm, 4px); cursor: pointer;
                font-size: 11px; font-weight: 800; text-transform: uppercase;
                transition: all 0.2s ease;
            }
            #review-exit-btn:hover { background: var(--accent); color: #0d1a14; border-color: transparent; }

            #review-body { display: grid; grid-template-columns: 1fr 400px; flex: 1; overflow: hidden; }
            #review-left { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 20px; background: var(--bg); }
            #review-board-area { display: flex; align-items: stretch; gap: 12px; }

            /* Eval Bar */
            #eval-bar-wrap {
                width: 14px; border-radius: 2px; overflow: hidden;
                background: var(--surface-3); display: flex; flex-direction: column;
                position: relative; border: 1px solid var(--border);
            }
            #eval-bar-white { background: var(--sq-light, #d4cfc5); transition: height 0.5s cubic-bezier(0.2, 1, 0.3, 1); width: 100%; }
            #eval-bar-black { background: #111; flex: 1; }
            #eval-bar-label {
                position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
                font-size: 10px; color: var(--accent); font-family: var(--font-mono);
                writing-mode: vertical-rl; opacity: 0.7; pointer-events: none;
            }

            /* Board */
            #review-board {
                display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr);
                width: 520px; height: 520px; border-radius: var(--radius-md, 8px);
                overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6); border: 1px solid var(--border);
            }
            #review-board-wrap { position: relative; }
            #review-board .sq { display: flex; justify-content: center; align-items: center; position: relative; font-size: 40px; }
            #review-board .sq.light { background-color: var(--sq-light, #d4cfc5); }
            #review-board .sq.dark  { background-color: var(--sq-dark, #4a7c59); }
            #review-board .sq.rv-last-from { background-color: var(--sq-light-hl, rgba(255, 255, 100, 0.55)) !important; }
            #review-board .sq.rv-last-to   { background-color: var(--sq-dark-hl, rgba(230, 230, 50, 0.55)) !important; }
            
            .rv-coord-file, .rv-coord-rank { position: absolute; font-size: 10px; font-family: var(--font-mono); color: var(--surface-3); opacity: 0.6; pointer-events: none; }
            .rv-coord-file { bottom: 2px; right: 4px; }
            .rv-coord-rank { top: 2px; left: 4px; }

            #review-arrow-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20; }

            /* Controls */
            #review-controls { display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--surface-2); border-radius: var(--radius-lg, 12px); border: 1px solid var(--border); }
            .rv-btn { width: 44px; height: 44px; background: var(--surface-3); border: 1px solid var(--border); border-radius: 4px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
            .rv-btn:hover:not(:disabled) { background: var(--accent); color: #0d1a14; transform: translateY(-2px); }
            #rv-move-counter { font-size: 12px; font-family: var(--font-mono); color: var(--accent); min-width: 90px; text-align: center; }

            /* Right Panel */
            #review-right { display: flex; flex-direction: column; background: var(--surface-2); border-left: 1px solid var(--border); overflow: hidden; }
            #review-graph-wrap { padding: 16px; background: var(--surface-1); border-bottom: 1px solid var(--border); }
            #review-eval-canvas { width: 100%; height: 100px; background: var(--bg); border-radius: 4px; }
            
            #review-move-card { padding: 20px; background: var(--surface-2); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }
            #rv-badge { padding: 6px 14px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            #rv-move-san { font-size: 24px; font-weight: 800; color: white; }
            
            #review-move-list { flex: 1; overflow-y: auto; }
            .rv-move-pair { display: grid; grid-template-columns: 44px 1fr 1fr; border-bottom: 1px solid var(--border); }
            .rv-move-num { padding: 10px; font-size: 11px; color: rgba(255,255,255,0.2); background: var(--surface-1); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); }
            .rv-move-cell { padding: 10px 14px; font-size: 14px; font-family: var(--font-mono); cursor: pointer; display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--border); }
            .rv-move-cell.rv-active { background: rgba(78, 204, 163, 0.1); border-left: 2px solid var(--accent); }
            
            #review-accuracy-bar { padding: 16px 20px; background: var(--surface-1); border-top: 1px solid var(--border); display: flex; gap: 24px; }
            .rv-acc-chip { padding: 3px 8px; border-radius: 2px; font-size: 10px; font-weight: 800; font-family: var(--font-mono); }
        `;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────
    //  BOARD RENDERING (Optimized Fix)
    // ─────────────────────────────────────────────
    function setupReviewBoard() {
        const boardEl = document.getElementById('review-board');
        if (!boardEl || boardEl.children.length > 0) return; 

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const sq = document.createElement('div');
                const sqName = String.fromCharCode(97 + j) + (8 - i);
                sq.classList.add('sq', (i + j) % 2 !== 0 ? 'dark' : 'light');
                sq.dataset.pos = sqName;
                if (j === 0) { const l = document.createElement('span'); l.className='rv-coord-rank'; l.textContent=8-i; sq.appendChild(l); }
                if (i === 7) { const l = document.createElement('span'); l.className='rv-coord-file'; l.textContent=String.fromCharCode(97+j); sq.appendChild(l); }
                boardEl.appendChild(sq);
            }
        }
    }

    function renderReviewBoard(highlightFrom, highlightTo) {
        setupReviewBoard();
        const boardState = replayGame.board();
        const squares = document.querySelectorAll('#review-board .sq');

        squares.forEach(sq => {
            const sqName = sq.dataset.pos;
            const fileIdx = sqName.charCodeAt(0) - 97;
            const rankIdx = 8 - parseInt(sqName[1]);

            sq.classList.toggle('rv-last-from', sqName === highlightFrom);
            sq.classList.toggle('rv-last-to', sqName === highlightTo);

            const piece = boardState[rankIdx][fileIdx];
            let pieceIcon = sq.querySelector('.piece');
            
            if (!piece) { if (pieceIcon) pieceIcon.remove(); } 
            else {
                const iconClass = reviewPieceIcons[piece.type];
                const color = piece.color === 'w' ? '#fff' : '#0d0d0f';
                if (!pieceIcon) {
                    pieceIcon = document.createElement('i');
                    pieceIcon.classList.add('fa-solid', 'piece');
                    sq.appendChild(pieceIcon);
                }
                if (!pieceIcon.classList.contains(iconClass)) pieceIcon.className = `fa-solid ${iconClass} piece`;
                pieceIcon.style.color = color;
            }
        });
    }

    function clearBestMoveArrow() {
        const svg = document.getElementById('review-arrow-svg');
        if (svg) svg.innerHTML = '';
    }

    function drawBestMoveArrow(bestMoveUCI) {
        const svg = document.getElementById('review-arrow-svg');
        const boardEl = document.getElementById('review-board');
        if (!svg || !boardEl) return;

        if (!bestMoveUCI || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(bestMoveUCI)) {
            clearBestMoveArrow();
            return;
        }

        const from = bestMoveUCI.slice(0, 2).toLowerCase();
        const to = bestMoveUCI.slice(2, 4).toLowerCase();
        const boardRect = boardEl.getBoundingClientRect();
        const sqSize = boardRect.width / 8;

        const centerOf = (square) => {
            const file = square.charCodeAt(0) - 97;
            const rank = parseInt(square[1], 10);
            const row = 8 - rank;
            return { x: (file + 0.5) * sqSize, y: (row + 0.5) * sqSize };
        };

        const start = centerOf(from);
        const end = centerOf(to);

        svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
        svg.innerHTML = `
            <defs>
                <marker id="rv-best-arrowhead" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="rgba(96,214,152,0.95)"></path>
                </marker>
            </defs>
            <line
                x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"
                stroke="rgba(96,214,152,0.95)"
                stroke-width="9"
                stroke-linecap="round"
                marker-end="url(#rv-best-arrowhead)"
            ></line>
            <circle cx="${start.x}" cy="${start.y}" r="9" fill="rgba(96,214,152,0.35)"></circle>
        `;
    }

    // ─────────────────────────────────────────────
    //  CORE LOGIC (Preserved)
    // ─────────────────────────────────────────────
    function goToMove(index) {
        currentIndex = Math.max(-1, Math.min(reviewMoves.length - 1, index));
        replayGame.load(fenHistory[currentIndex + 1]);
        let hFrom = null, hTo = null;
        if (currentIndex >= 0) {
            const m = reviewMoves[currentIndex];
            hFrom = m.move?.from || null;
            hTo = m.move?.to || null;
            updateMoveCard(m); updateEvalBar(m.evalAfter);
            drawBestMoveArrow(m.bestMoveUCI);
        } else {
            updateMoveCard(null); updateEvalBar(0);
            clearBestMoveArrow();
        }
        renderReviewBoard(hFrom, hTo);
        renderEvalGraph(currentIndex);
        updateMoveListHighlight();
        updateCounter();
    }

    function updateMoveCard(m) {
        const badge = document.getElementById('rv-badge');
        const san = document.getElementById('rv-move-san');
        if (!m) { badge.style.display = 'none'; san.textContent = 'Start'; return; }
        const classification = getClassification(m);
        const meta = CLASSIFICATION_META[classification] || CLASSIFICATION_META.good;
        badge.style.display = 'block';
        badge.textContent = meta.label || classification;
        badge.style.background = meta.color;
        san.textContent = getMoveSan(m);
    }

    function updateEvalBar(evalScore) {
        const barWhite = document.getElementById('eval-bar-white');
        const label = document.getElementById('eval-bar-label');
        if (!barWhite) return;
        const whitePct = ((Math.max(-10, Math.min(10, evalScore)) + 10) / 20) * 100;
        barWhite.style.height = whitePct + '%';
        if (label) label.textContent = evalScore.toFixed(1);
    }

    function updateMoveListHighlight() {
        document.querySelectorAll('.rv-move-cell').forEach(el => el.classList.remove('rv-active'));
        const active = document.querySelector(`.rv-move-cell[data-idx="${currentIndex}"]`);
        if (active) { active.classList.add('rv-active'); active.scrollIntoView({ block: 'nearest' }); }
    }

    function updateCounter() {
        const el = document.getElementById('rv-move-counter');
        if (el) el.textContent = `Move ${Math.floor((currentIndex + 2) / 2)} / ${Math.floor((reviewMoves.length + 1) / 2)}`;
    }

    function renderEvalGraph(highlightIndex) {
        const canvas = document.getElementById('review-eval-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.offsetWidth;
        const H = canvas.height = 100;
        ctx.fillStyle = '#0d0d0f'; ctx.fillRect(0, 0, W, H);
        if (reviewMoves.length === 0) return;
        const evals = reviewMoves.map(m => Math.max(-10, Math.min(10, m.evalAfter)));
        const stepX = W / (evals.length + 1);
        ctx.beginPath(); ctx.moveTo(0, H/2);
        evals.forEach((e, i) => ctx.lineTo((i+1)*stepX, H/2 - (e/10)*(H/2 - 8)));
        ctx.strokeStyle = '#4ecca3'; ctx.lineWidth = 2; ctx.stroke();
    }

    // ─────────────────────────────────────────────
    //  LAUNCHER
    // ─────────────────────────────────────────────
    window.launchReviewMode = (moveAnalysis) => {
        reviewMoves = moveAnalysis;
        replayGame = new Chess();
        fenHistory = [replayGame.fen()];
        const temp = new Chess();
        moveAnalysis.forEach(m => {
            const appliedMove = m.move?.from ? temp.move(m.move) : temp.move(getMoveSan(m));
            if (appliedMove) {
                fenHistory.push(temp.fen());
            }
        });

        injectReviewStyles();
        document.getElementById('review-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'review-overlay';
        overlay.innerHTML = `
            <div id="review-topbar">
                <h2>Game Review</h2>
                <div id="review-actions">
                    <button id="review-export-btn">Export PGN</button>
                    <button id="review-exit-btn">Close Review</button>
                </div>
            </div>
            <div id="review-body">
                <div id="review-left">
                    <div id="review-board-area">
                        <div id="eval-bar-wrap"><div id="eval-bar-white"></div><div id="eval-bar-black"></div><div id="eval-bar-label">0.0</div></div>
                        <div id="review-board-wrap"><div id="review-board"></div><svg id="review-arrow-svg"></svg></div>
                    </div>
                    <div id="review-controls">
                        <button class="rv-btn" id="rv-prev"><i class="fa-solid fa-angle-left"></i></button>
                        <div id="rv-move-counter">Move 0 / 0</div>
                        <button class="rv-btn" id="rv-next"><i class="fa-solid fa-angle-right"></i></button>
                    </div>
                </div>
                <div id="review-right">
                    <div id="review-graph-wrap"><canvas id="review-eval-canvas"></canvas></div>
                    <div id="review-move-card"><div id="rv-badge"></div><div id="rv-move-san">Start</div></div>
                    <div id="review-move-list"></div>
                    <div id="review-accuracy-bar"></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const listEl = document.getElementById('review-move-list');
        for (let i = 0; i < reviewMoves.length; i += 2) {
            const pair = document.createElement('div'); pair.className = 'rv-move-pair';
            const num = document.createElement('div'); num.className = 'rv-move-num'; num.textContent = Math.floor(i / 2) + 1;
            pair.appendChild(num);
            [i, i + 1].forEach(idx => {
                if (idx < reviewMoves.length) {
                    const m = reviewMoves[idx];
                    const classification = getClassification(m);
                    const meta = CLASSIFICATION_META[classification] || CLASSIFICATION_META.good;
                    const cell = document.createElement('div'); cell.className = 'rv-move-cell'; cell.dataset.idx = idx;
                    cell.innerHTML = `<span>${getMoveSan(m)}</span><span style="color:${meta.color}">${meta.emoji || ''}</span>`;
                    cell.onclick = () => goToMove(idx);
                    pair.appendChild(cell);
                }
            });
            listEl.appendChild(pair);
        }

        document.getElementById('review-export-btn').onclick = () => {
            if (typeof exportAnnotatedPGN === 'function') {
                exportAnnotatedPGN(reviewMoves);
            }
        };
        document.getElementById('review-exit-btn').onclick = () => overlay.remove();
        document.getElementById('rv-prev').onclick = () => goToMove(currentIndex - 1);
        document.getElementById('rv-next').onclick = () => goToMove(currentIndex + 1);
        goToMove(-1);
    };
})();
