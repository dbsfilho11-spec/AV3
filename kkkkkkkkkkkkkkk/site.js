"use strict";

const yearElement = document.getElementById("year");
if (yearElement) yearElement.textContent = String(new Date().getFullYear());

const accessibilityStorageKey = "verdevivo-accessibility";
const accessibilitySettings = {
  largeText: false,
  highContrast: false,
  reducedMotion: false,
};

try {
  const savedSettings = localStorage.getItem(accessibilityStorageKey);
  if (savedSettings) {
    const parsedSettings = JSON.parse(savedSettings);
    for (const setting of Object.keys(accessibilitySettings)) {
      if (typeof parsedSettings[setting] === "boolean") {
        accessibilitySettings[setting] = parsedSettings[setting];
      }
    }
  }
} catch (error) {
  console.error("Não foi possível carregar as configurações de acessibilidade.", error);
}

document.body.insertAdjacentHTML("beforeend", `
  <button class="accessibility-toggle" id="open-accessibility" type="button" aria-haspopup="dialog" aria-controls="accessibility-dialog">
    Acessibilidade
  </button>
  <dialog class="accessibility-dialog" id="accessibility-dialog" aria-labelledby="accessibility-title">
    <div class="accessibility-header">
      <h2 id="accessibility-title">Acessibilidade</h2>
      <button class="accessibility-close" id="close-accessibility" type="button" aria-label="Fechar configurações de acessibilidade">×</button>
    </div>
    <p>Personalize a visualização do site. As preferências ficam salvas neste navegador.</p>
    <div class="accessibility-options">
      <button type="button" data-accessibility-setting="largeText" aria-pressed="false">Aumentar tamanho do texto</button>
      <button type="button" data-accessibility-setting="highContrast" aria-pressed="false">Alto contraste</button>
      <button type="button" data-accessibility-setting="reducedMotion" aria-pressed="false">Reduzir animações</button>
      <button class="accessibility-reset" id="reset-accessibility" type="button">Restaurar padrão</button>
    </div>
    <p class="accessibility-status" id="accessibility-status" role="status" aria-live="polite"></p>
  </dialog>
`);

const accessibilityDialog = document.getElementById("accessibility-dialog");
const accessibilityStatus = document.getElementById("accessibility-status");
const accessibilityButtons = document.querySelectorAll("[data-accessibility-setting]");

function applyAccessibilitySettings() {
  document.documentElement.classList.toggle("large-text", accessibilitySettings.largeText);
  document.body.classList.toggle("high-contrast", accessibilitySettings.highContrast);
  document.body.classList.toggle("reduced-motion", accessibilitySettings.reducedMotion);

  for (const button of accessibilityButtons) {
    const setting = button.dataset.accessibilitySetting;
    button.setAttribute("aria-pressed", String(accessibilitySettings[setting]));
  }
}

function saveAccessibilitySettings() {
  try {
    localStorage.setItem(accessibilityStorageKey, JSON.stringify(accessibilitySettings));
    accessibilityStatus.textContent = "Preferência atualizada e salva.";
  } catch (error) {
    console.error("Não foi possível salvar as configurações de acessibilidade.", error);
    accessibilityStatus.textContent = "Preferência aplicada, mas não foi possível salvá-la neste navegador.";
  }
}

document.getElementById("open-accessibility").addEventListener("click", () => accessibilityDialog.showModal());
document.getElementById("close-accessibility").addEventListener("click", () => accessibilityDialog.close());

for (const button of accessibilityButtons) {
  button.addEventListener("click", () => {
    const setting = button.dataset.accessibilitySetting;
    accessibilitySettings[setting] = !accessibilitySettings[setting];
    applyAccessibilitySettings();
    saveAccessibilitySettings();
  });
}

document.getElementById("reset-accessibility").addEventListener("click", () => {
  for (const setting of Object.keys(accessibilitySettings)) {
    accessibilitySettings[setting] = false;
  }
  applyAccessibilitySettings();
  saveAccessibilitySettings();
  accessibilityStatus.textContent = "Configurações restauradas ao padrão.";
});

applyAccessibilitySettings();

const reflectionForm = document.getElementById("reflection-form");
const reflectionNote = document.getElementById("reflection-note");
const reflectionStatus = document.getElementById("reflection-status");
const clearReflectionButton = document.getElementById("clear-reflection");
const reflectionStorageKey = "verdevivo-reflection";

if (reflectionForm && reflectionNote && reflectionStatus && clearReflectionButton) {
  try {
    reflectionNote.value = localStorage.getItem(reflectionStorageKey) || "";
  } catch (error) {
    console.error("Não foi possível carregar a reflexão salva.", error);
    reflectionStatus.textContent = "Não foi possível acessar o armazenamento deste navegador.";
  }

  reflectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const note = reflectionNote.value.trim();

    if (!note) {
      reflectionStatus.textContent = "Escreva sua reflexão antes de salvar.";
      reflectionNote.focus();
      return;
    }

    try {
      localStorage.setItem(reflectionStorageKey, note);
      reflectionStatus.textContent = "Reflexão salva neste navegador.";
    } catch (error) {
      console.error("Não foi possível salvar a reflexão.", error);
      reflectionStatus.textContent = "Não foi possível salvar. Verifique as configurações do navegador.";
    }
  });

  clearReflectionButton.addEventListener("click", () => {
    try {
      localStorage.removeItem(reflectionStorageKey);
      reflectionNote.value = "";
      reflectionStatus.textContent = "Reflexão apagada.";
    } catch (error) {
      console.error("Não foi possível apagar a reflexão salva.", error);
      reflectionStatus.textContent = "Não foi possível apagar. Verifique as configurações do navegador.";
    }
  });
}
