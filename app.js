
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

/* =========================================================
   CONFIGURAÇÃO DO FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBJrLkfW9aAVJnrcB7hvYFbsJURBGjQU8M",
  authDomain: "duelosrankeadoswr.firebaseapp.com",
  projectId: "duelosrankeadoswr",
  storageBucket: "duelosrankeadoswr.firebasestorage.app",
  messagingSenderId: "453903935694",
  appId: "1:453903935694:web:d0334556ca801b84acc89f",
  measurementId: "G-6ZZ14JXLYB"
};

const ADMIN_UID = "U7ohORMjr1O9Ubby2WFMztAe8Au2";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const articlesRef = collection(db, "articles");

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const PAGE_SIZE = 9;

/* =========================================================
   ESTADO DA APLICAÇÃO
========================================================= */

let currentUser = null;
let isAdmin = false;

let allArticles = [];
let visibleArticles = [];

let activeCategory = "all";
let shownCount = PAGE_SIZE;

let currentArticleId = null;
let inlineMediaDraft = [];
let editorSavedRange = null;

let uploadInProgress = false;
let unsubscribePublic = null;
let unsubscribeAdmin = null;
let toastTimer = null;

/* =========================================================
   UTILITÁRIOS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(value) {
  const date = value?.toDate
    ? value.toDate()
    : value
      ? new Date(value)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function articleDate(article) {
  return (
    article.publishedAt ||
    article.updatedAt ||
    article.createdAt ||
    null
  );
}

function sortNewest(items) {
  return [...items].sort((a, b) => {
    const dateA = articleDate(a);
    const dateB = articleDate(b);

    const timeA = dateA?.toDate
      ? dateA.toDate().getTime()
      : new Date(dateA || 0).getTime();

    const timeB = dateB?.toDate
      ? dateB.toDate().getTime()
      : new Date(dateB || 0).getTime();

    return timeB - timeA;
  });
}

function gameLabel(game) {
  const labels = {
    "wild-rift": "Wild Rift",
    "lol-pc": "League of Legends PC",
    both: "Wild Rift + LoL PC"
  };

  return labels[game] || "Games";
}

function categoryLabel(category) {
  const labels = {
    atualizacoes: "Atualizações",
    esports: "Esports",
    guias: "Guias",
    meta: "Meta e balanceamento",
    comunidade: "Comunidade",
    "wild-rift": "Wild Rift",
    "lol-pc": "LoL PC"
  };

  return labels[category] || category || "Notícias";
}

function friendlyFirestoreError(error, action) {
  if (error?.code === "permission-denied") {
    return `O Firebase recusou a permissão para ${action}. Confira as regras do Firestore.`;
  }

  if (error?.code === "unavailable") {
    return "O Firebase está indisponível. Confira sua conexão.";
  }

  if (error?.code === "failed-precondition") {
    return "O Firestore informou uma pré-condição ausente. Confira o Console do navegador.";
  }

  return `Não foi possível ${action}. Código: ${
    error?.code || error?.message || "erro desconhecido"
  }.`;
}

/* =========================================================
   AVISOS NA TELA
========================================================= */

function showToast(message, duration = 3500) {
  const toast = $("#toast");

  if (!toast) {
    console.log(message);
    return;
  }

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }

  toast.classList.remove("show");
  toast.style.removeProperty("display");

  toast.textContent = String(message ?? "");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.classList.add("show");

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.style.setProperty("display", "none");
    toastTimer = null;
  }, Math.max(1000, Number(duration) || 3500));
}

function hideToast() {
  const toast = $("#toast");

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  if (toast) {
    toast.classList.remove("show");
    toast.style.setProperty("display", "none");
    toast.textContent = "";
  }
}

function setLoginError(message = "") {
  const element = $("#loginError");

  if (element) {
    element.textContent = message;
  }
}

function requireAdmin() {
  if (!currentUser || currentUser.uid !== ADMIN_UID || !isAdmin) {
    showToast("Entre com a conta autorizada para administrar as matérias.");
    openLogin();
    return false;
  }

  return true;
}

/* =========================================================
   SANITIZAÇÃO DO HTML DO EDITOR
========================================================= */

function sanitizeArticleHTML(html) {
  const parsed = new DOMParser().parseFromString(
    String(html ?? ""),
    "text/html"
  );

  const allowedTags = new Set([
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
    "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE",
    "A", "IMG", "FIGURE", "FIGCAPTION", "TABLE",
    "THEAD", "TBODY", "TR", "TH", "TD", "HR", "CODE",
    "PRE", "DIV", "SPAN", "SMALL", "SUB", "SUP", "MARK"
  ]);

  const allowedAttributes = new Set([
    "href", "src", "alt", "title", "target", "rel",
    "width", "height", "loading", "style"
  ]);

  function safeUrl(value) {
    const raw = String(value || "").trim();

    if (!raw) return "";

    try {
      const url = new URL(raw, window.location.href);

      if (!["https:", "http:"].includes(url.protocol)) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function clean(parent) {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const tag = node.tagName;

      if ([
        "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED",
        "FORM", "INPUT", "BUTTON", "SVG", "MATH",
        "LINK", "META", "BASE"
      ].includes(tag)) {
        node.remove();
        continue;
      }

      if (!allowedTags.has(tag)) {
        clean(node);
        node.replaceWith(...node.childNodes);
        continue;
      }

      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();

        if (!allowedAttributes.has(name)) {
          node.removeAttribute(attribute.name);
          continue;
        }

        if (name === "href" || name === "src") {
          const url = safeUrl(attribute.value);

          if (url) {
            node.setAttribute(name, url);
          } else {
            node.removeAttribute(attribute.name);
          }

          continue;
        }

        if (name === "style") {
          const match = attribute.value.match(
            /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|[a-z]{1,20})\s*(?:;|$)/i
          );

          if (match) {
            node.setAttribute("style", `color: ${match[1]};`);
          } else {
            node.removeAttribute("style");
          }
        }
      }

      if (
        tag === "A" &&
        node.getAttribute("target") === "_blank"
      ) {
        node.setAttribute("rel", "noopener noreferrer");
      }

      if (tag === "IMG") {
        node.setAttribute("loading", "lazy");
      }

      clean(node);
    }
  }

  clean(parsed.body);

  return parsed.body.innerHTML;
}

function renderContentSegment(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const hasHTML = /<\s*(p|br|strong|b|em|i|u|s|h[2-4]|ul|ol|li|blockquote|a|img|figure|table|hr|pre|code|div|span|small|sub|sup|mark)\b[^>]*>/i.test(text);

  if (hasHTML) {
    return sanitizeArticleHTML(text);
  }

  return text
    .split(/\n\s*\n/)
    .map(paragraph => {
      const clean = paragraph.trim();

      return clean
        ? `<p>${escapeHTML(clean).replace(/\n/g, "<br>")}</p>`
        : "";
    })
    .join("");
}

/* =========================================================
   VÍDEOS
========================================================= */

function buildVideoEmbed(rawUrl) {
  const value = String(rawUrl || "").trim();

  if (!value) return "";

  let url;

  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let src = "";

  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    let id = url.searchParams.get("v");

    if (!id && ["shorts", "live", "embed"].includes(parts[0])) {
      id = parts[1];
    }

    if (!id || !/^[\w-]{11}$/.test(id)) {
      return "";
    }

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  } else if (host === "youtu.be") {
    const id = parts[0];

    if (!id || !/^[\w-]{11}$/.test(id)) {
      return "";
    }

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  } else if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id = host === "player.vimeo.com" && parts[0] === "video"
      ? parts[1]
      : parts[parts.length - 1];

    if (!id || !/^\d+$/.test(id)) {
      return "";
    }

    src = `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
  } else if (["dailymotion.com", "dai.ly"].includes(host)) {
    let id = "";

    if (host === "dai.ly") {
      id = parts[0];
    } else if (parts[0] === "video") {
      id = (parts[1] || "").split("_")[0];
    }

    if (!id || !/^[A-Za-z0-9]+$/.test(id)) {
      return "";
    }

    src = `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
  } else if (/\.(mp4|webm|ogv|ogg)$/i.test(url.pathname)) {
    return `
      <div class="article-video">
        <video controls playsinline preload="metadata">
          <source src="${escapeHTML(url.href)}">
          Seu navegador não conseguiu reproduzir este vídeo.
        </video>
      </div>
    `;
  } else {
    return "";
  }

  return `
    <div class="article-video">
      <iframe
        src="${escapeHTML(src)}"
        title="Vídeo da matéria"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </div>
  `;
}

function renderArticleBody(content, media = []) {
  const mediaById = new Map(
    (Array.isArray(media) ? media : []).map(item => [item.id, item])
  );

  const markerPattern = /\[\[MEDIA:([a-zA-Z0-9_-]+)\]\]/g;
  const source = String(content || "");

  let html = "";
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(source)) !== null) {
    html += renderContentSegment(source.slice(cursor, match.index));

    const item = mediaById.get(match[1]);

    if (item?.url) {
      if (item.type === "image") {
        html += `
          <figure class="article-inline-media">
            <img
              src="${escapeHTML(item.url)}"
              alt="${escapeHTML(item.caption || "Imagem da matéria")}"
              loading="lazy"
            >
            ${
              item.caption
                ? `<figcaption>${escapeHTML(item.caption)}</figcaption>`
                : ""
            }
          </figure>
        `;
      } else if (item.type === "video-upload") {
        html += `
          <div class="article-video article-inline-media">
            <video controls playsinline preload="metadata">
              <source src="${escapeHTML(item.url)}">
              Seu navegador não conseguiu reproduzir este vídeo.
            </video>
            ${
              item.caption
                ? `<p class="media-caption">${escapeHTML(item.caption)}</p>`
                : ""
            }
          </div>
        `;
      } else {
        html += buildVideoEmbed(item.url);

        if (item.caption) {
          html += `<p class="media-caption">${escapeHTML(item.caption)}</p>`;
        }
      }
    }

    cursor = markerPattern.lastIndex;
  }

  html += renderContentSegment(source.slice(cursor));

  return html;
}

/* =========================================================
   PÁGINA INICIAL
========================================================= */

function articleCard(article) {
  const image = article.image
    ? `<img class="news-card-image" src="${escapeHTML(article.image)}" alt="" loading="lazy">`
    : `<div class="news-card-image" aria-hidden="true"></div>`;

  return `
    <article class="news-card">
      ${image}

      <div class="news-card-copy">
        <span class="tag">
          ${escapeHTML(categoryLabel(article.category))} ·
          ${escapeHTML(gameLabel(article.game))}
        </span>

        <div class="meta">
          ${escapeHTML(formatDate(articleDate(article)))}
        </div>

        <h3>${escapeHTML(article.title)}</h3>
        <p>${escapeHTML(article.summary || "")}</p>

        <a
          class="read-link"
          href="#artigo/${encodeURIComponent(article.id)}"
          data-open-article="${escapeHTML(article.id)}"
        >Ler matéria</a>
      </div>
    </article>
  `;
}

function renderHome() {
  const published = sortNewest(
    allArticles.filter(article => article.status === "published")
  );

  const search = normalized($("#searchInput")?.value || "");

  visibleArticles = published.filter(article => {
    const matchesGame =
      article.game === activeCategory ||
      (
        article.game === "both" &&
        ["wild-rift", "lol-pc"].includes(activeCategory)
      );

    const matchesCategory =
      activeCategory === "all" ||
      matchesGame ||
      article.category === activeCategory;

    const haystack = normalized([
      article.title,
      article.summary,
      article.content,
      article.videoUrl,
      article.game,
      article.category
    ].join(" "));

    return matchesCategory && (!search || haystack.includes(search));
  });

  const featured = $("#featuredSection");

  if (featured) {
    const item = visibleArticles[0];

    featured.innerHTML = item
      ? `
        <article class="featured-card">
          ${
            item.image
              ? `<img class="featured-image" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}">`
              : `<div class="featured-image" aria-hidden="true"></div>`
          }

          <div class="featured-copy">
            <span class="tag">
              DESTAQUE · ${escapeHTML(categoryLabel(item.category))}
            </span>

            <div class="meta">
              ${escapeHTML(gameLabel(item.game))} ·
              ${escapeHTML(formatDate(articleDate(item)))}
            </div>

            <h2>${escapeHTML(item.title)}</h2>
            <p>${escapeHTML(item.summary || "")}</p>

            <a
              class="read-link"
              href="#artigo/${encodeURIComponent(item.id)}"
              data-open-article="${escapeHTML(item.id)}"
            >Ler notícia completa</a>
          </div>
        </article>
      `
      : "";
  }

  const grid = $("#newsGrid");
  const count = $("#newsCount");
  const title = $("#listingTitle");
  const loadMore = $("#loadMoreBtn");

  if (count) {
    count.textContent =
      `${visibleArticles.length} notícia${visibleArticles.length === 1 ? "" : "s"}`;
  }

  if (title) {
    title.textContent = search
      ? "Resultados da busca"
      : activeCategory === "all"
        ? "Últimas notícias"
        : categoryLabel(activeCategory);
  }

  if (grid) {
    const items = visibleArticles.slice(0, shownCount);

    grid.innerHTML = items.length
      ? items.map(articleCard).join("")
      : `
        <div class="empty-state">
          ${
            search
              ? "Nenhuma notícia corresponde à busca."
              : "Ainda não há notícias publicadas nesta categoria."
          }
        </div>
      `;
  }

  loadMore?.classList.toggle(
    "hidden",
    visibleArticles.length <= shownCount
  );
}

/* =========================================================
   ABRIR MATÉRIA
========================================================= */

function openArticle(id) {
  const article = allArticles.find(
    item => item.id === id && item.status === "published"
  );

  if (!article) {
    showToast("Esta notícia não está disponível ou ainda não foi publicada.");
    return;
  }

  $("#homeView")?.classList.add("hidden");
  $("#adminPanel")?.classList.add("hidden");

  const view = $("#articleView");

  if (!view) return;

  view.classList.remove("hidden");

  view.innerHTML = `
    <a href="#inicio" class="back-link" data-home>
      ← Voltar às notícias
    </a>

    <header class="article-header">
      <span class="tag">
        ${escapeHTML(categoryLabel(article.category))} ·
        ${escapeHTML(gameLabel(article.game))}
      </span>

      <h1>${escapeHTML(article.title)}</h1>

      <p class="article-summary">
        ${escapeHTML(article.summary || "")}
      </p>

      <div class="meta">
        ${escapeHTML(formatDate(articleDate(article)))}
      </div>
    </header>

    ${
      article.image
        ? `<img class="article-hero-image" src="${escapeHTML(article.image)}" alt="${escapeHTML(article.title)}">`
        : ""
    }

    ${buildVideoEmbed(article.videoUrl || article.video || "")}

    <div class="article-content">
      ${renderArticleBody(article.content || "", article.inlineMedia || [])}
    </div>

    <p class="source-note">
      Conteúdo do Rift Diário. Imagens e materiais de terceiros pertencem aos seus respectivos titulares.
    </p>
  `;

  history.replaceState(
    null,
    "",
    `#artigo/${encodeURIComponent(id)}`
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() {
  $("#articleView")?.classList.add("hidden");
  $("#adminPanel")?.classList.add("hidden");
  $("#homeView")?.classList.remove("hidden");

  history.replaceState(null, "", "#inicio");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   LOGIN
========================================================= */

function openLogin() {
  const overlay = $("#loginOverlay");

  if (!overlay) {
    showToast("O formulário de login não foi encontrado no HTML.");
    return;
  }

  setLoginError("");
  overlay.classList.remove("hidden");

  setTimeout(() => $("#adminEmail")?.focus(), 50);
}

function closeLogin() {
  $("#loginOverlay")?.classList.add("hidden");
  setLoginError("");
}

/* =========================================================
   ABAS DO PAINEL ADMINISTRATIVO
========================================================= */

function setAdminTab(tab) {
  if (!["editor", "review", "manage"].includes(tab)) {
    return;
  }

  const panels = {
    editor: $("#editorTab"),
    review: $("#reviewTab"),
    manage: $("#manageTab")
  };

  $$("[data-admin-tab]").forEach(button => {
    const active = button.dataset.adminTab === tab;

    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  Object.entries(panels).forEach(([name, panel]) => {
    panel?.classList.toggle("hidden", name !== tab);
  });

  if (tab === "review") {
    renderDraftsList();
  }

  if (tab === "manage") {
    renderPublishedManage();
  }
}

function resetArticleForm() {
  $("#articleForm")?.reset();

  if ($("#editingId")) {
    $("#editingId").value = "";
  }

  if ($("#saveArticleBtn")) {
    $("#saveArticleBtn").textContent = "Publicar matéria";
  }

  $("#cancelEditBtn")?.classList.add("hidden");

  const editor = $("#articleContent");

  if (editor) {
    editor.innerHTML = "";
  }

  currentArticleId = null;
  inlineMediaDraft = [];
  editorSavedRange = null;
  uploadInProgress = false;
}

function fillEditor(id) {
  const article = allArticles.find(item => item.id === id);

  if (!article || !requireAdmin()) return;

  currentArticleId = id;

  if ($("#editingId")) $("#editingId").value = id;
  if ($("#articleTitle")) $("#articleTitle").value = article.title || "";
  if ($("#articleSummary")) $("#articleSummary").value = article.summary || "";
  if ($("#articleGame")) $("#articleGame").value = article.game || "wild-rift";
  if ($("#articleCategory")) $("#articleCategory").value = article.category || "atualizacoes";
  if ($("#articleImage")) $("#articleImage").value = article.image || "";

  if ($("#articleContent")) {
    $("#articleContent").innerHTML = sanitizeArticleHTML(
      article.content || ""
    );
  }

  inlineMediaDraft = Array.isArray(article.inlineMedia)
    ? article.inlineMedia.map(item => ({ ...item }))
    : [];

  editorSavedRange = null;

  if ($("#saveArticleBtn")) {
    $("#saveArticleBtn").textContent =
      article.status === "published"
        ? "Salvar alterações"
        : "Publicar matéria";
  }

  $("#cancelEditBtn")?.classList.remove("hidden");

  setAdminTab("editor");

  $("#adminPanel")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================================
   POSIÇÃO DO CURSOR NO EDITOR
========================================================= */

function saveEditorRange() {
  const editor = $("#articleContent");
  const selection = window.getSelection();

  if (!editor || !selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  if (editor === container || editor.contains(container)) {
    editorSavedRange = range.cloneRange();
  }
}

function restoreEditorRange() {
  const editor = $("#articleContent");

  if (!editor) return null;

  const selection = window.getSelection();

  if (!selection) return null;

  let range = editorSavedRange;

  const savedContainer = range?.commonAncestorContainer;

  const rangeIsValid = Boolean(
    range &&
    savedContainer &&
    (savedContainer === editor || editor.contains(savedContainer))
  );

  if (!rangeIsValid) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  editor.focus({ preventScroll: true });

  selection.removeAllRanges();
  selection.addRange(range);

  return range;
}

function insertMarkerAtCursor(id) {
  const editor = $("#articleContent");

  if (!editor) return;

  const range = restoreEditorRange();

  if (!range) {
    showToast("Clique no local da matéria onde deseja inserir a mídia.");
    return;
  }

  const marker = document.createTextNode(`[[MEDIA:${id}]]`);

  range.deleteContents();
  range.insertNode(marker);

  range.setStartAfter(marker);
  range.collapse(true);

  const selection = window.getSelection();

  selection?.removeAllRanges();
  selection?.addRange(range);

  editorSavedRange = range.cloneRange();

  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

/* =========================================================
   ENVIO DE IMAGENS E VÍDEOS PARA O FIREBASE STORAGE
========================================================= */

async function uploadInlineFile(file, type) {
  if (!file || !requireAdmin()) return;

  if (uploadInProgress) {
    showToast("Já existe um envio em andamento.");
    return;
  }

  const isImage = type === "image";

  const allowedTypes = isImage
    ? ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
    : ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

  if (!allowedTypes.includes(file.type)) {
    showToast(
      isImage
        ? "Use uma imagem JPG, PNG, WEBP, GIF ou AVIF."
        : "Use um vídeo MP4, WEBM, OGG ou MOV.",
      5000
    );
    return;
  }

  const maxBytes = isImage
    ? 12 * 1024 * 1024
    : 150 * 1024 * 1024;

  if (file.size > maxBytes) {
    showToast(
      isImage
        ? "A imagem deve ter no máximo 12 MB."
        : "O vídeo deve ter no máximo 150 MB.",
      5000
    );
    return;
  }

  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `articles-inline/${currentUser.uid}/${id}_${safeName}`;

  const controls = [
    $("#insertImageBtn"),
    $("#insertVideoBtn"),
    $("#editorImageInput"),
    $("#editorVideoInput")
  ].filter(Boolean);

  uploadInProgress = true;

  controls.forEach(control => {
    control.disabled = true;
  });

  try {
    const fileRef = storageRef(storage, path);

    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: currentUser.uid
      }
    });

    const url = await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        snapshot => {
          const percent = snapshot.totalBytes
            ? Math.round(
                snapshot.bytesTransferred / snapshot.totalBytes * 100
              )
            : 0;

          showToast(
            `Enviando ${isImage ? "imagem" : "vídeo"}: ${percent}%`,
            2500
          );
        },
        reject,
        async () => {
          try {
            resolve(await getDownloadURL(task.snapshot.ref));
          } catch (error) {
            reject(error);
          }
        }
      );
    });

    inlineMediaDraft.push({
      id,
      type: isImage ? "image" : "video-upload",
      url,
      caption: file.name.replace(/\.[^.]+$/, ""),
      name: file.name,
      storagePath: path
    });

    insertMarkerAtCursor(id);

    showToast(
      `${isImage ? "Imagem" : "Vídeo"} enviado e inserido na matéria.`
    );
  } catch (error) {
    console.error("Erro no upload do Firebase Storage:", error);

    const messages = {
      "storage/unauthorized": "O Firebase Storage recusou o envio. Confira as regras de acesso.",
      "storage/canceled": "O envio foi cancelado.",
      "storage/retry-limit-exceeded": "O limite de tentativas foi atingido. Confira sua conexão.",
      "storage/quota-exceeded": "A cota de armazenamento do Firebase foi excedida."
    };

    showToast(
      messages[error?.code] ||
        `Falha no upload: ${error?.code || error?.message || "erro desconhecido"}`,
      8000
    );
  } finally {
    uploadInProgress = false;

    controls.forEach(control => {
      control.disabled = false;
    });

    if ($("#editorImageInput")) {
      $("#editorImageInput").value = "";
    }

    if ($("#editorVideoInput")) {
      $("#editorVideoInput").value = "";
    }
  }
}

function insertVideoLinkAtCursor() {
  if (!requireAdmin()) return;

  const input = $("#articleInlineVideoUrl");

  if (!input) {
    const url = prompt("Cole o link do vídeo:");

    if (!url) return;

    insertVideoLink(url);
    return;
  }

  const url = input.value.trim();

  if (!url) {
    showToast("Cole o link do vídeo primeiro.");
    return;
  }

  insertVideoLink(url);
  input.value = "";
}

function insertVideoLink(url) {
  if (!buildVideoEmbed(url)) {
    showToast(
      "Link não reconhecido. Use YouTube, Vimeo, Dailymotion ou um link direto MP4/WebM/OGG.",
      6000
    );
    return;
  }

  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  inlineMediaDraft.push({
    id,
    type: "video-link",
    url,
    caption: "",
    name: url,
    storagePath: ""
  });

  insertMarkerAtCursor(id);

  showToast("Vídeo inserido no ponto do cursor.");
}

async function cleanupUnusedStorageMedia(previousMedia = [], nextMedia = []) {
  const nextPaths = new Set(
    (Array.isArray(nextMedia) ? nextMedia : [])
      .map(item => item.storagePath)
      .filter(Boolean)
  );

  const oldPaths = [
    ...new Set(
      (Array.isArray(previousMedia) ? previousMedia : [])
        .map(item => item.storagePath)
        .filter(Boolean)
    )
  ];

  for (const path of oldPaths) {
    if (nextPaths.has(path)) continue;

    try {
      await deleteObject(storageRef(storage, path));
    } catch (error) {
      if (error?.code !== "storage/object-not-found") {
        console.warn("Não foi possível limpar mídia antiga:", path, error);
      }
    }
  }
}

/* =========================================================
   SALVAR MATÉRIAS
========================================================= */

function articleFromForm(status) {
  const title = $("#articleTitle")?.value.trim() || "";
  const summary = $("#articleSummary")?.value.trim() || "";
  const game = $("#articleGame")?.value || "wild-rift";
  const category = $("#articleCategory")?.value || "atualizacoes";
  const image = $("#articleImage")?.value.trim() || "";
  const content = sanitizeArticleHTML($("#articleContent")?.innerHTML || "");

  if (!title || !summary || !content) {
    showToast("Preencha o título, o resumo e o conteúdo da matéria.");
    return null;
  }

  return {
    title,
    summary,
    game,
    category,
    image,
    content,
    inlineMedia: inlineMediaDraft.map(item => ({ ...item })),
    status,
    updatedAt: serverTimestamp(),
    ...(status === "published" ? { publishedAt: serverTimestamp() } : {})
  };
}

async function saveArticle(status) {
  if (!requireAdmin()) return;

  if (uploadInProgress) {
    showToast("Aguarde o envio da mídia terminar antes de salvar.");
    return;
  }

  const payload = articleFromForm(status);

  if (!payload) return;

  const saveButton = status === "published"
    ? $("#saveArticleBtn")
    : $("#saveDraftBtn");

  const previousLabel = saveButton?.textContent || "";

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";
  }

  try {
    const editingId = $("#editingId")?.value || "";
    const previousArticle = allArticles.find(item => item.id === editingId);

    if (editingId) {
      await updateDoc(doc(db, "articles", editingId), payload);

      await cleanupUnusedStorageMedia(
        previousArticle?.inlineMedia || [],
        payload.inlineMedia
      );

      showToast(
        status === "published"
          ? "Matéria atualizada e publicada."
          : "Rascunho atualizado."
      );
    } else {
      payload.createdAt = serverTimestamp();

      await addDoc(articlesRef, payload);

      showToast(
        status === "published"
          ? "Matéria publicada com sucesso."
          : "Rascunho salvo com sucesso."
      );
    }

    resetArticleForm();
    setAdminTab(status === "draft" ? "review" : "manage");
  } catch (error) {
    console.error("Erro ao salvar matéria:", error);
    showToast(friendlyFirestoreError(error, "salvar a matéria"), 7000);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = previousLabel;
    }
  }
}

/* =========================================================
   LISTAS DO PAINEL
========================================================= */

function renderDraftsList() {
  const container = $("#reviewQueue");
  const count = $("#reviewCount");

  const drafts = sortNewest(
    allArticles.filter(article => article.status === "draft")
  );

  if (count) {
    count.textContent = String(drafts.length);
  }

  if (!container) return;

  if (!drafts.length) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhum rascunho salvo.
      </div>
    `;
    return;
  }

  container.innerHTML = drafts.map(article => `
    <article class="admin-list-item">
      <div>
        <span class="tag">${escapeHTML(categoryLabel(article.category))}</span>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>
        <p>${escapeHTML(article.summary || "")}</p>
        <small>${escapeHTML(formatDate(articleDate(article)))}</small>
      </div>

      <div class="admin-list-actions">
        <button class="secondary-btn" data-edit-article="${escapeHTML(article.id)}">
          Editar
        </button>

        <button class="primary-btn" data-publish-article="${escapeHTML(article.id)}">
          Publicar
        </button>

        <button class="secondary-btn" data-delete-article="${escapeHTML(article.id)}">
          Excluir
        </button>
      </div>
    </article>
  `).join("");
}

function renderPublishedManage() {
  const container = $("#publishedManage");

  const published = sortNewest(
    allArticles.filter(article => article.status === "published")
  );

  if (!container) return;

  if (!published.length) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhuma matéria publicada.
      </div>
    `;
    return;
  }

  container.innerHTML = published.map(article => `
    <article class="admin-list-item">
      <div>
        <span class="tag">${escapeHTML(categoryLabel(article.category))}</span>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>
        <p>${escapeHTML(article.summary || "")}</p>
        <small>${escapeHTML(formatDate(articleDate(article)))}</small>
      </div>

      <div class="admin-list-actions">
        <button class="secondary-btn" data-edit-article="${escapeHTML(article.id)}">
          Editar
        </button>

        <button class="secondary-btn" data-unpublish-article="${escapeHTML(article.id)}">
          Transformar em rascunho
        </button>

        <button class="secondary-btn" data-delete-article="${escapeHTML(article.id)}">
          Excluir
        </button>
      </div>
    </article>
  `).join("");
}

async function publishExistingArticle(id) {
  if (!requireAdmin()) return;

  try {
    await updateDoc(doc(db, "articles", id), {
      status: "published",
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast("Matéria publicada.");
  } catch (error) {
    console.error(error);
    showToast(friendlyFirestoreError(error, "publicar a matéria"));
  }
}

async function unpublishArticle(id) {
  if (!requireAdmin()) return;

  try {
    await updateDoc(doc(db, "articles", id), {
      status: "draft",
      updatedAt: serverTimestamp()
    });

    showToast("Matéria movida para rascunhos.");
  } catch (error) {
    console.error(error);
    showToast(friendlyFirestoreError(error, "alterar a matéria"));
  }
}

async function deleteArticle(id) {
  if (!requireAdmin()) return;

  const article = allArticles.find(item => item.id === id);

  if (!article) return;

  const confirmed = confirm(
    `Deseja realmente excluir a matéria "${article.title}"? Essa ação não pode ser desfeita.`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "articles", id));

    await cleanupUnusedStorageMedia(
      article.inlineMedia || [],
      []
    );

    showToast("Matéria excluída.");
  } catch (error) {
    console.error(error);
    showToast(friendlyFirestoreError(error, "excluir a matéria"));
  }
}

/* =========================================================
   LISTENERS FIREBASE
========================================================= */

function stopListeners() {
  if (unsubscribePublic) {
    unsubscribePublic();
    unsubscribePublic = null;
  }

  if (unsubscribeAdmin) {
    unsubscribeAdmin();
    unsubscribeAdmin = null;
  }
}

function startPublicListener() {
  if (unsubscribePublic) {
    unsubscribePublic();
    unsubscribePublic = null;
  }

  const publicQuery = query(
    articlesRef,
    where("status", "==", "published")
  );

  unsubscribePublic = onSnapshot(
    publicQuery,
    snapshot => {
      const published = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      if (isAdmin) {
        const drafts = allArticles.filter(
          item => item.status !== "published"
        );

        allArticles = [...published, ...drafts];
      } else {
        allArticles = published;
      }

      renderHome();

      if (isAdmin) {
        renderDraftsList();
        renderPublishedManage();
      }
    },
    error => {
      console.error("Erro ao carregar matérias públicas:", error);
      showToast(friendlyFirestoreError(error, "carregar as notícias"), 7000);
    }
  );
}

function startAdminListener() {
  if (unsubscribeAdmin) {
    unsubscribeAdmin();
    unsubscribeAdmin = null;
  }

  unsubscribeAdmin = onSnapshot(
    articlesRef,
    snapshot => {
      allArticles = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderHome();
      renderDraftsList();
      renderPublishedManage();
    },
    error => {
      console.error("Erro ao carregar matérias administrativas:", error);
      showToast(friendlyFirestoreError(error, "carregar o painel"), 7000);
    }
  );
}

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  $("#adminBtn")?.classList.toggle("hidden", isAdmin);
  $("#adminPanel")?.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    $("#homeView")?.classList.add("hidden");
    $("#articleView")?.classList.add("hidden");

    closeLogin();
    startAdminListener();
  } else {
    $("#adminPanel")?.classList.add("hidden");
    $("#homeView")?.classList.remove("hidden");

    if (user) {
      showToast("Esta conta não tem permissão para administrar o site.");
      signOut(auth).catch(console.error);
    }

    if (unsubscribeAdmin) {
      unsubscribeAdmin();
      unsubscribeAdmin = null;
    }

    startPublicListener();
  }

  renderHome();
}

/* =========================================================
   EVENTOS DO EDITOR — CORRIGIDOS
========================================================= */

function runEditorCommand(command, value = null) {
  if (!requireAdmin()) return;

  const editor = $("#articleContent");

  if (!editor) return;

  // Restaura a seleção antes de aplicar a formatação.
  const range = restoreEditorRange();

  if (!range) {
    editor.focus({ preventScroll: true });
  }

  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, value);

  saveEditorRange();

  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function setupEditorEvents() {
  const editor = $("#articleContent");

  editor?.addEventListener("keyup", saveEditorRange);
  editor?.addEventListener("mouseup", saveEditorRange);
  editor?.addEventListener("input", saveEditorRange);
  editor?.addEventListener("focus", saveEditorRange);

  // Formatação: negrito, itálico, sublinhado e tachado.
  $$("[data-command]").forEach(button => {
    button.addEventListener("mousedown", saveEditorRange);

    button.addEventListener("click", () => {
      runEditorCommand(button.dataset.command);
    });
  });

  // Formato do bloco: não limpar o valor após selecionar.
  const blockFormat = $("#editorBlockFormat");

  blockFormat?.addEventListener("mousedown", saveEditorRange);

  blockFormat?.addEventListener("change", event => {
    const selectedFormat = event.target.value;

    if (!selectedFormat) return;

    runEditorCommand("formatBlock", selectedFormat);

    // Não usar event.target.value = "" aqui.
    // Isso fazia o nome da opção desaparecer.
  });

  // Cor do texto.
  $("#editorTextColor")?.addEventListener("mousedown", saveEditorRange);

  $("#editorTextColor")?.addEventListener("input", event => {
    runEditorCommand("foreColor", event.target.value);
  });

  // Inserção de links.
  $("#editorLinkBtn")?.addEventListener("mousedown", saveEditorRange);

  $("#editorLinkBtn")?.addEventListener("click", () => {
    const url = prompt("Cole o endereço do link:");

    if (!url) return;

    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      showToast("Digite um endereço válido, começando com https://.");
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      showToast("O endereço informado não é permitido.");
      return;
    }

    runEditorCommand("createLink", parsed.href);
  });

  // Inserção de imagens no ponto do cursor.
  $("#insertImageBtn")?.addEventListener("mousedown", saveEditorRange);

  $("#insertImageBtn")?.addEventListener("click", () => {
    saveEditorRange();
    $("#editorImageInput")?.click();
  });

  // Inserção de vídeos.
  $("#insertVideoBtn")?.addEventListener("mousedown", saveEditorRange);

  $("#insertVideoBtn")?.addEventListener("click", () => {
    saveEditorRange();

    const existingInput = $("#articleInlineVideoUrl");

    if (existingInput) {
      insertVideoLinkAtCursor();
      return;
    }

    const url = prompt("Cole o link do vídeo:");

    if (url) {
      insertVideoLink(url.trim());
    }
  });

  // Upload de imagens.
  $("#editorImageInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (file) {
      uploadInlineFile(file, "image");
    }
  });

  // Upload de vídeos.
  $("#editorVideoInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (file) {
      uploadInlineFile(file, "video");
    }
  });
}

/* =========================================================
   EVENTOS GERAIS
========================================================= */

function setupEvents() {
  $("#adminBtn")?.addEventListener("click", openLogin);
  $("#closeLoginBtn")?.addEventListener("click", closeLogin);

  $("#loginOverlay")?.addEventListener("click", event => {
    if (event.target.id === "loginOverlay") {
      closeLogin();
    }
  });

  $("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("#adminEmail")?.value.trim() || "";
    const password = $("#adminPassword")?.value || "";
    const button = $("#loginSubmitBtn");

    setLoginError("");

    if (!email || !password) {
      setLoginError("Informe seu e-mail e sua senha.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (credential.user.uid !== ADMIN_UID) {
        await signOut(auth);
        setLoginError("Esta conta não está autorizada a acessar o painel.");
      } else {
        closeLogin();
        showToast("Login realizado com sucesso.");
      }
    } catch (error) {
      console.error("Erro no login:", error);

      const messages = {
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/invalid-email": "O endereço de e-mail é inválido.",
        "auth/user-disabled": "Esta conta foi desativada.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde e tente novamente."
      };

      setLoginError(
        messages[error?.code] || "Não foi possível entrar. Confira suas credenciais."
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    }
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      resetArticleForm();
      goHome();
      showToast("Você saiu do painel administrativo.");
    } catch (error) {
      console.error(error);
      showToast("Não foi possível sair da conta.");
    }
  });

  $("#articleForm")?.addEventListener("submit", event => {
    event.preventDefault();
    saveArticle("published");
  });

  $("#saveDraftBtn")?.addEventListener("click", () => {
    saveArticle("draft");
  });

  $("#cancelEditBtn")?.addEventListener("click", resetArticleForm);

  $$("[data-admin-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setAdminTab(button.dataset.adminTab);
    });
  });

  $$("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "all";
      shownCount = PAGE_SIZE;

      $$("[data-category]").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      $("#homeView")?.classList.remove("hidden");
      $("#articleView")?.classList.add("hidden");

      renderHome();
    });
  });

  $("#searchToggle")?.addEventListener("click", () => {
    const panel = $("#searchPanel");

    panel?.classList.toggle("hidden");

    if (!panel?.classList.contains("hidden")) {
      $("#searchInput")?.focus();
    }
  });

  $("#searchInput")?.addEventListener("input", () => {
    shownCount = PAGE_SIZE;
    renderHome();
  });

  $("#clearSearch")?.addEventListener("click", () => {
    if ($("#searchInput")) {
      $("#searchInput").value = "";
    }

    shownCount = PAGE_SIZE;
    renderHome();
    $("#searchInput")?.focus();
  });

  $("#loadMoreBtn")?.addEventListener("click", () => {
    shownCount += PAGE_SIZE;
    renderHome();
  });

  $("#homeView")?.addEventListener("click", event => {
    const link = event.target.closest("[data-open-article]");

    if (link) {
      event.preventDefault();
      openArticle(link.dataset.openArticle);
    }
  });

  $("#articleView")?.addEventListener("click", event => {
    if (event.target.closest("[data-home]")) {
      event.preventDefault();
      goHome();
    }
  });

  $("#reviewQueue")?.addEventListener("click", handleAdminListClick);
  $("#publishedManage")?.addEventListener("click", handleAdminListClick);

  setupEditorEvents();

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeLogin();
    }
  });
}

function handleAdminListClick(event) {
  const editButton = event.target.closest("[data-edit-article]");
  const publishButton = event.target.closest("[data-publish-article]");
  const unpublishButton = event.target.closest("[data-unpublish-article]");
  const deleteButton = event.target.closest("[data-delete-article]");

  if (editButton) {
    fillEditor(editButton.dataset.editArticle);
    return;
  }

  if (publishButton) {
    publishExistingArticle(publishButton.dataset.publishArticle);
    return;
  }

  if (unpublishButton) {
    unpublishArticle(unpublishButton.dataset.unpublishArticle);
    return;
  }

  if (deleteButton) {
    deleteArticle(deleteButton.dataset.deleteArticle);
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

function initialize() {
  setupEvents();

  if ($("#homeView")) {
    $("#homeView").classList.remove("hidden");
  }

  if ($("#articleView")) {
    $("#articleView").classList.add("hidden");
  }

  if ($("#adminPanel")) {
    $("#adminPanel").classList.add("hidden");
  }

  onAuthStateChanged(
    auth,
    user => {
      setAdminState(user);
    },
    error => {
      console.error("Erro ao verificar sessão administrativa:", error);

      showToast(
        "Não foi possível verificar a sessão administrativa. Veja o Console.",
        6000
      );

      startPublicListener();
    }
  );

  const match = location.hash.match(/^#artigo\/(.+)$/);

  if (match) {
    setTimeout(() => {
      openArticle(decodeURIComponent(match[1]));
    }, 300);
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initialize,
    { once: true }
  );
} else {
  initialize();
}
