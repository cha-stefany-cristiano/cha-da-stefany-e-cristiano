import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, onSnapshot, query, where, addDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const configReady = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLOQUE_") && firebaseConfig.projectId && firebaseConfig.projectId !== "SEU_PROJETO";
const giftList = document.querySelector("#gift-list");
const rsvpForm = document.querySelector("#rsvp-form");
const rsvpStatus = document.querySelector("#rsvp-status");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

menuToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
nav?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));

function showMessage(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function money(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}
function renderGift(gift) {
  const image = gift.imageUrl
    ? `<img class="gift-image" src="${escapeHTML(gift.imageUrl)}" alt="${escapeHTML(gift.name)}" loading="lazy">`
    : `<div class="gift-placeholder" aria-hidden="true">${gift.emoji || "🧸"}</div>`;
  const price = gift.price !== null && gift.price !== undefined && gift.price !== "" ? `<span class="gift-price">${money(gift.price)}</span>` : "";
  const action = gift.reserved
    ? `<button class="button button-outline" type="button" disabled>Já reservado</button><span class="gift-state">Alguém escolheu este presente ♡</span>`
    : `<button class="button button-outline reserve-button" type="button" data-gift-id="${escapeHTML(gift.id)}" data-gift-name="${escapeHTML(gift.name)}">Reservar presente ♡</button>`;
  return `<article class="gift-card">${image}<div class="gift-info"><span class="gift-category">${escapeHTML(gift.category || "Sugestão")}</span><h3>${escapeHTML(gift.name)}</h3><p>${escapeHTML(gift.description || "Uma sugestão escolhida com carinho.")}</p>${price}${action}</div></article>`;
}
function watchPublicGifts(db) {
  const q = query(collection(db, "gifts"), where("active", "==", true));

  let currentGifts = [];
  const lockUnsubscribers = new Map();

  function renderCurrentGifts() {
    giftList.innerHTML = currentGifts.length
      ? currentGifts.map(renderGift).join("")
      : "<p>Nenhum presente disponível no momento.</p>";
  }

  onSnapshot(q, snap => {
    currentGifts = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).sort((a, b) =>
      (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
    );

    const activeIds = new Set(currentGifts.map(gift => gift.id));

    // Remove os acompanhamentos dos presentes que saíram da lista
    for (const [id, unsubscribe] of lockUnsubscribers) {
      if (!activeIds.has(id)) {
        unsubscribe();
        lockUnsubscribers.delete(id);
      }
    }

    // Acompanha a reserva de cada presente individualmente
    for (const gift of currentGifts) {
      if (!lockUnsubscribers.has(gift.id)) {
        const unsubscribe = onSnapshot(
          doc(db, "reservationLocks", gift.id),
          lockSnap => {
            const currentGift = currentGifts.find(g => g.id === gift.id);

            if (currentGift) {
              currentGift.reserved = lockSnap.exists();
              renderCurrentGifts();
            }
          },
          error => {
            console.error("Erro ao verificar reserva:", error);
          }
        );

        lockUnsubscribers.set(gift.id, unsubscribe);
      }
    }

    renderCurrentGifts();

    giftList.innerHTML = currentGifts.length
      ? currentGifts.map(renderGift).join("")
      : `<div class="empty-state">A lista de presentes será publicada em breve. ♡</div>`;
  }, error => {
    console.error(error);
    giftList.innerHTML = `<div class="empty-state">Não foi possível carregar a lista agora. Tente novamente mais tarde.</div>`;
  });
  giftList.addEventListener("click", async event => {
    const button = event.target.closest(".reserve-button");
    if (!button || button.disabled) return;
    const name = prompt(`Você escolheu "${button.dataset.giftName}". Qual é o seu nome?`);
    if (!name || !name.trim()) return;
    button.disabled = true;
    try {
      await runTransaction(db, async tx => {
        const giftRef = doc(db, "gifts", button.dataset.giftId);
        const lockRef = doc(db, "reservationLocks", button.dataset.giftId);
        const giftSnap = await tx.get(giftRef);
        const lockSnap = await tx.get(lockRef);
        if (!giftSnap.exists() || giftSnap.data().active !== true) throw new Error("Este presente não está mais disponível.");
        if (lockSnap.exists()) throw new Error("Outra pessoa acabou de reservar este presente.");
        const reservationRef = doc(collection(db, "reservations"));
        tx.set(lockRef, { giftId:button.dataset.giftId, reservationId:reservationRef.id, createdAt:serverTimestamp() });
        tx.set(reservationRef, { giftId:button.dataset.giftId, giftName:button.dataset.giftName, guestName:name.trim().slice(0,100), createdAt:serverTimestamp() });
      });
      alert("Reserva realizada com sucesso! Obrigado pelo carinho. ♡");
    } catch (error) {
      alert(error.message || "Não foi possível reservar. Atualize a página e tente novamente.");
    } finally {
      button.disabled = false;
    }
  });
}

async function loadEvent(db) {
  try {
    const snap = await getDoc(doc(db, "settings", "event"));
    if (!snap.exists()) return;
    const data = snap.data();
    const setText = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
    setText("baby-name", data.babyName);
    setText("event-date", data.date ? new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR", {day:"numeric",month:"long",year:"numeric"}) : "");
    setText("event-time", data.time);
    setText("event-location", data.location);
    setText("event-address", data.address);
    const map = document.getElementById("map-link");
    if (map && data.mapUrl && /^https:\/\/.+/i.test(data.mapUrl)) { map.href = data.mapUrl; map.hidden = false; }
  } catch (error) { console.warn("Os dados do evento ainda não foram configurados.", error); }
}
if (!configReady) {
  giftList.innerHTML = `<div class="empty-state">Configure o Firebase em <strong>js/firebase-config.js</strong> para carregar os presentes reais. ♡</div>`;
  showMessage(rsvpStatus, "O convite está em modo de configuração. A confirmação será ativada após conectar o Firebase.");
} else {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  loadEvent(db);
  watchPublicGifts(db);
  rsvpForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(rsvpForm);
    const name = String(data.get("name") || "").trim();
    const count = Number(data.get("count"));
    const message = String(data.get("message") || "").trim();
    if (!name || !Number.isInteger(count) || count < 1 || count > 6) {
      showMessage(rsvpStatus, "Confira seu nome e a quantidade de pessoas.", true); return;
    }
    const submit = rsvpForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    showMessage(rsvpStatus, "Enviando sua confirmação…");
    try {
      await addDoc(collection(db, "rsvps"), { name:name.slice(0,100), count, message:message.slice(0,500), createdAt:serverTimestamp(), status:"confirmed" });
      rsvpForm.reset();
      showMessage(rsvpStatus, "Presença confirmada! Obrigado por compartilhar esse momento conosco. ♡");
    } catch (error) {
      console.error(error);
      showMessage(rsvpStatus, "Não foi possível confirmar agora. Tente novamente mais tarde.", true);
    } finally { submit.disabled = false; }
  });
}
