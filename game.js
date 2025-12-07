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
const PALETTES = {
    light: ['#4e9de1', '#9a83e8', '#5fc29d', '#ff9c70', '#ff78a8', '#5daee5'],
    dark: ['#66b8ff', '#b2a0ff', '#58d6ae', '#ff8a62', '#ff6f9d', '#5aa4ff']
};
let themeState = 'light';
let highScore = 0;
let isGameOver = false;
let dragState = {
    active: false,
    pieceIndex: null,
    pointerId: null,
    floatEl: null,
    offsetX: 0,
    offsetY: 0,
    lastValid: null,
    previewCells: [],
    startRect: null
};
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
        
        pieceEl.addEventListener('pointerdown', handlePiecePointerDown);
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
    
    const placed = commitPlacement(selectedPieceIndex, startRow, startCol);
    if (!placed) {
        shakeBoard();
        selectedPieceIndex = null;
    }
}

function handlePieceClick(e) {
    selectedPieceIndex = parseInt(e.currentTarget.dataset.pieceIndex);
}

// Pointer-based drag handling
function handlePiecePointerDown(e) {
    if (isGameOver) return;
    const idx = parseInt(e.currentTarget.dataset.pieceIndex);
    if (Number.isNaN(idx)) return;
    selectedPieceIndex = idx;
    const piece = trayPieces[idx];
    if (!piece) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    dragState.active = true;
    dragState.pointerId = e.pointerId;
    dragState.pieceIndex = idx;
    // Center the floating piece under the pointer
    dragState.offsetX = 0;
    dragState.offsetY = 0;
    dragState.startRect = rect;
    dragState.lastValid = null;
    dragState.previewCells = [];
    
    const floatEl = buildFloatingPiece(piece, idx);
    dragState.floatEl = floatEl;
    dragState.offsetX = floatEl.clientWidth / 2;
    dragState.offsetY = floatEl.clientHeight / 2;
    updateFloatingPosition(e.clientX, e.clientY);
    
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.addEventListener('pointermove', handlePiecePointerMove);
    e.currentTarget.addEventListener('pointerup', handlePiecePointerUp);
    e.currentTarget.addEventListener('pointercancel', handlePiecePointerUp);
}

function handlePiecePointerMove(e) {
    if (!dragState.active || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    updateFloatingPosition(e.clientX, e.clientY);
    
    const piece = trayPieces[dragState.pieceIndex];
    const targetCell = getBoardCellFromPointer(e.clientX, e.clientY);
    clearPreview();
    if (!piece || !targetCell) {
        dragState.lastValid = null;
        return;
    }
    
    const pieceRows = piece.length;
    const pieceCols = piece[0].length;
    const startRow = targetCell.row - Math.floor(pieceRows / 2);
    const startCol = targetCell.col - Math.floor(pieceCols / 2);
    const withinBounds = startRow >= 0 && startCol >= 0 && startRow + pieceRows <= BOARD_SIZE && startCol + pieceCols <= BOARD_SIZE;
    const valid = withinBounds && canPlacePiece(board, piece, startRow, startCol);
    highlightPreview(startRow, startCol, piece, valid && withinBounds);
    dragState.lastValid = valid ? { row: startRow, col: startCol } : null;
}

function handlePiecePointerUp(e) {
    if (!dragState.active || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    clearPreview();
    removeFloatingPiece();
    
    if (dragState.lastValid) {
        const placed = commitPlacement(dragState.pieceIndex, dragState.lastValid.row, dragState.lastValid.col);
        if (!placed) {
            snapBackPiece();
        }
    } else {
        snapBackPiece();
    }
    selectedPieceIndex = null;
    
    dragState.active = false;
    dragState.pieceIndex = null;
    dragState.pointerId = null;
    dragState.lastValid = null;
    const target = e.currentTarget;
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', handlePiecePointerMove);
    target.removeEventListener('pointerup', handlePiecePointerUp);
    target.removeEventListener('pointercancel', handlePiecePointerUp);
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
    const palette = PALETTES[themeState] || PALETTES.light;
    return palette[Math.floor(Math.random() * palette.length)];
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

function recolorForTheme(fromKey, toKey) {
    const fromPalette = PALETTES[fromKey] || PALETTES.light;
    const toPalette = PALETTES[toKey] || PALETTES.light;
    if (fromPalette === toPalette) return;
    
    const remap = (color) => {
        const idx = fromPalette.indexOf(color);
        if (idx === -1) return color;
        return toPalette[idx % toPalette.length];
    };
    
    // Recolor board
    board = board.map(row => row.map(cell => (typeof cell === 'string' ? remap(cell) : cell)));
    // Recolor tray pieces
    trayPieces = trayPieces.map(piece => {
        const cloned = clonePiece(piece);
        if (cloned.color) cloned.color = remap(cloned.color);
        return cloned;
    });
    
    renderBoard();
    renderTray();
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
    const prev = themeState;
    themeState = theme === 'dark' ? 'dark' : 'light';
    body.classList.toggle('dark', themeState === 'dark');
    if (prev !== themeState) {
        recolorForTheme(prev, themeState);
    }
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

function getBoardCellFromPointer(clientX, clientY) {
    const boardEl = document.getElementById('board');
    const sampleCell = boardEl ? boardEl.querySelector('.cell') : null;
    if (!boardEl || !sampleCell) return null;
    const rect = boardEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const style = getComputedStyle(boardEl);
    const gap = parseFloat(style.gap || 0);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const cellSize = parseFloat(getComputedStyle(sampleCell).width) || rect.width / BOARD_SIZE;
    const step = cellSize + gap;
    const col = Math.floor((clientX - rect.left - paddingLeft) / step);
    const row = Math.floor((clientY - rect.top - paddingTop) / step);
    if (row < 0 || col < 0 || row >= BOARD_SIZE || col >= BOARD_SIZE) return null;
    return { row, col };
}

function clearPreview() {
    if (!dragState.previewCells) return;
    dragState.previewCells.forEach(cell => {
        cell.classList.remove('preview-valid');
        cell.classList.remove('preview-invalid');
    });
    dragState.previewCells = [];
}

function highlightPreview(row, col, piece, isValid) {
    const boardEl = document.getElementById('board');
    const cells = boardEl ? boardEl.querySelectorAll('.cell') : [];
    const rows = piece.length;
    const cols = piece[0].length;
    const className = isValid ? 'preview-valid' : 'preview-invalid';
    if (row < 0 || col < 0 || row + rows > BOARD_SIZE || col + cols > BOARD_SIZE) return;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece[r][c] !== 1) continue;
            const idx = (row + r) * BOARD_SIZE + (col + c);
            const cell = cells[idx];
            if (cell) {
                cell.classList.add(className);
                dragState.previewCells.push(cell);
            }
        }
    }
}

function buildFloatingPiece(piece, pieceIndex) {
    const color = getPieceColor(pieceIndex);
    const floatEl = document.createElement('div');
    floatEl.className = 'piece floating';
    floatEl.style.position = 'fixed';
    floatEl.style.top = '0';
    floatEl.style.left = '0';
    floatEl.style.pointerEvents = 'none';
    floatEl.style.transform = 'translate3d(0,0,0)';
    floatEl.style.opacity = '0.95';
    floatEl.style.zIndex = '10';
    floatEl.style.background = 'transparent';
    floatEl.style.padding = '0';
    floatEl.style.border = 'none';
    floatEl.style.boxShadow = 'none';
    
    const boardEl = document.getElementById('board');
    const sampleCell = boardEl ? boardEl.querySelector('.cell') : null;
    const cellSize = sampleCell ? parseFloat(getComputedStyle(sampleCell).width) : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 24;
    const gridGap = boardEl ? parseFloat(getComputedStyle(boardEl).gap || 0) : 3;
    
    const rows = piece.length;
    const cols = piece[0].length;
    floatEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    floatEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    floatEl.style.gap = `${gridGap}px`;
    floatEl.style.width = `${cols * cellSize + gridGap * (cols - 1)}px`;
    floatEl.style.height = `${rows * cellSize + gridGap * (rows - 1)}px`;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = piece[r][c] === 1 ? 'piece-cell' : 'piece-cell empty';
            if (piece[r][c] === 1) {
                cell.style.setProperty('--piece-color', color);
            }
            floatEl.appendChild(cell);
        }
    }
    
    document.body.appendChild(floatEl);
    return floatEl;
}

function updateFloatingPosition(clientX, clientY) {
    if (!dragState.floatEl) return;
    const x = clientX - dragState.offsetX;
    const y = clientY - dragState.offsetY;
    dragState.floatEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function removeFloatingPiece() {
    if (dragState.floatEl && dragState.floatEl.parentNode) {
        dragState.floatEl.parentNode.removeChild(dragState.floatEl);
    }
    dragState.floatEl = null;
}

function snapBackPiece() {
    removeFloatingPiece();
}

function commitPlacement(pieceIndex, row, col) {
    const piece = trayPieces[pieceIndex];
    if (!piece) return false;
    if (!canPlacePiece(board, piece, row, col)) return false;
    
    pushHistory();
    const pieceColor = getPieceColor(pieceIndex);
    const placedCells = placePiece(board, piece, row, col, pieceColor);
    score += placedCells;
    
    const cleared = clearLines();
    score += (cleared.rows * LINE_CLEAR_POINTS) + (cleared.cols * LINE_CLEAR_POINTS);
    if (isBoardClear()) {
        score += FULL_CLEAR_BONUS;
    }
    
    trayPieces.splice(pieceIndex, 1);
    selectedPieceIndex = null;
    renderBoard();
    if (trayPieces.length === 0) {
        generateTray();
    }
    renderTray();
    updateScore();
    checkGameOver();
    return true;
}

function canPlacePiece(boardState, piece, row, col) {
    const rows = piece.length;
    const cols = piece[0].length;
    if (row < 0 || col < 0 || row + rows > BOARD_SIZE || col + cols > BOARD_SIZE) return false;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece[r][c] !== 1) continue;
            if (boardState[row + r][col + c]) return false;
        }
    }
    return true;
}

function placePiece(boardState, piece, row, col, color) {
    let placed = 0;
    const rows = piece.length;
    const cols = piece[0].length;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece[r][c] !== 1) continue;
            boardState[row + r][col + c] = color;
            placed += 1;
        }
    }
    return placed;
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
            if (canPlacePiece(board, piece, r, c)) return true;
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
