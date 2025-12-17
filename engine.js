// engine.js
// БАЗОВЫЙ ДВИЖОК ШАХМАТ 2.0 (без спецрежимов)

// -------------------------
//  СТАНДАРТНЫЕ ПЕРЕМЕННЫЕ
// -------------------------
export let board = [];
export let turn = "white";
export let gameMode = "classic"; // new_mode активируется отдельным модулем
export let newModePlayer = null;
export let kingDead = false;

// Простейшая структура рокировки
export let castling = {
    white: { k: true, l: true, r: true },
    black: { k: true, l: true, r: true }
};

// -------------------------
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// -------------------------

export const getCol = (p) => p ? (p === p.toUpperCase() ? "black" : "white") : null;
export const getType = (p) => p ? p.toLowerCase() : null;
export const onBd = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const isLight = (r, c) => (r + c) % 2 === 0;

export function cloneBoard(bd = board) {
    return bd.map(row => [...row]);
}

// -------------------------
//  ИНИЦИАЛИЗАЦИЯ ДОСКИ
// -------------------------

export function initBoard() {
    board = [];
    const whiteRow = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const blackRow = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

    for (let r = 0; r < 8; r++) {
        if (r === 0) board.push([...whiteRow]);
        else if (r === 1) board.push(Array(8).fill('P'));
        else if (r === 6) board.push(Array(8).fill('p'));
        else if (r === 7) board.push([...blackRow]);
        else board.push(Array(8).fill(null));
    }

    turn = "white";
    gameMode = "classic";
    kingDead = false;
    newModePlayer = null;

    castling = {
        white: { k: true, l: true, r: true },
        black: { k: true, l: true, r: true }
    };
}

// -------------------------
//  ПРОВЕРКА НА ШАХ
// -------------------------

export function inCheck(color, bd = board) {
    let kingSymbol = color === "white" ? "k" : "K";

    // В режиме New Mode "король" заменяется на Z
    if (gameMode === "new_mode" && kingDead && color === newModePlayer) {
        kingSymbol = (color === "white") ? "z" : "Z";
    }

    let kr = -1, kc = -1;

    // Находим короля (или Z)
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (bd[r][c] === kingSymbol) {
                kr = r;
                kc = c;
                break;
            }
        }
    }

    if (kr === -1) return true; // Король отсутствует — автоматически шах

    const opp = color === "white" ? "black" : "white";

    // --- Пешки ---
    const pawnDir = opp === "white" ? 1 : -1;
    for (const dc of [-1, 1]) {
        const rr = kr + pawnDir, cc = kc + dc;
        if (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p && getCol(p) === opp && getType(p) === "p") return true;
        }
    }

    // --- Ходы коня, легиона, химеры ---
    const knightSmall = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
    const knightLarge = [[4, 1], [4, -1], [-4, 1], [-4, -1], [1, 4], [1, -4], [-1, 4], [-1, -4]];

    const checkKnight = (dr, dc, typeCheck) => {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr, cc)) return false;
        const p = bd[rr][cc];
        return (p && getCol(p) === opp && typeCheck.includes(getType(p)));
    };

    // обычный конь
    for (const [dr, dc] of knightSmall)
        if (checkKnight(dr, dc, ["n"])) return true;

    // большой конь (легион)
    for (const [dr, dc] of knightLarge)
        if (checkKnight(dr, dc, ["h"])) return true;

    // химера бьёт и малыми, и большими
    for (const [dr, dc] of [...knightSmall, ...knightLarge])
        if (checkKnight(dr, dc, ["x"])) return true;

    // --- Ладья / ферзь / Z / архонты прямые линии ---
    const rookDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dr, dc] of rookDirs) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                const t = getType(p);
                if (getCol(p) === opp && ["r", "q", "z", "a", "c"].includes(t)) return true;
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // --- Диагонали: слон / ферзь / Z / архонты ---
    const diagDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of diagDirs) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr, cc)) {
            const p = bd[rr][cc];
            if (p) {
                const t = getType(p);
                if (getCol(p) === opp) {
                    if (["b", "q", "z"].includes(t)) return true;
                    if (t === "a" && isLight(rr, cc)) return true; // белопольный архонт
                    if (t === "c" && !isLight(rr, cc)) return true; // чернопольный
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // --- Король ---
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const rr = kr + dr, cc = kc + dc;
            if (onBd(rr, cc)) {
                const p = bd[rr][cc];
                if (p && getCol(p) === opp && getType(p) === "k") return true;
            }
        }
    }

    return false;
}

// Проверка, атакуется ли клетка противником
export function isAttacked(r, c, attackerColor, bd = board) {
    // Ставим "виртуального" короля на клетку и проверяем шах
    const tmp = cloneBoard(bd);
    const me = attackerColor === "white" ? "black" : "white";
    const prev = tmp[r][c];

    tmp[r][c] = me === "white" ? "k" : "K";
    const danger = inCheck(me, tmp);

    tmp[r][c] = prev;
    return danger;
}
