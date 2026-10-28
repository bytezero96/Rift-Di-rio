import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
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
  serverTimestamp,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

/* Rift Diário — configuração original preservada */
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
let currentArticleId = null;
let inlineMediaDraft = [];
let uploadInProgress = false;
let unsubscribePublic = null;
let unsubscribeAdmin = null;
let toastTimer = null;
let editorSavedRange = null;
let unsubscribeRatings = null;
let unsubscribeComments = null;
let activeFeedbackArticleId = null;
let editingCommentId = null;

const PAGE_SIZE = 9;
let shownCount = PAGE_SIZE;

/* UTILITÁRIOS */

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
  return article.publishedAt || article.updatedAt || article.createdAt || null;
}

/* Ordena as matérias sem converter repetidamente as mesmas datas. */
function sortNewest(list) {
  const timestamp = article => {
    const value = articleDate(article);
    const date = value?.toDate
      ? value.toDate()
      : value
        ? new Date(value)
        : null;

    const time = date?.getTime();
    return Number.isFinite(time) ? time : 0;
  };

  return [...list].sort((a, b) => timestamp(b) - timestamp(a));
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/* SANITIZAÇÃO DE HTML */

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

  function safeUrl(value, image = false) {
    const raw = String(value || "").trim();

    if (!raw) return "";

    if (
      image &&
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
        } else if (name === "href") {
          const url = safeUrl(attr.value);

          if (url) {
            node.setAttribute("href", url);
          } else {
            node.removeAttribute("href");
          }
        } else if (name === "src") {
          const url = safeUrl(attr.value, true);

          if (url) {
            node.setAttribute("src", url);
          } else {
            node.removeAttribute("src");
          }
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
    /<\s*(p|br|strong|b|em|i|u|s|h[2-4]|ul|ol|li|blockquote|a|img|figure|figcaption|table|thead|tbody|tr|th|td|hr|pre|code|div|span|section|small|sub|sup|mark)\b[^>]*>/i
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

/* CARTÕES E PÁGINA INICIAL */

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

/* PLAYERS DE VÍDEO */

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

  let src = "";
  const parent = location.hostname || "localhost";

  // YouTube: links comuns, Shorts, lives e links de incorporação.
  if ([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com"
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
  }

  // Vimeo.
  else if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id =
      host === "player.vimeo.com" && pathParts[0] === "video"
        ? pathParts[1]
        : pathParts[pathParts.length - 1];

    if (!id || !/^\d+$/.test(id)) return "";

    src = `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
  }

  // Dailymotion.
  else if (["dailymotion.com", "dai.ly"].includes(host)) {
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
  }

  // Twitch.
  else if (["twitch.tv", "clips.twitch.tv"].includes(host)) {
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
  }

  // Kick.
  else if (["kick.com", "player.kick.com"].includes(host)) {
    const channel = pathParts[0];

    if (!channel || ["categories", "videos", "clips", "search"].includes(channel.toLowerCase())) {
      return "";
    }

    src = `https://player.kick.com/${encodeURIComponent(channel)}`;
  }

  // Vídeo hospedado diretamente em um endereço MP4, WebM ou OGG.
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

/* AVALIAÇÕES, COMENTÁRIOS E LOGIN SOCIAL */

function installFeedbackStyles() {
  if ($("#rift-feedback-styles")) return;

  const style = document.createElement("style");
  style.id = "rift-feedback-styles";
  style.textContent = `
    .rift-feedback{margin:32px 0;padding:24px;border:1px solid var(--border,#29374d);border-radius:16px;background:var(--panel,#0e1626);color:var(--text,#f4f7fb)}
    .rift-feedback h2,.rift-feedback h3{margin:0 0 12px}
    .rift-feedback p{line-height:1.6}
    .rift-rating-row{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
    .rift-feedback button{cursor:pointer}
    .rift-feedback-btn{border:1px solid var(--border,#29374d);background:var(--panel-light,#151f31);color:inherit;border-radius:10px;padding:10px 14px;font:inherit}
    .rift-feedback-btn.active,.rift-feedback-btn:hover{border-color:#d9b45b;color:#f5d477}
    .rift-comment-form{display:grid;gap:10px;margin:18px 0}
    .rift-comment-form textarea{width:100%;min-height:100px;resize:vertical;padding:12px;border:1px solid var(--border,#29374d);border-radius:10px;background:#080d18;color:#fff;font:inherit}
    .rift-comment{padding:14px 0;border-top:1px solid var(--border,#29374d)}
    .rift-comment-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:#aab6c8;font-size:.88rem}
    .rift-comment-body{white-space:pre-wrap;overflow-wrap:anywhere}
    .rift-comment-actions{display:flex;gap:8px;margin-top:8px}
    .rift-feedback-note{color:#aab6c8;font-size:.9rem}
    .rift-social-login{display:grid;gap:10px;margin-top:16px}
    .rift-social-btn{width:100%;border:1px solid var(--border,#29374d);border-radius:10px;padding:12px;background:var(--panel-light,#151f31);color:#fff;font:inherit;font-weight:700;cursor:pointer}
    .rift-social-btn:hover{border-color:#d9b45b}
    .rift-social-label{margin:16px 0 0;color:#aab6c8;font-size:.88rem}
    @media(max-width:600px){.rift-feedback{padding:16px}.rift-rating-row{display:grid;grid-template-columns:1fr 1fr}.rift-feedback-btn{width:100%}}
  `;

  document.head.appendChild(style);
}

function ensureSocialLoginButtons() {
  const form = $("#loginForm");
  if (!form || $("#riftSocialLogin")) return;

  const social = document.createElement("div");
  social.id = "riftSocialLogin";
  social.className = "rift-social-login";
  social.innerHTML = `
    <p class="rift-social-label">Para avaliar e comentar, entre com sua conta:</p>
    <button type="button" class="rift-social-btn" id="riftGoogleLogin">Continuar com Google</button>
    <button type="button" class="rift-social-btn" id="riftAppleLogin">Continuar com Apple</button>
  `;

  form.insertAdjacentElement("afterend", social);

  $("#riftGoogleLogin")?.addEventListener("click", () => socialSignIn("google"));
  $("#riftAppleLogin")?.addEventListener("click", () => socialSignIn("apple"));
}

async function socialSignIn(providerName) {
  setLoginError("");

  try {
    let provider;

    if (providerName === "google") {
      provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
    } else {
      provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
    }

    await signInWithPopup(auth, provider);
    closeLogin();
    showToast("Login realizado. Você já pode avaliar e comentar.");
  } catch (error) {
    console.error("Erro no login social:", error);

    const messages = {
      "auth/popup-closed-by-user": "A janela de login foi fechada antes da conclusão.",
      "auth/popup-blocked": "O navegador bloqueou a janela. Permita pop-ups e tente novamente.",
      "auth/operation-not-allowed": "Ative esse provedor em Firebase > Authentication > Sign-in method.",
      "auth/unauthorized-domain": "Adicione o domínio do site à lista de domínios autorizados do Firebase.",
      "auth/account-exists-with-different-credential": "Já existe uma conta com esse e-mail usando outro método de login."
    };

    setLoginError(
      messages[error.code] ||
      `Não foi possível entrar: ${error.message || error.code}`
    );
  }
}

function stopFeedbackListeners() {
  if (unsubscribeRatings) unsubscribeRatings();
  if (unsubscribeComments) unsubscribeComments();

  unsubscribeRatings = null;
  unsubscribeComments = null;
  activeFeedbackArticleId = null;
}

function renderFeedbackSection(articleId) {
  const host = $("#riftFeedback");
  if (!host) return;

  const user = currentUser;

  host.innerHTML = `
    <section class="rift-feedback" aria-labelledby="riftFeedbackTitle">
      <h2 id="riftFeedbackTitle">Avaliações e comentários</h2>
      <p class="rift-feedback-note" id="riftRatingSummary">Carregando avaliações…</p>

      <div class="rift-rating-row" role="group" aria-label="Avalie esta matéria">
        <button class="rift-feedback-btn" type="button" data-rating="1">👍 Gostei</button>
        <button class="rift-feedback-btn" type="button" data-rating="-1">👎 Não gostei</button>
        <button class="rift-feedback-btn" type="button" data-rating="0">Remover minha avaliação</button>
      </div>

      <p class="rift-feedback-note" id="riftFeedbackAuthNote">
        ${user
          ? `Conectado como ${escapeHTML(user.displayName || user.email || "leitor")}.`
          : "Entre com Google ou Apple para avaliar e comentar."}
      </p>

      <form class="rift-comment-form" id="riftCommentForm">
        <label for="riftCommentText">Seu comentário</label>
        <textarea
          id="riftCommentText"
          maxlength="3000"
          placeholder="Escreva um comentário respeitoso…"
          required
          ${user ? "" : "disabled"}
        ></textarea>

        <div class="rift-rating-row">
          <button
            class="rift-feedback-btn"
            id="riftCommentSubmit"
            type="submit"
            ${user ? "" : "disabled"}
          >Publicar comentário</button>

          <button
            class="rift-feedback-btn"
            id="riftCommentCancel"
            type="button"
            hidden
          >Cancelar edição</button>
        </div>
      </form>

      <h3>Comentários dos leitores</h3>
      <div id="riftCommentsList">
        <p class="rift-feedback-note">Carregando comentários…</p>
      </div>
    </section>
  `;

  host.querySelectorAll("[data-rating]").forEach(button => {
    button.addEventListener("click", () => {
      submitRating(articleId, Number(button.dataset.rating));
    });
  });

  $("#riftCommentForm")?.addEventListener("submit", event => {
    submitComment(event, articleId);
  });

  $("#riftCommentCancel")?.addEventListener("click", resetCommentEditor);

  $("#riftCommentsList")?.addEventListener("click", event => {
    handleCommentAction(event, articleId);
  });

  watchArticleFeedback(articleId);
}

function watchArticleFeedback(articleId) {
  stopFeedbackListeners();
  activeFeedbackArticleId = articleId;

  const ratingsRef = collection(db, "articles", articleId, "ratings");
  const commentsRef = collection(db, "articles", articleId, "comments");

  unsubscribeRatings = onSnapshot(
    ratingsRef,
    snapshot => {
      let positive = 0;
      let negative = 0;
      let mine = 0;

      snapshot.forEach(item => {
        const value = Number(item.data().value);

        if (value === 1) positive++;
        if (value === -1) negative++;

        if (currentUser && item.id === currentUser.uid) {
          mine = value;
        }
      });

      const summary = $("#riftRatingSummary");

      if (summary) {
        summary.textContent =
          `${positive} gostaram · ${negative} não gostaram · ${positive + negative} avaliação(ões)`;
      }

      $("#riftFeedback [data-rating=\"1\"]")?.classList.toggle("active", mine === 1);
      $("#riftFeedback [data-rating=\"-1\"]")?.classList.toggle("active", mine === -1);
    },
    error => {
      console.error("Erro ao carregar avaliações:", error);

      const summary = $("#riftRatingSummary");

      if (summary) {
        summary.textContent =
          "Não foi possível carregar as avaliações. Confira as regras do Firestore.";
      }
    }
  );

  unsubscribeComments = onSnapshot(
    commentsRef,
    snapshot => {
      const items = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      items.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

      renderComments(items, articleId);
    },
    error => {
      console.error("Erro ao carregar comentários:", error);

      const list = $("#riftCommentsList");

      if (list) {
        list.innerHTML =
          '<p class="rift-feedback-note">Não foi possível carregar os comentários. Confira as regras do Firestore.</p>';
      }
    }
  );
}

function renderComments(items, articleId) {
  const host = $("#riftCommentsList");
  if (!host) return;

  if (!items.length) {
    host.innerHTML =
      '<p class="rift-feedback-note">Ainda não há comentários nesta matéria.</p>';
    return;
  }

  host.innerHTML = items.map(item => {
    const mine = Boolean(currentUser && item.uid === currentUser.uid);
    const author = item.displayName || "Leitor do Rift Diário";

    return `
      <article class="rift-comment">
        <div class="rift-comment-meta">
          <strong>${escapeHTML(author)}</strong>
          <span>${escapeHTML(formatDate(item.createdAt))}</span>
          ${item.updatedAt ? "<span>(editado)</span>" : ""}
        </div>

        <p class="rift-comment-body">${escapeHTML(item.text || "")}</p>

        ${mine ? `
          <div class="rift-comment-actions">
            <button type="button" class="rift-feedback-btn" data-comment-edit="${escapeHTML(item.id)}">Editar</button>
            <button type="button" class="rift-feedback-btn" data-comment-delete="${escapeHTML(item.id)}">Excluir</button>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

async function submitRating(articleId, value) {
  if (!currentUser) {
    openLogin();
    showToast("Entre com Google ou Apple para avaliar esta matéria.");
    return;
  }

  if (isAdmin) {
    showToast("Use uma conta de leitor para avaliar matérias.");
    return;
  }

  try {
    const ratingRef = doc(db, "articles", articleId, "ratings", currentUser.uid);

    if (value === 0) {
      await deleteDoc(ratingRef);
      showToast("Sua avaliação foi removida.");
    } else {
      await setDoc(ratingRef, {
        value,
        uid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      showToast(
        value === 1
          ? "Você avaliou positivamente esta matéria."
          : "Você avaliou negativamente esta matéria."
      );
    }
  } catch (error) {
    console.error("Erro ao salvar avaliação:", error);
    showToast(friendlyFirestoreError(error, "salvar sua avaliação"), 6000);
  }
}

function resetCommentEditor() {
  editingCommentId = null;

  const form = $("#riftCommentForm");
  form?.reset();

  const submit = $("#riftCommentSubmit");
  if (submit) submit.textContent = "Publicar comentário";

  const cancel = $("#riftCommentCancel");
  if (cancel) cancel.hidden = true;
}

async function submitComment(event, articleId) {
  event.preventDefault();

  if (!currentUser) {
    openLogin();
    return;
  }

  if (isAdmin) {
    showToast("Use uma conta de leitor para comentar.");
    return;
  }

  const field = $("#riftCommentText");
  const text = field?.value.trim() || "";

  if (text.length < 2) {
    showToast("Escreva um comentário com pelo menos 2 caracteres.");
    return;
  }

  if (text.length > 3000) {
    showToast("O comentário pode ter no máximo 3.000 caracteres.");
    return;
  }

  try {
    if (editingCommentId) {
      await updateDoc(
        doc(db, "articles", articleId, "comments", editingCommentId),
        {
          text,
          updatedAt: serverTimestamp()
        }
      );

      showToast("Comentário atualizado.");
    } else {
      await addDoc(collection(db, "articles", articleId, "comments"), {
        uid: currentUser.uid,
        displayName: currentUser.displayName || "Leitor do Rift Diário",
        text,
        createdAt: serverTimestamp(),
        updatedAt: null
      });

      showToast("Comentário publicado.");
    }

    resetCommentEditor();
  } catch (error) {
    console.error("Erro ao salvar comentário:", error);
    showToast(friendlyFirestoreError(error, "salvar o comentário"), 6000);
  }
}

async function handleCommentAction(event, articleId) {
  const edit = event.target.closest("[data-comment-edit]");
  const del = event.target.closest("[data-comment-delete]");

  if (!edit && !del) return;
  if (!currentUser) return;

  const id = (edit || del).dataset.commentEdit ||
    (edit || del).dataset.commentDelete;

  try {
    const commentRef = doc(db, "articles", articleId, "comments", id);

    if (del) {
      if (!confirm("Excluir seu comentário? Esta ação não pode ser desfeita.")) {
        return;
      }

      await deleteDoc(commentRef);

      if (editingCommentId === id) {
        resetCommentEditor();
      }

      showToast("Comentário excluído.");
      return;
    }

    const snap = await getDoc(commentRef);

    if (!snap.exists() || snap.data().uid !== currentUser.uid) {
      showToast("Você só pode editar seus próprios comentários.");
      return;
    }

    editingCommentId = id;
    $("#riftCommentText").value = snap.data().text || "";
    $("#riftCommentSubmit").textContent = "Salvar alterações";
    $("#riftCommentCancel").hidden = false;
    $("#riftCommentText").focus();
  } catch (error) {
    console.error("Erro ao alterar comentário:", error);
    showToast(friendlyFirestoreError(error, "alterar o comentário"), 6000);
  }
}

/* NAVEGAÇÃO E MATÉRIAS */

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

  installFeedbackStyles();
  stopFeedbackListeners();

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

    <div id="riftFeedback"></div>

    <p class="source-note">
      Conteúdo do Rift Diário. Imagens e materiais de terceiros pertencem aos seus respectivos titulares.
    </p>
  `;

  renderFeedbackSection(id);
  history.replaceState(null, "", `#artigo/${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() {
  stopFeedbackListeners();
  $("#articleView")?.classList.add("hidden");
  $("#homeView")?.classList.remove("hidden");

  if (!isAdmin) {
    $("#adminPanel")?.classList.add("hidden");
  }

  history.replaceState(null, "", "#inicio");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openLogin() {
  const overlay = $("#loginOverlay");

  if (!overlay) {
    showToast("O formulário de login não foi encontrado no HTML.");
    return;
  }

  setLoginError("");
  ensureSocialLoginButtons();
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

/* PAINEL ADMINISTRATIVO */

function setAdminTab(tab) {
  const validTabs = ["editor", "review", "manage"];

  if (!validTabs.includes(tab)) return;

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
  editorSavedRange = null;

  if ($("#articleContent")) {
    $("#articleContent").innerHTML = "";
  }

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

  $("#articleContent").innerHTML = sanitizeArticleHTML(article.content || "");

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

/* INSERÇÃO DE IMAGENS E VÍDEOS */

function saveEditorRange() {
  const editor = $("#articleContent");
  const selection = window.getSelection();

  if (!editor || !selection || selection.rangeCount === 0) return;

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
  if (!editor) return null;

  editor.focus({ preventScroll: true });

  const selection = window.getSelection();
  if (!selection) return null;

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
  if (!editor) return;

  const range = restoreEditorRange();
  if (!range) return;

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
  saveEditorRange();
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

  const content = $("#articleContent")?.innerHTML || "";

  host.innerHTML =
    renderArticleBody(content, inlineMediaDraft) ||
    `<p class="form-hint">A prévia da matéria com mídias aparecerá aqui.</p>`;
}

/* UPLOAD COM PROGRESSO E TRATAMENTO DE ERROS */

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
    $("#insertImageBtn"),
    $("#insertVideoBtn"),
    $("#editorImageInput"),
    $("#editorVideoInput")
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
        error => reject(error),
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

    showToast(
      `${isImage ? "Imagem" : "Vídeo"} enviado e inserido na matéria.`
    );
  } catch (error) {
    console.error("Erro no upload do Firebase Storage:", error);

    const messages = {
      "storage/unauthorized":
        "O Firebase Storage recusou o envio. Confira as regras de acesso.",
      "storage/canceled":
        "O envio foi cancelado.",
      "storage/retry-limit-exceeded":
        "O limite de tentativas foi atingido. Confira sua conexão.",
      "storage/quota-exceeded":
        "A cota de armazenamento do Firebase foi excedida.",
      "storage/unknown":
        "Erro desconhecido no Storage. Consulte o Console do navegador."
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

    if ($("#editorImageInput")) $("#editorImageInput").value = "";
    if ($("#editorVideoInput")) $("#editorVideoInput").value = "";
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
  const removed = inlineMediaDraft.find(item => item.id === id);
  inlineMediaDraft = inlineMediaDraft.filter(item => item.id !== id);

  const field = $("#articleContent");

  if (field) {
    const marker = `[[MEDIA:${id}]]`;

    field.innerHTML = field.innerHTML
      .replaceAll(marker, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  renderInlineMediaManager();
  updateInlinePreview();

  if (removed?.storagePath) {
    showToast(
      "Mídia removida do texto. O arquivo armazenado não foi apagado automaticamente.",
      5000
    );
  }
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
        console.warn(
          "Não foi possível limpar mídia antiga:",
          path,
          error
        );
      }
    }
  }
}

/* SALVAMENTO DAS MATÉRIAS */

function articleFromForm(status, existingArticle = null) {
  const payload = {
    title: $("#articleTitle").value.trim(),
    summary: $("#articleSummary").value.trim(),
    game: $("#articleGame").value,
    category: $("#articleCategory").value,
    image: $("#articleImage").value.trim(),
    videoUrl: $("#articleVideoUrl")?.value.trim() || "",
    content: $("#articleContent").innerHTML.trim(),

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

  const existingArticle = currentArticleId
    ? allArticles.find(article => article.id === currentArticleId)
    : null;

  const payload = articleFromForm(status, existingArticle);
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

      await cleanupUnusedStorageMedia(
        existingArticle?.inlineMedia || [],
        payload.inlineMedia
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
          ? "Matéria publicada com sucesso."
          : "Rascunho salvo com sucesso."
      );
    }

    resetArticleForm();
  } catch (error) {
    console.error("Erro ao salvar matéria:", error);
    showToast(friendlyFirestoreError(error, "salvar a matéria"), 6000);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Publicar matéria";
    }
  }
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

/* FILAS DO PAINEL ADMINISTRATIVO */

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
      await cleanupUnusedStorageMedia(article.inlineMedia || [], []);
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

/* FIRESTORE: NOTÍCIAS PÚBLICAS E PAINEL ADMINISTRATIVO */

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

      if (isAdmin) {
        allArticles = [
          ...allArticles.filter(article => article.status !== "published"),
          ...publicItems
        ];

        allArticles = [
          ...new Map(allArticles.map(article => [article.id, article])).values()
        ];
      } else {
        allArticles = publicItems;
      }

      renderHome();

      const directMatch = location.hash.match(/^#artigo\/(.+)$/);

      if (directMatch) {
        const directId = decodeURIComponent(directMatch[1]);

        if (publicItems.some(article => article.id === directId)) {
          openArticle(directId);
        }
      }

      if (isAdmin) {
        renderReviewQueue();
        renderPublishedManage();
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

      showToast(
        friendlyFirestoreError(error, "carregar as notícias"),
        6000
      );
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

      showToast(
        friendlyFirestoreError(error, "carregar o painel editorial"),
        6000
      );
    }
  );
}

function updatePublicAccountButton(user) {
  const actions = $(".topbar-actions");
  if (!actions) return;

  let button = $("#riftAccountBtn");

  if (!user || user.uid === ADMIN_UID) {
    button?.remove();
    return;
  }

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "riftAccountBtn";
    button.className = "admin-btn";

    button.addEventListener("click", async () => {
      try {
        await signOut(auth);
        showToast("Você saiu da sua conta.");

        if (location.hash.startsWith("#artigo/")) {
          openArticle(decodeURIComponent(location.hash.slice(8)));
        }
      } catch (error) {
        console.error("Erro ao sair da conta:", error);
        showToast("Não foi possível sair da conta.");
      }
    });

    actions.appendChild(button);
  }

  button.textContent = "Sair da conta";
  button.title = user.displayName || user.email || "Conta de leitor";
}

/* BOTÃO LOGIN / PAINEL ADM */

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  updatePublicAccountButton(user);

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

  $("#logoutBtn")?.classList.toggle("hidden", !user);

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

    startPublicListener();

    const match = location.hash.match(/^#artigo\/(.+)$/);

    if (match) {
      const articleId = decodeURIComponent(match[1]);

      if (allArticles.some(article =>
        article.id === articleId && article.status === "published"
      )) {
        openArticle(articleId);
      }
    }
  }
}

/* FERRAMENTAS DE FORMATAÇÃO DO EDITOR */

function escapeEditorText(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function rememberEditorSelection() {
  saveEditorRange();
}

function applyEditorCommand(command) {
  const editor = $("#articleContent");
  if (!editor) return;

  const range = restoreEditorRange();

  if (!range) {
    editor.focus({ preventScroll: true });
    return;
  }

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
    } else if (["p", "h2", "h3", "blockquote"].includes(command)) {
      const formats = {
        p: "P",
        h2: "H2",
        h3: "H3",
        blockquote: "BLOCKQUOTE"
      };

      document.execCommand("formatBlock", false, formats[command]);
    } else if (command === "link") {
      const raw = window.prompt(
        "Cole o endereço completo do link (https://...):",
        "https://"
      );

      if (!raw) return;

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
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    updateInlinePreview();
  } catch (error) {
    console.error("Erro ao formatar o texto:", error);
    showToast("Não foi possível aplicar essa formatação.");
  }
}

/* EVENTOS */

function setupEvents() {
  installFeedbackStyles();
  ensureSocialLoginButtons();

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

  const editorField = $("#articleContent");
  const editorToolbar = document.querySelector(".editor-toolbar");

  ["keyup", "mouseup", "input", "focus", "click", "touchend"].forEach(eventName => {
    editorField?.addEventListener(eventName, () => {
      saveEditorRange();

      if (eventName === "input") {
        updateInlinePreview();
      }
    });
  });

  editorField?.addEventListener("paste", () => {
    setTimeout(() => {
      saveEditorRange();
      updateInlinePreview();
    }, 0);
  });

  document.addEventListener("selectionchange", () => {
    if (editorField && document.activeElement === editorField) {
      saveEditorRange();
    }
  });

  editorToolbar?.addEventListener("pointerdown", event => {
    const control = event.target.closest(
      "[data-command], #editorLinkBtn, #insertImageBtn, #insertVideoBtn"
    );

    if (!control) return;

    saveEditorRange();

    if (control.matches("[data-command], #editorLinkBtn")) {
      event.preventDefault();
    }
  });

  editorToolbar?.addEventListener("click", event => {
    const button = event.target.closest("[data-command]");

    if (!button) return;

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
    const format = event.target.value;

    applyEditorCommand(format);
    event.target.value = "p";
  });

  $("#editorTextColor")?.addEventListener("change", event => {
    if (!editorField) return;

    restoreEditorRange();
    document.execCommand("foreColor", false, event.target.value);
    saveEditorRange();

    editorField.dispatchEvent(new Event("input", { bubbles: true }));
    updateInlinePreview();
  });

  $("#editorLinkBtn")?.addEventListener("click", () => {
    applyEditorCommand("link");
  });

  editorField?.addEventListener("input", updateInlinePreview);

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

  $("#reviewQueue")?.addEventListener("click", handleArticleAction);
  $("#publishedManage")?.addEventListener("click", handleArticleAction);

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
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
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
