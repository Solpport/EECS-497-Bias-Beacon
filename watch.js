const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 9876;
const FILES = [
  "content.js",
  "background.js",
  "popup.js",
  "popup.html",
  "manifest.json",
  "styles.css",
  "config.js",
];

let version = Date.now();

FILES.forEach((file) => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) return;
  fs.watch(fullPath, () => {
    version = Date.now();
    console.log(`[${new Date().toLocaleTimeString()}] ${file} changed — reloading extension`);
  });
});

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(String(version));
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Watching on port ${PORT}. Load the extension in your main Chrome profile and it will auto-reload on save.`);
  });
