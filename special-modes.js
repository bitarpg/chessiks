// special-modes.js
// СПЕЦМЕХАНИКИ ШАХМАТ 2.0

import {
    board,
    turn,
    gameMode,
    newModePlayer,
    kingDead,
    castling,
    getCol,
    getType,
    onBd,
    isLight
} from "./engine.js";

import { cloneBoard } from "./engine.js";


// ---------------------------------------
//      Х И М Е Р А
// ---------------------------------------

export let chimeraTracker = {};   // { "r,c": count }

// Перемещение химеры сохраняет её счётчик
export function onChimeraMove(start, target) {
    const fromKey = `${start.r},${start.c}`;
    const toKey = `${target.r},${target.c}`;

    // удаляем трекер с клетки, куда наступили (если там была химера)
    if (chimeraTracker[toKey] !== undefined) delete chimeraTracker[toKey];

    if (chimeraTracker[fromKey] === undefined)
        chimeraTracker[fromKey] = 0;

    chimeraTracker[toKey] = chimeraTracker[fromKey];
    delete chimeraTracker[fromKey];
}

// При завершении хода игрока проверяем переворот химеры
export function updateChimeraLoyalty(finishedPlayer) {
    for (const key in chimeraTracker) {
        const [r, c] = key.split(',').map(Number);
        const p = board[r][c];
        if (!p) { delete chimeraTracker[key]; continue; }

        if (getType(p) !== "x") continue;

        const owner = getCol(p);
        if (owner !== finishedPlayer) continue;

        chimeraTracker[key]++;

        // каждые 2 хода она меняет сторону
        if (chimeraTracker[key] >= 2) {
            board[r][c] = (p === "x") ? "X" : "x";
            chimeraTracker[key] = 0;
        }
    }
}


// Создание химеры после дипломатии
export function createChimera(from, to, attackerColor) {
    board[to.r][to.c] = attackerColor === "white" ? "x" : "X";
    board[from.r][from.c] = null;

    const key = `${to.r},${to.c}`;
    chimeraTracker[key] = 0;
}


// ---------------------------------------
//      Л Е Г И О Н
// ---------------------------------------

export function tryMakeLegion(from, to) {
    const p1 = board[from.r][from.c];
    const p2 = board[to.r][to.c];
    if (!p1 || !p2) return false;

    if (getType(p1) !== "n" || getType(p2) !== "n") return false;
    if (getCol(p1) !== getCol(p2)) return false;

    board[to.r][to.c] = getCol(p1) === "white" ? "h" : "H";
    board[from.r][from.c] = null;

    return true;
}


// ---------------------------------------
//   А Р Х О Н Т Ы  (A/C)
// ---------------------------------------

export function archonAllowsDiagonal(type, r, c) {
    if (type === "a") return isLight(r, c);
    if (type === "c") return !isLight(r, c);
    return false;
}


// ---------------------------------------
//     Н О В Ы Й   Р Е Ж И М   (Z)
// ---------------------------------------

export function activateNewMode(player) {
    gameMode = "new_mode";
    newModePlayer = player;
    kingDead = true;

    // Подсчёт оставшихся спецфигур игрока
    let legions = 0, archons = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;

            if (getCol(p) !== player) continue;

            const t = getType(p);

            if (t === "h" || t === "x") legions++;
            if (t === "a" || t === "c") archons++;
        }
    }

    // Удаляем все фигуры игрока
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c] && getCol(board[r][c]) === player)
                board[r][c] = null;

    // Возрождаем армию
    const back = player === "white" ? 7 : 0;
    const pawns = player === "white" ? 6 : 1;
    const row = player === "white"
        ? ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
        : ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

    board[back] = [...row];
    board[pawns] = Array(8).fill(player === "white" ? 'p' : 'P');

    // Перераспределяем спецфигуры после возрождения
    for (let c = 0; c < 8; c++) {
        const p = board[back][c];
        const t = getType(p);

        if (t === "n" && legions > 0) {
            board[back][c] = player === "white" ? "h" : "H";
            legions--;
        }

        if (t === "r" && archons > 0) {
            const isL = isLight(back, c);
            board[back][c] = player === "white"
                ? (isL ? "a" : "c")
                : (isL ? "A" : "C");
            archons--;
        }
    }

    // Убираем короля и добавляем Z
    board[back][4] = null;
    board[back][3] = player === "white" ? "z" : "Z";
}


// ---------------------------------------
//   ДОПОЛНИТЕЛЬНЫЕ ФИЛЬТРЫ ДЛЯ ХОДОВ
// ---------------------------------------

// Запрещаем атаковать Z союзников в new_mode
export function filterMovesForZ(moves, r, c) {
    const piece = board[r][c];
    const col = getCol(piece);

    return moves.filter(m => {
        const target = board[m.r]?.[m.c];
        if (!target) return true;

        const tType = getType(target);
        const tCol = getCol(target);

        // нельзя бить своего нового "короля"
        if (gameMode === "new_mode" && tType === "z" && tCol === newModePlayer) {
            return false;
        }
        return true;
    });
}
