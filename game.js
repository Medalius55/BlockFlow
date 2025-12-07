const BOARD_SIZE = 10;
let board = [];
let score = 0;
let trayPieces = [];
let selectedPieceIndex = null;
let transparentDragImage = null;
const dragCanvasCache = new Map();
let dragGhost = null;
const PIECE_COLORS = ['#6fb6ff', '#b6a6ff', '#9de0c5', '#ffd1a9', '#ffb3c8', '#9dd7ff'];
let boardListenersAttached = false;
let history = [];
const LINE_CLEAR_POINTS = BOARD_SIZE;
const FULL_CLEAR_BONUS = BOARD_SIZE * BOARD_SIZE;
const HIGH_SCORE_KEY = 'blockflow_highscore';
const THEME_KEY = 'blockflow_theme';
let highScore = 0;
let isGameOver = false;
const BASE_PIECES = [
    [[1]],
    [[1, 1]],
    [[1, 0], [0, 1]],
    [[1, 1, 1]],
    [[1, 1, 1, 1]],
    [[1], [1]],
    [[1], [1], [1]],
    [[1], [1], [1], [1]],
    [[1, 1], [1, 1]],
    [[1, 0], [1, 0], [1, 1]],       // L
    [[0, 1], [0, 1], [1, 1]],       // J
    [[1, 1, 1], [0, 1, 0]],         // T
    [[0, 1, 1], [1, 1, 0]],         // S
    [[1, 1, 0], [0, 1, 1]],         // Z
    [[1, 1, 1], [1, 0, 0]],         // L long
    [[1, 1, 1], [0, 0, 1]],         // J long
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]], // 3x3 square
    [[1, 1, 1], [1, 1, 1]],            // 2x3 rectangle
];
const ALL_PIECES = generateAllOrientations(BASE_PIECES);

// Initialize game
function init() {
    board = createEmptyBoard();
    loadHighScore();
    loadTheme();
    bindOverlay();
    renderBoard();
    generateTray();
    renderTray();
    updateScore();
    showOverlay('Relax and fit the pieces. Ready?', 'Start Game');
    
    document.getElementById('newGame').addEventListener('click', startNewGame);
    document.getElementById('undo').addEventListener('click', undoMove);
    document.getElementById('hint').addEventListener('click', showHint);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
        updateThemeButton();
    }
}

// Create empty 10x10 board
function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
}

// Render board as grid
function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    if (!boardListenersAttached) {
        boardEl.addEventListener('dragover', handleBoardDragOver);
        boardEl.addEventListener('drop', handleBoardDrop);
        boardEl.addEventListener('touchend', handleBoardTouchEnd, { passive: false });
        boardListenersAttached = true;
    }
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (board[row][col]) {
                cell.classList.add('filled');
                cell.style.setProperty('--filled-color', typeof board[row][col] === 'string' ? board[row][col] : 'var(--accent-green)');
            }
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', handleCellClick);
            cell.addEventListener('dragover', handleCellDragOver);
            cell.addEventListener('drop', handleCellDrop);
            boardEl.appendChild(cell);
        }
    }
}

// Generate dummy pieces for tray (placeholder)
function generateTray() {
    trayPieces = [];
    const pool = [...ALL_PIECES];
    const picks = 3;
    for (let i = 0; i < picks && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const base = pool.splice(idx, 1)[0];
        const piece = clonePiece(base);
        piece.color = getRandomColor();
        trayPieces.push(piece);
    }
}

// Render tray pieces
function renderTray() {
    const trayEl = document.getElementById('tray');
    trayEl.innerHTML = '';
    
    trayPieces.forEach((piece, index) => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        pieceEl.dataset.pieceIndex = index;
        pieceEl.draggable = true;
        const color = piece.color || getRandomColor();
        
        const rows = piece.length;
        const cols = piece[0].length;
        pieceEl.style.gridTemplateColumns = `repeat(${cols}, var(--piece-size))`;
        pieceEl.style.gridTemplateRows = `repeat(${rows}, var(--piece-size))`;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = document.createElement('div');
                cell.className = piece[row][col] === 1 ? 'piece-cell' : 'piece-cell empty';
                if (piece[row][col] === 1) {
                    cell.style.setProperty('--piece-color', color);
                }
                pieceEl.appendChild(cell);
            }
        }
        
        pieceEl.addEventListener('click', handlePieceClick);
        pieceEl.addEventListener('dragstart', handlePieceDragStart);
        pieceEl.addEventListener('dragend', handlePieceDragEnd);
        pieceEl.addEventListener('touchstart', handlePieceTouchStart, { passive: false });
        trayEl.appendChild(pieceEl);
    });
}

function handleCellClick(e) {
    if (selectedPieceIndex === null || isGameOver) return;
    
    const dropPos = getDropPosition(e);
    if (!dropPos) return;
    const { row, col } = dropPos;
    const piece = trayPieces[selectedPieceIndex];
    if (!piece) {
        selectedPieceIndex = null;
        return;
    }
    
    const pieceColor = getPieceColor(selectedPieceIndex);
    
    const pieceRows = piece.length;
    const pieceCols = piece[0].length;
    const maxRowStart = BOARD_SIZE - pieceRows;
    const maxColStart = BOARD_SIZE - pieceCols;
    const startRow = Math.max(0, Math.min(maxRowStart, row - Math.floor(pieceRows / 2)));
    const startCol = Math.max(0, Math.min(maxColStart, col - Math.floor(pieceCols / 2)));
    
    for (let r = 0; r < pieceRows; r++) {
        for (let c = 0; c < pieceCols; c++) {
            if (piece[r][c] === 1 && board[startRow + r][startCol + c]) {
                shakeBoard();
                selectedPieceIndex = null;
                return;
            }
        }
    }
    
    pushHistory();
    
    let cellsPlaced = 0;
    for (let r = 0; r < pieceRows; r++) {
        for (let c = 0; c < pieceCols; c++) {
            if (piece[r][c] === 1) {
                board[startRow + r][startCol + c] = pieceColor;
                cellsPlaced += 1;
            }
        }
    }
    score += cellsPlaced;
    
    const cleared = clearLines();
    score += (cleared.rows * LINE_CLEAR_POINTS) + (cleared.cols * LINE_CLEAR_POINTS);
    if (isBoardClear()) {
        score += FULL_CLEAR_BONUS;
    }
    
    trayPieces.splice(selectedPieceIndex, 1);
    selectedPieceIndex = null;
    renderBoard();
    if (trayPieces.length === 0) {
        generateTray();
    }
    renderTray();
    updateScore();
    checkGameOver();
}

function handlePieceClick(e) {
    selectedPieceIndex = parseInt(e.currentTarget.dataset.pieceIndex);
}

function handlePieceDragStart(e) {
    selectedPieceIndex = parseInt(e.currentTarget.dataset.pieceIndex);
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'piece');
        const piece = trayPieces[selectedPieceIndex];
        const dragImage = getPieceDragElement(piece);
        e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    }
}

function handleCellDragOver(e) {
    if (selectedPieceIndex === null) return;
    e.preventDefault();
}

function handleCellDrop(e) {
    e.preventDefault();
    handleCellClick(e);
}

function handleBoardDragOver(e) {
    if (selectedPieceIndex === null) return;
    e.preventDefault();
}

function handleBoardDrop(e) {
    e.preventDefault();
    handleCellClick(e);
}

function handlePieceTouchStart(e) {
    selectedPieceIndex = parseInt(e.currentTarget.dataset.pieceIndex);
    e.preventDefault();
}

function handleBoardTouchEnd(e) {
    if (selectedPieceIndex === null || isGameOver) return;
    e.preventDefault();
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target) return;
    handleCellClick({
        target,
        clientX: touch.clientX,
        clientY: touch.clientY
    });
}

function handlePieceDragEnd() {
    if (dragGhost && dragGhost.parentNode) {
        dragGhost.parentNode.removeChild(dragGhost);
    }
    dragGhost = null;
}

function getPieceDragCanvas(piece) {
    if (!piece) {
        if (!transparentDragImage) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            transparentDragImage = canvas;
        }
        return transparentDragImage;
    }
    
    const key = piece.map(row => row.join('')).join('|');
    if (dragCanvasCache.has(key)) return dragCanvasCache.get(key);
    
    const cellSize = 24;
    const padding = 4;
    const rows = piece.length;
    const cols = piece[0].length;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellSize + (cols - 1) * 3 + padding * 2;
    canvas.height = rows * cellSize + (rows - 1) * 3 + padding * 2;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(255,255,255,0.001)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece[r][c] !== 1) continue;
            const x = padding + c * (cellSize + 3);
            const y = padding + r * (cellSize + 3);
            const gradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
            gradient.addColorStop(0, '#b6a6ff');
            gradient.addColorStop(1, '#6fb6ff');
            ctx.fillStyle = gradient;
            roundRect(ctx, x, y, cellSize, cellSize, 6);
        }
    }
    
    dragCanvasCache.set(key, canvas);
    return canvas;
}

function getPieceDragElement(piece) {
    if (!piece) {
        return getPieceDragCanvas(piece);
    }
    const color = piece.color || getPieceColor(selectedPieceIndex);
    
    if (dragGhost && dragGhost.parentNode) {
        dragGhost.parentNode.removeChild(dragGhost);
    }
    
    const ghost = document.createElement('div');
    ghost.className = 'piece';
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '1';
    ghost.style.transform = 'none';
    ghost.style.boxShadow = 'none';
    ghost.style.padding = '0';
    ghost.style.background = 'transparent';
    ghost.style.border = 'none';
    
    const boardEl = document.getElementById('board');
    const sampleCell = boardEl ? boardEl.querySelector('.cell') : null;
    const cellSize = sampleCell ? parseFloat(getComputedStyle(sampleCell).width) : 30;
    const gridGap = boardEl ? parseFloat(getComputedStyle(boardEl).gap || 4) : 4;
    
    const rows = piece.length;
    const cols = piece[0].length;
    ghost.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    ghost.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    ghost.style.gap = `${gridGap}px`;
    const totalWidth = cols * cellSize + (cols - 1) * gridGap;
    const totalHeight = rows * cellSize + (rows - 1) * gridGap;
    ghost.style.width = `${totalWidth}px`;
    ghost.style.height = `${totalHeight}px`;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = piece[r][c] === 1 ? 'piece-cell' : 'piece-cell empty';
            if (piece[r][c] === 1) {
                cell.style.setProperty('--piece-color', color);
            }
            ghost.appendChild(cell);
        }
    }
    
    document.body.appendChild(ghost);
    dragGhost = ghost;
    return ghost;
}

function getRandomColor() {
    return PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
}

function getPieceColor(index) {
    const piece = trayPieces[index];
    if (piece) {
        if (!piece.color) piece.color = getRandomColor();
        return piece.color;
    }
    return getRandomColor();
}

function clonePiece(shape) {
    return shape.map(row => row.slice());
}

function cloneBoard(srcBoard) {
    return srcBoard.map(row => row.slice());
}

function cloneTray(srcTray) {
    return srcTray.map(piece => {
        const cloned = clonePiece(piece);
        cloned.color = piece.color;
        return cloned;
    });
}

function loadHighScore() {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    const parsed = stored ? parseInt(stored, 10) : 0;
    highScore = Number.isFinite(parsed) ? parsed : 0;
    const el = document.getElementById('highScore');
    if (el) el.textContent = highScore;
}

function saveHighScore() {
    try {
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    } catch (_) {
        // ignore storage errors
    }
}

function bindOverlay() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            startNewGame();
        });
    }
}

function showOverlay(message, buttonText) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const msg = document.getElementById('overlayMessage');
    const btn = document.getElementById('startBtn');
    if (msg) msg.textContent = message;
    if (btn) btn.textContent = buttonText || 'Start';
    overlay.style.display = 'flex';
}

function hideOverlay() {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
}

function loadTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function saveTheme(theme) {
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
        // ignore storage errors
    }
}

function applyTheme(theme) {
    const body = document.body;
    body.classList.toggle('dark', theme === 'dark');
    updateThemeButton();
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
}

function updateThemeButton() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.textContent = document.body.classList.contains('dark') ? '🌙' : '☀️';
    }
}

function shakeBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.classList.remove('shake');
    // force reflow to restart animation
    void boardEl.offsetWidth;
    boardEl.classList.add('shake');
}

function undoMove() {
    if (history.length === 0 || isGameOver) return;
    const last = history.pop();
    board = last.board;
    trayPieces = last.trayPieces;
    score = last.score;
    selectedPieceIndex = null;
    renderBoard();
    renderTray();
    updateScore();
}

function pushHistory() {
    history.push({
        board: cloneBoard(board),
        trayPieces: cloneTray(trayPieces),
        score
    });
}

function getDropPosition(e) {
    const targetCell = e.target.closest('.cell');
    if (targetCell) {
        return {
            row: parseInt(targetCell.dataset.row),
            col: parseInt(targetCell.dataset.col)
        };
    }
    const boardEl = document.getElementById('board');
    const sampleCell = boardEl ? boardEl.querySelector('.cell') : null;
    if (!boardEl || !sampleCell) return null;
    const rect = boardEl.getBoundingClientRect();
    const boardStyle = getComputedStyle(boardEl);
    const paddingLeft = parseFloat(boardStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(boardStyle.paddingTop) || 0;
    const gap = parseFloat(boardStyle.gap) || 0;
    const cellSize = parseFloat(getComputedStyle(sampleCell).width) || 0;
    const step = cellSize + gap;
    const x = e.clientX - rect.left - paddingLeft;
    const y = e.clientY - rect.top - paddingTop;
    const col = Math.min(BOARD_SIZE - 1, Math.max(0, Math.round(x / step)));
    const row = Math.min(BOARD_SIZE - 1, Math.max(0, Math.round(y / step)));
    return { row, col };
}

function checkGameOver() {
    if (trayPieces.length === 0) return;
    for (let i = 0; i < trayPieces.length; i++) {
        const piece = trayPieces[i];
        if (hasValidPlacement(piece)) return;
    }
    isGameOver = true;
    showOverlay('No more moves! Final score: ' + score, 'Play Again');
}

function hasValidPlacement(piece) {
    const rows = piece.length;
    const cols = piece[0].length;
    for (let r = 0; r <= BOARD_SIZE - rows; r++) {
        for (let c = 0; c <= BOARD_SIZE - cols; c++) {
            let fits = true;
            for (let pr = 0; pr < rows && fits; pr++) {
                for (let pc = 0; pc < cols; pc++) {
                    if (piece[pr][pc] !== 1) continue;
                    if (board[r + pr][c + pc]) {
                        fits = false;
                        break;
                    }
                }
            }
            if (fits) return true;
        }
    }
    return false;
}

function clearLines() {
    const fullRows = [];
    const fullCols = [];
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        if (board[r].every(cell => cell)) fullRows.push(r);
    }
    
    for (let c = 0; c < BOARD_SIZE; c++) {
        let full = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (!board[r][c]) {
                full = false;
                break;
            }
        }
        if (full) fullCols.push(c);
    }
    
    fullRows.forEach(r => {
        for (let c = 0; c < BOARD_SIZE; c++) {
            board[r][c] = 0;
        }
    });
    
    fullCols.forEach(c => {
        for (let r = 0; r < BOARD_SIZE; r++) {
            board[r][c] = 0;
        }
    });
    
    return { rows: fullRows.length, cols: fullCols.length };
}

function isBoardClear() {
    return board.every(row => row.every(cell => !cell));
}

function findFirstPlacement(piece) {
    const rows = piece.length;
    const cols = piece[0].length;
    for (let r = 0; r <= BOARD_SIZE - rows; r++) {
        for (let c = 0; c <= BOARD_SIZE - cols; c++) {
            let fits = true;
            for (let pr = 0; pr < rows && fits; pr++) {
                for (let pc = 0; pc < cols; pc++) {
                    if (piece[pr][pc] !== 1) continue;
                    if (board[r + pr][c + pc]) {
                        fits = false;
                        break;
                    }
                }
            }
            if (fits) return { row: r, col: c };
        }
    }
    return null;
}

function flashHint(row, col, piece) {
    const boardEl = document.getElementById('board');
    const cells = boardEl.querySelectorAll('.cell');
    const rows = piece.length;
    const cols = piece[0].length;
    const highlights = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece[r][c] !== 1) continue;
            const idx = (row + r) * BOARD_SIZE + (col + c);
            const cell = cells[idx];
            if (cell) {
                cell.classList.add('hint');
                highlights.push(cell);
            }
        }
    }
    setTimeout(() => {
        highlights.forEach(cell => cell.classList.remove('hint'));
    }, 800);
}

function generateAllOrientations(shapes) {
    const seen = new Set();
    const result = [];
    
    shapes.forEach(original => {
        let current = original;
        for (let i = 0; i < 4; i++) {
            const trimmed = trimShape(current);
            const key = trimmed.map(row => row.join('')).join('|');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(trimmed);
            }
            current = rotateShape(current);
        }
    });
    
    return result;
}

function rotateShape(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            rotated[c][rows - 1 - r] = shape[r][c];
        }
    }
    return rotated;
}

function trimShape(shape) {
    let top = 0;
    let bottom = shape.length - 1;
    let left = 0;
    let right = shape[0].length - 1;
    
    while (top <= bottom && shape[top].every(v => v === 0)) top++;
    while (bottom >= top && shape[bottom].every(v => v === 0)) bottom--;
    
    const colIsEmpty = col => shape.every(row => row[col] === 0);
    while (left <= right && colIsEmpty(left)) left++;
    while (right >= left && colIsEmpty(right)) right--;
    
    const trimmed = [];
    for (let r = top; r <= bottom; r++) {
        trimmed.push(shape[r].slice(left, right + 1));
    }
    return trimmed;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function startNewGame() {
    board = createEmptyBoard();
    score = 0;
    history = [];
    isGameOver = false;
    renderBoard();
    generateTray();
    renderTray();
    updateScore();
    hideOverlay();
}

function updateScore() {
    document.getElementById('score').textContent = score;
    if (score > highScore) {
        highScore = score;
        saveHighScore();
    }
    document.getElementById('highScore').textContent = highScore;
}

function showHint() {
    if (isGameOver || trayPieces.length === 0) return;
    for (let i = 0; i < trayPieces.length; i++) {
        const hint = findFirstPlacement(trayPieces[i]);
        if (hint) {
            flashHint(hint.row, hint.col, trayPieces[i]);
            return;
        }
    }
}

init();
