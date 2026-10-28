/*
 * Suryo chat widget. One script tag on any site:
 *   <script src="https://<host>/widget.js" data-business="kesar" async></script>
 * Everything lives inside a closed shadow root so neither page CSS nor ours can bleed across.
 * Host pages can open it with a drafted message:
 *   window.dispatchEvent(new CustomEvent("suryo:open", { detail: { message: "Track my order" } }));
 */
(function () {
  "use strict";

  var docEl = document.documentElement;
  if (docEl.hasAttribute("data-suryo-widget")) return;
  var script =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"][data-business]');
  if (!script || !script.src) return;

  var business = (script.getAttribute("data-business") || "").trim();
  if (!/^[a-z0-9-]{1,80}$/.test(business)) {
    console.warn("[suryo] widget.js needs a valid data-business attribute");
    return;
  }
  // A DOM marker instead of a window global, so loading the tag twice stays harmless.
  docEl.setAttribute("data-suryo-widget", "");

  var origin = new URL(script.src, window.location.href).origin;
  var chatUrl = origin + "/chat/" + encodeURIComponent(business) + "?embed=1";
  var accent = script.getAttribute("data-accent") || "#ff7a30";
  var label = script.getAttribute("data-label") || "Chat with the front desk";

  var ICON_CHAT =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.5C4 7.36 7.58 4 12 4s8 3.36 8 7.5S16.42 19 12 19c-.98 0-1.92-.16-2.79-.46L5 20l1.06-3.43A7.1 7.1 0 0 1 4 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.6" cy="11.5" r="1.1" fill="currentColor"/><circle cx="12" cy="11.5" r="1.1" fill="currentColor"/><circle cx="15.4" cy="11.5" r="1.1" fill="currentColor"/></svg>';
  var ICON_CLOSE =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".launcher{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border:0;border-radius:50%;cursor:pointer;" +
    "display:grid;place-items:center;color:#160a03;background:" + accent + ";" +
    "box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 28px -8px rgba(0,0,0,.45),0 3px 8px rgba(0,0,0,.2);" +
    "transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s,opacity .2s;-webkit-tap-highlight-color:transparent}" +
    ".launcher:hover{transform:translateY(-2px) scale(1.03)}" +
    ".launcher:active{transform:scale(.96)}" +
    ".launcher:focus-visible{outline:3px solid " + accent + ";outline-offset:3px}" +
    ".launcher .icon{position:absolute;display:grid;place-items:center;transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .2s}" +
    ".launcher .close{opacity:0;transform:rotate(-90deg) scale(.6)}" +
    ".open .launcher .chat{opacity:0;transform:rotate(90deg) scale(.6)}" +
    ".open .launcher .close{opacity:1;transform:none}" +
    ".panel{position:fixed;right:20px;bottom:92px;width:400px;height:min(640px,calc(100vh - 120px));" +
    "border-radius:18px;overflow:hidden;background:#08080a;" +
    "box-shadow:0 0 0 1px rgba(255,255,255,.06),0 30px 80px -20px rgba(0,0,0,.55),0 12px 28px -10px rgba(0,0,0,.4);" +
    "transform-origin:calc(100% - 28px) calc(100% + 40px);opacity:0;transform:translateY(12px) scale(.94);" +
    "pointer-events:none;visibility:hidden;" +
    "transition:opacity .22s ease,transform .38s cubic-bezier(.22,1,.36,1),visibility 0s linear .38s}" +
    ".open .panel{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition:opacity .22s ease,transform .38s cubic-bezier(.22,1,.36,1),visibility 0s}" +
    "iframe{display:block;width:100%;height:100%;border:0;background:#08080a;color-scheme:dark}" +
    "@media (max-width:480px){" +
    ".panel{inset:0;width:100%;height:100%;border-radius:0;transform-origin:50% 100%}" +
    ".open .launcher{opacity:0;pointer-events:none;transform:scale(.8)}}" +
    "@media (prefers-reduced-motion:reduce){.launcher,.launcher .icon,.panel,.open .panel{transition:none!important}}";

  var host = document.createElement("div");
  host.setAttribute("data-suryo-widget", business);
  host.style.cssText = "position:fixed;z-index:2147483000;inset:auto 0 0 auto;width:0;height:0;";
  var root = host.attachShadow({ mode: "closed" });

  var style = document.createElement("style");
  style.textContent = css;
  var wrap = document.createElement("div");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", label);
  panel.setAttribute("aria-hidden", "true");

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", label);
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="icon chat">' + ICON_CHAT + '</span><span class="icon close">' + ICON_CLOSE + "</span>";

  wrap.appendChild(panel);
  wrap.appendChild(launcher);
  root.appendChild(style);
  root.appendChild(wrap);

  var iframe = null;
  var isOpen = false;
  var frameReady = false;
  var pendingDraft = "";

  function ensureFrame() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.src = chatUrl;
    iframe.title = label;
    iframe.allow = "clipboard-write";
    iframe.addEventListener("load", function () {
      if (isOpen) focusFrame();
    });
    panel.appendChild(iframe);
  }

  function focusFrame() {
    if (!iframe || !iframe.contentWindow) return;
    iframe.focus();
    iframe.contentWindow.postMessage("suryo:focus", origin);
  }

  // The chat only fills its composer; the visitor still chooses to send.
  function sendDraft() {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ type: "suryo:draft", text: pendingDraft }, origin);
    pendingDraft = "";
  }

  function open() {
    if (isOpen) return;
    ensureFrame();
    isOpen = true;
    wrap.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Close chat");
    window.setTimeout(focusFrame, 60);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    wrap.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", label);
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    if (isOpen) close();
    else open();
  });
  // Warm the iframe on intent so the chat is already painted when it opens.
  launcher.addEventListener("pointerenter", ensureFrame, { once: true });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen) close();
  });

  window.addEventListener("suryo:open", function (event) {
    var detail = event.detail;
    var text = detail && typeof detail.message === "string" ? detail.message.slice(0, 500) : "";
    pendingDraft = text;
    open();
    if (text && frameReady) sendDraft();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !iframe || event.source !== iframe.contentWindow) return;
    if (event.data === "suryo:close") close();
    // The chat announces itself once its listeners are attached, which is later than the load event.
    if (event.data === "suryo:ready") {
      frameReady = true;
      if (pendingDraft) sendDraft();
    }
  });

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
