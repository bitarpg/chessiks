// rules.js
// ÁÀÇÎÂÛÅ ÏĞÀÂÈËÀ ØÀÕÌÀÒ ÁÅÇ ÑÏÅÖÌÅÕÀÍÈÊ

import {
    board,
    turn,
    gameMode,
    newModePlayer,
    castling,
    getCol,
    getType,
    onBd,
    isLight
} from "./engine.js";

import { inCheck, isAttacked, cloneBoard } from "./engine.js";


// -----------------------------
//      ÏÅØÊÈ
// -----------------------------
export function getPawnMoves(r, c, safe = true) {
    const p = board[r][c];
    if (!p) return [];

    const col = getCol(p);
    const dir = col === "white" ? -1 : 1;
    const startRow = col === "white" ? 6 : 1;

    const moves = [];

    // 1. õîä âïåğ¸ä
    if (onBd(r + dir, c) && !board[r + dir][c]) {
        moves.push({ r: r + dir, c });

        // äâîéíîé õîä
        if (r === startRow && !board[r + 2 * dir][c]) {
            moves.push({ r: r + 2 * dir, c });
        }
    }

    // 2. àòàêè
    for (const dc of [-1, +1]) {
        const rr = r + dir, cc = c + dc;
        if (!onBd(rr, cc)) continue;

        const t = board[rr][cc];
        if (t && getCol(t) !== col) {
            moves.push({ r: rr, c: cc, atk: true });
        }
    }

    return moves;
}



// -----------------------------
//      ÊÎÍÜ
// -----------------------------
export function getKnightMoves(r, c) {
    const p = board[r][c];
    if (!p) return [];

    const col = getCol(p);
    const jumps = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    const moves = [];

    for (const [dr, dc] of jumps) {
        const rr = r + dr, cc = c + dc;
        if (!onBd(rr, cc)) continue;

        const t = board[rr][cc];
        if (!t || getCol(t) !== col) {
            moves.push({ r: rr, c: cc, atk: !!t });
        }
    }

    return moves;
}



// -----------------------------
//   ËÈÍÅÉÍÛÅ ÔÈÃÓĞÛ (ËÀÄÜß / ÑËÎÍ / ÔÅĞÇÜ)
// -----------------------------
export function getSlidingMoves(r, c, dirs) {
    const p = board[r][c];
    if (!p) return [];

    const moves = [];
    const col = getCol(p);

    for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;

        while (onBd(rr, cc)) {
            const t = board[rr][cc];

            if (!t) {
                moves.push({ r: rr, c: cc });
            } else {
                if (getCol(t) !== col) {
                    moves.push({ r: rr, c: cc, atk: true });
                }
                break;
            }

            rr += dr;
            cc += dc;
        }
    }

    return moves;
}



// -----------------------------
//          ÊÎĞÎËÜ
// -----------------------------
export function getKingMoves(r, c, safe = true) {
    const p = board[r][c];
    if (!p) return [];

    const col = getCol(p);

    const steps = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    const moves = [];
    for (const [dr, dc] of steps) {
        const rr = r + dr, cc = c + dc;
        if (!onBd(rr, cc)) continue;

        const t = board[rr][cc];
        if (!t || getCol(t) !== col) moves.push({ r: rr, c: cc, atk: !!t });
    }

    // -------------------------
    //         ĞÎÊÈĞÎÂÊÀ
    // -------------------------
    if (!safe) return moves;
    if (inCheck(col)) return moves;  // êîğîëü íå ìîæåò ğîêèğîâàòüñÿ ïîä øàõîì

    const backRank = col === "white" ? 7 : 0;

    // êîğîòêàÿ
    if (castling[col].k && castling[col].r) {
        const rook = board[backRank][7];

        if (rook && getType(rook) === "r" && getCol(rook) === col) {
            if (
                !board[backRank][5] &&
                !board[backRank][6] &&
                !isAttacked(backRank, 5, col) &&
                !isAttacked(backRank, 6, col)
            ) {
                moves.push({ r: backRank, c: 6, castle: "short" });
            }
        }
    }

    // äëèííàÿ
    if (castling[col].l && castling[col].r) {
        const rook = board[backRank][0];

        if (rook && getType(rook) === "r" && getCol(rook) === col) {
            if (
                !board[backRank][1] &&
                !board[backRank][2] &&
                !board[backRank][3] &&
                !isAttacked(backRank, 3, col) &&
                !isAttacked(backRank, 2, col)
            ) {
                moves.push({ r: backRank, c: 2, castle: "long" });
            }
        }
    }

    return moves;
}



// -----------------------------
//      ÃËÀÂÍÀß ÔÓÍÊÖÈß getMoves
// -----------------------------
export function getMoves(r, c, safe = true) {
    const p = board[r][c];
    if (!p) return [];

    const type = getType(p);

    let raw = [];

    switch (type) {
        case "p": raw = getPawnMoves(r, c, safe); break;
        case "n": raw = getKnightMoves(r, c, safe); break;

        case "r":
            raw = getSlidingMoves(r, c, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
            break;

        case "b":
            raw = getSlidingMoves(r, c, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
            break;

        case "q":
            raw = getSlidingMoves(r, c, [
                [1, 0], [-1, 0], [0, 1], [0, -1],
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ]);
            break;

        case "k":
        case "z":
            raw = getKingMoves(r, c, safe);
            break;

        default:
            return []; // ñïåöôèãóğû áóäóò â special-modes.js
    }

    if (!safe) return raw;

    // -----------------------------
    // ÔÈËÜÒĞÀÖÈß ÍÅÇÀÊÎÍÍÛÕ ÕÎÄÎÂ
    // -----------------------------
    const legal = [];
    for (const mv of raw) {
        const copy = cloneBoard(board);

        copy[mv.r][mv.c] = copy[r][c];
        copy[r][c] = null;

        if (!inCheck(getCol(p), copy)) {
            legal.push(mv);
        }
    }

    return legal;
}
