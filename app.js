import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

/* =========================================================
   RIFT DIÁRIO — FIREBASE
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBJrLkf9W9aAVJnrcB7hvYFbsJURBGjQU8M",
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
const ratingsRef = collection(db, "articleRatings");
const commentsRef = collection(db, "articleComments");
const likesRef = collection(db, "commentLikes");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector)
];

/* =========================================================
   ESTADO
   ========================================================= */

let currentUser = null;
let isAdmin = false;

let allArticles = [];
let visibleArticles = [];

let activeCategory = "all";
let activeAdminTab = "editor";
let currentArticleId = null;

let inlineMediaDraft = [];
let uploadInProgress = false;

let unsubscribePublic = null;
let unsubscribeAdmin = null;
let unsubscribeRatings = null;
let unsubscribeComments = null;
let unsubscribeLikes = null;

let articleRatings = [];
let articleComments = [];
let articleLikes = [];

let replyToComment = null;
let editingCommentId = null;

let toastTimer = null;

const PAGE_SIZE = 9;
let shownCount = PAGE_SIZE;

/* =========================================================
   ESTILOS DAS FUNCIONALIDADES DA COMUNIDADE
   ========================================================= */

function installCommunityStyles() {
  if ($("#communityStyles")) return;

  const style = document.createElement("style");
  style.id = "communityStyles";

  style.textContent = `
    .community-section {
      margin: 34px 0;
      padding: 22px;
      background: var(--panel, #0e1626);
      border: 1px solid var(--border, #29374d);
      border-radius: 14px;
    }

    .community-section h2,
    .community-section h3 {
      margin-top: 0;
    }

    .community-subtitle {
      color: #aab7ca;
      font-size: .92rem;
      line-height: 1.5;
    }

    .community-actions,
    .community-share,
    .community-auth-buttons,
    .comment-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .community-btn {
      border: 1px solid var(--border, #29374d);
      border-radius: 9px;
      background: var(--panel-light, #151f31);
      color: #f2f5fa;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
      transition: border-color .2s, transform .2s;
    }

    .community-btn:hover {
      border-color: #e0b44c;
      transform: translateY(-1px);
    }

    .community-btn:disabled {
      opacity: .55;
      cursor: not-allowed;
      transform: none;
    }

    .community-btn.active {
      border-color: #e0b44c;
      color: #f2c85b;
    }

    .community-btn.danger {
      color: #ff9999;
    }

    .community-count {
      color: #aab7ca;
      font-size: .88rem;
    }

    .community-auth-box {
      margin: 16px 0;
      padding: 15px;
      border: 1px solid var(--border, #29374d);
      border-radius: 10px;
    }

    .community-auth-box p {
      margin-top: 0;
      color: #c4cede;
      line-height: 1.5;
    }

    .community-form {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    .community-form textarea {
      width: 100%;
      min-height: 105px;
      resize: vertical;
      padding: 13px;
      border: 1px solid var(--border, #29374d);
      border-radius: 10px;
      background: #080f1d;
      color: #f2f5fa;
      font: inherit;
      box-sizing: border-box;
    }

    .community-form textarea:focus {
      outline: 1px solid #e0b44c;
      border-color: #e0b44c;
    }

    .community-comment {
      padding: 17px 0;
      border-bottom: 1px solid var(--border, #29374d);
    }

    .community-comment:last-child {
      border-bottom: 0;
    }

    .community-comment.reply {
      margin: 12px 0 0 20px;
      padding: 12px 0 0 14px;
      border-left: 2px solid #35445d;
    }

    .community-comment-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .community-comment-name {
      color: #f2c85b;
      font-weight: 700;
    }

    .community-comment-date {
      color: #8796ad;
      font-size: .8rem;
    }

    .community-comment-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.65;
      color: #e0e6ef;
    }

    .comment-actions {
      margin-top: 10px;
    }

    .comment-actions .community-btn {
      padding: 6px 10px;
      font-size: .85rem;
    }

    .community-notice {
      margin-top: 12px;
      color: #aab7ca;
      font-size: .88rem;
      line-height: 1.5;
    }

    .community-share {
      margin-top: 20px;
    }

    .community-share a {
      text-decoration: none;
    }

    .community-current-user {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 15px;
      color: #c4cede;
      font-size: .9rem;
    }

    .community-empty {
      color: #aab7ca;
      padding: 12px 0;
    }

    @media (max-width: 600px) {
      .community-section {
        padding: 15px;
      }

      .community-comment.reply {
        margin-left: 10px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
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
  if (element) element.textContent = message;
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

function articleDate(article) {
  return article.publishedAt ||
    article.updatedAt ||
    article.createdAt ||
    null;
}

function sortNewest(list) {
  return [...list].sort((a, b) => {
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

function friendlyFirestoreError(error, action) {
  if (error?.code === "permission-denied") {
    return `O Firebase recusou a permissão para ${action}. Confira as regras do Firestore.`;
  }

  if (error?.code === "unavailable") {
    return "O Firebase está indisponível. Confira a conexão e tente novamente.";
  }

  if (error?.code === "failed-precondition") {
    return "O Firestore informou uma pré-condição ausente. Confira o Console do navegador.";
  }

  return `Não foi possível ${action}. Código: ${
    error?.code || error?.message || "erro desconhecido"
  }.`;
}

function canUseCommunity() {
  if (!currentUser) return false;

  return currentUser.providerData.some(provider =>
    ["google.com", "apple.com"].includes(provider.providerId)
  );
}

function currentDisplayName() {
  return currentUser?.displayName ||
    currentUser?.email?.split("@")[0] ||
    "Jogador";
}

function currentArticle() {
  return allArticles.find(article =>
    article.id === currentArticleId &&
    article.status === "published"
  );
}

function communityUserMessage() {
  if (!currentUser) {
    return "Entre com Google ou Apple para participar da comunidade.";
  }

  if (!canUseCommunity()) {
    return "Para participar da comunidade, entre com uma conta Google ou Apple.";
  }

  return "";
}

/* =========================================================
   AUTENTICAÇÃO GOOGLE E APPLE
   ========================================================= */

function ensureCommunityLoginButtons() {
  const overlay = $("#loginOverlay");
  if (!overlay) return;

  let host = $("#communityLoginButtons");

  if (!host) {
    host = document.createElement("div");
    host.id = "communityLoginButtons";
    host.className = "community-auth-box";

    host.innerHTML = `
      <p><strong>Entrar na comunidade</strong></p>
      <p>Use uma conta Google ou Apple para avaliar matérias e participar dos comentários.</p>
      <div class="community-auth-buttons">
        <button type="button" class="community-btn" id="googleLoginBtn">
          Continuar com Google
        </button>
        <button type="button" class="community-btn" id="appleLoginBtn">
          Continuar com Apple
        </button>
      </div>
    `;

    const form = $("#loginForm", overlay);

    if (form) {
      form.insertAdjacentElement("afterend", host);
    } else {
      overlay.appendChild(host);
    }

    $("#googleLoginBtn")?.addEventListener("click", () => {
      signInWithCommunityProvider("google");
    });

    $("#appleLoginBtn")?.addEventListener("click", () => {
      signInWithCommunityProvider("apple");
    });
  }
}

async function signInWithCommunityProvider(providerName) {
  try {
    let provider;

    if (providerName === "google") {
      provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account"
      });
    } else {
      provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
    }

    await signInWithPopup(auth, provider);

    closeLogin();
    showToast("Login realizado com sucesso.");
  } catch (error) {
    console.error("Erro no login social:", error);

    const messages = {
      "auth/popup-closed-by-user": "A janela de login foi fechada.",
      "auth/popup-blocked": "O navegador bloqueou a janela de login.",
      "auth/unauthorized-domain": "Este domínio não está autorizado no Firebase Authentication.",
      "auth/operation-not-allowed": "Este provedor ainda não está habilitado no Firebase Authentication.",
      "auth/account-exists-with-different-credential": "Já existe uma conta com este e-mail usando outro método de login."
    };

    showToast(
      messages[error.code] ||
      `Não foi possível entrar: ${error.message || error.code}`,
      6000
    );
  }
}

/* =========================================================
   SANITIZAÇÃO DO CONTEÚDO
   ========================================================= */

function sanitizeArticleHTML(html) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(String(html ?? ""), "text/html");

  const allowedTags = new Set([
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
    "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE",
    "A", "IMG", "FIGURE", "FIGCAPTION", "TABLE",
    "THEAD", "TBODY", "TR", "TH", "TD", "HR", "CODE",
    "PRE", "DIV", "SPAN", "SECTION", "SMALL", "SUB",
    "SUP", "MARK"
  ]);

  const allowedAttrs = new Set([
    "href", "src", "alt", "title", "target", "rel",
    "width", "height", "loading"
  ]);

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

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

      if (node.nodeType !== Node.ELEMENT_NODE) continue;

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

      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();

        if (!allowedAttrs.has(name)) {
          node.removeAttribute(attr.name);
        } else if (name === "href" || name === "src") {
          const url = safeUrl(attr.value);

          if (url) node.setAttribute(name, url);
          else node.removeAttribute(name);
        }
      }

      if (tag === "A" && node.getAttribute("target") === "_blank") {
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
  if (!text) return "";

  const hasHTML =
    /<\s*(p|br|strong|b|em|i|u|s|h[2-4]|ul|ol|li|blockquote|a|img|figure|table|hr|pre|code|div|span|section|small|sub|sup|mark)\b[^>]*>/i
      .test(text);

  if (hasHTML) return sanitizeArticleHTML(text);

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

  if (!["https:", "http:"].includes(url.protocol)) return "";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);
  const parent = location.hostname || "localhost";

  let src = "";

  if ([
    "youtube.com", "m.youtube.com",
    "music.youtube.com", "youtube-nocookie.com"
  ].includes(host)) {
    let id = url.searchParams.get("v");

    if (!id && ["shorts", "live", "embed", "v"].includes(pathParts[0])) {
      id = pathParts[1];
    }

    if (!id || !/^[\w-]{11}$/.test(id)) return "";

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  } else if (host === "youtu.be") {
    const id = pathParts[0];

    if (!id || !/^[\w-]{11}$/.test(id)) return "";

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  } else if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id =
      host === "player.vimeo.com" && pathParts[0] === "video"
        ? pathParts[1]
        : pathParts[pathParts.length - 1];

    if (!id || !/^\d+$/.test(id)) return "";

    src = `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
  } else if (["dailymotion.com", "dai.ly"].includes(host)) {
    let id = "";

    if (host === "dai.ly") {
      id = pathParts[0] || "";
    } else if (pathParts[0] === "video") {
      id = (pathParts[1] || "").split("_")[0];
    } else if (pathParts[0] === "embed" && pathParts[1] === "video") {
      id = pathParts[2] || "";
    }

    if (!id || !/^[A-Za-z0-9]+$/.test(id)) return "";

    src = `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
  } else if (["twitch.tv", "clips.twitch.tv"].includes(host)) {
    if (host === "clips.twitch.tv") {
      const slug = pathParts[0];
      if (!slug) return "";

      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(parent)}`;
    } else if (pathParts[0] === "videos" && /^\d+$/.test(pathParts[1] || "")) {
      src = `https://player.twitch.tv/?video=v${encodeURIComponent(pathParts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (pathParts[0] === "clip" && pathParts[1]) {
      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(pathParts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (
      pathParts[0] &&
      !["directory", "downloads", "jobs", "p", "search", "settings", "turbo"].includes(pathParts[0].toLowerCase())
    ) {
      src = `https://player.twitch.tv/?channel=${encodeURIComponent(pathParts[0])}&parent=${encodeURIComponent(parent)}`;
    } else {
      return "";
    }
  } else if (["kick.com", "player.kick.com"].includes(host)) {
    const channel = pathParts[0];

    if (!channel || ["categories", "videos", "clips", "search"].includes(channel.toLowerCase())) {
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
  const byId = new Map(
    (Array.isArray(media) ? media : []).map(item => [item.id, item])
  );

  const markerPattern = /\[\[MEDIA:([a-zA-Z0-9_-]+)\]\]/g;
  const source = String(content || "");

  let html = "";
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(source)) !== null) {
    html += renderContentSegment(source.slice(cursor, match.index));

    const item = byId.get(match[1]);

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

/* =========================================================
   CARTÕES E PÁGINA INICIAL
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
    const matchesCategory =
      activeCategory === "all" ||
      article.game === activeCategory ||
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
    grid.innerHTML = !visibleArticles.length
      ? `<div class="empty-state">${
          search
            ? "Nenhuma notícia corresponde à busca."
            : "Ainda não há notícias publicadas nesta categoria."
        }</div>`
      : visibleArticles.slice(0, shownCount).map(articleCard).join("");
  }

  if (loadMore) {
    loadMore.classList.toggle("hidden", visibleArticles.length <= shownCount);
  }
}

/* =========================================================
   AVALIAÇÕES DAS MATÉRIAS
   ========================================================= */

function ratingDocumentId(articleId, uid) {
  return `${articleId}_${uid}`;
}

function myRating() {
  if (!currentUser || !currentArticleId) return null;

  return articleRatings.find(rating => rating.uid === currentUser.uid) || null;
}

function renderRatingSection() {
  const host = $("#articleRatings");
  if (!host) return;

  const positive = articleRatings.filter(item => item.value === "positive").length;
  const negative = articleRatings.filter(item => item.value === "negative").length;
  const mine = myRating();

  host.innerHTML = `
    <section class="community-section" aria-label="Avaliação da matéria">
      <h2>O que você achou desta matéria?</h2>
      <p class="community-subtitle">
        Sua avaliação ajuda a comunidade do Rift Diário.
      </p>

      <div class="community-actions">
        <button
          type="button"
          class="community-btn ${mine?.value === "positive" ? "active" : ""}"
          data-rate="positive"
          aria-pressed="${mine?.value === "positive" ? "true" : "false"}"
        >👍 Gostei <span class="community-count">${positive}</span></button>

        <button
          type="button"
          class="community-btn ${mine?.value === "negative" ? "active" : ""}"
          data-rate="negative"
          aria-pressed="${mine?.value === "negative" ? "true" : "false"}"
        >👎 Não gostei <span class="community-count">${negative}</span></button>

        ${
          mine
            ? `<button type="button" class="community-btn danger" data-remove-rating>Remover minha avaliação</button>`
            : ""
        }
      </div>

      ${
        !currentUser
          ? `<p class="community-notice">Entre com Google ou Apple para avaliar.</p>`
          : !canUseCommunity()
            ? `<p class="community-notice">Entre com Google ou Apple para avaliar.</p>`
            : ""
      }
    </section>
  `;
}

async function setMyRating(value) {
  if (!currentArticleId || !currentUser) {
    openLogin();
    showToast("Entre com Google ou Apple para avaliar esta matéria.");
    return;
  }

  if (!canUseCommunity()) {
    openLogin();
    showToast("Use Google ou Apple para avaliar matérias.");
    return;
  }

  const id = ratingDocumentId(currentArticleId, currentUser.uid);
  const ref = doc(db, "articleRatings", id);

  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);

      if (snapshot.exists() && snapshot.data().value === value) {
        transaction.delete(ref);
      } else {
        transaction.set(ref, {
          articleId: currentArticleId,
          uid: currentUser.uid,
          value,
          updatedAt: serverTimestamp()
        });
      }
    });
  } catch (error) {
    console.error("Erro ao registrar avaliação:", error);
    showToast(friendlyFirestoreError(error, "registrar sua avaliação"), 6000);
  }
}

async function removeMyRating() {
  if (!currentArticleId || !currentUser) return;

  const id = ratingDocumentId(currentArticleId, currentUser.uid);

  try {
    await deleteDoc(doc(db, "articleRatings", id));
    showToast("Sua avaliação foi removida.");
  } catch (error) {
    console.error("Erro ao remover avaliação:", error);
    showToast(friendlyFirestoreError(error, "remover sua avaliação"), 6000);
  }
}

function startRatingsListener(articleId) {
  if (unsubscribeRatings) {
    unsubscribeRatings();
    unsubscribeRatings = null;
  }

  articleRatings = [];

  const q = query(
    ratingsRef,
    where("articleId", "==", articleId)
  );

  unsubscribeRatings = onSnapshot(
    q,
    snapshot => {
      articleRatings = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderRatingSection();
    },
    error => {
      console.error("Erro ao carregar avaliações:", error);
      showToast(friendlyFirestoreError(error, "carregar avaliações"), 5000);
    }
  );
}

/* =========================================================
   COMENTÁRIOS E RESPOSTAS
   ========================================================= */

function commentDate(comment) {
  return comment.createdAt || comment.updatedAt || null;
}

function sortedComments() {
  return [...articleComments].sort((a, b) => {
    const da = commentDate(a)?.toDate
      ? commentDate(a).toDate().getTime()
      : new Date(commentDate(a) || 0).getTime();

    const dbDate = commentDate(b)?.toDate
      ? commentDate(b).toDate().getTime()
      : new Date(commentDate(b) || 0).getTime();

    return da - dbDate;
  });
}

function renderComment(comment, isReply = false) {
  const mine = currentUser && comment.uid === currentUser.uid;
  const likeCount = articleLikes.filter(like => like.commentId === comment.id).length;
  const likedByMe = currentUser && articleLikes.some(
    like => like.commentId === comment.id && like.uid === currentUser.uid
  );

  const editing = editingCommentId === comment.id;

  return `
    <article class="community-comment ${isReply ? "reply" : ""}" data-comment-id="${escapeHTML(comment.id)}">
      <div class="community-comment-header">
        <span class="community-comment-name">${escapeHTML(comment.displayName || "Jogador")}</span>
        <span class="community-comment-date">${escapeHTML(formatDate(commentDate(comment)))}</span>
      </div>

      ${
        editing
          ? `
            <form class="community-form" data-edit-comment="${escapeHTML(comment.id)}">
              <textarea name="commentText" maxlength="3000" required>${escapeHTML(comment.text || "")}</textarea>
              <div class="comment-actions">
                <button type="submit" class="community-btn">Salvar edição</button>
                <button type="button" class="community-btn" data-cancel-edit>Cancelar</button>
              </div>
            </form>
          `
          : `<div class="community-comment-text">${escapeHTML(comment.text || "")}</div>`
      }

      ${
        !editing
          ? `
            <div class="comment-actions">
              <button
                type="button"
                class="community-btn ${likedByMe ? "active" : ""}"
                data-like-comment="${escapeHTML(comment.id)}"
                aria-pressed="${likedByMe ? "true" : "false"}"
              >♥ Curtir ${likeCount}</button>

              ${
                !isReply
                  ? `<button type="button" class="community-btn" data-reply-comment="${escapeHTML(comment.id)}">Responder</button>`
                  : ""
              }

              ${
                mine
                  ? `
                    <button type="button" class="community-btn" data-edit-comment-button="${escapeHTML(comment.id)}">Editar</button>
                    <button type="button" class="community-btn danger" data-delete-comment="${escapeHTML(comment.id)}">Excluir</button>
                  `
                  : ""
              }
            </div>
          `
          : ""
      }

      <div class="community-replies" data-replies-for="${escapeHTML(comment.id)}"></div>
    </article>
  `;
}

function renderCommentsSection() {
  const host = $("#articleComments");
  if (!host) return;

  const roots = sortedComments().filter(comment => !comment.parentId);
  const message = communityUserMessage();

  host.innerHTML = `
    <section class="community-section" aria-label="Comentários">
      <h2>Comentários da comunidade</h2>
      <p class="community-subtitle">
        Compartilhe sua opinião e converse com outros jogadores.
      </p>

      ${
        currentUser
          ? `
            <div class="community-current-user">
              <span>Conectado como ${escapeHTML(currentDisplayName())}</span>
              <button type="button" class="community-btn" id="communityLogoutBtn">Sair da comunidade</button>
            </div>
          `
          : ""
      }

      ${
        message
          ? `
            <div class="community-auth-box">
              <p>${escapeHTML(message)}</p>
              <div class="community-auth-buttons">
                <button type="button" class="community-btn" data-community-login="google">Entrar com Google</button>
                <button type="button" class="community-btn" data-community-login="apple">Entrar com Apple</button>
              </div>
            </div>
          `
          : `
            <form class="community-form" id="newCommentForm">
              <textarea
                name="commentText"
                maxlength="3000"
                placeholder="Escreva seu comentário..."
                required
              ></textarea>
              <button type="submit" class="community-btn">Publicar comentário</button>
            </form>
          `
      }

      ${
        replyToComment
          ? `
            <p class="community-notice">
              Você está respondendo a um comentário.
              <button type="button" class="community-btn" data-cancel-reply>Cancelar resposta</button>
            </p>
          `
          : ""
      }

      <div id="communityCommentList">
        ${
          roots.length
            ? roots.map(comment => renderComment(comment)).join("")
            : `<p class="community-empty">Ainda não há comentários. Seja o primeiro a participar!</p>`
        }
      </div>
    </section>
  `;

  // Renderiza as respostas junto dos respectivos comentários.
  for (const root of roots) {
    const replies = sortedComments().filter(comment => comment.parentId === root.id);
    const repliesHost = $(`[data-replies-for="${CSS.escape(root.id)}"]`, host);

    if (repliesHost && replies.length) {
      repliesHost.innerHTML = replies.map(reply => renderComment(reply, true)).join("");
    }
  }
}

function startCommentsListener(articleId) {
  if (unsubscribeComments) {
    unsubscribeComments();
    unsubscribeComments = null;
  }

  articleComments = [];

  const q = query(
    commentsRef,
    where("articleId", "==", articleId)
  );

  unsubscribeComments = onSnapshot(
    q,
    snapshot => {
      articleComments = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderCommentsSection();
    },
    error => {
      console.error("Erro ao carregar comentários:", error);
      showToast(friendlyFirestoreError(error, "carregar comentários"), 5000);
    }
  );
}

function startLikesListener(articleId) {
  if (unsubscribeLikes) {
    unsubscribeLikes();
    unsubscribeLikes = null;
  }

  articleLikes = [];

  const q = query(
    likesRef,
    where("articleId", "==", articleId)
  );

  unsubscribeLikes = onSnapshot(
    q,
    snapshot => {
      articleLikes = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderCommentsSection();
    },
    error => {
      console.error("Erro ao carregar curtidas:", error);
    }
  );
}

async function createComment(text, parentId = null) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    showToast("Escreva um comentário antes de publicar.");
    return;
  }

  if (cleanText.length > 3000) {
    showToast("O comentário ultrapassou o limite de 3.000 caracteres.");
    return;
  }

  if (!currentUser || !canUseCommunity()) {
    openLogin();
    showToast("Entre com Google ou Apple para comentar.");
    return;
  }

  if (!currentArticleId) return;

  try {
    await addDoc(commentsRef, {
      articleId: currentArticleId,
      uid: currentUser.uid,
      displayName: currentDisplayName(),
      text: cleanText,
      parentId: parentId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    replyToComment = null;
    showToast(parentId ? "Resposta publicada." : "Comentário publicado.");
  } catch (error) {
    console.error("Erro ao publicar comentário:", error);
    showToast(friendlyFirestoreError(error, "publicar comentário"), 6000);
  }
}

async function updateComment(commentId, text) {
  const comment = articleComments.find(item => item.id === commentId);
  const cleanText = String(text || "").trim();

  if (!comment || !currentUser || comment.uid !== currentUser.uid) {
    showToast("Você só pode editar seus próprios comentários.");
    return;
  }

  if (!cleanText) {
    showToast("O comentário não pode ficar vazio.");
    return;
  }

  if (cleanText.length > 3000) {
    showToast("O comentário ultrapassou o limite de 3.000 caracteres.");
    return;
  }

  try {
    await updateDoc(doc(db, "articleComments", commentId), {
      text: cleanText,
      updatedAt: serverTimestamp()
    });

    editingCommentId = null;
    showToast("Comentário atualizado.");
  } catch (error) {
    console.error("Erro ao editar comentário:", error);
    showToast(friendlyFirestoreError(error, "editar comentário"), 6000);
  }
}

async function deleteComment(commentId) {
  const comment = articleComments.find(item => item.id === commentId);

  if (!comment || !currentUser || comment.uid !== currentUser.uid) {
    showToast("Você só pode excluir seus próprios comentários.");
    return;
  }

  if (!confirm("Deseja excluir este comentário?")) return;

  try {
    // Remove também as respostas do comentário principal.
    if (!comment.parentId) {
      const replies = articleComments.filter(item => item.parentId === commentId);

      for (const reply of replies) {
        await deleteDoc(doc(db, "articleComments", reply.id));
      }
    }

    // Remove as curtidas vinculadas ao comentário.
    const relatedLikes = articleLikes.filter(item => item.commentId === commentId);

    for (const like of relatedLikes) {
      await deleteDoc(doc(db, "commentLikes", like.id));
    }

    await deleteDoc(doc(db, "articleComments", commentId));
    showToast("Comentário excluído.");
  } catch (error) {
    console.error("Erro ao excluir comentário:", error);
    showToast(friendlyFirestoreError(error, "excluir comentário"), 6000);
  }
}

async function toggleCommentLike(commentId) {
  if (!currentUser || !canUseCommunity()) {
    openLogin();
    showToast("Entre com Google ou Apple para curtir comentários.");
    return;
  }

  const id = `${commentId}_${currentUser.uid}`;
  const ref = doc(db, "commentLikes", id);

  try {
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        articleId: currentArticleId,
        commentId,
        uid: currentUser.uid,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Erro ao curtir comentário:", error);
    showToast(friendlyFirestoreError(error, "curtir comentário"), 6000);
  }
}

/* =========================================================
   COMPARTILHAMENTO
   ========================================================= */

function articleShareUrl() {
  const article = currentArticle();

  if (!article) return location.href;

  const url = new URL(location.href);
  url.hash = `artigo/${encodeURIComponent(article.id)}`;

  return url.href;
}

function articleShareText() {
  const article = currentArticle();

  return article
    ? `${article.title} — Rift Diário`
    : "Confira as notícias do Rift Diário";
}

async function copyArticleLink() {
  const url = articleShareUrl();

  try {
    await navigator.clipboard.writeText(url);
    showToast("Link da matéria copiado.");
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();

    const copied = document.execCommand("copy");
    input.remove();

    showToast(
      copied
        ? "Link da matéria copiado."
        : "Não foi possível copiar o link automaticamente."
    );
  }
}

async function shareNative() {
  const url = articleShareUrl();
  const text = articleShareText();

  if (navigator.share) {
    try {
      await navigator.share({
        title: text,
        text,
        url
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        showToast("Não foi possível abrir o compartilhamento.");
      }
    }
  } else {
    await copyArticleLink();
  }
}

function renderShareSection() {
  const host = $("#articleShare");
  if (!host) return;

  const url = articleShareUrl();
  const text = articleShareText();

  const whatsappUrl =
    `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

  const facebookUrl =
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  host.innerHTML = `
    <section class="community-section" aria-label="Compartilhar matéria">
      <h2>Compartilhe esta matéria</h2>
      <p class="community-subtitle">
        Ajude outros jogadores a encontrar as notícias do Rift Diário.
      </p>

      <div class="community-share">
        <a
          class="community-btn"
          href="${escapeHTML(whatsappUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >WhatsApp</a>

        <a
          class="community-btn"
          href="${escapeHTML(facebookUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >Facebook</a>

        <button type="button" class="community-btn" id="shareInstagramBtn">
          Instagram
        </button>

        <button type="button" class="community-btn" id="nativeShareBtn">
          Compartilhar…
        </button>

        <button type="button" class="community-btn" id="copyArticleLinkBtn">
          Copiar link
        </button>
      </div>

      <p class="community-notice">
        O Instagram não oferece compartilhamento direto de links de matérias
        por um botão comum de site. Use o botão de compartilhamento do celular
        ou copie o link para publicá-lo no Instagram.
      </p>
    </section>
  `;

  $("#shareInstagramBtn")?.addEventListener("click", async () => {
    if (navigator.share) {
      await shareNative();
    } else {
      await copyArticleLink();
      showToast("Cole o link na publicação, mensagem ou bio do Instagram.");
    }
  });

  $("#nativeShareBtn")?.addEventListener("click", shareNative);
  $("#copyArticleLinkBtn")?.addEventListener("click", copyArticleLink);
}

/* =========================================================
   PÁGINA DA MATÉRIA
   ========================================================= */

function stopArticleListeners() {
  if (unsubscribeRatings) unsubscribeRatings();
  if (unsubscribeComments) unsubscribeComments();
  if (unsubscribeLikes) unsubscribeLikes();

  unsubscribeRatings = null;
  unsubscribeComments = null;
  unsubscribeLikes = null;
}

function openArticle(id) {
  const article = allArticles.find(
    item => item.id === id && item.status === "published"
  );

  if (!article) {
    showToast("Esta notícia não está disponível ou ainda não foi publicada.");
    return;
  }

  stopArticleListeners();

  currentArticleId = id;
  articleRatings = [];
  articleComments = [];
  articleLikes = [];
  replyToComment = null;
  editingCommentId = null;

  $("#homeView")?.classList.add("hidden");
  $("#adminPanel")?.classList.add("hidden");

  const view = $("#articleView");
  if (!view) return;

  view.classList.remove("hidden");

  const inlineBody = renderArticleBody(
    article.content || "",
    Array.isArray(article.inlineMedia) ? article.inlineMedia : []
  );

  view.innerHTML = `
    <a href="#inicio" class="back-link" data-home>← Voltar às notícias</a>

    <header class="article-header">
      <span class="tag">
        ${escapeHTML(categoryLabel(article.category))} ·
        ${escapeHTML(gameLabel(article.game))}
      </span>

      <h1>${escapeHTML(article.title)}</h1>
      <p class="article-summary">${escapeHTML(article.summary)}</p>
      <div class="meta">${escapeHTML(formatDate(articleDate(article)))}</div>
    </header>

    ${
      article.image
        ? `<img class="article-hero-image" src="${escapeHTML(article.image)}" alt="${escapeHTML(article.title)}">`
        : ""
    }

    ${buildVideoEmbed(article.videoUrl || article.video || "")}

    <div class="article-content">${inlineBody}</div>

    <p class="source-note">
      Conteúdo do Rift Diário. Imagens e materiais de terceiros pertencem aos seus respectivos titulares.
    </p>

    <div id="articleRatings"></div>
    <div id="articleShare"></div>
    <div id="articleComments"></div>
  `;

  history.replaceState(null, "", `#artigo/${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });

  startRatingsListener(id);
  startCommentsListener(id);
  startLikesListener(id);

  renderRatingSection();
  renderShareSection();
  renderCommentsSection();
}

function goHome() {
  stopArticleListeners();

  currentArticleId = null;

  $("#articleView")?.classList.add("hidden");
  $("#homeView")?.classList.remove("hidden");

  if (!isAdmin) {
    $("#adminPanel")?.classList.add("hidden");
  }

  history.replaceState(null, "", "#inicio");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   LOGIN ADMINISTRATIVO
   ========================================================= */

function openLogin() {
  const overlay = $("#loginOverlay");

  if (!overlay) {
    showToast("O formulário de login não foi encontrado no HTML.");
    return;
  }

  ensureCommunityLoginButtons();
  setLoginError("");
  overlay.classList.remove("hidden");

  setTimeout(() => $("#adminEmail")?.focus(), 50);
}

function closeLogin() {
  $("#loginOverlay")?.classList.add("hidden");
  setLoginError("");
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
   PAINEL ADMINISTRATIVO
   ========================================================= */

function setAdminTab(tab) {
  const validTabs = ["editor", "review", "manage"];
  if (!validTabs.includes(tab)) return;

  activeAdminTab = tab;

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
    if (panel) panel.classList.toggle("hidden", name !== tab);
  });

  if (tab === "review") renderReviewQueue();
  if (tab === "manage") renderPublishedManage();
}

function resetArticleForm() {
  $("#articleForm")?.reset();

  if ($("#editingId")) $("#editingId").value = "";

  if ($("#saveArticleBtn")) {
    $("#saveArticleBtn").textContent = "Publicar matéria";
  }

  $("#cancelEditBtn")?.classList.add("hidden");

  currentArticleId = null;
  inlineMediaDraft = [];

  renderInlineMediaManager();
  updateInlinePreview();
}

function fillEditor(id) {
  const article = allArticles.find(item => item.id === id);
  if (!article) return;

  currentArticleId = id;

  $("#editingId").value = id;
  $("#articleTitle").value = article.title || "";
  $("#articleSummary").value = article.summary || "";
  $("#articleGame").value = article.game || "wild-rift";
  $("#articleCategory").value = article.category || "atualizacoes";
  $("#articleImage").value = article.image || "";

  if ($("#articleVideoUrl")) {
    $("#articleVideoUrl").value = article.videoUrl || article.video || "";
  }

  $("#articleContent").value = article.content || "";

  inlineMediaDraft = Array.isArray(article.inlineMedia)
    ? article.inlineMedia.map(item => ({ ...item }))
    : [];

  renderInlineMediaManager();
  updateInlinePreview();

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

/* =========================================================
   INSERÇÃO DE MÍDIAS NO TEXTO
   ========================================================= */

function insertMarkerAtCursor(id) {
  const field = $("#articleContent");
  if (!field) return;

  const marker = `\n\n[[MEDIA:${id}]]\n\n`;

  const start = Number.isInteger(field.selectionStart)
    ? field.selectionStart
    : field.value.length;

  const end = Number.isInteger(field.selectionEnd)
    ? field.selectionEnd
    : field.value.length;

  field.value =
    field.value.slice(0, start) +
    marker +
    field.value.slice(end);

  const cursor = start + marker.length;

  field.focus();
  field.setSelectionRange(cursor, cursor);

  updateInlinePreview();
}

function renderInlineMediaManager() {
  const host = $("#inlineMediaList");
  if (!host) return;

  host.innerHTML = inlineMediaDraft.length
    ? inlineMediaDraft.map(item => `
        <div class="inline-media-item">
          <span class="inline-media-kind">
            ${
              item.type === "image"
                ? "IMAGEM"
                : item.type === "video-upload"
                  ? "VÍDEO ENVIADO"
                  : "VÍDEO POR LINK"
            }
          </span>
          <span class="inline-media-name">
            ${escapeHTML(item.caption || item.name || item.url)}
          </span>
          <button
            type="button"
            class="text-btn"
            data-remove-inline-media="${escapeHTML(item.id)}"
          >Remover</button>
        </div>
      `).join("")
    : `<p class="form-hint">Nenhuma mídia inserida no corpo da matéria.</p>`;
}

function updateInlinePreview() {
  const host = $("#inlineMediaPreview");
  if (!host) return;

  const content = $("#articleContent")?.value || "";

  host.innerHTML =
    renderArticleBody(content, inlineMediaDraft) ||
    `<p class="form-hint">A prévia da matéria com mídias aparecerá aqui.</p>`;
}

async function uploadInlineFile(file, type) {
  if (!file) return;
  if (!requireAdmin()) return;

  if (uploadInProgress) {
    showToast("Já existe um envio em andamento.");
    return;
  }

  const isImage = type === "image";

  const allowed = isImage
    ? ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
    : ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

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

  const buttons = [
    $("#uploadImageBtn"),
    $("#uploadVideoBtn"),
    $("#insertVideoLinkBtn")
  ].filter(Boolean);

  uploadInProgress = true;
  buttons.forEach(button => {
    button.disabled = true;
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
            ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)
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

    const caption =
      $("#articleMediaCaption")?.value.trim() ||
      file.name.replace(/\.[^.]+$/, "");

    inlineMediaDraft.push({
      id,
      type: isImage ? "image" : "video-upload",
      url,
      caption,
      name: file.name,
      storagePath: path
    });

    insertMarkerAtCursor(id);
    renderInlineMediaManager();
    updateInlinePreview();

    showToast(`${isImage ? "Imagem" : "Vídeo"} enviado e inserido na matéria.`);
  } catch (error) {
    console.error("Erro no upload do Firebase Storage:", error);

    const messages = {
      "storage/unauthorized": "O Firebase Storage recusou o envio. Confira as regras.",
      "storage/canceled": "O envio foi cancelado.",
      "storage/retry-limit-exceeded": "O limite de tentativas foi atingido. Confira sua conexão.",
      "storage/quota-exceeded": "A cota de armazenamento foi excedida."
    };

    showToast(
      messages[error?.code] ||
      `Falha no upload: ${error?.code || error?.message || "erro desconhecido"}`,
      8000
    );
  } finally {
    uploadInProgress = false;
    buttons.forEach(button => {
      button.disabled = false;
    });

    if ($("#uploadImageInput")) $("#uploadImageInput").value = "";
    if ($("#uploadVideoInput")) $("#uploadVideoInput").value = "";
  }
}

function insertVideoLinkAtCursor() {
  if (!requireAdmin()) return;

  const input = $("#articleInlineVideoUrl");
  const url = input?.value.trim() || "";

  if (!url) {
    showToast("Cole primeiro o link do vídeo.");
    return;
  }

  if (!buildVideoEmbed(url)) {
    showToast(
      "Link não reconhecido. Use YouTube, Vimeo, Dailymotion, Twitch, Kick ou MP4/WebM/OGG direto.",
      6000
    );
    return;
  }

  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const caption = $("#articleMediaCaption")?.value.trim() || "";

  inlineMediaDraft.push({
    id,
    type: "video-link",
    url,
    caption,
    name: url
  });

  insertMarkerAtCursor(id);
  renderInlineMediaManager();

  input.value = "";
  showToast("Vídeo inserido no ponto do cursor.");
}

function removeInlineMedia(id) {
  inlineMediaDraft = inlineMediaDraft.filter(item => item.id !== id);

  const field = $("#articleContent");

  if (field) {
    field.value = field.value.replace(
      new RegExp(`\\n?\\s*\\[\\[MEDIA:${id}\\]\\]\\s*`, "g"),
      "\n\n"
    );
  }

  renderInlineMediaManager();
  updateInlinePreview();
}

/* =========================================================
   SALVAMENTO DE MATÉRIAS
   ========================================================= */

function articleFromForm(status, existingArticle = null) {
  const payload = {
    title: $("#articleTitle").value.trim(),
    summary: $("#articleSummary").value.trim(),
    game: $("#articleGame").value,
    category: $("#articleCategory").value,
    image: $("#articleImage").value.trim(),
    videoUrl: $("#articleVideoUrl")?.value.trim() || "",
    content: $("#articleContent").value.trim(),

    inlineMedia: inlineMediaDraft.map(item => ({
      id: item.id,
      type: item.type,
      url: item.url,
      caption: item.caption || "",
      name: item.name || "",
      storagePath: item.storagePath || ""
    })),

    status,
    updatedAt: serverTimestamp()
  };

  if (status === "published" && !existingArticle?.publishedAt) {
    payload.publishedAt = serverTimestamp();
  }

  return payload;
}

async function saveArticle(event, status) {
  event?.preventDefault();

  if (!requireAdmin()) return;

  const form = $("#articleForm");
  if (!form.reportValidity()) return;

  const videoUrl = $("#articleVideoUrl")?.value.trim() || "";

  if (videoUrl && !buildVideoEmbed(videoUrl)) {
    showToast(
      "Link de vídeo não reconhecido. Use YouTube, Vimeo, Dailymotion, Twitch, Kick ou MP4/WebM/OGG.",
      6000
    );
    return;
  }

  if (uploadInProgress) {
    showToast("Aguarde o término do upload antes de salvar a matéria.");
    return;
  }

  const editingId = currentArticleId;
  const existingArticle = editingId
    ? allArticles.find(article => article.id === editingId)
    : null;

  const payload = articleFromForm(status, existingArticle);
  const button = $("#saveArticleBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Salvando...";
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, "articles", editingId), payload);

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

    resetArticleForm();
    setAdminTab(status === "draft" ? "review" : "manage");
  } catch (error) {
    console.error("Erro ao salvar matéria:", error);
    showToast(friendlyFirestoreError(error, "salvar a matéria"), 6000);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = currentArticleId
        ? "Salvar alterações"
        : "Publicar matéria";
    }
  }
}

/* =========================================================
   FILAS ADMINISTRATIVAS
   ========================================================= */

function adminItem(article, mode) {
  const image = article.image
    ? `<img src="${escapeHTML(article.image)}" alt="" loading="lazy">`
    : `<div aria-hidden="true"></div>`;

  const status = article.status === "published"
    ? "Publicada"
    : article.status === "review"
      ? "Em revisão"
      : "Rascunho";

  const actionButtons = mode === "review"
    ? `
      <button class="primary-btn" data-article-action="publish" data-id="${escapeHTML(article.id)}">Aprovar e publicar</button>
      <button class="secondary-btn" data-article-action="edit" data-id="${escapeHTML(article.id)}">Editar</button>
      <button class="secondary-btn" data-article-action="delete" data-id="${escapeHTML(article.id)}">Excluir</button>
    `
    : `
      <button class="secondary-btn" data-article-action="edit" data-id="${escapeHTML(article.id)}">Editar</button>
      ${
        article.status !== "published"
          ? `<button class="primary-btn" data-article-action="publish" data-id="${escapeHTML(article.id)}">Publicar</button>`
          : `<button class="secondary-btn" data-article-action="draft" data-id="${escapeHTML(article.id)}">Tornar rascunho</button>`
      }
      <button class="secondary-btn" data-article-action="delete" data-id="${escapeHTML(article.id)}">Excluir</button>
    `;

  return `
    <article class="admin-item">
      ${image}
      <div>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>
        <p>${escapeHTML(status)} · ${escapeHTML(gameLabel(article.game))} · ${escapeHTML(categoryLabel(article.category))}</p>
        <p>${escapeHTML(article.summary || "Sem resumo")}</p>
      </div>
      <div class="admin-item-actions">${actionButtons}</div>
    </article>
  `;
}

function renderReviewQueue() {
  const host = $("#reviewQueue");
  if (!host) return;

  const items = sortNewest(
    allArticles.filter(article =>
      article.status === "draft" || article.status === "review"
    )
  );

  if ($("#reviewCount")) {
    $("#reviewCount").textContent = String(items.length);
  }

  host.innerHTML = items.length
    ? items.map(article => adminItem(article, "review")).join("")
    : `<p class="empty-state">Nenhum rascunho aguardando revisão.</p>`;
}

function renderPublishedManage() {
  const host = $("#publishedManage");
  if (!host) return;

  const items = sortNewest(
    allArticles.filter(article => article.status === "published")
  );

  host.innerHTML = items.length
    ? items.map(article => adminItem(article, "manage")).join("")
    : `<p class="empty-state">Ainda não há matérias publicadas.</p>`;
}

async function handleArticleAction(event) {
  const button = event.target.closest("[data-article-action]");

  if (!button || !requireAdmin()) return;

  const id = button.dataset.id;
  const action = button.dataset.articleAction;
  const article = allArticles.find(item => item.id === id);

  if (!article) return;

  try {
    if (action === "edit") {
      fillEditor(id);
      return;
    }

    if (action === "delete") {
      if (!confirm(`Excluir a matéria “${article.title}”? Esta ação não pode ser desfeita.`)) {
        return;
      }

      await deleteDoc(doc(db, "articles", id));
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
    showToast(friendlyFirestoreError(error, "alterar a matéria"), 6000);
  }
}

/* =========================================================
   FIRESTORE: MATÉRIAS
   ========================================================= */

function startPublicListener() {
  if (unsubscribePublic) unsubscribePublic();

  const publishedQuery = query(
    articlesRef,
    where("status", "==", "published")
  );

  unsubscribePublic = onSnapshot(
    publishedQuery,
    snapshot => {
      const publicItems = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      allArticles = publicItems;

      renderHome();

      if (currentArticleId) {
        const updated = allArticles.find(item => item.id === currentArticleId);

        if (!updated || updated.status !== "published") {
          goHome();
        }
      }
    },
    error => {
      console.error("Erro ao carregar notícias públicas:", error);

      const grid = $("#newsGrid");

      if (grid) {
        grid.innerHTML = `
          <div class="empty-state">
            Não foi possível carregar as notícias. Confira a conexão,
            as regras do Firestore e o Console do navegador.
          </div>
        `;
      }

      if ($("#newsCount")) {
        $("#newsCount").textContent = "Erro ao carregar";
      }

      showToast(friendlyFirestoreError(error, "carregar as notícias"), 6000);
    }
  );
}

function startAdminListener() {
  if (unsubscribeAdmin) unsubscribeAdmin();

  unsubscribeAdmin = onSnapshot(
    articlesRef,
    snapshot => {
      allArticles = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderHome();
      renderReviewQueue();
      renderPublishedManage();
    },
    error => {
      console.error("Erro ao carregar painel editorial:", error);
      showToast(friendlyFirestoreError(error, "carregar o painel editorial"), 6000);
    }
  );
}

/* =========================================================
   ESTADO DE AUTENTICAÇÃO
   ========================================================= */

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  const adminButton = $("#adminBtn");

  if (adminButton) {
    adminButton.innerHTML = isAdmin
      ? `
        <svg class="admin-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M19 8v6M16 11h6"></path>
        </svg>
        <span>Painel ADM</span>
      `
      : `
        <svg class="admin-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M20 8v6M17 11h6"></path>
        </svg>
        <span>Login</span>
      `;
  }

  $("#logoutBtn")?.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    $("#adminPanel")?.classList.remove("hidden");
    closeLogin();

    if (unsubscribePublic) {
      unsubscribePublic();
      unsubscribePublic = null;
    }

    startAdminListener();
  } else {
    $("#adminPanel")?.classList.add("hidden");

    if (unsubscribeAdmin) {
      unsubscribeAdmin();
      unsubscribeAdmin = null;
    }

    // Importante: contas comuns permanecem autenticadas
    // para usar avaliações, comentários e curtidas.
    startPublicListener();
  }

  if (currentArticleId) {
    renderRatingSection();
    renderC
