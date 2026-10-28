
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================================
   CONFIGURAÇÃO FIREBASE
   MANTIDA CONFORME O CÓDIGO ORIGINAL
========================================= */

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

/* =========================================
   INICIALIZAÇÃO
========================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const articlesCollection = collection(db, "articles");

let currentUser = null;
let isAdmin = false;

let allArticles = [];
let visibleArticles = [];
let currentCategory = "all";
let currentSearch = "";
let currentArticleId = null;
let editingArticle = null;
let newsLimit = 9;
let currentAdminTab = "editor";
let savedEditorRange = null;
let toastTimer = null;

/* =========================================
   ELEMENTOS
========================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(
  document.querySelectorAll(selector)
);

const adminBtn = $("#adminBtn");
const loginOverlay = $("#loginOverlay");
const loginForm = $("#loginForm");
const loginTitle = $("#loginTitle");
const loginError = $("#loginError");
const loginSubmitBtn = $("#loginSubmitBtn");

const adminPanel = $("#adminPanel");
const logoutBtn = $("#logoutBtn");

const articleForm = $("#articleForm");
const articleTitle = $("#articleTitle");
const articleSummary = $("#articleSummary");
const articleGame = $("#articleGame");
const articleCategory = $("#articleCategory");
const articleImage = $("#articleImage");
const articleContent = $("#articleContent");

const saveArticleBtn = $("#saveArticleBtn");
const saveDraftBtn = $("#saveDraftBtn");
const cancelEditBtn = $("#cancelEditBtn");

const editorImageInput = $("#editorImageInput");
const editorVideoInput = $("#editorVideoInput");
const insertImageBtn = $("#insertImageBtn");
const insertVideoBtn = $("#insertVideoBtn");

const editorBlockFormat = $("#editorBlockFormat");
const editorTextColor = $("#editorTextColor");
const editorLinkBtn = $("#editorLinkBtn");

const homeView = $("#homeView");
const articleView = $("#articleView");
const featuredSection = $("#featuredSection");
const newsGrid = $("#newsGrid");
const newsCount = $("#newsCount");
const listingTitle = $("#listingTitle");
const loadMoreBtn = $("#loadMoreBtn");

const searchToggle = $("#searchToggle");
const searchPanel = $("#searchPanel");
const searchInput = $("#searchInput");
const clearSearch = $("#clearSearch");

const reviewQueue = $("#reviewQueue");
const reviewCount = $("#reviewCount");
const publishedManage = $("#publishedManage");
const toast = $("#toast");

/* =========================================
   MENSAGENS
========================================= */

function showMessage(message, type = "error") {
  if (!toast) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  toast.style.borderColor =
    type === "success" ? "#348c68" :
    type === "warning" ? "#a47b28" :
    "#8d4252";

  toast.style.background =
    type === "success" ? "#103626" :
    type === "warning" ? "#352b14" :
    "#32151e";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 4500);
}

/* =========================================
   UTILITÁRIOS
========================================= */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function normalizeText(value = "") {
  return String(value)
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safeURL(value = "") {
  try {
    const url = new URL(value, window.location.href);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return url.href;
    }

    return "";
  } catch {
    return "";
  }
}

function getArticleDate(article) {
  const timestamp = article.updatedAt || article.createdAt;

  if (timestamp?.toDate) {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  return null;
}

function formatDate(article) {
  const date = getArticleDate(article);

  if (!date) {
    return "Publicação recente";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function gameLabel(game) {
  const labels = {
    "wild-rift": "Wild Rift",
    "lol-pc": "League of Legends",
    both: "Wild Rift e LoL"
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

function articleImageURL(article) {
  return safeURL(article.image || "");
}

function setButtonLoading(button, loading, loadingText = "Salvando...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;

    button.disabled = false;
  }
}

/* =========================================
   LOGIN
========================================= */

function openLogin() {
  if (!loginOverlay) return;

  loginOverlay.classList.remove("hidden");
  loginOverlay.setAttribute("aria-hidden", "false");

  if (loginTitle) {
    loginTitle.textContent = "Entrar no painel";
  }

  if (loginError) {
    loginError.textContent = "";
  }

  $("#adminEmail")?.focus();
}

function closeLogin() {
  if (!loginOverlay) return;

  loginOverlay.classList.add("hidden");
  loginOverlay.setAttribute("aria-hidden", "true");
}

$("#closeLoginBtn")?.addEventListener("click", closeLogin);

loginOverlay?.addEventListener("click", (event) => {
  if (event.target === loginOverlay) {
    closeLogin();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLogin();
  }
});

adminBtn?.addEventListener("click", () => {
  if (isAdmin) {
    adminPanel?.classList.toggle("hidden");

    if (!adminPanel?.classList.contains("hidden")) {
      adminPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    return;
  }

  openLogin();
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#adminEmail")?.value.trim();
  const password = $("#adminPassword")?.value;

  if (!email || !password) {
    if (loginError) {
      loginError.textContent = "Digite seu e-mail e sua senha.";
    }

    return;
  }

  if (loginError) {
    loginError.textContent = "";
  }

  setButtonLoading(loginSubmitBtn, true, "Entrando...");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (credential.user.uid !== ADMIN_UID) {
      await signOut(auth);

      throw new Error(
        "Esta conta não tem permissão de administrador."
      );
    }

    loginForm.reset();
    closeLogin();

    showMessage("Login realizado com sucesso!", "success");

    adminPanel?.classList.remove("hidden");
    adminPanel?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("Erro no login:", error);

    const messages = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/invalid-email": "O e-mail informado é inválido.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/too-many-requests":
        "Muitas tentativas. Aguarde e tente novamente.",
      "auth/operation-not-allowed":
        "O login por e-mail e senha não está habilitado no Firebase.",
      "auth/network-request-failed":
        "Falha de conexão. Verifique sua internet."
    };

    const message =
      messages[error.code] ||
      error.message ||
      "Não foi possível entrar. Confira os dados e tente novamente.";

    if (loginError) {
      loginError.textContent = message;
    } else {
      showMessage(message);
    }
  } finally {
    setButtonLoading(loginSubmitBtn, false);
  }
});

/* =========================================
   ESTADO DO ADMINISTRADOR
========================================= */

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  if (adminBtn) {
    adminBtn.textContent = isAdmin ? "Painel ADM" : "Login";

    adminBtn.setAttribute(
      "aria-label",
      isAdmin ? "Abrir painel administrativo" : "Fazer login"
    );
  }

  logoutBtn?.classList.toggle("hidden", !isAdmin);
  adminPanel?.classList.toggle("hidden", !isAdmin);

  if (!isAdmin) {
    closeLogin();
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user && user.uid !== ADMIN_UID) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao encerrar sessão:", error);
    }

    setAdminState(null);
    return;
  }

  setAdminState(user);

  if (user && isAdmin) {
    await loadArticles();
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    resetEditor();
    showMessage("Você saiu da sua conta.", "success");
  } catch (error) {
    console.error("Erro ao sair:", error);
    showMessage("Não foi possível sair da conta.");
  }
});

/* =========================================
   CARREGAMENTO DAS MATÉRIAS
========================================= */

async function loadArticles() {
  if (newsGrid) {
    newsGrid.innerHTML =
      '<div class="loading-state">Carregando notícias...</div>';
  }

  try {
    const articlesQuery = query(
      articlesCollection,
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(articlesQuery);

    allArticles = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderNews();
    renderAdminLists();
  } catch (error) {
    console.error("Erro ao carregar matérias:", error);

    if (newsGrid) {
      newsGrid.innerHTML = `
        <div class="empty-state">
          Não foi possível carregar as notícias.
          Verifique as regras do Firestore e sua conexão.
        </div>
      `;
    }

    showMessage(
      "Erro ao carregar notícias. Verifique as permissões do Firestore."
    );
  }
}

/* =========================================
   FILTROS E BUSCA
========================================= */

function getPublishedArticles() {
  return allArticles.filter(
    (article) => article.status === "published"
  );
}

function filterArticles() {
  const published = getPublishedArticles();

  return published.filter((article) => {
    const matchesCategory =
      currentCategory === "all" ||
      article.game === currentCategory ||
      article.category === currentCategory ||
      (
        currentCategory === "esports" &&
        article.category === "esports"
      ) ||
      (
        currentCategory === "guias" &&
        article.category === "guias"
      );

    const searchableText = normalizeText([
      article.title,
      article.summary,
      article.game,
      article.category,
      article.content
    ].join(" "));

    const matchesSearch =
      !currentSearch ||
      searchableText.includes(normalizeText(currentSearch));

    return matchesCategory && matchesSearch;
  });
}

function renderNews() {
  visibleArticles = filterArticles();

  if (listingTitle) {
    if (currentSearch) {
      listingTitle.textContent = "Resultados da busca";
    } else if (currentCategory !== "all") {
      listingTitle.textContent = categoryLabel(currentCategory);
    } else {
      listingTitle.textContent = "Últimas notícias";
    }
  }

  if (newsCount) {
    newsCount.textContent =
      `${visibleArticles.length} notícia(s)`;
  }

  renderFeatured();
  renderNewsGrid();
}

function renderFeatured() {
  if (!featuredSection) return;

  if (
    currentCategory !== "all" ||
    currentSearch ||
    visibleArticles.length === 0
  ) {
    featuredSection.innerHTML = "";
    featuredSection.classList.add("hidden");
    return;
  }

  const article = visibleArticles[0];
  const image = articleImageURL(article);

  featuredSection.classList.remove("hidden");

  featuredSection.innerHTML = `
    <article class="featured-card">
      ${
        image
          ? `
            <img
              class="featured-image"
              src="${escapeHTML(image)}"
              alt="${escapeHTML(article.title || "Imagem da matéria")}"
              loading="lazy"
            >
          `
          : `
            <div class="featured-image" aria-hidden="true"></div>
          `
      }

      <div class="featured-copy">
        <span class="tag">
          ${escapeHTML(categoryLabel(article.category))}
        </span>

        <h2>${escapeHTML(article.title || "Sem título")}</h2>

        <p>${escapeHTML(article.summary || "")}</p>

        <div class="meta">
          <span>${escapeHTML(gameLabel(article.game))}</span>
          <span>•</span>
          <time>${escapeHTML(formatDate(article))}</time>
        </div>

        <a
          class="read-link"
          href="#materia-${encodeURIComponent(article.id)}"
          data-open-article="${escapeHTML(article.id)}"
        >
          Ler matéria →
        </a>
      </div>
    </article>
  `;
}

function renderNewsGrid() {
  if (!newsGrid) return;

  const list = visibleArticles.slice(0, newsLimit);

  if (!list.length) {
    newsGrid.innerHTML = `
      <div class="empty-state">
        ${
          currentSearch
            ? "Nenhuma notícia encontrada para essa busca."
            : "Ainda não há notícias publicadas nesta categoria."
        }
      </div>
    `;

    loadMoreBtn?.classList.add("hidden");
    return;
  }

  const gridArticles =
    currentCategory === "all" && !currentSearch
      ? list.slice(1)
      : list;

  newsGrid.innerHTML = gridArticles.map((article) => {
    const image = articleImageURL(article);

    return `
      <article class="news-card">
        <a
          href="#materia-${encodeURIComponent(article.id)}"
          data-open-article="${escapeHTML(article.id)}"
          aria-label="Ler ${escapeHTML(article.title || "matéria")}"
        >
          ${
            image
              ? `
                <img
                  class="news-card-image"
                  src="${escapeHTML(image)}"
                  alt="${escapeHTML(article.title || "")}"
                  loading="lazy"
                >
              `
              : `
                <div class="news-card-image" aria-hidden="true"></div>
              `
          }
        </a>

        <div class="news-card-copy">
          <span class="tag">
            ${escapeHTML(categoryLabel(article.category))}
          </span>

          <h3>
            <a
              href="#materia-${encodeURIComponent(article.id)}"
              data-open-article="${escapeHTML(article.id)}"
            >
              ${escapeHTML(article.title || "Sem título")}
            </a>
          </h3>

          <p>${escapeHTML(article.summary || "")}</p>

          <div class="meta">
            <span>${escapeHTML(gameLabel(article.game))}</span>
            <span>•</span>
            <time>${escapeHTML(formatDate(article))}</time>
          </div>

          <a
            class="read-link"
            href="#materia-${encodeURIComponent(article.id)}"
            data-open-article="${escapeHTML(article.id)}"
          >
            Ler matéria →
          </a>
        </div>
      </article>
    `;
  }).join("");

  const hasMore = visibleArticles.length > newsLimit;

  loadMoreBtn?.classList.toggle("hidden", !hasMore);
}

/* =========================================
   ABRIR MATÉRIA
========================================= */

function sanitizeArticleHTML(html) {
  if (!window.DOMPurify) {
    const fallback = document.createElement("div");
    fallback.textContent = html || "";
    return fallback.innerHTML;
  }

  return window.DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "del",
      "h2", "h3", "h4", "ul", "ol", "li", "blockquote",
      "a", "img", "video", "source", "iframe", "span",
      "div", "figure", "figcaption", "font"
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "width", "height", "controls", "controlslist",
      "preload", "poster", "type", "loading",
      "allow", "allowfullscreen", "frameborder",
      "referrerpolicy", "class", "style", "color"
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: [
      "script", "object", "embed", "form", "input",
      "button", "textarea", "select"
    ]
  });
}

function openArticle(articleId) {
  const article = allArticles.find(
    (item) => item.id === articleId &&
      item.status === "published"
  );

  if (!article || !articleView) {
    showMessage("Esta matéria não está disponível.");
    return;
  }

  currentArticleId = article.id;

  const image = articleImageURL(article);
  const safeContent = sanitizeArticleHTML(article.content || "");

  articleView.innerHTML = `
    <a href="#" class="back-link" id="backToNews">
      ← Voltar para as notícias
    </a>

    <article>
      <header class="article-header">
        <span class="tag">
          ${escapeHTML(categoryLabel(article.category))}
        </span>

        <h1>${escapeHTML(article.title || "Sem título")}</h1>

        <p class="article-summary">
          ${escapeHTML(article.summary || "")}
        </p>

        <div class="meta">
          <span>${escapeHTML(gameLabel(article.game))}</span>
          <span>•</span>
          <time>${escapeHTML(formatDate(article))}</time>
        </div>
      </header>

      ${
        image
          ? `
            <img
              class="article-hero-image"
              src="${escapeHTML(image)}"
              alt="${escapeHTML(article.title || "")}"
            >
          `
          : ""
      }

      <div class="article-content">
        ${safeContent}
      </div>
    </article>
  `;

  homeView?.classList.add("hidden");
  adminPanel?.classList.add("hidden");
  articleView.classList.remove("hidden");

  window.history.replaceState(
    null,
    "",
    `#materia-${encodeURIComponent(article.id)}`
  );

  articleView.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function backToNews() {
  currentArticleId = null;

  articleView?.classList.add("hidden");
  homeView?.classList.remove("hidden");

  window.history.replaceState(null, "", window.location.pathname);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.addEventListener("click", (event) => {
  const articleLink = event.target.closest("[data-open-article]");

  if (articleLink) {
    event.preventDefault();

    openArticle(articleLink.dataset.openArticle);
    return;
  }

  if (event.target.closest("#backToNews")) {
    event.preventDefault();
    backToNews();
  }
});

/* =========================================
   NAVEGAÇÃO E CATEGORIAS
========================================= */

function activateCategory(category, clickedButton = null) {
  currentCategory = category || "all";
  newsLimit = 9;

  $$(".nav-link").forEach((button) => {
    const active = button === clickedButton;

    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  backToNews();
  renderNews();
}

$$(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    activateCategory(button.dataset.category || "all", button);
  });
});

searchToggle?.addEventListener("click", () => {
  searchPanel?.classList.toggle("hidden");

  if (!searchPanel?.classList.contains("hidden")) {
    searchInput?.focus();
  }
});

searchInput?.addEventListener("input", () => {
  currentSearch = searchInput.value.trim();
  newsLimit = 9;

  backToNews();
  renderNews();
});

clearSearch?.addEventListener("click", () => {
  if (searchInput) {
    searchInput.value = "";
  }

  currentSearch = "";
  newsLimit = 9;

  renderNews();
  searchInput?.focus();
});

loadMoreBtn?.addEventListener("click", () => {
  newsLimit += 9;
  renderNewsGrid();
});

/* =========================================
   ABAS DO PAINEL
========================================= */

function activateAdminTab(tabName) {
  if (!isAdmin) {
    showMessage("Entre como administrador para acessar o painel.");
    return;
  }

  currentAdminTab = tabName;

  const tabIds = {
    editor: "editorTab",
    review: "reviewTab",
    manage: "manageTab"
  };

  Object.entries(tabIds).forEach(([name, id]) => {
    const element = document.getElementById(id);

    element?.classList.toggle("hidden", name !== tabName);
  });

  $$("[data-admin-tab]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.adminTab === tabName
    );
  });

  if (tabName === "review" || tabName === "manage") {
    renderAdminLists();
  }
}

$$("[data-admin-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activateAdminTab(button.dataset.adminTab);
  });
});

/* =========================================
   EDITOR RICO — CURSOR
========================================= */

function saveEditorSelection() {
  if (!articleContent) return;

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (
    articleContent.contains(range.startContainer) &&
    articleContent.contains(range.endContainer)
  ) {
    savedEditorRange = range.cloneRange();
  }
}

function restoreEditorSelection() {
  if (!articleContent) return;

  articleContent.focus();

  const selection = window.getSelection();

  if (!selection) return;

  selection.removeAllRanges();

  if (
    savedEditorRange &&
    articleContent.contains(savedEditorRange.startContainer) &&
    articleContent.contains(savedEditorRange.endContainer)
  ) {
    selection.addRange(savedEditorRange);
    return;
  }

  const range = document.createRange();

  range.selectNodeContents(articleContent);
  range.collapse(false);

  selection.addRange(range);

  savedEditorRange = range.cloneRange();
}

articleContent?.addEventListener("keyup", saveEditorSelection);
articleContent?.addEventListener("mouseup", saveEditorSelection);
articleContent?.addEventListener("input", saveEditorSelection);
articleContent?.addEventListener("focus", saveEditorSelection);

document.addEventListener("selectionchange", () => {
  if (
    articleContent &&
    articleContent.contains(document.activeElement)
  ) {
    saveEditorSelection();
  }
});

/* =========================================
   COMANDOS DE FORMATAÇÃO
========================================= */

function executeEditorCommand(command, value = null) {
  if (!articleContent) return;

  restoreEditorSelection();

  document.execCommand(command, false, value);

  saveEditorSelection();
  articleContent.focus();
}

$$(".editor-toolbar [data-command]").forEach((button) => {
  button.addEventListener("mousedown", (event) => {
    // Evita perder a seleção do texto ao clicar na barra.
    event.preventDefault();
  });

  button.addEventListener("click", () => {
    executeEditorCommand(button.dataset.command);
  });
});

editorBlockFormat?.addEventListener("change", () => {
  const format = editorBlockFormat.value;

  const formats = {
    p: "p",
    h2: "h2",
    h3: "h3",
    blockquote: "blockquote"
  };

  executeEditorCommand(
    "formatBlock",
    formats[format] || "p"
  );
});

editorTextColor?.addEventListener("input", () => {
  executeEditorCommand("foreColor", editorTextColor.value);
});

editorLinkBtn?.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

editorLinkBtn?.addEventListener("click", () => {
  const inputURL = window.prompt(
    "Digite a URL do link (https://...)"
  );

  if (!inputURL) return;

  const url = safeURL(inputURL.trim());

  if (!url) {
    showMessage("Informe uma URL válida começando com http:// ou https://.");
    return;
  }

  executeEditorCommand("createLink", url);
});

/* =========================================
   UPLOAD DE IMAGENS E VÍDEOS
========================================= */

function safeFileName(name) {
  return String(name || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
}

function validateMediaFile(file, type) {
  if (!file) return false;

  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  const allowedVideoTypes = [
    "video/mp4",
    "video/webm",
    "video/ogg"
  ];

  const allowedTypes =
    type === "image" ? allowedImageTypes : allowedVideoTypes;

  if (!allowedTypes.includes(file.type)) {
    showMessage(
      type === "image"
        ? "Escolha uma imagem JPG, PNG, WEBP ou GIF."
        : "Escolha um vídeo MP4, WEBM ou OGG."
    );

    return false;
  }

  const maxSize =
    type === "image"
      ? 10 * 1024 * 1024
      : 100 * 1024 * 1024;

  if (file.size > maxSize) {
    showMessage(
      type === "image"
        ? "A imagem deve ter no máximo 10 MB."
        : "O vídeo deve ter no máximo 100 MB."
    );

    return false;
  }

  return true;
}

async function uploadMedia(file, type) {
  if (!isAdmin || !currentUser) {
    throw new Error("Você precisa estar autenticado como administrador.");
  }

  const timestamp = Date.now();
  const fileName = safeFileName(file.name);

  const storagePath =
    `articles/${currentUser.uid}/${timestamp}_${fileName}`;

  const storageRef = ref(storage, storagePath);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: currentUser.uid,
      mediaType: type
    }
  });

  return getDownloadURL(snapshot.ref);
}

function insertHTMLAtCursor(html) {
  if (!articleContent) return;

  restoreEditorSelection();

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    articleContent.insertAdjacentHTML("beforeend", html);
    return;
  }

  const range = selection.getRangeAt(0);

  if (
    !articleContent.contains(range.startContainer) ||
    !articleContent.contains(range.endContainer)
  ) {
    articleContent.insertAdjacentHTML("beforeend", html);
    return;
  }

  range.deleteContents();

  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;

  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  savedEditorRange = range.cloneRange();
  articleContent.focus();
}

async function handleMediaUpload(file, type, button, input) {
  if (!file) return;

  if (!validateMediaFile(file, type)) {
    if (input) input.value = "";
    return;
  }

  if (!isAdmin) {
    showMessage("Somente o administrador pode enviar mídias.");
    if (input) input.value = "";
    return;
  }

  setButtonLoading(
    button,
    true,
    type === "image" ? "Enviando imagem..." : "Enviando vídeo..."
  );

  try {
    const url = await uploadMedia(file, type);
    const safe = escapeHTML(url);

    if (type === "image") {
      insertHTMLAtCursor(`
        <p>
          <img
            src="${safe}"
            alt="${escapeHTML(file.name)}"
            loading="lazy"
          >
        </p>
      `);
    } else {
      insertHTMLAtCursor(`
        <p>
          <video controls preload="metadata">
            <source
              src="${safe}"
              type="${escapeHTML(file.type)}"
            >
            Seu navegador não consegue reproduzir este vídeo.
          </video>
        </p>
      `);
    }

    showMessage(
      type === "image"
        ? "Imagem enviada e inserida no texto!"
        : "Vídeo enviado e inserido no texto!",
      "success"
    );
  } catch (error) {
    console.error("Erro no upload:", error);

    showMessage(
      "Não foi possível enviar o arquivo. Verifique se o Firebase Storage está habilitado e se as regras permitem o upload."
    );
  } finally {
    setButtonLoading(button, false);

    if (input) {
      input.value = "";
    }

    articleContent?.focus();
  }
}

insertImageBtn?.addEventListener("mousedown", (event) => {
  event.preventDefault();
  saveEditorSelection();
});

insertImageBtn?.addEventListener("click", () => {
  saveEditorSelection();
  editorImageInput?.click();
});

insertVideoBtn?.addEventListener("mousedown", (event) => {
  event.preventDefault();
  saveEditorSelection();
});

insertVideoBtn?.addEventListener("click", () => {
  saveEditorSelection();
  editorVideoInput?.click();
});

editorImageInput?.addEventListener("change", async () => {
  await handleMediaUpload(
    editorImageInput.files?.[0],
    "image",
    insertImageBtn,
    editorImageInput
  );
});

editorVideoInput?.addEventListener("change", async () => {
  await handleMediaUpload(
    editorVideoInput.files?.[0],
    "video",
    insertVideoBtn,
    editorVideoInput
  );
});

/* =========================================
   CONTEÚDO SEGURO PARA SALVAR
========================================= */

function cleanEditorHTML() {
  if (!articleContent) return "";

  const rawHTML = articleContent.innerHTML.trim();

  if (!window.DOMPurify) {
    const text = articleContent.innerText.trim();

    if (!text) return "";

    showMessage(
      "O sanitizador não carregou. Verifique sua conexão e tente novamente."
    );

    return null;
  }

  return window.DOMPurify.sanitize(rawHTML, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "del",
      "h2", "h3", "h4", "ul", "ol", "li", "blockquote",
      "a", "img", "video", "source", "iframe", "span",
      "div", "figure", "figcaption", "font"
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "width", "height", "controls", "controlslist",
      "preload", "poster", "type", "loading",
      "allow", "allowfullscreen", "frameborder",
      "referrerpolicy", "class", "style", "color"
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: [
      "script", "object", "embed", "form", "input",
      "button", "textarea", "select"
    ]
  });
}

function editorHasContent(html) {
  if (!html) return false;

  const container = document.createElement("div");
  container.innerHTML = html;

  return Boolean(
    container.textContent.trim() ||
    container.querySelector("img, video, iframe")
  );
}

/* =========================================
   SALVAR MATÉRIA OU RASCUNHO
========================================= */

async function saveArticle(status) {
  if (!isAdmin || !currentUser) {
    showMessage("Faça login como administrador antes de publicar.");
    return;
  }

  const title = articleTitle?.value.trim() || "";
  const summary = articleSummary?.value.trim() || "";
  const game = articleGame?.value || "wild-rift";
  const category = articleCategory?.value || "atualizacoes";
  const image = articleImage?.value.trim() || "";

  if (!title || !summary) {
    showMessage("Preencha o título e o resumo da matéria.");
    return;
  }

  if (title.length > 140) {
    showMessage("O título deve ter no máximo 140 caracteres.");
    return;
  }

  if (summary.length > 300) {
    showMessage("O resumo deve ter no máximo 300 caracteres.");
    return;
  }

  if (image && !safeURL(image)) {
    showMessage("A URL da imagem de capa é inválida.");
    return;
  }

  const content = cleanEditorHTML();

  if (content === null) return;

  if (!editorHasContent(content)) {
    showMessage("Escreva o conteúdo da matéria antes de salvar.");
    return;
  }

  const isEditing = Boolean(editingArticle?.id);
  const button = status === "published" ? saveArticleBtn : saveDraftBtn;

  setButtonLoading(
    button,
    true,
    status === "published" ? "Publicando..." : "Salvando..."
  );

  const payload = {
    title,
    summary,
    game,
    category,
    image: safeURL(image),
    content,
    status,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  };

  try {
    if (isEditing) {
      await updateDoc(
        doc(db, "articles", editingArticle.id),
        payload
      );
    } else {
      await addDoc(articlesCollection, {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
    }

    showMessage(
      status === "published"
        ? isEditing
          ? "Matéria atualizada e publicada!"
          : "Matéria publicada com sucesso!"
        : isEditing
          ? "Rascunho atualizado!"
          : "Rascunho salvo com sucesso!",
      "success"
    );

    resetEditor();
    await loadArticles();

    activateAdminTab("manage");
  } catch (error) {
    console.error("Erro ao salvar matéria:", error);

    showMessage(
      "Não foi possível salvar. Verifique as regras do Firestore e tente novamente."
    );
  } finally {
    setButtonLoading(button, false);
  }
}

articleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveArticle("published");
});

saveDraftBtn?.addEventListener("click", async () => {
  await saveArticle("draft");
});

/* =========================================
   EDITAR MATÉRIA
========================================= */

function editArticle(articleId) {
  if (!isAdmin) {
    showMessage("Somente o administrador pode editar matérias.");
    return;
  }

  const article = allArticles.find(
    (item) => item.id === articleId
  );

  if (!article) {
    showMessage("Matéria não encontrada.");
    return;
  }

  editingArticle = article;

  if ($("#editingId")) {
    $("#editingId").value = article.id;
  }

  if (articleTitle) articleTitle.value = article.title || "";
  if (articleSummary) articleSummary.value = article.summary || "";
  if (articleGame) articleGame.value = article.game || "wild-rift";
  if (articleCategory) {
    articleCategory.value = article.category || "atualizacoes";
  }

  if (articleImage) articleImage.value = article.image || "";
  if (articleContent) {
    articleContent.innerHTML = sanitizeArticleHTML(article.content || "");
  }

  if (saveArticleBtn) {
    saveArticleBtn.textContent =
      article.status === "published"
        ? "Atualizar e publicar"
        : "Publicar matéria";
  }

  if (saveDraftBtn) {
    saveDraftBtn.textContent = "Salvar alterações como rascunho";
  }

  cancelEditBtn?.classList.remove("hidden");

  activateAdminTab("editor");

  adminPanel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  showMessage("Matéria carregada no editor.", "success");
}

function resetEditor() {
  articleForm?.reset();

  if (articleContent) {
    articleContent.innerHTML = "";
  }

  if ($("#editingId")) {
    $("#editingId").value = "";
  }

  editingArticle = null;
  savedEditorRange = null;

  if (saveArticleBtn) {
    saveArticleBtn.textContent = "Publicar matéria";
  }

  if (saveDraftBtn) {
    saveDraftBtn.textContent = "Salvar rascunho";
  }

  cancelEditBtn?.classList.add("hidden");

  if (editorImageInput) editorImageInput.value = "";
  if (editorVideoInput) editorVideoInput.value = "";
}

cancelEditBtn?.addEventListener("click", () => {
  resetEditor();

  showMessage("Edição cancelada.", "success");
});

/* =========================================
   PUBLICAR, DESPUBLICAR E EXCLUIR
========================================= */

async function changeArticleStatus(articleId, status) {
  if (!isAdmin || !currentUser) {
    showMessage("Ação permitida apenas para o administrador.");
    return;
  }

  try {
    await updateDoc(doc(db, "articles", articleId), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });

    showMessage(
      status === "published"
        ? "Matéria publicada!"
        : "Matéria salva como rascunho.",
      "success"
    );

    await loadArticles();
  } catch (error) {
    console.error("Erro ao alterar status:", error);
    showMessage("Não foi possível atualizar o status da matéria.");
  }
}

async function removeArticle(articleId) {
  if (!isAdmin || !currentUser) {
    showMessage("Ação permitida apenas para o administrador.");
    return;
  }

  const article = allArticles.find(
    (item) => item.id === articleId
  );

  if (!article) return;

  const confirmed = window.confirm(
    `Deseja excluir a matéria "${article.title || "Sem título"}"? Esta ação não pode ser desfeita.`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "articles", articleId));

    if (editingArticle?.id === articleId) {
      resetEditor();
    }

    showMessage("Matéria excluída.", "success");
    await loadArticles();
  } catch (error) {
    console.error("Erro ao excluir:", error);
    showMessage("Não foi possível excluir a matéria.");
  }
}

/* =========================================
   LISTAS ADMINISTRATIVAS
========================================= */

function renderAdminLists() {
  if (!isAdmin) return;

  const drafts = allArticles.filter(
    (article) => article.status === "draft"
  );

  const published = allArticles.filter(
    (article) => article.status === "published"
  );

  if (reviewCount) {
    reviewCount.textContent = String(drafts.length);
  }

  if (reviewQueue) {
    if (!drafts.length) {
      reviewQueue.innerHTML = `
        <p class="empty-state">
          Não há rascunhos aguardando revisão.
        </p>
      `;
    } else {
      reviewQueue.innerHTML = drafts.map((article) => {
        return renderAdminItem(article, "draft");
      }).join("");
    }
  }

  if (publishedManage) {
    if (!published.length) {
      publishedManage.innerHTML = `
        <p class="empty-state">
          Nenhuma matéria publicada ainda.
        </p>
      `;
    } else {
      publishedManage.innerHTML = published.map((article) => {
        return renderAdminItem(article, "published");
      }).join("");
    }
  }
}

function renderAdminItem(article, status) {
  const image = articleImageURL(article);

  return `
    <article class="admin-item">
      ${
        image
          ? `
            <img
              src="${escapeHTML(image)}"
              alt=""
              loading="lazy"
            >
          `
          : `
            <div class="admin-item-image" aria-hidden="true"></div>
          `
      }

      <div>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>

        <p>
          ${escapeHTML(gameLabel(article.game))}
          • ${escapeHTML(categoryLabel(article.category))}
          • ${escapeHTML(formatDate(article))}
        </p>

        <p>${escapeHTML(article.summary || "")}</p>
      </div>

      <div class="admin-item-actions">
        <button
          type="button"
          data-action="edit"
          data-id="${escapeHTML(article.id)}"
        >
          Editar
        </button>

        ${
          status === "draft"
            ? `
              <button
                type="button"
                data-action="publish"
                data-id="${escapeHTML(article.id)}"
              >
                Publicar
              </button>
            `
            : `
              <button
                type="button"
                data-action="unpublish"
                data-id="${escapeHTML(article.id)}"
              >
                Despublicar
              </button>
            `
        }

        <button
          type="button"
          class="danger-btn"
          data-action="delete"
          data-id="${escapeHTML(article.id)}"
        >
          Excluir
        </button>
      </div>
    </article>
  `;
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  if (!isAdmin) {
    showMessage("Você precisa estar autenticado como administrador.");
    return;
  }

  const articleId = button.dataset.id;
  const action = button.dataset.action;

  if (!articleId) return;

  if (action === "edit") {
    editArticle(articleId);
  } else if (action === "publish") {
    await changeArticleStatus(articleId, "published");
  } else if (action === "unpublish") {
    await changeArticleStatus(articleId, "draft");
  } else if (action === "delete") {
    await removeArticle(articleId);
  }
});

/* =========================================
   INICIALIZAÇÃO DA PÁGINA
========================================= */

async function initializePage() {
  try {
    await loadArticles();
  } catch (error) {
    console.error("Erro na inicialização:", error);
  }

  const navButtons = $$(".nav-link");

  const initialButton =
    navButtons.find(
      (button) => button.dataset.category === "all"
    ) || navButtons[0];

  if (initialButton) {
    activateCategory(
      initialButton.dataset.category || "all",
      initialButton
    );
  }
}

initializePage();
