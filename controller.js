// controller.js — ПОЛНАЯ ЛОГИКА ИЗ HTML, без изменений поведения

// === ИМПОРТЫ ===
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
    isLight,
    initBoard
} from "../engine/engine.js";

import { getMoves as engineGetMoves, inCheck } from "../engine/rules.js";

import {
    chimeraTracker,
    tryMakeLegion,
    createChimera,
    updateChimeraLoyalty,
    activateNewMode as smActivateNewMode
} from "../engine/special-modes.js";

import UI, {
    render,
    updateUI,
    log,
    updateUIState,
    showEndModal,
    hideEndModal,
    showDipModal,
    hideDipModal,
    updateLossCountersUI,
    updateMoraleUI
} from "../ui/ui.js";

import * as NET from "../network/network.js";


// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ КОНТРОЛЛЕРА (как в HTML, один-в-один) ===
let selected = null;
let moves = [];
let loyalty = 3;
let pendingMove = null;

let whiteRevived = false;
let blackRevived = false;

let moveCount = 0;
let lastMoveData = null;

let aiEnabled = false;
let aiColor = "black";

let whiteMorale = 10;
let blackMorale = 10;

let myOnlineColor = null;


// Делаем UI → controller связь (как договорено)
export function setUICallbacks() {
    UI.setCallbacks({
        clickCell: clickCell,
        acceptProp: acceptProp,
        declineProp: declineProp,
        activateNewMode: activateNewMode
    });
}


// === ВСПОМОГАТЕЛЬНЫЕ СВЯЗИ UI-СОСТОЯНИЙ ===
function pushUIState() {
    updateUIState({
        moves,
        selected,
        chimeraTracker,
        lastMoveData,
        myOnlineColor
    });
}


// === ПЕРЕЗАПУСК ИГРЫ (HTML initGame) ===
export function initGame() {
    initBoard();

    selected = null;
    moves = [];
    loyalty = 3;
    pendingMove = null;
    moveCount = 0;
    lastMoveData = null;
    whiteMorale = 10;
    blackMorale = 10;
    whiteRevived = false;
    blackRevived = false;
    myOnlineColor = NET.getOnlineColor() || null;

    hideEndModal();
    hideDipModal();

    pushUIState();
    render();
    updateUI();

    log("Новая партия началась.");
}
//
// =====================================================
//  CLICK CELL (КЛИК ПО КЛЕТКЕ) — ПОЛНЫЙ ПЕРЕНОС ИЗ HTML
// =====================================================
//
function clickCell(r, c) {
    if (NET.isOnlineActive() && NET.getOnlineColor() && turn !== NET.getOnlineColor()) return;

    // если уже выбрана фигура
    if (selected) {
        const mv = moves.find(m => m.r === r && m.c === c);
        if (mv) {
            doMove(mv);
            return;
        }
    }

    // выбрать новую фигуру
    if (board[r][c] && getCol(board[r][c]) === turn) {

        if (NET.isOnlineActive() && NET.getOnlineColor() && getCol(board[r][c]) !== NET.getOnlineColor())
            return;

        selected = { r, c };
        moves = getMovesAt(r, c);
        pushUIState();
        render();
    } else {
        selected = null;
        moves = [];
        pushUIState();
        render();
    }
}

//
// =====================================================
//  getMovesAt() — ПОЛНАЯ HTML-ЛОГИКА (не движковая!)
// =====================================================
//
function getMovesAt(r, c, safe = true) {

    const p = board[r][c];
    if (!p) return [];
    const col = getCol(p);
    const type = getType(p);

    const localMoves = [];   // как в HTML

    // направления
    const dirs  = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    const kn    = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    const bigKn = [[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4]];

    // =========================
    // ПЕШКА (точно как в HTML)
    // =========================
    if (type === 'p') {
        const d = col === 'white' ? -1 : 1;
        const start = col === 'white' ? 6 : 1;

        if (onBd(r+d, c) && !board[r+d][c]) {
            localMoves.push({ r: r+d, c });
            if (r === start && !board[r+d*2][c]) {
                localMoves.push({ r: r+d*2, c });
            }
        }

        [[d,1],[d,-1]].forEach(([dr, dc]) => {
            const rr = r+dr, cc = c+dc;
            if (!onBd(rr, cc)) return;
            const t = board[rr][cc];
            if (t && getCol(t) !== col)
                localMoves.push({ r: rr, c: cc, atk: true });
        });
    }

    // =========================
    // ЛАДЬЯ / СЛОН / ФЕРЗЬ / АРХОНТ
    // =========================
    if (["r","b","q","a","c"].includes(type)) {

        let useDirs = [];

        if (type === "r" || type === "q") useDirs.push(...dirs.slice(0,4));
        if (type === "b" || type === "q") useDirs.push(...dirs.slice(4));

        if (type === "a" || type === "c") {
            useDirs = [...dirs.slice(0,4)];
            const okDiag = (type === "a" && isLight(r,c)) || (type === "c" && !isLight(r,c));
            if (okDiag) useDirs.push(...dirs.slice(4));
        }

        for (let [dr,dc] of useDirs) {
            let rr = r+dr, cc = c+dc;
            while (onBd(rr,cc)) {
                const t = board[rr][cc];

                // Слияние (bishop + rook)
                if (t && getCol(t) === col) {
                    if (type === "r" && getType(t) === "b")
                        localMoves.push({ r: rr, c: cc, fuse: true });
                    if (type === "b" && getType(t) === "r")
                        localMoves.push({ r: rr, c: cc, fuse: true });
                }

                if (!t) {
                    localMoves.push({ r: rr, c: cc });
                } else {
                    if (getCol(t) !== col)
                        localMoves.push({ r: rr, c: cc, atk: true });
                    break;
                }

                rr += dr;
                cc += dc;
            }
        }
    }

    // =========================
    // КОНЬ / ЛЕГИОН / ХИМЕРА
    // =========================
    if (["n","h","x"].includes(type)) {

        const addK = (rr,cc, dr,dc,arrType) => {
            if (!onBd(rr,cc)) return;
            const t = board[rr][cc];

            // предложение химеры
            if (type === "n" && t && getType(t)==='n' && getCol(t)!==col) {
                localMoves.push({ r: rr, c: cc, atk: true, prop: "chimera" });
                return;
            }

            // обычный ход
            if (!t || getCol(t) !== col)
                localMoves.push({ r: rr, c: cc, atk: !!t });

            // слияние двух коней → легион
            if (type === "n" && t && getCol(t)===col && getType(t)==='n')
                localMoves.push({ r: rr, c: cc, merge: true });
        };

        // малый ход
        if (type==='n' || type==='x') {
            for (let [dr,dc] of kn) addK(r+dr,c+dc,dr,dc,'n');
        }

        // большой ход
        if (type==='h' || type==='x') {
            for (let [dr,dc] of bigKn) addK(r+dr,c+dc,dr,dc,'h');
        }
    }

    // =========================
    // КОРОЛЬ + Z-КОРОЛЬ
    // =========================
    if (type==='k' || type==='z') {

        for (let [dr,dc] of dirs) {
            const rr = r+dr, cc = c+dc;
            if (!onBd(rr,cc)) continue;
            const t = board[rr][cc];
            if (!t || getCol(t)!==col)
                localMoves.push({ r: rr, c: cc, atk: !!t });
        }

        // === РОКИРОВКА (как в HTML) ===
        if (safe && type==='k') {

            if (!inCheck(col)) {
                const row = (col==='white' ? 7 : 0);
                const opp = opposite(col);

                // короткая
                const rookShort = board[row][7];
                if (castling[col].k && castling[col].r && rookShort &&
                    getType(rookShort)==='r' && getCol(rookShort)===col) {

                    if (!board[row][5] && !board[row][6] &&
                        !isAttackedHTML(row,5,opp) &&
                        !isAttackedHTML(row,6,opp)) {

                        localMoves.push({ r: row, c: 6, castle: "short" });
                    }
                }

                // длинная
                const rookLong = board[row][0];
                if (castling[col].k && castling[col].l && rookLong &&
                    getType(rookLong)==='r' && getCol(rookLong)===col) {

                    if (!board[row][1] && !board[row][2] && !board[row][3] &&
                        !isAttackedHTML(row,3,opp) &&
                        !isAttackedHTML(row,2,opp)) {

                        localMoves.push({ r: row, c: 2, castle: "long" });
                    }
                }
            }
        }
    }

    // =========================
    // ФИНАЛЬНАЯ ФИЛЬТРАЦИЯ ХОДОВ (как в HTML)
    // =========================
    const output = [];

    for (let mv of localMoves) {

        const targetP = board[mv.r][mv.c];
        if (targetP) {
            const tType = getType(targetP);
            const tCol  = getCol(targetP);

            if (tType === 'k') continue;

            if (gameMode === 'new_mode' && tType==='z' && tCol===newModePlayer)
                continue;
        }

        output.push(mv);
    }

    // === если safe=false — не проверяем шах ===
    if (!safe) return output;

    // Фильтруем ходы, оставляющие короля под шахом
    const legal=[];
    for (let mv of output) {
        const tmp = board.map(row => [...row]);
        tmp[mv.r][mv.c] = tmp[r][c];
        tmp[r][c] = null;
        if (!inCheck(col, tmp))
            legal.push(mv);
    }

    return legal;
}

//
// =====================================================
//  HTML isAttacked() — используется при рокировке
// =====================================================
function isAttackedHTML(r, c, attackerCol) {
    const tmp = board.map(row => [...row]);
    const myCol = attackerCol==='white'?'black':'white';

    const old = tmp[r][c];
    tmp[r][c] = (myCol==='white'?'k':'K');

    const v = inCheck(myCol, tmp);
    tmp[r][c] = old;

    return v;
}

//
// =====================================================
//   ВСПОМОГАТЕЛЬНОЕ ОТ HTML
// =====================================================
function opposite(col){ return col==='white'?'black':'white'; }

function isSquareThreatenedHTML(bd, r, c, byColor) {
    // Полная копия UI/HTML версии — ИИ и дипломатия используют это
    // (частично дублирует ui.js, но иначе нарушим точную эквивалентность)

    // Пешки
    if (byColor==="white") {
        let rr=r+1;
        for (let dc of [-1,+1]) {
            let cc=c+dc;
            if (onBd(rr,cc) && bd[rr][cc]) {
                const p=bd[rr][cc];
                if (getCol(p)==="white" && getType(p)==="p") return true;
            }
        }
    } else {
        let rr=r-1;
        for (let dc of [-1,+1]) {
            let cc=c+dc;
            if (onBd(rr,cc) && bd[rr][cc]) {
                const p=bd[rr][cc];
                if (getCol(p)==="black" && getType(p)==="p") return true;
            }
        }
    }

    // Конь/легион/химера
    const smallK=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    const bigK=[[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4]];
    for (let [dr,dc] of [...smallK,...bigK]) {
        const rr=r+dr, cc=c+dc;
        if (!onBd(rr,cc)) continue;
        const p=bd[rr][cc];
        if (!p || getCol(p)!==byColor) continue;
        const t=getType(p);

        if (t==='n' && smallK.some(k=>k[0]===dr&&k[1]===dc)) return true;
        if (t==='h' && bigK.some(k=>k[0]===dr&&k[1]===dc)) return true;
        if (t==='x') return true;
    }

    // Линии
    const rookDirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for (let [dr,dc] of rookDirs) {
        let rr=r+dr, cc=c+dc;
        while (onBd(rr,cc)) {
            const p=bd[rr][cc];
            if (p) {
                if (getCol(p)===byColor) {
                    const t=getType(p);
                    if (["r","q","z","a","c"].includes(t)) return true;
                }
                break;
            }
            rr+=dr; cc+=dc;
        }
    }

    // Диагонали
    const diag=[[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr,dc] of diag) {
        let rr=r+dr, cc=c+dc;
        while (onBd(rr,cc)) {
            const p=bd[rr][cc];
            if (p) {
                if (getCol(p)===byColor) {
                    const t=getType(p);
                    if (["b","q","z"].includes(t)) return true;
                    if (t==='a' && isLight(rr,cc)) return true;
                    if (t==='c' && !isLight(rr,cc)) return true;
                }
                break;
            }
            rr+=dr; cc+=dc;
        }
    }

    // Король
    for (let dr of [-1,0,1]) {
        for (let dc of [-1,0,1]) {
            if (dr===0&&dc===0) continue;
            const rr=r+dr, cc=c+dc;
            if (!onBd(rr,cc)) continue;
            const p=bd[rr][cc];
            if (p && getCol(p)===byColor && getType(p)==='k')
                return true;
        }
    }

    return false;
}
//
// =====================================================
//  doMove() — ПОЛНАЯ КОПИЯ ЛОГИКИ HTML
// =====================================================
//
function doMove(mv) {
    const start = selected;
    const p = board[start.r][start.c];
    const type = getType(p);
    const col = getCol(p);

    // Для отправки хода по сети
    const moveDetails = {
        from: start,
        to: mv,
        proposal: !!mv.prop
    };

    // --------------------------------------------------
    // ПРЕДЛОЖЕНИЕ СОЮЗА (ХИМЕРА)
    // --------------------------------------------------
    if (mv.prop && NET.isOnlineActive()) {
        NET.sendMoveToCloud(board, turn, moveDetails, castling, gameMode, moveCount);
        log("Предложение союза отправлено...");
        selected = null;
        moves = [];
        pushUIState();
        render();
        return;
    }

    // Офлайн дипломатия
    if (mv.prop) {
        pendingMove = mv;
        showDipModal();
        return;
    }

    // Если на целевой клетке стоит Chimera → убрать её трекер
    const targetKey = `${mv.r},${mv.c}`;
    if (chimeraTracker[targetKey] !== undefined) {
        delete chimeraTracker[targetKey];
    }

    // --------------------------------------------------
    //  ХОД ХИМЕРЫ → перенос трекера
    // --------------------------------------------------
    if (getType(p) === 'x') {
        const startKey = `${start.r},${start.c}`;
        if (chimeraTracker[startKey] !== undefined) {
            chimeraTracker[targetKey] = chimeraTracker[startKey];
            delete chimeraTracker[startKey];
        } else {
            chimeraTracker[targetKey] = 0; // fallback
        }
    }

    // --------------------------------------------------
    //  СБИВАЕМ РОКИРОВОЧНЫЕ ФЛАГИ
    // --------------------------------------------------
    if (type === 'k') {
        castling[turn].k = false;
    }
    if (type === 'r') {
        const row = turn === 'white' ? 7 : 0;
        if (start.c === 0) castling[turn].l = false;
        if (start.c === 7) castling[turn].r = false;
    }

    // --------------------------------------------------
    //  ОПЕРАЦИИ КОНЯ: ЛЕГИОН И ХИМЕРА
    // --------------------------------------------------
    if (type === 'n') {
        const t = board[mv.r][mv.c];

        // === ЛЕГИОН ===
        if (t && getCol(t) === col && getType(t) === 'n') {
            // два коня → H
            board[mv.r][mv.c] = col === 'white' ? 'h' : 'H';
            board[start.r][start.c] = null;
            log("ЛЕГИОН: Объединение завершено.");
            endTurn(start.r, start.c, mv, moveDetails);
            return;
        }

        // === ХИМЕРА (дипломатия) ===
        if (mv.prop === "chimera") {
            const target = board[mv.r][mv.c];
            if (target && getType(target)==='n' && getCol(target)!==col) {
                pendingMove = mv;
                pendingMove.from = start;
                pendingMove.to = { r: mv.r, c: mv.c };
                pendingMove.attackerColor = col;
                showDipModal();
                log("Предложение: создать ХИМЕРУ");
                return;
            }
        }
    }

    // --------------------------------------------------
    //  FUSE: ЛАДЬЯ + СЛОН = ARCHON
    // --------------------------------------------------
    if (mv.fuse) {
        const isL = isLight(start.r, start.c);
        const code = turn === 'white'
            ? (isL ? 'a' : 'c')
            : (isL ? 'A' : 'C');

        board[mv.r][mv.c] = code;
        board[start.r][start.c] = null;

        log("СЛИЯНИЕ: Канцлер создан.");
        endTurn(start.r, start.c, mv, moveDetails);
        return;
    }

    // --------------------------------------------------
    //  РОКИРОВКА
    // --------------------------------------------------
    if (mv.castle) {
        board[mv.r][mv.c] = p;
        board[start.r][start.c] = null;
        castling[turn].k = false;

        const row = (turn === 'white' ? 7 : 0);

        if (mv.castle === "short") {
            board[row][5] = board[row][7];
            board[row][7] = null;
        } else {
            board[row][3] = board[row][0];
            board[row][0] = null;
        }

        log("РОКИРОВКА!");
        endTurn(start.r, start.c, mv, moveDetails);
        return;
    }

    // --------------------------------------------------
    //  ОСТАЛЬНЫЕ ХОДЫ
    // --------------------------------------------------

    // перемещаем
    board[mv.r][mv.c] = p;
    board[start.r][start.c] = null;

    // ПЕШКА ДОШЛА → ПРОМОУШН
    if (type === 'p' && (mv.r === 0 || mv.r === 7)) {

        // В HTML: в обоих режимах превращали в ферзя,
        // в new_mode → снова ферзь, но heavy нет
        board[mv.r][mv.c] = (turn === 'white' ? 'q' : 'Q');

        log("ПРОМОУШН: Создан Ферзь.");
    }

    endTurn(start.r, start.c, mv, moveDetails);
}
//
// =====================================================
//  END TURN — ПОЛНЫЙ ПЕРЕНОС HTML ЛОГИКИ
// =====================================================
//
function endTurn(sr, sc, mv, moveDetails) {
    const nextTurn = (turn === 'white') ? 'black' : 'white';

    // 1. Увеличиваем счетчик ходов
    moveCount++;

    // 2. Логика переворота ХИМЕРЫ
    const justFinished = turn;

    for (const key in chimeraTracker) {
        const [r, c] = key.split(',').map(Number);
        const piece = board[r][c];

        if (piece && getType(piece) === 'x') {

            const owner = getCol(piece);

            if (owner === justFinished) {
                chimeraTracker[key]++;

                if (chimeraTracker[key] >= 2) {
                    const newType = (piece === 'x') ? 'X' : 'x';
                    board[r][c] = newType;
                    chimeraTracker[key] = 0;

                    log(`ХИМЕРА на ${String.fromCharCode(97 + c)}${8 - r} сменила лояльность!`);
                }
            }
        } else {
            delete chimeraTracker[key]; // "мусорный" трекер
        }
    }

    // 3. Создание moveDetails если вдруг не передали
    if (!moveDetails && typeof sr !== 'undefined') {
        moveDetails = { from: { r: sr, c: sc }, to: mv };
    }

    // 4. Отправка по сети (ПОЛНОСТЬЮ КАК В HTML)
    if (NET.isOnlineActive()) {
        NET.sendMoveToCloud(
            board,
            nextTurn,
            moveDetails,
            castling,
            gameMode,
            moveCount,
            chimeraTracker
        );
    }

    // 5. Лояльность (после каждого хода уменьшается)
    loyalty--;
    if (loyalty <= 0) {
        consultGeminiLoyalty();
        loyalty = 3;
    }

    // 6. Меняем ход
    turn = nextTurn;
    selected = null;
    moves = [];

    lastMoveData = moveDetails;

    // 7. Потери
    updateLossCountersInternal();

    // 8. Обновляем UI
    pushUIState();
    render();
    updateUI();
    updateMoraleUIInternal();

    // ===== AI ХОД =====
    if (aiEnabled && turn === aiColor) {
        setTimeout(() => {
            const before = lastMoveData;
            makeAIMove();
            setTimeout(() => {
                if (before === lastMoveData) {
                    checkGameState();
                }
            }, 50);
        }, 150);
        return;
    }

    checkGameState();
}

//
// =====================================================
//    ВНУТРЕННИЕ UI ОБНОВЛЕНИЯ (как в HTML)
// =====================================================
//

function updateLossCountersInternal() {
    const value = {
        p:1,P:1, n:3,N:3, b:3,B:3, r:5,R:5,
        a:8,A:8, c:8,C:8, h:6,H:6, q:10,Q:10
    };

    const START =
        8*1 + 2*3 + 2*3 + 2*5 + 10;

    let whiteCur = 0;
    let blackCur = 0;

    for (let r=0;r<8;r++){
        for(let c=0;c<8;c++){
            const p = board[r][c];
            if (!p) continue;
            if (!value[p]) continue;
            if (p === p.toUpperCase()) blackCur += value[p];
            else whiteCur += value[p];
        }
    }

    const whiteLoss = START - whiteCur;
    const blackLoss = START - blackCur;

    updateLossCountersUI(whiteLoss, blackLoss);
}

let whiteMorale = 10;
let blackMorale = 10;

function updateMoraleUIInternal() {
    updateMoraleUI(whiteMorale, blackMorale);
}

//
// =====================================================
//    КОНСУЛЬТАЦИЯ ЛОЯЛЬНОСТИ (HTML AI Gemini logic)
// =====================================================
//
function consultGeminiLoyalty() {

    const whiteLoss = parseInt(document.getElementById("loss-w").innerText);
    const blackLoss = parseInt(document.getElementById("loss-b").innerText);

    whiteMorale = Math.max(0, 10 - whiteLoss / 3);
    blackMorale = Math.max(0, 10 - blackLoss / 3);

    for (let r=0;r<8;r++){
        for (let c=0;c<8;c++){
            const p = board[r][c];
            if (!p || getType(p) !== 'p') continue;

            const color = getCol(p);
            const morale = (color==='white') ? whiteMorale : blackMorale;
            if (morale > 3) continue;

            let chance = 0;
            if (morale <=3) chance = 0.05 + Math.random()*0.10;
            if (morale <=1) chance = 0.20 + Math.random()*0.10;

            const dirs = [
                [1,0],[-1,0],[0,1],[0,-1],
                [1,1],[1,-1],[-1,1],[-1,-1]
            ];
            let enemyNear = false;

            for (let [dr,dc] of dirs){
                const rr=r+dr, cc=c+dc;
                if (!onBd(rr,cc)) continue;
                const e = board[rr][cc];
                if (e && getCol(e)!==color) {
                    enemyNear = true;
                    break;
                }
            }

            if (!enemyNear) continue;

            if (Math.random() < chance) {
                board[r][c] = (color==='white') ? 'P' : 'p';
                log(`⚠ Пешка на (${r},${c}) изменила сторону!`);
            }
        }
    }

    updateMoraleUIInternal();
    pushUIState();
    render();
}

//
// =====================================================
//   ПРИНЯТЬ СОЮЗ (ACCEPT) → Создать химеру
// =====================================================
//
function acceptProp() {
    hideDipModal();

    const code = (turn === 'white') ? 'X' : 'x';

    board[pendingMove.r][pendingMove.c] = code;
    board[selected.r][selected.c] = null;

    const key = `${pendingMove.r},${pendingMove.c}`;
    chimeraTracker[key] = 0;

    log("ХИМЕРА рождена. Лояльность нестабильна.");

    endTurn(selected.r, selected.c, pendingMove);
    pendingMove = null;
}

//
// =====================================================
//   ОТКАЗАТЬ СОЮЗ (DECLINE)
// =====================================================
//
function declineProp() {
    hideDipModal();

    board[pendingMove.r][pendingMove.c] = board[selected.r][selected.c];
    board[selected.r][selected.c] = null;

    log("ОТКАЗ. Враг уничтожен.");

    endTurn(selected.r, selected.c, pendingMove);
    pendingMove = null;
}

//
// =====================================================
//   АКТИВАЦИЯ РЕЖИМА NEW MODE (ВОСКРЕСИТЬ АРМИЮ)
// =====================================================
//
function activateNewMode() {

    const player = turn;

    // отметка, что цвет уже использовал возрождение
    if (player === 'white') whiteRevived = true;
    else blackRevived = true;

    gameMode = 'new_mode';
    newModePlayer = player;
    kingDead = true;

    hideEndModal();

    // ---- ПОЛНЫЙ ВОССТАНОВЛЕННЫЙ БЛОК HTML ----

    let legions = 0, archons=0;

    for (let r=0;r<8;r++){
        for(let c=0;c<8;c++){
            const p = board[r][c];
            if (!p) continue;
            if (getCol(p)!==player) continue;
            const t = getType(p);
            if (t==='h' || t==='x') legions++;
            if (t==='a' || t==='c') archons++;
        }
    }

    for (let r=0;r<8;r++)
        for(let c=0;c<8;c++)
            if (board[r][c] && getCol(board[r][c])===player)
                board[r][c]=null;

    const baseR = (player==='white'?7:0);
    const pawnR = (player==='white'?6:1);

    const r1 = (player==='white'
        ? ['r','n','b','q','k','b','n','r']
        : ['R','N','B','Q','K','B','N','R']);

    board[baseR] = [...r1];
    board[pawnR] = Array(8).fill(player==='white'?'p':'P');

    for (let c=0;c<8;c++){
        const p = board[baseR][c];

        if (getType(p)==='n' && legions>0) {
            board[baseR][c] = (player==='white'?'h':'H');
            legions--;
        }

        if (getType(p)==='r' && archons>0) {
            const isL = isLight(baseR,c);
            board[baseR][c] = (player==='white'
                ? (isL?'a':'c')
                : (isL?'A':'C'));
            archons--;
        }
    }

    board[baseR][4] = null;
    board[baseR][3] = (player==='white'?'z':'Z');

    log("НОВЫЙ РЕЖИМ! Король мертв. Ферзь (Z) теперь Лидер.");

    // ---- HTML: если онлайн, отправить ----
    if (NET.isOnlineActive()) {
        NET.sendMoveToCloud(board, turn, {}, castling, gameMode, moveCount, chimeraTracker);
    }

    pushUIState();
    render();
}
//
// =====================================================
//           ФУНКЦИИ ДЛЯ ИИ (ПОЛНАЯ ВЕРСИЯ HTML)
// =====================================================
//

// ===============================
//   VALUE MAP ИСПОЛЬЗУЕТСЯ В ИИ
// ===============================
function getPieceValue(p) {
    if (!p) return 0;
    p = p.toLowerCase();
    return {
        'p': 1,
        'n': 3,
        'h': 5,
        'b': 3,
        'r': 5,
        'a': 7,
        'c': 7,
        'q': 9,
        'x': 7,
        'z': 10,
        'k': 100
    }[p] || 0;
}

//
// =====================================================
//   simulateMove — создаёт копию доски после хода
//   (ПОЛНАЯ КОПИЯ ИЗ HTML)
// =====================================================
//
function simulateMove(bd, from, to) {
    let copy = bd.map(row => [...row]);
    copy[to.r][to.c] = copy[from.r][from.c];
    copy[from.r][from.c] = null;
    return copy;
}

//
// =====================================================
//  ГЛОБАЛЬНАЯ ОЦЕНКА ОПАСНОСТИ (из HTML)
// =====================================================
//
function getGlobalThreatScore(bd, color) {
    let score = 0;
    const opp = opposite(color);

    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {

            const p = bd[r][c];
            if (!p || getCol(p)!==color) continue;

            if (isSquareThreatenedHTML(bd, r, c, opp)) {
                if (getType(p) !== 'k') {
                    score += getPieceValue(p);
                }
            }
        }
    }
    return score;
}

//
// =====================================================
//     evaluateMove — ПОЛНАЯ ЛОГИКА ИЗ HTML
// =====================================================
//
function evaluateMove(from, mv, bd, color, isCheckMode, initialDanger) {
    let score = 0;

    const piece = bd[from.r][from.c];
    const target = bd[mv.r][mv.c];
    const pieceType = getType(piece);

    // Симулируем позицию
    const after = simulateMove(bd, from, mv);

    // === 1. Глобальная безопасность ===
    const futureDanger = getGlobalThreatScore(after, color);
    const dangerDiff = initialDanger - futureDanger;

    score += dangerDiff * 2;   // усиление веса, как в HTML

    // === 2. Взятие ===
    if (target) {
        let val = getPieceValue(target);
        score += val * 1.5; // как в HTML

        if (!isSquareThreatenedHTML(after, mv.r, mv.c, opposite(color))) {
            score += 2;
        }
    }

    // === 3. Безопасность фигуры после хода ===
    const attackedNew = isSquareThreatenedHTML(after, mv.r, mv.c, opposite(color));
    const defendedNew = isDefendedHTML(after, mv.r, mv.c, color);

    if (attackedNew) {
        let loss = getPieceValue(piece);
        if (defendedNew) score -= loss * 0.5;
        else score -= loss * 2;
    }

    // === 4. Шах ферзю соперника ===
    if (inCheck(opposite(color), after)) score += 3;

    // === 5. Центр ===
    if ([3,4].includes(mv.r) && [3,4].includes(mv.c)) score += 0.5;

    // === 6. Активность пешек в дебюте ===
    if (pieceType === 'p' && (color==='white' ? from.r===1 : from.r===6)) {
        score += 1;
    }

    // === 7. Паника короля (как в HTML) ===
    if (pieceType==='k' && !isCheckMode) score -= 1;

    return score;
}

//
// =====================================================
//   DEFENSE CHECK (HTML версия isDefended)
// =====================================================
//
function isDefendedHTML(bd, r, c, color) {

    // Пешки
    if (color==="white") {
        let rr=r+1;
        for (let dc of [-1,+1]) {
            let cc=c+dc;
            if (onBd(rr,cc)) {
                const p=bd[rr][cc];
                if (p && getCol(p)==="white" && getType(p)==="p") return true;
            }
        }
    } else {
        let rr=r-1;
        for (let dc of [-1,+1]) {
            let cc=c+dc;
            if (onBd(rr,cc)) {
                const p=bd[rr][cc];
                if (p && getCol(p)==="black" && getType(p)==="p") return true;
            }
        }
    }

    // Конь / Легион / Химера
    const smallK=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    const bigK  =[[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4]];

    for (let [dr,dc] of [...smallK,...bigK]) {
        let rr=r+dr, cc=c+dc;
        if (!onBd(rr,cc)) continue;
        let p=bd[rr][cc];
        if (!p || getCol(p)!==color) continue;
        let t = getType(p);

        if (t==='n' && smallK.some(k=>k[0]===dr&&k[1]===dc)) return true;
        if (t==='h' && bigK.some(k=>k[0]===dr&&k[1]===dc)) return true;
        if (t==='x') return true;
    }

    // Прямые
    const rookDirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for (let [dr,dc] of rookDirs){
        let rr=r+dr, cc=c+dc;
        while (onBd(rr,cc)) {
            const p = bd[rr][cc];
            if (p){
                if (getCol(p)===color){
                    const t=getType(p);
                    if (["r","q","z","a","c"].includes(t)) return true;
                }
                break;
            }
            rr+=dr; cc+=dc;
        }
    }

    // Диагонали
    const diag=[[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr,dc] of diag){
        let rr=r+dr, cc=c+dc;
        while (onBd(rr,cc)){
            const p=bd[rr][cc];
            if (p){
                if (getCol(p)===color){
                    const t=getType(p);
                    if (["b","q","z","a","c"].includes(t)) return true;
                }
                break;
            }
            rr+=dr; cc+=dc;
        }
    }

    // Король
    for (let dr of [-1,0,1]){
        for (let dc of [-1,0,1]){
            if (dr===0 && dc===0) continue;
            const rr=r+dr, cc=c+dc;
            if (onBd(rr,cc)){
                const p=bd[rr][cc];
                if (p && getCol(p)===color && getType(p)==='k')
                    return true;
            }
        }
    }

    return false;
}

//
// =====================================================
//   MAKE AI MOVE (ПОЛНЫЙ HTML АЛГОРИТМ)
// =====================================================
//
function makeAIMove() {

    if (!aiEnabled) return;
    if (NET.isOnlineActive()) return;

    if (pendingMove) {
        declineProp();
        return;
    }

    let bestScore = -999999;
    let bestMove = null;

    const inCheckNow = inCheck(aiColor, board);
    const dangerNow  = getGlobalThreatScore(board, aiColor);

    for (let r=0;r<8;r++){
        for (let c=0;c<8;c++){

            if (!board[r][c] || getCol(board[r][c]) !== aiColor) continue;

            let raw = getMovesAt(r, c, false).filter(m => !m.prop && !m.merge && !m.fuse);

            let legal = [];
            for (let mv of raw) {
                const after = simulateMove(board, {r,c}, mv);
                if (!inCheck(aiColor, after)) legal.push(mv);
            }

            if (legal.length === 0) continue;

            for (let mv of legal) {
                const score = evaluateMove(
                    {r,c},
                    mv,
                    board,
                    aiColor,
                    inCheckNow,
                    dangerNow
                );

                const noise = Math.random() * 0.5;
                if (score + noise > bestScore) {
                    bestScore = score + noise;
                    bestMove = { from:{r,c}, to: mv };
                }
            }
        }
    }

    if (!bestMove) return;

    executeAIMove(bestMove);
}

//
// =====================================================
//   ВЫПОЛНЕНИЕ ХОДА ИИ
// =====================================================
//
function executeAIMove(m) {
    selected = m.from;
    doMove(m.to);
    selected = null;
}
//
// =====================================================
//   CHECK GAME STATE — мат, пат (полная HTML версия)
// =====================================================
//
function checkGameState() {

    let hasMoves = false;

    for (let r=0;r<8;r++){
        for (let c=0;c<8;c++){
            if (board[r][c] && getCol(board[r][c]) === turn) {
                const ms = getMovesAt(r,c,true)
                    .filter(m => !m.fuse && !m.merge && !m.prop);

                if (ms.length > 0) {
                    hasMoves = true;
                }
            }
        }
    }

    const check = inCheck(turn, board);

    // === ШАХ И МАТ ===
    if (!hasMoves && check) {

        const winner = (turn === 'white') ? 'black' : 'white';

        log(`МАТ! Победили ${winner === 'white' ? 'Белые' : 'Чёрные'}`);

        // правила показа кнопки "ВОСКРЕСИТЬ АРМИЮ"
        const allowNewMode =
            (turn === 'white' ? !whiteRevived : !blackRevived);

        const onlineBlock =
            NET.isOnlineActive() &&
            NET.getOnlineColor() &&
            NET.getOnlineColor() !== turn;

        showEndModal(
            true,               // isCheckmate
            winner,             // winnerColor
            allowNewMode,       // allow resurrection?
            onlineBlock,        // hide buttons if opponent decides
            onlineBlock         // waiting text
        );

        return;
    }

    // === ПАТ ===
    if (!hasMoves && !check) {

        log("ПАТ! Ничья.");

        showEndModal(
            false,  // not checkmate
            null,
            false,  // no resurrection on stalemate
            false,
            false
        );
        return;
    }

    hideEndModal();
}

//
// =====================================================
//   ONLINE SYNC — приём хода из сети
// =====================================================
//
export function applyRemoteMove(data) {

    // счётчик ходов
    if (typeof data.moveCount !== 'undefined')
        moveCount = data.moveCount;

    // режим (classic / new_mode)
    if (data.mode && gameMode !== data.mode) {
        gameMode = data.mode;
        if (data.mode === 'new_mode') {
            kingDead = true;
            newModePlayer = data.turn;
        }
    }

    // дипломатия
    hideDipModal();

    if (data.lastMove && data.lastMove.proposal) {

        if (myOnlineColor && myOnlineColor === data.turn) {
            log("Ожидание ответа соперника на союз...");
        } else {
            pendingMove = data.lastMove.to;
            selected = data.lastMove.from;
            showDipModal();
            log("Получено предложение союза!");
        }

        return;
    }

    // синхронизация доски
    board.splice(0, board.length, ...data.board.map(r=>[...r]));
    turn = data.turn;

    if (data.castling) {
        castling.white = {...data.castling.white};
        castling.black = {...data.castling.black};
    }

    if (data.chimeraTracker) {
        Object.keys(chimeraTracker).forEach(k => delete chimeraTracker[k]);
        Object.assign(chimeraTracker, data.chimeraTracker);
    }

    lastMoveData = data.lastMove || null;

    pushUIState();
    render();
    updateUI();
    checkGameState();
}

//
// =====================================================
//   NETWORK EVENTS → controller entry points
// =====================================================
//
export function onGameStartNet(data) {

    myOnlineColor = data.color;
    NET.setCallbacks({
        onRemoteMove: applyRemoteMove,
        onGameStart: onGameStartNet,
        onRoomList: _ => {},
        onOpponentLeft: () => { alert("Соперник отключился."); location.reload(); },
        onError: msg => alert(msg)
    });

    board.splice(0, board.length, ...data.board.map(r=>[...r]));
    turn = data.turn;

    castling.white = {...data.castling.white};
    castling.black = {...data.castling.black};

    moveCount = 0;

    selected = null;
    moves = [];
    pendingMove = null;
    lastMoveData = null;

    pushUIState();
    render();
    updateUI();
}

//
// =====================================================
//   TOGGLE AI (ПОЛНЫЙ HTML)
// =====================================================
//
export function toggleAI() {
    aiEnabled = !aiEnabled;

    if (aiEnabled) {
        log("Режим ИИ включён. Вы играете против робота.");
        myOnlineColor = null;
    } else {
        log("Режим ИИ выключен.");
    }
}

//
// =====================================================
//   NETWORK COMMANDS (HOST/JOIN) — перенесены 1:1
// =====================================================
//

export function hostGame() {
    NET.hostGame();
}

export function joinGame(roomId) {
    NET.joinGame(roomId);
}

export function enterOnlineMode(id, status) {
    // Чисто UI отображение вынесено в ui.js, но HTML делал это здесь.
    document.getElementById('lobby-panel').classList.add('hidden');
    document.getElementById('online-active-ui').classList.remove('hidden');
    document.getElementById('room-display').innerText = id;
    document.getElementById('online-msg').innerText = status;

    myOnlineColor = NET.getOnlineColor();
}

//
// =====================================================
//   ПОЛНЫЙ ЭКСПОРТ КОНТРОЛЛЕРА
// =====================================================
//

export default {
    initGame,
    clickCell,
    doMove,
    endTurn,
    toggleAI,
    activateNewMode,
    acceptProp,
    declineProp,
    applyRemoteMove,
    onGameStartNet,
    hostGame,
    joinGame,
    enterOnlineMode,
    setUICallbacks
};
