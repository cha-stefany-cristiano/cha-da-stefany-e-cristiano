import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import giftImages from "./gift-images.js";

const ready = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLOQUE_") && firebaseConfig.projectId && firebaseConfig.projectId !== "SEU_PROJETO";
const $ = selector => document.querySelector(selector);
const loginView = $("#login-view"), appView = $("#admin-app");
let auth, db, storage, currentUser = null, gifts = [], rsvps = [], reservations = [];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateLabel = stamp => stamp?.toDate ? stamp.toDate().toLocaleDateString("pt-BR") : "—";
const money = value => value === "" || value == null ? "—" : Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function message(el, text, error=false) { el.textContent=text; el.classList.toggle("error",error); }
function tab(name) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.hidden = p.id !== `tab-${name}`);
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => tab(b.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => tab(b.dataset.goto)));
$("#logout-button").addEventListener("click", () => signOut(auth));

if (!ready) {
  message($("#login-status"), "Antes de entrar, preencha js/firebase-config.js com as credenciais do seu projeto Firebase.", true);
  $("#login-form").addEventListener("submit", e => { e.preventDefault(); message($("#login-status"), "Configure o Firebase e habilite Authentication por e-mail/senha.", true); });
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app); storage = getStorage(app);
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true;
    message($("#login-status"), "Verificando acesso…");
    try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); }
    catch (error) { message($("#login-status"), "Não foi possível entrar. Confira o e-mail, a senha e a configuração do Firebase.", true); console.error(error); }
    finally { btn.disabled = false; }
  });
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (!user) { loginView.hidden = false; appView.hidden = true; $("#logout-button").hidden = true; return; }
    try {
      if ((user.email || "").toLowerCase() !== "vinicius.bandeira.goncalves@gmail.com") {
        await signOut(auth);
        loginView.hidden = false; appView.hidden = true;
        message($("#login-status"), "Esta conta não tem permissão para acessar o painel administrativo.", true);
        return;
      }
      loginView.hidden = true; appView.hidden = false; $("#logout-button").hidden = false;
      startSubscriptions();
      loadEventForm();
    } catch (error) { console.error(error); message($("#login-status"), "Erro ao verificar permissões.", true); }
  });
}

function startSubscriptions() {
  onSnapshot(query(collection(db,"gifts"),orderBy("createdAt","desc")), snap => {
    gifts = snap.docs.map(d=>({id:d.id,...d.data()})); renderGifts(); renderMetrics();
  }, console.error);
  onSnapshot(query(collection(db,"rsvps"),orderBy("createdAt","desc")), snap => {
    rsvps = snap.docs.map(d=>({id:d.id,...d.data()})); renderGuests(); renderRecent(); renderMetrics();
  }, console.error);
  onSnapshot(query(collection(db,"reservations"),orderBy("createdAt","desc")), snap => {
    reservations = snap.docs.map(d=>({id:d.id,...d.data()})); renderReservations(); renderMetrics();
  }, console.error);
}
function renderMetrics() {
  $("#metric-rsvps").textContent = rsvps.length;
  $("#metric-people").textContent = rsvps.reduce((sum,r)=>sum+(Number(r.count)||0),0);
  $("#metric-gifts").textContent = gifts.filter(g=>g.active !== false).length;
  $("#metric-reserved").textContent = reservations.length;
}
function renderRecent() {
  $("#recent-guests").innerHTML = rsvps.slice(0,5).map(r=>`<tr><td>${esc(r.name)}</td><td>${Number(r.count)||1}</td><td>${esc(r.message||"—")}</td><td>${dateLabel(r.createdAt)}</td></tr>`).join("") || `<tr><td colspan="4">Ainda não há confirmações.</td></tr>`;
}
function renderGuests() {
  const term = ($("#guest-search").value||"").toLocaleLowerCase("pt-BR");
  const rows = rsvps.filter(r=>String(r.name||"").toLocaleLowerCase("pt-BR").includes(term));
  $("#all-guests").innerHTML = rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${Number(r.count)||1}</td><td>${esc(r.message||"—")}</td><td>${dateLabel(r.createdAt)}</td><td><button class="table-action danger" data-delete-rsvp="${r.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="5">Nenhum participante encontrado.</td></tr>`;
}
$("#guest-search").addEventListener("input",renderGuests);
$("#all-guests").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-delete-rsvp]"); if(!btn)return;
  if(!confirm("Excluir esta confirmação de presença?"))return;
  try{await deleteDoc(doc(db,"rsvps",btn.dataset.deleteRsvp));}catch(err){alert("Não foi possível excluir a confirmação.");console.error(err);}
});
function renderGifts() {
  $("#admin-gifts").innerHTML = gifts.map(g=>`<tr><td>${esc(g.name)}${g.active===false?' <small>(oculto)</small>':''}</td><td>${esc(g.category||"Outros")}</td><td>${money(g.price)}</td><td>${reservations.some(r=>r.giftId===g.id)?"Reservado":(g.active===false?"Oculto":"Disponível")}</td><td><button class="table-action" data-edit-gift="${g.id}">Editar</button><button class="table-action" data-toggle-gift="${g.id}">${g.active===false?"Publicar":"Ocultar"}</button><button class="table-action danger" data-delete-gift="${g.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="5">Nenhum presente cadastrado ainda.</td></tr>`;
}
$("#admin-gifts").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit-gift]"), toggle=e.target.closest("[data-toggle-gift]"), del=e.target.closest("[data-delete-gift]");
  if(edit){const g=gifts.find(x=>x.id===edit.dataset.editGift);if(!g)return;$("#gift-id").value=g.id;$("#gift-name").value=g.name||"";$("#gift-category").value=g.category||"Outros";$("#gift-price").value=g.price??"";$("#gift-description").value=g.description||"";$("#gift-image-url").value = g.imageUrl || "";

gallery.querySelectorAll(".gift-image-option").forEach(option => {
  option.classList.toggle(
    "selected",
    option.dataset.imageUrl === g.imageUrl
  );
});

if (g.imageUrl) {
  previewImg.src = g.imageUrl;
  preview.hidden = false;
} else {
  preview.hidden = true;
  previewImg.removeAttribute("src");
}$("#current-image").textContent=g.imageUrl?"Imagem atual cadastrada.":"";$("#gift-form-title").textContent="Editar presente";$("#cancel-edit").hidden=false;$("#gift-form").scrollIntoView({behavior:"smooth"});return;}
  if(toggle){const g=gifts.find(x=>x.id===toggle.dataset.toggleGift);if(g)try{await updateDoc(doc(db,"gifts",g.id),{active:g.active===false,updatedAt:serverTimestamp()});}catch(err){alert("Não foi possível atualizar o presente.");}return;}
  if(del){const g=gifts.find(x=>x.id===del.dataset.deleteGift);if(!g)return;if(!confirm(`Excluir "${g.name}"?`))return;try{if(g.imagePath)await deleteObject(ref(storage,g.imagePath)).catch(()=>{});await deleteDoc(doc(db,"gifts",g.id));}catch(err){alert("Não foi possível excluir o presente.");console.error(err);}}
});
$("#cancel-edit").addEventListener("click",resetGiftForm);
function resetGiftForm(){ $("#gift-form").reset();$("#gift-id").value="";$("#gift-form-title").textContent="Adicionar presente";$("#current-image").textContent="";$("#cancel-edit").hidden=true;$("#gift-image-url").value = "";
preview.hidden = true;
previewImg.removeAttribute("src");

gallery.querySelectorAll(".gift-image-option").forEach(option => {
  option.classList.remove("selected");
});message($("#gift-status"),""); }

$("#gift-form").addEventListener("submit", async e => {
  e.preventDefault();

  const btn = e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled = true;
  message($("#gift-status"), "Salvando presente…");

  try {
    const id = $("#gift-id").value;
    const existing = gifts.find(g => g.id === id);
    const selectedImage = $("#gift-image-url").value;

    const rawPrice = $("#gift-price").value;

    const data = {
      name: $("#gift-name").value.trim(),
      category: $("#gift-category").value,
      price: rawPrice === "" ? null : Number(rawPrice),
      description: $("#gift-description").value.trim(),
      imageUrl: selectedImage || existing?.imageUrl || "",
      imagePath: "",
      active: existing?.active !== false,
      updatedAt: serverTimestamp()
    };

    if (!data.name) {
      throw new Error("Informe o nome do presente.");
    }

    if (id) {
      await updateDoc(doc(db, "gifts", id), data);
    } else {
      await addDoc(collection(db, "gifts"), {
        ...data,
        createdAt: serverTimestamp()
      });
    }

    resetGiftForm();
    message($("#gift-status"), "Presente salvo com sucesso.");
  } catch (err) {
    message(
      $("#gift-status"),
      err.message || "Erro ao salvar o presente.",
      true
    );
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

const gallery = $("#gift-image-gallery");
const imageUrlInput = $("#gift-image-url");
const preview = $("#selected-image-preview");
const previewImg = $("#selected-image-preview-img");

function renderGiftImageGallery() {
  gallery.innerHTML = giftImages.map(image => `
    <button
      type="button"
      class="gift-image-option"
      data-image-url="${esc(image.url)}"
      aria-label="Selecionar ${esc(image.name)}"
    >
      <img src="${esc(image.url)}" alt="${esc(image.name)}" loading="lazy">
      <span>${esc(image.name)}</span>
    </button>
  `).join("");
}

renderGiftImageGallery();

gallery.addEventListener("click", e => {
  const button = e.target.closest("[data-image-url]");
  if (!button) return;

  const url = button.dataset.imageUrl;
  imageUrlInput.value = url;

  gallery.querySelectorAll(".gift-image-option").forEach(option => {
    option.classList.toggle("selected", option === button);
  });

  previewImg.src = url;
  preview.hidden = false;
  $("#current-image").textContent = "Nova foto selecionada.";
});


function renderReservations(){
  $("#reservations-list").innerHTML=reservations.map(r=>`<tr><td>${esc(r.giftName||gifts.find(g=>g.id===r.giftId)?.name||"Presente")}</td><td>${esc(r.guestName||"—")}</td><td>${dateLabel(r.createdAt)}</td><td><button class="table-action danger" data-release="${r.id}" data-gift-id="${r.giftId}">Liberar reserva</button></td></tr>`).join("")||`<tr><td colspan="4">Nenhuma reserva até agora.</td></tr>`;
}
$("#reservations-list").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-release]");if(!btn)return;
  if(!confirm("Liberar esta reserva para que outra pessoa possa escolher o presente?"))return;
  try{await runTransaction(db,async tx=>{const resRef=doc(db,"reservations",btn.dataset.release);const lockRef=doc(db,"reservationLocks",btn.dataset.giftId);tx.delete(resRef);tx.delete(lockRef);});}catch(err){alert("Não foi possível liberar a reserva.");console.error(err);}
});
async function loadEventForm(){
  try{const snap=await getDoc(doc(db,"settings","event"));if(!snap.exists())return;const d=snap.data();$("#event-baby").value=d.babyName||"";$("#event-date").value=d.date||"";$("#event-time").value=d.time||"";$("#event-location").value=d.location||"";$("#event-address").value=d.address||"";$("#event-map").value=d.mapUrl||"";}catch(err){console.error(err);}
}
$("#event-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;message($("#event-status"),"Salvando dados…");
  try{const mapUrl=$("#event-map").value.trim();if(mapUrl&&!/^https:\/\/.+/i.test(mapUrl))throw new Error("O link do mapa deve começar com https://");await setDoc(doc(db,"settings","event"),{babyName:$("#event-baby").value.trim(),date:$("#event-date").value,time:$("#event-time").value.trim(),location:$("#event-location").value.trim(),address:$("#event-address").value.trim(),mapUrl,updatedAt:serverTimestamp()},{merge:true});message($("#event-status"),"Dados do evento salvos.");}
  catch(err){message($("#event-status"),err.message||"Não foi possível salvar.",true);}
  finally{btn.disabled=false;}
});
