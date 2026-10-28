
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
    messageBox.setAttribute("aria-live", "polite");

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
  if (!loginOverlay) {
    showMessage(
      "Não encontrei #loginOverlay. Confira o ID no HTML."
    );
    return;
  }

  loginOverlay.classList.remove("hidden");
  loginOverlay.setAttribute("aria-hidden", "false");

  if (loginTitle) {
    loginTitle.textContent = "Login";
  }

  const emailInput = loginForm?.querySelector(
    'input[type="email"], input[name="email"]'
  );

  emailInput?.focus();
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

$$(
  "#closeLogin, #closeLoginBtn, #loginCloseBtn, [data-close-login]"
).forEach((button) => {
  button.addEventListener("click", closeLogin);
});

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
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (credential.user.uid !== ADMIN_UID) {
      await signOut(auth);

      showMessage(
        "Esta conta não tem permissão de administrador."
      );

      return;
    }

    closeLogin();
    loginForm.reset();

    showMessage("Login realizado com sucesso!", "success");
  } catch (error) {
    console.error("Erro no login:", error);

    const messages = {
      "auth/invalid-credential":
        "E-mail ou senha incorretos.",
      "auth/invalid-email":
        "O e-mail informado é inválido.",
      "auth/user-not-found":
        "Usuário não encontrado.",
      "auth/wrong-password":
        "Senha incorreta.",
      "auth/too-many-requests":
        "Muitas tentativas. Aguarde e tente novamente.",
      "auth/operation-not-allowed":
        "O login por e-mail e senha não está habilitado no Firebase.",
      "auth/network-request-failed":
        "Falha de conexão. Verifique sua internet."
    };

    showMessage(
      messages[error.code] ||
      "Não foi possível entrar. Confira a configuração do Firebase."
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
    adminBtn.textContent = "Login";

    adminBtn.setAttribute(
      "aria-label",
      isAdmin
        ? "Abrir painel administrativo"
        : "Fazer login"
    );
  }

  logoutBtn?.classList.toggle("hidden", !isAdmin);

  if (adminPanel) {
    adminPanel.classList.toggle("hidden", !isAdmin);
  }

  $$("[data-admin-only]").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user && user.uid !== ADMIN_UID) {
    setAdminState(null);

    try {
      await signOut(auth);
    } catch (error) {
      console.error(
        "Erro ao encerrar sessão não autorizada:",
        error
      );
    }

    return;
  }

  setAdminState(user);
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    closeLogin();

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
  $$(".nav-link, [data-nav-link]").forEach((link) => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  });

  clickedLink.classList.add("active");
  clickedLink.setAttribute("aria-current", "page");
}

function navigateToSection(link) {
  const href = link.getAttribute("href") || "";

  const targetId =
    link.dataset.target ||
    (href.startsWith("#") ? href.slice(1) : "");

  if (!targetId) return;

  const target = document.getElementById(targetId);

  if (!target) return;

  const pages = $$("[data-page]");

  if (pages.length) {
    pages.forEach((page) => {
      page.classList.add("hidden");
    });

    target.classList.remove("hidden");
  } else {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

const navigationLinks = $$(".nav-link, [data-nav-link]");

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";

    const targetId =
      link.dataset.target ||
      (href.startsWith("#") ? href.slice(1) : "");

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

      const target =
        link.dataset.target ||
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
   FIRESTORE — NOTÍCIAS
========================================= */

const articlesCollection = collection(db, "articles");

/* =========================================
   EXPORTAÇÕES
========================================= */

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
