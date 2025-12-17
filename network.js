// network.js — Полная копия сетевой логики из HTML
// Вариант 3 — перенос 1-в-1, но в виде модуля.

// === ВНЕШНИЕ CALLBACK-и ===
// controller.js будет устанавливать эти функции:
let onRemoteMove = null;
let onGameStart = null;
let onRoomList = null;
let onOpponentLeft = null;
let onError = null;

export function setCallbacks(callbacks) {
    onRemoteMove   = callbacks.onRemoteMove   || null;
    onGameStart    = callbacks.onGameStart    || null;
    onRoomList     = callbacks.onRoomList     || null;
    onOpponentLeft = callbacks.onOpponentLeft || null;
    onError        = callbacks.onError        || null;
}

// === внутренние переменные ===

let socket = null;
let currentRoomId = null;
let myOnlineColor = null;
let isConnected = false;

// === API, вызываемое controller.js ===

// Соединение с сервером
export function connectToServer() {
    socket = io(); // socket.io определён глобально

    socket.on("connect", () => {
        isConnected = true;
        console.log("Сеть: подключено.");
    });

    socket.on("connect_error", (err) => {
        console.log("Ошибка подключения:", err);
    });

    setupSocketListeners();
}

export function isOnlineActive() {
    return !!currentRoomId;
}

export function getOnlineColor() {
    return myOnlineColor;
}

export function hostGame() {
    if (!isConnected) {
        alert("Сначала подключитесь к серверу!");
        return;
    }

    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.emit("create_room", roomId);
    currentRoomId = roomId;

    // controller сам покажет интерфейс
    if (onGameStart) {
        onGameStart({
            roomId,
            awaiting: true
        });
    }
}

export function joinGame(roomId) {
    if (!isConnected) {
        alert("Сначала подключитесь к серверу!");
        return;
    }
    socket.emit("join_room", roomId);
}

// Отправка хода
export function sendMoveToCloud(boardState, nextTurn, moveDetails, castlingState, modeState, mCount, chimeraTracker) {
    if (!socket || !currentRoomId) return;

    socket.emit("make_move", {
        roomId: currentRoomId,
        board: boardState,
        turn: nextTurn,
        lastMove: moveDetails,
        castling: castlingState,
        mode: modeState,
        moveCount: mCount,
        chimeraTracker
    });
}


// ============================================================================
// === СОБЫТИЯ SOCKET.IO (1-в-1 ваш HTML)                                     
// ============================================================================

function setupSocketListeners() {
    // Список комнат
    socket.on("room_list", (rooms) => {
        if (onRoomList) onRoomList(rooms);
    });

    // Игрок присоединился
    socket.on("player_joined", (data) => {
        console.log("Игрок подключился к комнате:", data.roomId);
    });

    // Начало игры
    socket.on("game_start", (data) => {
        currentRoomId = data.roomId;
        myOnlineColor = data.color;

        if (onGameStart) {
            onGameStart({
                roomId: data.roomId,
                color: data.color,
                board: data.board,
                turn: data.turn,
                castling: data.castling
            });
        }
    });

    // Получение хода
    socket.on("receive_move", (data) => {
        if (onRemoteMove) onRemoteMove(data);
    });

    socket.on("error_msg", (msg) => {
        if (onError) onError(msg);
    });

    socket.on("opponent_left", () => {
        if (onOpponentLeft) onOpponentLeft();
    });
}
