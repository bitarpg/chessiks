// ui.js — полный UI, полностью перенесённый из HTML, без изменений поведения.
import GP from "../pieceset.js";   // путь подстрой под твою структуру

import { board, turn, gameMode, newModePlayer, kingDead, getCol, getType, onBd, isLight } from "../engine/engine.js";

// Глобальные переменные UI-слоя (как в HTML)
let moves = [];
let selected = null;
let chimeraTracker = {};
let lastMoveData = null;
let myOnlineColor = null;

// Controller callbacks (устанавливаются controller.js)
let uiCallbacks = {
    clickCell: () => {},
    acceptProp: () => {},
    declineProp: () => {},
    activateNewMode: () => {}
};

// Установить callback-и
export function setCallbacks(cb) {
    uiCallbacks = cb;
}

// Обновляем движковые переменные, чтобы UI и controller синхронизировались.
// Controller будет вызывать это перед render().
export function updateUIState(state) {
    moves = state.moves;
    selected = state.selected;
    chimeraTracker = state.chimeraTracker;
    lastMoveData = state.lastMoveData;
    myOnlineColor = state.myOnlineColor;
}

// ЛОГ
export function log(t) {
    const l = document.getElementById('log');
    l.innerHTML = `<div>> ${t}</div>` + l.innerHTML;
}

// ОБНОВЛЕНИЕ ПАНЕЛЕЙ
export function updateUI() {
    document.getElementById('turn-display').innerText = turn.toUpperCase();
    document.getElementById('mode-display').innerText =
        gameMode === 'new_mode' ? 'LAST STAND' : 'КЛАССИКА';
    // loyalty обновляет controller — UI только отображает
}

//
// ======== НАЧАЛО ГЛАВНОЙ ФУНКЦИИ RENDER (перенос из HTML 1-в-1) =========
//

export function render() {
    const div = document.getElementById('board');
    const svg = document.getElementById('svg-overlay');

    // Очищаем клетки
    const cells = div.querySelectorAll('.cell');
    cells.forEach(c => c.remove());
    svg.innerHTML = ''; // удаляем линии

    const inChk = inCheckUI(turn);

    // Поворот доски
    const wrapper = document.querySelector('.board-wrapper');
    const flipped = (myOnlineColor === 'black');

    if (flipped) wrapper.classList.add('flipped');
    else wrapper.classList.remove('flipped');

    // === РЕНДЕР КЛЕТОК И ФИГУР ===
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const d = document.createElement('div');
            d.className = `cell ${(r + c) % 2 ? 'dark' : 'light'}`;

            // Выбранная клетка
            if (selected && selected.r === r && selected.c === c)
                d.classList.add('selected');

            // Шах
            const p = board[r][c];
            if (inChk && p && getCol(p) === turn) {
                const target = (gameMode === 'new_mode' && kingDead && turn === newModePlayer) ? 'z' : 'k';
                if (getType(p) === target) d.classList.add('check');
            }

            // === ФИГУРА ===
            if (p) {
                const s = document.createElement('span');
                s.className = `piece ${getCol(p)}`;

                const t = getType(p);

                // ARCHON
                if (t === 'a' || t === 'c') {
                    s.classList.add('archon');
                    if (t === 'a') s.classList.add('archon-light');
                    else s.classList.add('archon-dark');
                    s.innerHTML += `<span class="badge">${t.toUpperCase()}</span>`;
                }

                // LEGION
                if (t === 'h') {
                    s.classList.add('legion');
                    s.innerHTML += `<span class="badge">L</span>`;
                }

                // CHIMERA
                if (t === 'x') {
                    s.classList.add('chimera');
                    s.innerHTML += `<span class="badge">X</span>`;
                }

                // HEAVY QUEEN (Z)
                if (t === 'z') {
                    s.classList.add('heavy');
                    s.innerHTML += `<span class="badge">Z</span>`;
                }

                s.innerText = GP[p] || p;
                d.appendChild(s);
            }

            // === ПОДСКАЗКИ ХОДОВ ===
            const mv = moves.find(m => m.r === r && m.c === c);
            if (mv) {
                const h = document.createElement('div');
                h.className = 'hint';

                if (mv.prop) h.classList.add('union-hint');
                else if (mv.atk) h.classList.add('attack-hint');
                else if (mv.fuse) {
                    h.classList.add('special-hint', 'fuse');
                    h.innerText = 'FUSE';
                }
                else if (mv.merge) {
                    h.classList.add('special-hint', 'legion');
                    h.innerText = 'LEGION';
                }
                else if (mv.castle) {
                    h.classList.add('special-hint', 'castle');
                    h.innerText = 'CASTLE';
                }
                else h.classList.add('move-hint');

                d.appendChild(h);
            }

            // === КЛИК ===
            d.onclick = () => uiCallbacks.clickCell(r, c);

            div.appendChild(d);
        }
    }

    // === ЛИНИЯ ПОСЛЕДНЕГО ХОДА ===
    if (lastMoveData && lastMoveData.from && lastMoveData.to) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.classList.add("last-move-purple");

        const x1 = (lastMoveData.from.c * 12.5 + 6.25) + "%";
        const y1 = (lastMoveData.from.r * 12.5 + 6.25) + "%";
        const x2 = (lastMoveData.to.c * 12.5 + 6.25) + "%";
        const y2 = (lastMoveData.to.r * 12.5 + 6.25) + "%";

        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("stroke", "rgba(124,58,237,0.5)");
        line.setAttribute("stroke-width", "6");
        line.setAttribute("stroke-linecap", "round");

        svg.appendChild(line);
    }
}

//
// ======== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ UI (как в HTML) =========
//

//
// ===========================
//   UI inCheck (как в HTML)
// ===========================
function inCheckUI(col) {
    // Строгое соответствие HTML-версии проверки шаха
    let kingSymbol = (col === 'white') ? 'k' : 'K';

    // В Last Stand (Z-режим) король заменяется на Z
    if (gameMode === 'new_mode' && kingDead && col === newModePlayer) {
        kingSymbol = (col === 'white') ? 'z' : 'Z';
    }

    // ищем короля / Z
    let kr = -1, kc = -1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === kingSymbol) {
                kr = r; kc = c;
                break;
            }
        }
    }
    if (kr === -1) return true; // нет короля → шах

    const opp = (col === 'white' ? 'black' : 'white');

    // === 1. Пешки ===
    const pawnAttackDir = (opp === 'white') ? 1 : -1;
    for (let dc of [-1, 1]) {
        const rr = kr + pawnAttackDir, cc = kc + dc;
        if (onBd(rr, cc)) {
            const p = board[rr][cc];
            if (p && getCol(p) === opp && getType(p) === 'p')
                return true;
        }
    }

    // === 2. Конь / Легион / Химера ===
    const smallK = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    const bigK   = [[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4]];

    // Конь
    for (let [dr,dc] of smallK) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr,cc)) continue;
        const p = board[rr][cc];
        if (p && getCol(p) === opp && getType(p) === 'n')
            return true;
    }

    // Легион
    for (let [dr,dc] of bigK) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr,cc)) continue;
        const p = board[rr][cc];
        if (p && getCol(p) === opp && getType(p) === 'h')
            return true;
    }

    // Химера (оба диапазона)
    for (let [dr,dc] of [...smallK, ...bigK]) {
        const rr = kr + dr, cc = kc + dc;
        if (!onBd(rr,cc)) continue;
        const p = board[rr][cc];
        if (p && getCol(p) === opp && getType(p) === 'x')
            return true;
    }

    // === 3. Ладья / Ферзь / Z / Архонт по прямым линиям ===
    const rookDirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let [dr,dc] of rookDirs) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr,cc)) {
            const p = board[rr][cc];
            if (p) {
                const t = getType(p);
                if (getCol(p) === opp &&
                   (t === 'r' || t === 'q' || t === 'z' || t === 'a' || t === 'c'))
                    return true;
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // === 4. Диагонали — слон, ферзь, Z, архонт в зависимости от клетки ===
    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr,dc] of diag) {
        let rr = kr + dr, cc = kc + dc;
        while (onBd(rr,cc)) {
            const p = board[rr][cc];
            if (p) {
                const t = getType(p);
                if (getCol(p) === opp) {
                    if (t === 'b' || t === 'q' || t === 'z')
                        return true;
                    if (t === 'a' && isLight(rr,cc))
                        return true;
                    if (t === 'c' && !isLight(rr,cc))
                        return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // === 5. Король соперника рядом ===
    for (let dr of [-1,0,1]) {
        for (let dc of [-1,0,1]) {
            if (dr === 0 && dc === 0) continue;
            const rr = kr + dr, cc = kc + dc;
            if (!onBd(rr,cc)) continue;
            const p = board[rr][cc];
            if (p && getCol(p) === opp && getType(p) === 'k')
                return true;
        }
    }

    return false;
}

//
// ===========================
//   isSquareThreatened()
//   (В HTML использовалось для ИИ и UI-подсветок)
// ===========================
function isSquareThreatened(bd, r, c, byColor) {

    // === Пешки ===
    if (byColor === "white") {
        const rr = r + 1;
        for (let dc of [-1,1]) {
            const cc = c + dc;
            if (onBd(rr,cc)) {
                const p = bd[rr][cc];
                if (p && getCol(p) === "white" && getType(p) === "p")
                    return true;
            }
        }
    } else {
        const rr = r - 1;
        for (let dc of [-1,1]) {
            const cc = c + dc;
            if (onBd(rr,cc)) {
                const p = bd[rr][cc];
                if (p && getCol(p) === "black" && getType(p) === "p")
                    return true;
            }
        }
    }

    // === Knight / Legion / Chimera ===
    const smallK = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    const bigK   = [[4,1],[4,-1],[-4,1],[-4,-1],[1,4],[1,-4],[-1,4],[-1,-4]];

    for (let [dr,dc] of [...smallK, ...bigK]) {
        const rr = r + dr, cc = c + dc;
        if (!onBd(rr,cc)) continue;
        const p = bd[rr][cc];
        if (!p || getCol(p) !== byColor) continue;
        const t = getType(p);

        if (t === 'n' && smallK.some(k=>k[0]===dr&&k[1]===dc))
            return true;
        if (t === 'h' && bigK.some(k=>k[0]===dr&&k[1]===dc))
            return true;
        if (t === 'x')
            return true;
    }

    // === Rook / Queen / Z / Archon прямые ===
    const rookDirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let [dr,dc] of rookDirs) {
        let rr = r + dr, cc = c + dc;
        while (onBd(rr,cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === byColor) {
                    const t = getType(p);
                    if (["r","q","z","a","c"].includes(t))
                        return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // === Bishop / Queen / Z / Archon диагонали ===
    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr,dc] of diag) {
        let rr = r + dr, cc = c + dc;
        while (onBd(rr,cc)) {
            const p = bd[rr][cc];
            if (p) {
                if (getCol(p) === byColor) {
                    const t = getType(p);
                    if (["b","q","z"].includes(t))
                        return true;
                    if (t === 'a' && isLight(rr,cc))
                        return true;
                    if (t === 'c' && !isLight(rr,cc))
                        return true;
                }
                break;
            }
            rr += dr; cc += dc;
        }
    }

    // === Король ===
    for (let dr of [-1,0,1]) {
        for (let dc of [-1,0,1]) {
            if (dr === 0 && dc === 0) continue;
            const rr = r + dr, cc = c + dc;
            if (!onBd(rr,cc)) continue;
            const p = bd[rr][cc];
            if (p && getCol(p) === byColor && getType(p) === 'k')
                return true;
        }
    }

    return false;
}

//
// ===========================
//    ВСПОМОГАТЕЛЬНЫЕ UI ФУНКЦИИ
// ===========================
function opposite(col) {
    return col === 'white' ? 'black' : 'white';
}

function getPieceValue(p) {
    if (!p) return 0;
    const t = p.toLowerCase();
    const map = {
        p:1, n:3, h:5, b:3, r:5, a:7, c:7, q:9, x:7, z:10, k:100
    };
    return map[t] || 0;
}
// ===============================
//   МОДАЛКИ UI (как в HTML)
// ===============================

// Дипломатия — окно принятия/отказа союза
export function showDipModal() {
    document.getElementById('dip-modal').classList.add('active');
}

export function hideDipModal() {
    document.getElementById('dip-modal').classList.remove('active');
}

// Кнопки “ПРИНЯТЬ” / “ОТКАЗАТЬ”
// HTML-version → window.acceptProp(), window.declineProp()
// теперь → uiCallbacks.acceptProp() / uiCallbacks.declineProp()

document.getElementById('dip-modal')?.querySelector('.btn.bg-purple-600')?.addEventListener('click', () => {
    uiCallbacks.acceptProp();
});

document.getElementById('dip-modal')?.querySelector('.btn.bg-red-600')?.addEventListener('click', () => {
    uiCallbacks.declineProp();
});

// ===============================
//   МОДАЛКА МАТА (END-MODAL)
// ===============================

export function showEndModal(isCheckmate, winnerColor, allowNewMode, isOnlineBlock, waitForOpponent) {
    const modal = document.getElementById('end-modal');
    const title = document.getElementById('end-title');
    const desc  = document.getElementById('end-desc');
    const buttons = document.getElementById('end-buttons');
    const waitMsg = document.getElementById('winner-wait-msg');
    const btnNewMode = document.getElementById('btn-new-mode');

    if (isCheckmate) {
        title.innerText = winnerColor === 'white' ? "БЕЛЫМ МАТ" : "ЧЕРНЫМ МАТ";
        desc.innerText = "Король пал. Возродить армию?";
    } else {
        title.innerText = "ПАТ";
        desc.innerText = "Ничья. Ни один игрок не может сделать ход.";
    }

    // Разрешить кнопку resurrect only if allowed
    btnNewMode.style.display = allowNewMode ? 'inline-flex' : 'none';

    // Если онлайн-режим не разрешает выбор победителю
    if (isOnlineBlock) {
        buttons.classList.add('hidden');
        waitMsg.classList.remove('hidden');
    } else {
        buttons.classList.remove('hidden');
        waitMsg.classList.add('hidden');
    }

    modal.classList.add('active');
}

export function hideEndModal() {
    document.getElementById('end-modal').classList.remove('active');
}

// Кнопка “ВОСКРЕСИТЬ АРМИЮ”
document.getElementById('btn-new-mode')?.addEventListener('click', () => {
    uiCallbacks.activateNewMode();
});

// ===============================
//   ОБНОВЛЕНИЕ СЧЁТЧИКОВ UI
// ===============================

export function updateLossCountersUI(whiteLoss, blackLoss) {
    document.getElementById('loss-w').innerText = whiteLoss;
    document.getElementById('loss-b').innerText = blackLoss;
}

export function updateMoraleUI(whiteMorale, blackMorale) {
    document.getElementById("morale-w").innerText = whiteMorale.toFixed(1);
    document.getElementById("morale-b").innerText = blackMorale.toFixed(1);

    const wElem = document.getElementById("morale-w");
    const bElem = document.getElementById("morale-b");

    function colorize(el, morale) {
        if (morale > 6) el.style.color = "#34d399";      // зелёный
        else if (morale > 3) el.style.color = "#fbbf24"; // жёлтый
        else el.style.color = "#f87171";                 // красный
    }

    colorize(wElem, whiteMorale);
    colorize(bElem, blackMorale);
}

// ===============================
//   СЕТЕВАЯ СИНХРОНИЗАЦИЯ (UI часть)
// ===============================

// Controller вызывает эту функцию после получения состояния из сети
export function syncOnlineState(newBoard, newTurn, newCastling, newTracker) {
    // UI только отображает, controller обновляет движок
    if (newTracker) chimeraTracker = newTracker;
    render();
}

// ===============================
//   ОБЩИЙ ЭКСПОРТ UI-МОДУЛЯ
// ===============================

export default {
    render,
    updateUI,
    log,
    updateUIState,
    setCallbacks,
    showDipModal,
    hideDipModal,
    showEndModal,
    hideEndModal,
    updateLossCountersUI,
    updateMoraleUI,
    syncOnlineState
};

