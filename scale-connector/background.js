const LEAD_KEY = "lc_pending_scale_lead";
const SCALE_PATTERN = "https://scale.26fit.com.br/*";
const SCALE_URL = "https://scale.26fit.com.br/d/at-unidades";

function cleanLead(input = {}) {
  const digits = (value) => String(value || "").replace(/\D/g, "");
  return {
    nome: String(input.nome || "").trim(),
    ddi: digits(input.ddi || "55"),
    phone: digits(input.phone || ""),
    unidade: String(input.unidade || "").trim(),
    createdAt: Date.now()
  };
}

function chooseScaleTab(tabs) {
  if (!Array.isArray(tabs) || !tabs.length) return null;

  return [...tabs].sort((a, b) => {
    const aScore =
      (a.active ? 100 : 0) +
      (String(a.url || "").includes("/d/at-unidades") ? 40 : 0);
    const bScore =
      (b.active ? 100 : 0) +
      (String(b.url || "").includes("/d/at-unidades") ? 40 : 0);

    if (aScore !== bScore) return bScore - aScore;
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  })[0];
}

async function focusTab(tab) {
  if (!tab?.id) return;

  try {
    await chrome.tabs.update(tab.id, { active: true });
  } catch {}

  if (typeof tab.windowId === "number") {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {}
  }
}

async function sendLeadToScale(tabId, lead) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "LC_FILL_SCALE_LEAD",
      lead
    });
  } catch {
    // Se a extensão foi recarregada enquanto o Scale já estava aberto,
    // o content script antigo pode não existir mais. Injeta a versão atual.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });

      await new Promise((resolve) => setTimeout(resolve, 180));

      return await chrome.tabs.sendMessage(tabId, {
        type: "LC_FILL_SCALE_LEAD",
        lead
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

async function openOrFillScale(inputLead) {
  const lead = cleanLead(inputLead);

  if (!lead.phone) {
    return { ok: false, error: "Lead sem telefone." };
  }

  await chrome.storage.local.set({ [LEAD_KEY]: lead });

  const tabs = await chrome.tabs.query({ url: SCALE_PATTERN });
  const existing = chooseScaleTab(tabs);

  if (existing?.id) {
    await focusTab(existing);

    const result = await sendLeadToScale(existing.id, lead);

    return {
      ok: result?.ok !== false,
      mode: "existing",
      tabId: existing.id,
      modalOpen: Boolean(result?.modalOpen),
      error: result?.error || null
    };
  }

  const created = await chrome.tabs.create({
    url: SCALE_URL,
    active: true
  });

  return {
    ok: true,
    mode: "opened",
    tabId: created.id || null,
    modalOpen: false
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LC_OPEN_OR_FILL_SCALE") return;

  openOrFillScale(message.lead)
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );

  return true;
});
