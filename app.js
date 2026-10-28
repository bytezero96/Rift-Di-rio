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
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

/* =========================================================
   RIFT DIÁRIO — CONFIGURAÇÃO
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

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const articlesRef = collection(db, "articles");

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
let toastTimer = null;

const PAGE_SIZE = 9;
let shownCount = PAGE_SIZE;

/* =========================================================
   FUNÇÕES AUXILIARES
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
  return article.publishedAt || article.updatedAt || article.createdAt || null;
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
          ${escapeHTML(categoryLabel(article.category))}
          · ${escapeHTML(gameLabel(article.game))}
        </span>

        <div class="meta">
          ${escapeHTML(formatDate(articleDate(article)))}
        </div>

        <h3>${escapeHTML(article.title)}</h3>
        <p>${escapeHTML(article.summary)}</p>

        <a
          class="read-link"
          href="#artigo/${encodeURIComponent(article.id)}"
          data-open-article="${escapeHTML(article.id)}"
        >
          Ler matéria ↗
        </a>
      </div>
    </article>
  `;
}

function renderHome() {
  const published = sortNewest(
    allArticles.filter(article => article.status === "published")
  );

  const searchTerm = normalized($("#searchInput")?.value || "");

  visibleArticles = published.filter(article => {
    const matchesCategory =
      activeCategory === "all" ||
      article.game === activeCategory ||
      article.category === activeCategory;

    const searchableText = normalized(
      `${article.title} ${article.summary} ${article.content} ${article.videoUrl || ""} ${article.game} ${article.category}`
    );

    return matchesCategory &&
      (!searchTerm || searchableText.includes(searchTerm));
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
              ${escapeHTML(gameLabel(item.game))}
              · ${escapeHTML(formatDate(articleDate(item)))}
            </div>

            <h2>${escapeHTML(item.title)}</h2>
            <p>${escapeHTML(item.summary)}</p>

            <a
              class="read-link"
              href="#artigo/${encodeURIComponent(item.id)}"
              data-open-article="${escapeHTML(item.id)}"
            >
              Ler notícia completa ↗
            </a>
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
    title.textContent = searchTerm
      ? "Resultados da busca"
      : activeCategory === "all"
        ? "Últimas notícias"
        : categoryLabel(activeCategory);
  }

  if (grid) {
    if (!visibleArticles.length) {
      grid.innerHTML = `
        <div class="empty-state">
          ${
            searchTerm
              ? "Nenhuma notícia corresponde à busca."
              : "Ainda não há notícias publicadas nesta categoria."
          }
        </div>
      `;
    } else {
      grid.innerHTML = visibleArticles
        .slice(0, shownCount)
        .map(articleCard)
        .join("");
    }
  }

  if (loadMore) {
    loadMore.classList.toggle(
      "hidden",
      visibleArticles.length <= shownCount
    );
  }
}

/* =========================================================
   VÍDEOS — LINKS E INCORPORAÇÃO
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
  const pathParts = url.pathname.split("/").filter(Boolean);
  let src = "";
  const parent = location.hostname || "localhost";

  // YouTube
  if ([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com"
  ].includes(host)) {
    let id = url.searchParams.get("v");

    if (
      !id &&
      ["shorts", "live", "embed", "v"].includes(pathParts[0])
    ) {
      id = pathParts[1];
    }

    if (!id || !/^[\w-]{11}$/.test(id)) {
      return "";
    }

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  } else if (host === "youtu.be") {
    const id = pathParts[0];

    if (!id || !/^[\w-]{11}$/.test(id)) {
      return "";
    }

    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  }

  // Vimeo
  else if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id =
      host === "player.vimeo.com" && pathParts[0] === "video"
        ? pathParts[1]
        : pathParts[pathParts.length - 1];

    if (!id || !/^\d+$/.test(id)) {
      return "";
    }

    src = `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
  }

  // Dailymotion
  else if (["dailymotion.com", "dai.ly"].includes(host)) {
    let id = "";

    if (host === "dai.ly") {
      id = pathParts[0] || "";
    } else if (pathParts[0] === "video") {
      id = (pathParts[1] || "").split("_")[0];
    } else if (pathParts[0] === "embed" && pathParts[1] === "video") {
      id = pathParts[2] || "";
    }

    if (!id || !/^[A-Za-z0-9]+$/.test(id)) {
      return "";
    }

    src = `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
  }

  // Twitch
  else if (["twitch.tv", "clips.twitch.tv"].includes(host)) {
    if (host === "clips.twitch.tv") {
      const slug = pathParts[0];

      if (!slug) return "";

      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(parent)}`;
    } else if (
      pathParts[0] === "videos" &&
      /^\d+$/.test(pathParts[1] || "")
    ) {
      src = `https://player.twitch.tv/?video=v${encodeURIComponent(pathParts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (pathParts[0] === "clip" && pathParts[1]) {
      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(pathParts[1])}&parent=${encodeURIComponent(parent)}`;
    } else if (
      pathParts[0] &&
      !["directory", "downloads", "jobs", "p", "search", "settings", "turbo"]
        .includes(pathParts[0].toLowerCase())
    ) {
      src = `https://player.twitch.tv/?channel=${encodeURIComponent(pathParts[0])}&parent=${encodeURIComponent(parent)}`;
    } else {
      return "";
    }
  }

  // Kick
  else if (["kick.com", "player.kick.com"].includes(host)) {
    const channel = pathParts[0];

    if (
      !channel ||
      ["categories", "videos", "clips", "search"].includes(channel.toLowerCase())
    ) {
      return "";
    }

    src = `https://player.kick.com/${encodeURIComponent(channel)}`;
  }

  // Arquivos de vídeo diretos
  else if (/\.(mp4|webm|ogv|ogg)$/i.test(url.pathname)) {
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

/* =========================================================
   CORPO DA MATÉRIA E MÍDIAS INSERIDAS
========================================================= */

function renderArticleBody(content, media = []) {
  const byId = new Map(
    (Array.isArray(media) ? media : []).map(item => [item.id, item])
  );

  const textHTML = value =>
    String(value || "")
      .split(/\n\s*\n/)
      .map(paragraph => {
        const clean = paragraph.trim();

        return clean
          ? `<p>${escapeHTML(clean).replace(/\n/g, "<br>")}</p>`
          : "";
      })
      .join("");

  const markerPattern = /\[\[MEDIA:([a-zA-Z0-9_-]+)\]\]/g;

  let html = "";
  let cursor = 0;
  let match;

  const source = String(content || "");

  while ((match = markerPattern.exec(source)) !== null) {
    html += textHTML(source.slice(cursor, match.index));

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

  html += textHTML(source.slice(cursor));

  return html;
}

/* =========================================================
   ABRIR E FECHAR MATÉRIAS
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

  const inlineBody =
    Array.isArray(article.inlineMedia) && article.inlineMedia.length
      ? renderArticleBody(article.content || "", article.inlineMedia)
      : escapeHTML(article.content || "")
          .split(/\n\s*\n/)
          .map(paragraph => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
          .join("");

  view.innerHTML = `
    <a href="#inicio" class="back-link" data-home>
      ← Voltar às notícias
    </a>

    <header class="article-header">
      <span class="tag">
        ${escapeHTML(categoryLabel(article.category))}
        · ${escapeHTML(gameLabel(article.game))}
      </span>

      <h1>${escapeHTML(article.title)}</h1>
      <p class="article-summary">${escapeHTML(article.summary)}</p>

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

  history.replaceState(null, "", `#artigo/${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() {
  $("#articleView")?.classList.add("hidden");
  $("#homeView")?.classList.remove("hidden");

  if (!isAdmin) {
    $("#adminPanel")?.classList.add("hidden");
  }

  history.replaceState(null, "", "#inicio");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   LOGIN E AUTORIZAÇÃO
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

function requireAdmin() {
  if (
    !currentUser ||
    currentUser.uid !== ADMIN_UID ||
    !isAdmin
  ) {
    showToast("Entre com a conta autorizada para administrar as matérias.");
    openLogin();
    return false;
  }

  return true;
}

/* =========================================================
   ABAS DO PAINEL ADMINISTRATIVO
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
    if (panel) {
      panel.classList.toggle("hidden", name !== tab);
    }
  });

  if (tab === "review") renderReviewQueue();
  if (tab === "manage") renderPublishedManage();
}

/* =========================================================
   FORMULÁRIO DE MATÉRIAS
========================================================= */

function resetArticleForm() {
  $("#articleForm")?.reset();

  if ($("#editingId")) {
    $("#editingId").value = "";
  }

  if ($("#saveArticleBtn")) {
    $("#saveArticleBtn").textContent = "Publicar matéria";
  }

  $("#cancelEditBtn")?.classList.add("hidden");

  currentArticleId = null;
  inlineMediaDraft = [];
  uploadInProgress = false;

  renderInlineMediaManager();
  updateInlinePreview();
}

function fillEditor(id) {
  const article = allArticles.find(item => item.id === id);

  if (!article) return;

  currentArticleId = id;

  if ($("#editingId")) {
    $("#editingId").value = id;
  }

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
   INSERÇÃO DE IMAGEM E VÍDEO NO TEXTO
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
          >
            Remover
          </button>
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

  const id =
    `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

  showToast(`Enviando ${isImage ? "imagem" : "vídeo"}...`, 6000);

  try {
    const fileRef = storageRef(storage, path);

    await uploadBytes(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: currentUser.uid
      }
    });

    const url = await getDownloadURL(fileRef);

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

    showToast(
      `${isImage ? "Imagem" : "Vídeo"} enviado e inserido na matéria.`
    );
  } catch (error) {
    console.error("Erro ao enviar mídia para o Firebase Storage:", error);

    showToast(
      friendlyFirestoreError(
        error,
        "enviar a mídia. Confira se o Firebase Storage está habilitado e suas regras permitem upload administrativo."
      ),
      7000
    );
  } finally {
    uploadInProgress = false;

    buttons.forEach(button => {
      button.disabled = false;
    });

    if ($("#uploadImageInput")) {
      $("#uploadImageInput").value = "";
    }

    if ($("#uploadVideoInput")) {
      $("#uploadVideoInput").value = "";
    }
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

  const id =
    `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
   SALVAR E PUBLICAR MATÉRIAS
========================================================= */

function articleFromForm(status) {
  return {
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
    updatedAt: serverTimestamp(),

    ...(status === "published"
      ? { publishedAt: serverTimestamp() }
      : {})
  };
}

async function saveArticle(event, status) {
  event?.preventDefault();

  if (!requireAdmin()) return;

  const form = $("#articleForm");

  if (!form.reportValidity()) return;

  const videoUrl = $("#articleVideoUrl")?.value.trim() || "";

  if (videoUrl && !buildVideoEmbed(videoUrl)) {
    showToast(
      "Link de vídeo não reconhecido. Use YouTube, Vimeo, Dailymotion, Twitch, Kick ou um arquivo MP4/WebM/OGG direto.",
      6000
    );
    return;
  }

  if (uploadInProgress) {
    showToast("Aguarde o término do upload antes de salvar a matéria.");
    return;
  }

  const payload = articleFromForm(status);
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

    resetArticleForm();

    setAdminTab(status === "draft" ? "review" : "manage");
  } catch (error) {
    console.error("Erro ao salvar matéria no Firestore:", error);

    showToast(
      friendlyFirestoreError(error, "salvar a matéria"),
      6000
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = currentArticleId
        ? "Salvar alterações"
        : "Publicar matéria";
    }
  }
}

function friendlyFirestoreError(error, action) {
  if (error?.code === "permission-denied") {
    return `O Firebase recusou a permissão para ${action}. Confira as regras do Firestore ou do Storage.`;
  }

  if (error?.code === "unavailable") {
    return "O Firebase está indisponível no momento. Confira a conexão e tente novamente.";
  }

  if (error?.code === "failed-precondition") {
    return "O Firestore informou uma pré-condição ausente. Veja o erro no console do navegador.";
  }

  return `Não foi possível ${action}. Código: ${error?.code || error?.message || "erro desconhecido"}.`;
}

/* =========================================================
   LISTAS DO PAINEL ADMINISTRATIVO
========================================================= */

function adminItem(article, mode) {
  const image = article.image
    ? `<img src="${escapeHTML(article.image)}" alt="" loading="lazy">`
    : `<div aria-hidden="true"></div>`;

  const status =
    article.status === "published"
      ? "Publicada"
      : article.status === "review"
        ? "Em revisão"
        : "Rascunho";

  const actionButtons = mode === "review"
    ? `
      <button class="primary-btn" data-article-action="publish" data-id="${escapeHTML(article.id)}">
        Aprovar e publicar
      </button>

      <button class="secondary-btn" data-article-action="edit" data-id="${escapeHTML(article.id)}">
        Editar
      </button>

      <button class="secondary-btn" data-article-action="delete" data-id="${escapeHTML(article.id)}">
        Excluir
      </button>
    `
    : `
      <button class="secondary-btn" data-article-action="edit" data-id="${escapeHTML(article.id)}">
        Editar
      </button>

      ${
        article.status !== "published"
          ? `<button class="primary-btn" data-article-action="publish" data-id="${escapeHTML(article.id)}">Publicar</button>`
          : `<button class="secondary-btn" data-article-action="draft" data-id="${escapeHTML(article.id)}">Tornar rascunho</button>`
      }

      <button class="secondary-btn" data-article-action="delete" data-id="${escapeHTML(article.id)}">
        Excluir
      </button>
    `;

  return `
    <article class="admin-item">
      ${image}

      <div>
        <h3>${escapeHTML(article.title || "Sem título")}</h3>

        <p>
          ${escapeHTML(status)}
          · ${escapeHTML(gameLabel(article.game))}
          · ${escapeHTML(categoryLabel(article.category))}
        </p>

        <p>${escapeHTML(article.summary || "Sem resumo")}</p>
      </div>

      <div class="admin-item-actions">
        ${actionButtons}
      </div>
    </article>
  `;
}

function renderReviewQueue() {
  const host = $("#reviewQueue");

  if (!host) return;

  const items = sortNewest(
    allArticles.filter(
      article =>
        article.status === "draft" ||
        article.status === "review"
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
      if (
        !confirm(
          `Excluir a matéria “${article.title}”? Esta ação não pode ser desfeita.`
        )
      ) {
        return;
      }

      await deleteDoc(doc(db, "articles", id));

      showToast("Matéria excluída.");
    } else if (action === "publish") {
      await updateDoc(doc(db, "articles", id), {
        status: "published",
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

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

/* =========================================================
   FIRESTORE — CARREGAMENTO PÚBLICO E ADMINISTRATIVO
========================================================= */

// Visitantes consultam apenas artigos publicados.
// A condição status == "published" é necessária para corresponder
// às permissões de leitura pública configuradas no Firestore.
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
      const publicItems = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      if (isAdmin) {
        allArticles = [
          ...allArticles.filter(article => article.status !== "published"),
          ...publicItems
        ];

        allArticles = [
          ...new Map(
            allArticles.map(article => [article.id, article])
          ).values()
        ];
      } else {
        allArticles = publicItems;
      }

      renderHome();

      if (isAdmin) {
        renderReviewQueue();
        renderPublishedManage();
      }
    },
    error => {
      console.error(
        "Erro ao carregar notícias públicas do Firestore:",
        error
      );

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

      showToast(
        friendlyFirestoreError(error, "carregar as notícias"),
        6000
      );
    }
  );
}

// Somente o administrador autorizado consulta a coleção inteira,
// incluindo rascunhos e matérias em revisão.
function startAdminListener() {
  if (unsubscribeAdmin) {
    unsubscribeAdmin();
  }

  unsubscribeAdmin = onSnapshot(
    articlesRef,
    snapshot => {
      const adminItems = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      allArticles = adminItems;

      renderHome();
      renderReviewQueue();
      renderPublishedManage();
    },
    error => {
      console.error(
        "Erro ao carregar painel editorial:",
        error
      );

      showToast(
        friendlyFirestoreError(error, "carregar o painel editorial"),
        6000
      );
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
    adminButton.textContent = "Painel ADM";
  }

  $("#logoutBtn")?.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    $("#adminPanel")?.classList.remove("hidden");

    closeLogin();

    if (unsubscribePublic) {
      unsubscribePublic();
      unsubscribePublic = null;
    }

    if (unsubscribeAdmin) {
      unsubscribeAdmin();
      unsubscribeAdmin = null;
    }

    startAdminListener();
  } else {
    $("#adminPanel")?.classList.add("hidden");

    if (unsubscribeAdmin) {
      unsubscribeAdmin();
      unsubscribeAdmin = null;
    }

    startPublicListener();

    // Contas diferentes da conta administrativa não permanecem conectadas.
    if (user) {
      signOut(auth).catch(error => {
        console.error(
          "Erro ao encerrar sessão não autorizada:",
          error
        );
      });
    }
  }
}

/* =========================================================
   EVENTOS DA INTERFACE
========================================================= */

function setupEvents() {
  $("#adminBtn")?.addEventListener("click", () => {
    if (isAdmin && currentUser?.uid === ADMIN_UID) {
      $("#homeView")?.classList.toggle("hidden");
      $("#adminPanel")?.classList.toggle("hidden");
      $("#articleView")?.classList.add("hidden");
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

        showToast(
          "Login realizado. Carregando painel editorial..."
        );
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
        "auth/api-key-not-valid": "A chave de API foi recusada. Confira a configuração do projeto Firebase."
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

  $("#uploadImageBtn")?.addEventListener("click", () => {
    $("#uploadImageInput")?.click();
  });

  $("#uploadVideoBtn")?.addEventListener("click", () => {
    $("#uploadVideoInput")?.click();
  });

  $("#uploadImageInput")?.addEventListener("change", event => {
    uploadInlineFile(event.target.files?.[0], "image");
  });

  $("#uploadVideoInput")?.addEventListener("change", event => {
    uploadInlineFile(event.target.files?.[0], "video");
  });

  $("#insertVideoLinkBtn")?.addEventListener(
    "click",
    insertVideoLinkAtCursor
  );

  $("#articleContent")?.addEventListener(
    "input",
    updateInlinePreview
  );

  $("#inlineMediaList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-inline-media]");

    if (button) {
      removeInlineMedia(button.dataset.removeInlineMedia);
    }
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-tab]");

    if (!button) return;

    event.preventDefault();

    setAdminTab(button.dataset.adminTab);
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

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

function initialize() {
  setupEvents();

  // A leitura pública é iniciada independentemente do login.
  startPublicListener();

  onAuthStateChanged(
    auth,
    user => setAdminState(user),
    error => {
      console.error(
        "Erro no estado de autenticação:",
        error
      );

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
