const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {

    document.addEventListener("mousedown", (e) => {

        if (e.button === 1) {

            ipcRenderer.send("start-drag");
        }

    });

});