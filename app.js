
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

/* =========================================
   CONFIGURAÇÃO FIREBASE
   Mantenha aqui os seus dados reais.
========================================= */

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Coloque o UID real da sua conta administradora.
const ADMIN_UID = "SEU_UID_ADMIN";

/* =========================================
   INICIALIZAÇÃO
========================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isAdmin = false;

/* =========================================
   ELEMENTOS
========================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const adminBtn = $("#adminBtn");
const loginOverlay = $("#loginOverlay");
const loginForm = $("#loginForm");
const loginTitle = $("#loginTitle");
const adminPanel = $("#adminPanel");
const logoutBtn = $("#logoutBtn");

/* =========================================
   MENSAGENS
========================================= */

function showMessage(message, type = "error") {
  let messageBox = $("#appMessage");

  if (!messageBox) {
    messageBox = document.createElement("div");
    messageBox.id = "appMessage";
    messageBox.setAttribute("role", "status");

    Object.assign(messageBox.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "99999",
      padding: "12px 18px",
      borderRadius: "8px",
      maxWidth: "90%",
      color: "#fff",
      background: "#252525",
      boxShadow: "0 4px 18px rgba(0,0,0,.25)",
      textAlign: "center"
    });

    document.body.appendChild(messageBox);
  }

  messageBox.textContent = message;
  messageBox.style.background =
    type === "success" ? "#176b43" : "#252525";

  messageBox.classList.remove("hidden");

  clearTimeout(messageBox.hideTimer);
  messageBox.hideTimer = setTimeout(() => {
    messageBox.classList.add("hidden");
  }, 4000);
}

/* =========================================
   ABRIR E FECHAR LOGIN
========================================= */

function openLogin() {
  if (loginOverlay) {
    loginOverlay.classList.remove("hidden");
    loginOverlay.setAttribute("aria-hidden", "false");

    if (loginTitle) {
      loginTitle.textContent = "Login";
    }

    const emailInput = loginForm?.querySelector(
      'input[type="email"], input[name="email"]'
    );

    emailInput?.focus();
  } else {
    showMessage(
      "Não encontrei #loginOverlay. Confira o ID no HTML."
    );
  }
}

function closeLogin() {
  if (!loginOverlay) return;

  loginOverlay.classList.add("hidden");
  loginOverlay.setAttribute("aria-hidden", "true");
}

adminBtn?.addEventListener("click", () => {
  if (isAdmin) {
    if (adminPanel) {
      adminPanel.classList.toggle("hidden");
    } else {
      showMessage("Não encontrei #adminPanel no HTML.");
    }
    return;
  }

  openLogin();
});

// Compatibilidade com diferentes nomes de botão de fechar.
$$(
  "#closeLogin, #closeLoginBtn, #loginCloseBtn, [data-close-login]"
).forEach((button) => {
  button.addEventListener("click", closeLogin);
});

// Fecha ao clicar no fundo do modal.
loginOverlay?.addEventListener("click", (event) => {
  if (event.target === loginOverlay) {
    closeLogin();
  }
});

// Fecha com a tecla Escape.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLogin();
  }
});

/* =========================================
   AUTENTICAÇÃO
========================================= */

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const emailInput = loginForm.querySelector(
    'input[type="email"], input[name="email"]'
  );

  const passwordInput = loginForm.querySelector(
    'input[type="password"], input[name="password"]'
  );

  const submitButton = loginForm.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showMessage("Digite seu e-mail e sua senha.");
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);

    closeLogin();
    loginForm.reset();

    showMessage("Login realizado com sucesso!", "success");
  } catch (error) {
    console.error("Erro no login:", error);

    const messages = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/invalid-email": "O e-mail informado é inválido.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/too-many-requests":
        "Muitas tentativas. Aguarde e tente novamente."
    };

    showMessage(
      messages[error.code] ||
      "Não foi possível entrar. Confira sua conexão e os dados."
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

/* =========================================
   ESTADO DO ADMINISTRADOR
========================================= */

function setAdminState(user) {
  currentUser = user;
  isAdmin = Boolean(user && user.uid === ADMIN_UID);

  if (adminBtn) {
    // O botão permanece com o texto Login.
    adminBtn.textContent = "Login";
    adminBtn.setAttribute(
      "aria-label",
      isAdmin ? "Abrir painel administrativo" : "Fazer login"
    );
  }

  logoutBtn?.classList.toggle("hidden", !isAdmin);

  if (adminPanel && !isAdmin) {
    adminPanel.classList.add("hidden");
  }

  // Se houver uma área exclusiva do administrador no HTML.
  $$("[data-admin-only]").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin);
  });

  // Exibe o painel apenas para o administrador autenticado.
  if (isAdmin && adminPanel) {
    adminPanel.classList.remove("hidden");
  }
}

onAuthStateChanged(auth, (user) => {
  setAdminState(user);
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    closeLogin();

    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }

    showMessage("Você saiu da sua conta.", "success");
  } catch (error) {
    console.error("Erro ao sair:", error);
    showMessage("Não foi possível sair da conta.");
  }
});

/* =========================================
   NAVEGAÇÃO
========================================= */

function normalizePath(value) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function activateNavigation(clickedLink) {
  // Retira a seleção de todas as opções.
  $$(".nav-link, .nav-link.active, [data-nav-link]").forEach(
    (link) => {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    }
  );

  // Seleciona somente a opção clicada.
  clickedLink.classList.add("active");
  clickedLink.setAttribute("aria-current", "page");
}

function navigateToSection(link) {
  const href = link.getAttribute("href") || "";
  const targetId = link.dataset.target ||
    (href.startsWith("#") ? href.slice(1) : "");

  if (!targetId) return;

  const target = document.getElementById(targetId);

  if (!target) return;

  // Esconde as seções de conteúdo que usam data-page.
  const pages = $$("[data-page]");

  if (pages.length) {
    pages.forEach((page) => {
      page.classList.add("hidden");
    });

    target.classList.remove("hidden");
  } else {
    // Se o site não usa data-page, apenas rola até a seção.
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

const navigationLinks = $$(
  ".nav-link, [data-nav-link]"
);

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    const targetId = link.dataset.target ||
      (href.startsWith("#") ? href.slice(1) : "");

    // Links com destino interno são tratados pelo site.
    if (targetId) {
      const target = document.getElementById(targetId);

      if (target) {
        event.preventDefault();
        navigateToSection(link);
      }
    }

    activateNavigation(link);
  });
});

// Se o HTML usa botões ou abas com data-target.
$$("[data-target]").forEach((element) => {
  if (
    element.matches(".nav-link, [data-nav-link]") ||
    element.tagName === "A"
  ) {
    return;
  }

  element.addEventListener("click", () => {
    activateNavigation(element);
    navigateToSection(element);
  });
});

/* =========================================
   ESTADO INICIAL DA NAVEGAÇÃO
========================================= */

function initializeNavigation() {
  const currentHash = window.location.hash;

  let initialLink = null;

  if (currentHash) {
    initialLink = Array.from(navigationLinks).find((link) => {
      const href = link.getAttribute("href") || "";
      const target = link.dataset.target ||
        (href.startsWith("#") ? href.slice(1) : "");

      return target === currentHash.slice(1);
    });
  }

  if (!initialLink) {
    initialLink = Array.from(navigationLinks).find((link) => {
      const label = normalizePath(link.textContent);
      const href = normalizePath(link.getAttribute("href"));

      return (
        label.includes("inicio") ||
        href === "#inicio" ||
        href.endsWith("/index.html")
      );
    });
  }

  if (initialLink) {
    activateNavigation(initialLink);
  } else if (navigationLinks.length) {
    activateNavigation(navigationLinks[0]);
  }
}

initializeNavigation();

/* =========================================
   FIRESTORE
   Referência disponível para as funções
   de notícias que você já utiliza no site.
========================================= */

const articlesCollection = collection(db, "articles");

export {
  app,
  auth,
  db,
  articlesCollection,
  currentUser,
  isAdmin,
  setAdminState,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
};
