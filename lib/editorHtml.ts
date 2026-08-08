const CDN = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16";

const MODES = [
  "javascript/javascript",
  "xml/xml",
  "css/css",
  "htmlmixed/htmlmixed",
  "markdown/markdown",
  "python/python",
  "yaml/yaml",
  "shell/shell",
  "clike/clike",
  "ruby/ruby",
  "go/go",
  "sql/sql",
  "jsx/jsx",
];

const modeScripts = MODES.map(
  (m) => `<script src="${CDN}/mode/${m}.min.js"><\/script>`
).join("\n");

export function buildEditorHtml(fileName: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="color-scheme" content="dark">
<link rel="stylesheet" href="${CDN}/codemirror.min.css">
<link rel="stylesheet" href="${CDN}/theme/material-darker.min.css">
<script src="${CDN}/codemirror.min.js"><\/script>
${modeScripts}
<style>
  html, body { margin: 0; padding: 0; background: #0d1117; height: 100%; overflow: hidden; -webkit-user-select: text; user-select: text; }
  #app { height: 100%; }
  .CodeMirror { height: 100%; font-size: 13px; line-height: 1.5; background: #0d1117; }
  .CodeMirror-gutters { background: #0d1117; border-right: 1px solid #30363d; }
  .CodeMirror-linenumber { color: #6e7681; padding: 0 8px 0 4px; }
  .cm-s-material-darker.CodeMirror { background: #0d1117; }
  .cm-s-material-darker .CodeMirror-cursor { border-left: 1px solid #2f81f7; }
  .cm-s-material-darker .CodeMirror-selected { background: #264f78; }
</style>
</head>
<body>
<div id="app"></div>
<script>
var FILE_NAME = ${JSON.stringify(fileName)};
var INITIAL_CONTENT = ${JSON.stringify(content)};
var EXT_MODES = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "javascript", tsx: "jsx", json: "javascript", jsonc: "javascript",
  md: "markdown", markdown: "markdown", html: "htmlmixed", htm: "htmlmixed",
  xml: "xml", svg: "xml", css: "css", scss: "css", less: "css",
  py: "python", rb: "ruby", go: "go", rs: "text/x-rustsrc",
  java: "text/x-java", c: "text/x-csrc", h: "text/x-csrc",
  cpp: "text/x-c++src", cc: "text/x-c++src",
  sh: "shell", bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml",
  sql: "sql", swift: "text/x-swift", kt: "text/x-kotlin", php: "text/x-php",
  gitignore: "shell", env: "shell", tf: "shell", toml: "shell"
};
function modeFor(file) {
  var lower = file.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith("/dockerfile")) return "yaml";
  var ext = (file.split(".").pop() || "").toLowerCase();
  return EXT_MODES[ext] || null;
}
  var editor = CodeMirror(document.getElementById("app"), {
    value: INITIAL_CONTENT,
    readOnly: false,
  mode: modeFor(FILE_NAME),
  theme: "material-darker",
  lineNumbers: true,
  lineWrapping: false,
  indentUnit: 2,
  tabSize: 2,
  indentWithTabs: false,
  scrollbarStyle: "native",
    cursorBlinkRate: 530
  });
  window.editor = editor;
  editor.refresh();
  editor.on("change", function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "change", value: editor.getValue() }));
  });
window.addEventListener("message", function (event) {
  var data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "getValue") {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "value", value: editor.getValue() }));
  } else if (data.type === "scrollToLine") {
    var line = Math.max(0, (data.line || 1) - 1);
    editor.setCursor({ line: line, ch: 0 });
    editor.scrollIntoView({ line: line, ch: 0 }, 100);
  } else if (data.type === "focus") {
    editor.focus();
  }
});
<\/script>
</body>
</html>`;
}
