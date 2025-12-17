// main.js — связывает UI, controller и network, заменяя window.* из старого HTML

import * as CONTROLLER from "./controller.js";
import * as NETWORK from "./network.js";
import UI from "./ui.js";

// ================================
//       1. ИНИЦИАЛИЗАЦИЯ UI → CONTROLLER
// ================================
CONTROLLER.setUICallbacks();

// ================================
//       2. СЕТЕВЫЕ КОЛЛБЭКИ
// ================================
NETWORK.setCallbacks({
    onRemoteMove: (data) => CONTROLLER.applyRemoteMove(data),
    onGameStart:  (data) => CONTROLLER.onGameStartNet(data),
    onRoomList:   (rooms) => updateRoomList(rooms),
    onOpponentLeft: () => alert("Соперник отключился."),
    onError: (msg) => alert(msg)
});

// ================================
//       3. ЗАПУСК ОНЛАЙНА
// ================================

document.getElementById("btn-connect").onclick = () => {
    NETWORK.connectToServer();
};

document.getElementById("btn-host").onclick = () => {
    CONTROLLER.hostGame();
};

document.getElementById("btn-join").onclick = () => {
    const room = document.getElementById("room-input").value.trim().toUpperCase();
    if (room) CONTROLLER.joinGame(room);
};

// Обновление списка комнат в лобби
function updateRoomList(rooms) {
    const box = document.getElementById("room-list-container");
    box.innerHTML = "";

    if (rooms.length === 0) {
        box.innerHTML = '<div class="text-gray-500 text-[10px] italic">Нет доступных комнат</div>';
        return;
    }

    rooms.forEach(room => {
        const btn = document.createElement("button");
        btn.className =
            "w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 mb-1 rounded text-xs flex justify-between items-center";
        btn.innerHTML = `
            <span class="text-blue-400 font-mono font-bold">#${room.id}</span>
            <span class="text-gray-400 text-[9px]">Игроков: ${room.count}/2</span>
        `;
        btn.onclick = () => CONTROLLER.joinGame(room.id);
        box.appendChild(btn);
    });
}

// ================================
//       4. КНОПКИ ИИ / ПЕРЕЗАПУСКА
// ================================

document.getElementById("btn-ai").onclick = () => {
    CONTROLLER.toggleAI();
};

document.getElementById("btn-reload").onclick = () => {
    location.reload();
};

document.getElementById("btn-restart").onclick = () => {
    CONTROLLER.initGame();
};

document.getElementById("btn-accept").onclick = () => {
    CONTROLLER.acceptProp();
};

document.getElementById("btn-decline").onclick = () => {
    CONTROLLER.declineProp();
};

document.getElementById("btn-new-mode").onclick = () => {
    CONTROLLER.activateNewMode();
};

// ================================
//       5. СТАРТ ИГРЫ
// ================================

window.onload = () => {
    CONTROLLER.initGame();
};
