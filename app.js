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

/* CONFIGURAÇÃO DO RIFT DIÁRIO */
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

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PAGE_SIZE = 9;

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

/* UTILITÁRIOS */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showToast(message, duration = 3500) {
  const toast = $("#toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function setLoginError(message = "") {
  const element = $("#loginError");

  if (element) {
    element.textContent = message;
  }
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
  return article.publishedAt ||
    article.updatedAt ||
    article.createdAt ||
    null;
}

function sortNewest(items) {
  return [...items].sort((a, b) => {
    const dateA = articleDate(a)?.toDate
      ? articleDate(a).toDate().getTime()
      : new Date(articleDate(a) || 0).getTime();

    const dateB = articleDate(b)?.toDate
      ? articleDate(b).toDate().getTime()
      : new Date(articleDate(b) || 0).getTime();

    return dateB - dateA;
  });
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function gameLabel(game) {
  return ({
    "wild-rift": "Wild Rift",
    "lol-pc": "League of Legends PC",
    both: "Wild Rift + LoL PC"
  })[game] || "Games";
}

function categoryLabel(category) {
  return ({
    atualizacoes: "Atualizações",
    esports: "Esports",
    guias: "Guias",
    meta: "Meta e balanceamento",
    comunidade: "Comunidade",
    "wild-rift": "Wild Rift",
    "lol-pc": "LoL PC"
  })[category] || category || "Notícias";
}

function friendlyFirestoreError(error, action) {
  if (error?.code === "permission-denied") {
    return `O Firebase recusou a permissão para ${action}. Confira as regras do Firestore.`;
  }

  if (error?.code === "unavailable") {
    return "O Firebase está indisponível. Confira a conexão e tente novamente.";
  }

  if (error?.code === "failed-precondition") {
    return "O Firestore informou uma pré-condição ausente. Veja o Console do navegador.";
  }

  return `Não foi possível ${action}. Código: ${error?.code || error?.message || "erro desconhecido"}.`;
}

function requireAdmin() {
  if (!currentUser || currentUser.uid !== ADMIN_UID || !isAdmin) {
    showToast("Entre com a conta autorizada para administrar as matérias.");
    openLogin();
    return false;
  }

  return true;
}

/* LIMPEZA DO HTML DO EDITOR */

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

  const allowedAttrs = new Set([
    "href", "src", "alt", "title", "target", "rel",
    "width", "height", "loading", "style"
  ]);

  function safeUrl(value, isImage = false) {
    const raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    if (
      isImage &&
      /^data:image\/(png|jpeg|gif|webp);base64,/i.test(raw)
    ) {
      return raw;
    }

    try {
      const url = new URL(raw, window.location.href);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : "";
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

        if (!allowedAttrs.has(name)) {
          node.removeAttribute(attribute.name);
        } else if (name === "href" || name === "src") {
          const url = safeUrl(
            attribute.value,
            name === "src"
          );

          if (url) {
            node.setAttribute(name, url);
          } else {
            node.removeAttribute(attribute.name);
          }
        } else if (name === "style") {
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

  const hasHTML =
    /<\s*(p|br|strong|b|em|i|u|s|h[2-4]|ul|ol|li|blockquote|a|img|figure|table|hr|pre|code|div|span|small|sub|sup|mark)\b[^>]*>/i
      .test(text);

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

/* VÍDEOS */

function buildVideoEmbed(rawUrl) {
  const value = String(rawUrl || "").trim();

  if (!value) {
    return "";
  }

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
  const parent = location.hostname || "localhost";

  let src = "";

  if ([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com"
  ].includes(host)) {
    let id = url.searchParams.get("v");

    if (
      !id &&
      ["shorts", "live", "embed", "v"].includes(parts[0])
    ) {
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
    const id =
      host === "player.vimeo.com" && parts[0] === "video"
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
    } else if (parts[0] === "embed" && parts[1] === "video") {
      id = parts[2];
    }

    if (!id || !/^[A-Za-z0-9]+$/.test(id)) {
      return "";
    }

    src = `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
  } else if (["twitch.tv", "clips.twitch.tv"].includes(host)) {
    if (host === "clips.twitch.tv") {
      if (!parts[0]) {
        return "";
      }

      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(parts[0])}&parent=${encodeURIComponent(parent)}`;
    } else if (
      parts[0] === "videos" &&
      /^\d+$/.test(parts[1] || "")
    ) {
      src = `https://player.twitch.tv/?video=v${encodeURIComponent(parts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (parts[0] === "clip" && parts[1]) {
      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(parts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (
      parts[0] &&
      ![
        "directory", "downloads", "jobs", "p",
        "search", "settings", "turbo"
      ].includes(parts[0].toLowerCase())
    ) {
      src = `https://player.twitch.tv/?channel=${encodeURIComponent(parts[0])}&parent=${encodeURIComponent(parent)}`;
    } else {
      return "";
    }
  } else if (["kick.com", "player.kick.com"].includes(host)) {
    const channel = parts[0];

    if (
      !channel ||
      ["categories", "videos", "clips", "search"].includes(channel.toLowerCase())
    ) {
      return "";
    }

    src = `https://player.kick.com/${encodeURIComponent(channel)}`;
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
    html += renderContentSegment(
      source.slice(cursor, match.index)
    );

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
            ${item.caption ? `<figcaption>${escapeHTML(item.caption)}</figcaption>` : ""}
          </figure>
        `;
      } else if (item.type === "video-upload") {
        html += `
          <div class="article-video article-inline-media">
            <video controls playsinline preload="metadata">
              <source src="${escapeHTML(item.url)}">
              Seu navegador não conseguiu reproduzir este vídeo.
            </video>
            ${item.caption ? `<p class="media-caption">${escapeHTML(item.caption)}</p>` : ""}
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

/* PÁGINA INICIAL */

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
        <div class="meta">${escapeHTML(formatDate(articleDate(article)))}</div>
        <h3>${escapeHTML(article.title)}</h3>
        <p>${escapeHTML(article.summary)}</p>
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

    const haystack = normalized(
      `${article.title} ${article.summary} ${article.content} ${article.videoUrl || ""} ${article.game} ${article.category}`
    );

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
            <span class="tag">DESTAQUE · ${escapeHTML(categoryLabel(item.category))}</span>
            <div class="meta">
              ${escapeHTML(gameLabel(item.game))} ·
              ${escapeHTML(formatDate(articleDate(item)))}
            </div>
            <h2>${escapeHTML(item.title)}</h2>
            <p>${escapeHTML(item.summary)}</p>
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
    count.textContent = `${visibleArticles.length} notícia${visibleArticles.length === 1 ? "" : "s"}`;
  }

  if (title) {
    title.textContent = search
      ? "Resultados da busca"
      : activeCategory === "all"
        ? "Últimas notícias"
        : categoryLabel(activeCategory);
  }

  if (grid) {
    grid.innerHTML = visibleArticles.length
      ? visibleArticles.slice(0, shownCount).map(articleCard).join("")
      : `
        <div class="empty-state">
          ${search
            ? "Nenhuma notícia corresponde à busca."
            : "Ainda não há notícias publicadas nesta categoria."}
        </div>
      `;
  }

  if (loadMore) {
    loadMore.classList.toggle(
      "hidden",
      visibleArticles.length <= shownCount
    );
  }
}

/* ABRIR MATÉRIA */

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

  if (!view) {
    return;
  }

  view.classList.remove("hidden");

  const inlineBody = renderArticleBody(
    article.content || "",
    article.inlineMedia || []
  );

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
        ${escapeHTML(article.summary)}
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
      ${inlineBody}
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

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function goHome() {
  $("#articleView")?.classList.add("hidden");
  $("#adminPanel")?.classList.add("hidden");
  $("#homeView")?.classList.remove("hidden");

  history.replaceState(null, "", "#inicio");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* LOGIN ADMINISTRATIVO */

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

/* PAINEL */

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
  $("#articleContent").innerHTML = "";

  currentArticleId = null;
  inlineMediaDraft = [];
  editorSavedRange = null;
  uploadInProgress = false;
}

function fillEditor(id) {
  const article = allArticles.find(item => item.id === id);

  if (!article) {
    return;
  }

  currentArticleId = id;

  $("#editingId").value = id;
  $("#articleTitle").value = article.title || "";
  $("#articleSummary").value = article.summary || "";
  $("#articleGame").value = article.game || "wild-rift";
  $("#articleCategory").value = article.category || "atualizacoes";
  $("#articleImage").value = article.image || "";

  $("#articleContent").innerHTML = sanitizeArticleHTML(
    article.content || ""
  );

  inlineMediaDraft = Array.isArray(article.inlineMedia)
    ? article.inlineMedia.map(item => ({ ...item }))
    : [];

  $("#saveArticleBtn").textContent =
    article.status === "published"
      ? "Salvar alterações"
      : "Publicar matéria";

  $("#cancelEditBtn")?.classList.remove("hidden");

  setAdminTab("editor");

  $("#adminPanel")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* INSERÇÃO DE MÍDIAS NO CURSOR */

function saveEditorRange() {
  const editor = $("#articleContent");
  const selection = window.getSelection();

  if (!editor || !selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);

  if (
    editor.contains(range.commonAncestorContainer) ||
    range.commonAncestorContainer === editor
  ) {
    editorSavedRange = range.cloneRange();
  }
}

function restoreEditorRange() {
  const editor = $("#articleContent");

  if (!editor) {
    return null;
  }

  editor.focus({ preventScroll: true });

  const selection = window.getSelection();

  if (!selection) {
    return null;
  }

  let range = editorSavedRange;

  if (
    !range ||
    !(
      editor.contains(range.commonAncestorContainer) ||
      range.commonAncestorContainer === editor
    )
  ) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);

  return range;
}

function insertMarkerAtCursor(id) {
  const editor = $("#articleContent");
  const range = restoreEditorRange();

  if (!editor || !range) {
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

  editor.dispatchEvent(
    new Event("input", { bubbles: true })
  );
}

async function uploadInlineFile(file, type) {
  if (!file || !requireAdmin()) {
    return;
  }

  if (uploadInProgress) {
    showToast("Já existe um envio em andamento.");
    return;
  }

  const isImage = type === "image";

  const allowed = isImage
    ? [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif"
      ]
    : [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime"
      ];

  if (!allowed.includes(file.type)) {
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
                snapshot.bytesTransferred /
                snapshot.totalBytes * 100
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
      "storage/quota-exceeded": "A cota de armazenamento do Firebase foi excedida.",
      "storage/unknown": "Erro desconhecido no Storage. Consulte o Console do navegador."
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
  if (!requireAdmin()) {
    return;
  }

  const input = $("#articleInlineVideoUrl");
  const url = input?.value.trim() || "";

  if (!url) {
    showToast("Cole o link do vídeo primeiro.");
    return;
  }

  if (!buildVideoEmbed(url)) {
    showToast(
      "Link não reconhecido. Use YouTube, Vimeo, Dailymotion, Twitch, Kick ou um link direto MP4/WebM/OGG.",
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
  input.value = "";

  showToast("Vídeo inserido no ponto do cursor.");
}

async function cleanupUnusedStorageMedia(
  previousMedia = [],
  nextMedia = []
) {
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
    if (nextPaths.has(path)) {
      continue;
    }

    try {
      await deleteObject(storageRef(storage, path));
    } catch (error) {
      if (error?.code !== "storage/object-not-found") {
        console.warn(
          "Não foi possível limpar mídia antiga:",
          path,
          error
        );
      }
    }
  }
}

/* SALVAR MATÉRIA OU RASCUNHO */

function articleFromForm(status, existingArticle = null) {
  const content = sanitizeArticleHTML(
    $("#articleContent").innerHTML.trim()
  );

  const usedMedia = inlineMediaDraft.filter(item =>
    content.includes(`[[MEDIA:${item.id}]]`)
  );

  return {
    title: $("#articleTitle").value.trim(),
    summary: $("#articleSummary").value.trim(),
    game: $("#articleGame").value,
    category: $("#articleCategory").value,
    image: $("#articleImage").value.trim(),

    // Preserva links de vídeo antigos que já estejam salvos na matéria.
    videoUrl: existingArticle?.videoUrl || existingArticle?.video || "",

    content,

    inlineMedia: usedMedia.map(item => ({
      id: item.id,
      type: item.type,
      url: item.url,
      caption: item.caption || "",
      name: item.name || "",
      storagePath: item.storagePath || ""
    })),

    status,
    updatedAt: serverTimestamp(),

    ...(status === "published" && !existingArticle?.publishedAt
      ? { publishedAt: serverTimestamp() }
      : {})
  };
}

async function saveArticle(event, status) {
  event?.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const form = $("#articleForm");

  // Rascunhos podem ser salvos incompletos.
  if (status === "published" && !form.reportValidity()) {
    return;
  }

  const title = $("#articleTitle")?.value.trim() || "";
  const summary = $("#articleSummary")?.value.trim() || "";
  const contentText = $("#articleContent")?.innerText.trim() || "";
  const contentHTML = $("#articleContent")?.innerHTML.trim() || "";

  if (
    status === "published" &&
    (
      !title ||
      !summary ||
      (
        !contentText &&
        !/\[\[MEDIA:[\w-]+\]\]/.test(contentHTML)
      )
    )
  ) {
    showToast(
      "Para publicar, preencha o título, o resumo e o conteúdo da matéria."
    );
    return;
  }

  if (uploadInProgress) {
    showToast("Aguarde o término do upload antes de salvar a matéria.");
    return;
  }

  const existingArticle = currentArticleId
    ? allArticles.find(article => article.id === currentArticleId)
    : null;

  const payload = articleFromForm(status, existingArticle);
  const wasEditing = Boolean(currentArticleId);
  const button = $("#saveArticleBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Salvando...";
  }

  try {
    if (currentArticleId) {
      await updateDoc(
        doc(db, "articles", currentArticleId),
        payload
      );

      showToast(
        status === "published"
          ? "Matéria atualizada e publicada."
          : "Rascunho atualizado."
      );
    } else {
      await addDoc(articlesRef, {
        ...payload,
        createdAt: serverTimestamp()
      });

      showToast(
        status === "published"
          ? "Matéria publicada."
          : "Rascunho salvo."
      );
    }

    // Limpa arquivos que foram enviados, mas retirados do texto antes de salvar.
    const previousMedia = [
      ...(existingArticle?.inlineMedia || []),
      ...inlineMediaDraft
    ];

    await cleanupUnusedStorageMedia(
      previousMedia,
      payload.inlineMedia
    );

    resetArticleForm();

    setAdminTab(
      status === "draft" ? "review" : "manage"
    );
  } catch (error) {
    console.error("Erro ao salvar matéria:", error);

    showToast(
      friendlyFirestoreError(error, "salvar a matéria"),
      6000
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = wasEditing
        ? "Salvar alterações"
        : "Publicar matéria";
    }
  }
}

/* LISTAS DO PAINEL */

function adminItem(article, mode) {
  const image = article.image
    ? `<img src="${escapeHTML(article.image)}" alt="" loading="lazy">`
    : `<div aria-hidden="true"></div>`;

  const status = article.status === "published"
    ? "Publicada"
    : "Rascunho";

  const actions = mode === "review"
    ? `
      <button
        class="primary-btn"
        data-article-action="publish"
        data-id="${escapeHTML(article.id)}"
      >Publicar</button>

      <button
        class="secondary-btn"
        data-article-action="edit"
        data-id="${escapeHTML(article.id)}"
      >Editar</button>

      <button
        class="secondary-btn danger-btn"
        data-article-action="delete"
        data-id="${escapeHTML(article.id)}"
      >Excluir</button>
    `
    : `
      <button
        class="secondary-btn"
        data-article-action="edit"
        data-id="${escapeHTML(article.id)}"
      >Editar</button>

      ${
        article.status === "published"
          ? `
            <button
              class="secondary-btn"
              data-article-action="draft"
              data-id="${escapeHTML(article.id)}"
            >Tornar rascunho</button>
          `
          : `
            <button
              class="primary-btn"
              data-article-action="publish"
              data-id="${escapeHTML(article.id)}"
            >Publicar</button>
          `
      }

      <button
        class="secondary-btn danger-btn"
        data-article-action="delete"
        data-id="${escapeHTML(article.id)}"
      >Excluir</button>
    `;

  return `
    <article class="admin-item">
      ${image}

      <div>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>
        <p>
          ${escapeHTML(status)} ·
          ${escapeHTML(gameLabel(article.game))} ·
          ${escapeHTML(categoryLabel(article.category))}
        </p>
        <p>${escapeHTML(article.summary || "Sem resumo")}</p>
      </div>

      <div class="admin-item-actions">
        ${actions}
      </div>
    </article>
  `;
}

function renderDraftsList() {
  const host = $("#reviewQueue");

  if (!host) {
    return;
  }

  const items = sortNewest(
    allArticles.filter(article =>
      article.status === "draft" ||
      article.status === "review"
    )
  );

  if ($("#reviewCount")) {
    $("#reviewCount").textContent = String(items.length);
  }

  host.innerHTML = items.length
    ? items.map(article => adminItem(article, "review")).join("")
    : `<p class="empty-state">Nenhum rascunho salvo.</p>`;
}

function renderPublishedManage() {
  const host = $("#publishedManage");

  if (!host) {
    return;
  }

  const items = sortNewest(
    allArticles.filter(article => article.status === "published")
  );

  host.innerHTML = items.length
    ? items.map(article => adminItem(article, "manage")).join("")
    : `<p class="empty-state">Ainda não há matérias publicadas.</p>`;
}

async function handleArticleAction(event) {
  const button = event.target.closest("[data-article-action]");

  if (!button || !requireAdmin()) {
    return;
  }

  const id = button.dataset.id;
  const action = button.dataset.articleAction;
  const article = allArticles.find(item => item.id === id);

  if (!article) {
    return;
  }

  try {
    if (action === "edit") {
      fillEditor(id);
      return;
    }

    if (action === "delete") {
      if (!confirm(
        `Excluir a matéria “${article.title}”? Esta ação não pode ser desfeita.`
      )) {
        return;
      }

      await deleteDoc(doc(db, "articles", id));

      await cleanupUnusedStorageMedia(
        article.inlineMedia || [],
        []
      );

      showToast("Matéria excluída.");
    } else if (action === "publish") {
      const payload = {
        status: "published",
        updatedAt: serverTimestamp()
      };

      if (!article.publishedAt) {
        payload.publishedAt = serverTimestamp();
      }

      await updateDoc(doc(db, "articles", id), payload);

      showToast("Matéria publicada.");
    } else if (action === "draft") {
      await updateDoc(doc(db, "articles", id), {
        status: "draft",
        updatedAt: serverTimestamp()
      });

      showToast("Matéria voltou para rascunho.");
    }
  } catch (error) {
    console.error("Erro ao administrar matéria:", error);

    showToast(
      friendlyFirestoreError(error, "alterar a matéria"),
      6000
    );
  }
}

/* FIRESTORE */

function startPublicListener() {
  if (unsubscribePublic) {
    unsubscribePublic();
  }

  const publishedQuery = query(
    articlesRef,
    where("status", "==", "published")
  );

  unsubscribePublic = onSnapshot(
    publishedQuery,
    snapshot => {
      allArticles = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderHome();

      const match = location.hash.match(/^#artigo\/(.+)$/);

      if (match) {
        const id = decodeURIComponent(match[1]);

        if (allArticles.some(article => article.id === id)) {
          openArticle(id);
        }
      }
    },
    error => {
      console.error("Erro ao carregar notícias:", error);

      if ($("#newsGrid")) {
        $("#newsGrid").innerHTML = `
          <div class="empty-state">
            Não foi possível carregar as notícias.
            Confira a conexão e as regras do Firestore.
          </div>
        `;
      }

      if ($("#newsCount")) {
        $("#newsCount").textContent = "Erro ao carregar";
      }

      showToast(
        friendlyFirestoreError(error, "carregar as notícias"),
        6000
      );
    }
  );
}

function startAdminListener() {
  if (unsubscribeAdmin) {
    unsubscribeAdmin();
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
      console.error("Erro ao carregar o painel editorial:", error);

      showToast(
        friendlyFirestoreError(error, "carregar o painel editorial"),
        6000
      );
    }
  );
}

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  const adminButton = $("#adminBtn");

  if (adminButton) {
    adminButton.innerHTML = isAdmin
      ? `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M19 8v6M16 11h6"></path>
        </svg>
        <span>Painel ADM</span>
      `
      : `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M20 8v6M17 11h6"></path>
        </svg>
        <span>Login</span>
      `;
  }

  $("#logoutBtn")?.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    $("#homeView")?.classList.add("hidden");
    $("#articleView")?.classList.add("hidden");
    $("#adminPanel")?.classList.remove("hidden");

    closeLogin();

    if (unsubscribePublic) {
      unsubscribePublic();
      unsubscribePublic = null;
    }

    startAdminListener();
  } else {
    $("#adminPanel")?.classList.add("hidden");
    $("#homeView")?.classList.remove("hidden");

    if (unsubscribeAdmin) {
      unsubscribeAdmin();
      unsubscribeAdmin = null;
    }

    startPublicListener();
  }
}

/* FORMATAÇÃO DO EDITOR */

function applyEditorCommand(command) {
  const editor = $("#articleContent");

  if (!editor) {
    return;
  }

  restoreEditorRange();

  const commands = {
    bold: "bold",
    italic: "italic",
    underline: "underline",
    strikeThrough: "strikeThrough",
    insertUnorderedList: "insertUnorderedList",
    insertOrderedList: "insertOrderedList"
  };

  try {
    if (commands[command]) {
      document.execCommand(commands[command], false, null);
    } else if (
      ["p", "h2", "h3", "blockquote"].includes(command)
    ) {
      document.execCommand(
        "formatBlock",
        false,
        ({
          p: "P",
          h2: "H2",
          h3: "H3",
          blockquote: "BLOCKQUOTE"
        })[command]
      );
    } else if (command === "link") {
      const raw = window.prompt(
        "Cole o endereço completo do link (https://...):",
        "https://"
      );

      if (!raw) {
        return;
      }

      let url;

      try {
        url = new URL(raw.trim());

        if (!["https:", "http:"].includes(url.protocol)) {
          throw new Error("Protocolo inválido");
        }
      } catch {
        showToast(
          "Link inválido. Use um endereço que comece com https:// ou http://."
        );
        return;
      }

      document.execCommand("createLink", false, url.href);
    } else {
      return;
    }

    editor.focus({ preventScroll: true });
    saveEditorRange();

    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  } catch (error) {
    console.error("Erro ao formatar o texto:", error);
    showToast("Não foi possível aplicar essa formatação.");
  }
}

/* EVENTOS */

function setupEvents() {
  // Mantém o HTML atual e simplifica o nome da aba.
  const draftsTab = $('[data-admin-tab="review"]');

  if (draftsTab && draftsTab.querySelector(".tiny-count")) {
    draftsTab.firstChild.textContent = "Rascunhos ";
  }

  // Adiciona o campo de vídeo por link sem exigir alteração do HTML.
  const editorHint = $(".editor-hint");

  if (editorHint && !$("#articleInlineVideoUrl")) {
    const row = document.createElement("div");

    row.className = "inline-video-link-row";

    row.innerHTML = `
      <input
        id="articleInlineVideoUrl"
        type="url"
        inputmode="url"
        aria-label="Link do vídeo"
        placeholder="Link do YouTube, Vimeo, Twitch ou vídeo direto"
      >

      <button
        type="button"
        class="secondary-btn"
        id="insertVideoLinkBtn"
      >Inserir vídeo por link</button>
    `;

    editorHint.insertAdjacentElement("afterend", row);
  }

  $("#adminBtn")?.addEventListener("click", () => {
    if (isAdmin && currentUser?.uid === ADMIN_UID) {
      const panel = $("#adminPanel");
      const openingPanel = panel?.classList.contains("hidden");

      $("#articleView")?.classList.add("hidden");

      if (openingPanel) {
        $("#homeView")?.classList.add("hidden");
        panel?.classList.remove("hidden");
      } else {
        panel?.classList.add("hidden");
        $("#homeView")?.classList.remove("hidden");
      }
    } else {
      openLogin();
    }
  });

  $("#closeLoginBtn")?.addEventListener("click", closeLogin);

  $("#loginOverlay")?.addEventListener("click", event => {
    if (event.target === $("#loginOverlay")) {
      closeLogin();
    }
  });

  $("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    setLoginError("");

    const email = $("#adminEmail")?.value.trim();
    const password = $("#adminPassword")?.value;
    const button = $("#loginSubmitBtn");

    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (result.user.uid !== ADMIN_UID) {
        await signOut(auth);

        setLoginError(
          "Esta conta não está autorizada como administradora deste portal."
        );
      } else {
        closeLogin();
        showToast("Login realizado.");
      }
    } catch (error) {
      console.error("Erro no login Firebase:", error);

      const messages = {
        "auth/invalid-email": "O formato do e-mail é inválido.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/user-not-found": "Usuário não encontrado no Authentication.",
        "auth/wrong-password": "E-mail ou senha incorretos.",
        "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
        "auth/operation-not-allowed": "O login por e-mail/senha não está habilitado no Firebase Authentication.",
        "auth/api-key-not-valid": "A chave de API foi recusada. Confira a configuração do Firebase."
      };

      setLoginError(
        messages[error.code] ||
        `Não foi possível entrar (${error.code || error.message}).`
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
      showToast("Sessão encerrada.");
      $("#homeView")?.classList.remove("hidden");
    } catch (error) {
      console.error("Erro ao sair:", error);
      showToast("Não foi possível encerrar a sessão.");
    }
  });

  $("#articleForm")?.addEventListener("submit", event => {
    saveArticle(event, "published");
  });

  $("#saveDraftBtn")?.addEventListener("click", () => {
    saveArticle(null, "draft");
  });

  $("#cancelEditBtn")?.addEventListener("click", resetArticleForm);

  const editor = $("#articleContent");
  const toolbar = $(".editor-toolbar");

  [
    "keyup",
    "mouseup",
    "input",
    "focus",
    "click",
    "touchend"
  ].forEach(name => {
    editor?.addEventListener(name, saveEditorRange);
  });

  editor?.addEventListener("paste", () => {
    setTimeout(saveEditorRange, 0);
  });

  document.addEventListener("selectionchange", () => {
    if (editor && document.activeElement === editor) {
      saveEditorRange();
    }
  });

  toolbar?.addEventListener("pointerdown", event => {
    const control = event.target.closest(
      "[data-command], #editorLinkBtn, #insertImageBtn, #insertVideoBtn"
    );

    if (!control) {
      return;
    }

    saveEditorRange();

    if (control.matches("[data-command], #editorLinkBtn")) {
      event.preventDefault();
    }
  });

  toolbar?.addEventListener("click", event => {
    const button = event.target.closest("[data-command]");

    if (!button) {
      return;
    }

    event.preventDefault();
    applyEditorCommand(button.dataset.command);
  });

  $("#insertImageBtn")?.addEventListener("click", () => {
    saveEditorRange();
    $("#editorImageInput")?.click();
  });

  $("#insertVideoBtn")?.addEventListener("click", () => {
    saveEditorRange();
    $("#editorVideoInput")?.click();
  });

  $("#insertVideoLinkBtn")?.addEventListener(
    "click",
    insertVideoLinkAtCursor
  );

  $("#editorImageInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (file) {
      uploadInlineFile(file, "image");
    }

    event.target.value = "";
  });

  $("#editorVideoInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (file) {
      uploadInlineFile(file, "video");
    }

    event.target.value = "";
  });

  $("#editorBlockFormat")?.addEventListener("change", event => {
    applyEditorCommand(event.target.value);
    event.target.value = "p";
  });

  $("#editorTextColor")?.addEventListener("change", event => {
    if (!editor) {
      return;
    }

    restoreEditorRange();

    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, event.target.value);

    saveEditorRange();

    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  });

  $("#editorLinkBtn")?.addEventListener("click", () => {
    applyEditorCommand("link");
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-tab]");

    if (button) {
      event.preventDefault();
      setAdminTab(button.dataset.adminTab);
    }
  });

  $("#reviewQueue")?.addEventListener(
    "click",
    handleArticleAction
  );

  $("#publishedManage")?.addEventListener(
    "click",
    handleArticleAction
  );

  $$("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "all";

      $$("[data-category]").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      shownCount = PAGE_SIZE;

      goHome();
      renderHome();
    });
  });

  $("#searchToggle")?.addEventListener("click", () => {
    $("#searchPanel")?.classList.toggle("hidden");

    if (!$("#searchPanel")?.classList.contains("hidden")) {
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
  });

  $("#loadMoreBtn")?.addEventListener("click", () => {
    shownCount += PAGE_SIZE;
    renderHome();
  });

  document.addEventListener("click", event => {
    const link = event.target.closest("[data-open-article]");

    if (link) {
      event.preventDefault();
      openArticle(link.dataset.openArticle);
      return;
    }

    if (event.target.closest("[data-home]")) {
      event.preventDefault();
      goHome();
    }
  });

  window.addEventListener("hashchange", () => {
    const match = location.hash.match(/^#artigo\/(.+)$/);

    if (match) {
      openArticle(decodeURIComponent(match[1]));
    } else {
      goHome();
    }
  });
}

/* INICIALIZAÇÃO */

function initialize() {
  setupEvents();

  onAuthStateChanged(
    auth,
    user => setAdminState(user),
    error => {
      console.error("Erro no estado de autenticação:", error);

      showToast(
        "Não foi possível verificar a sessão administrativa. Veja o Console.",
        6000
      );
    }
  );

  const match = location.hash.match(/^#artigo\/(.+)$/);

  if (match) {
    setTimeout(() => {
      openArticle(decodeURIComponent(match[1]));
    }, 300);
  }
}

try {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
} catch (error) {
  console.error("Falha ao iniciar o Rift Diário:", error);

  showToast(
    "O site encontrou um erro ao iniciar. Abra o Console para ver os detalhes.",
    6000
  );
}
