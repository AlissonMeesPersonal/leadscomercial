const PENDING_LEAD_STORAGE_KEY = "lc_pending_scale_lead";
const SCALE_PAGE_PATTERN = "https://scale.26fit.com.br/*";
const SCALE_ENTRY_URL = "https://scale.26fit.com.br/d/at-unidades";

function keepOnlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeBillingData(billing) {
  if (!billing || typeof billing !== "object") {
    return null;
  }

  return {
    template: String(billing.template ?? "").trim(),
    variavel1: String(billing.variavel1 ?? "").trim(),
    variavel2: String(billing.variavel2 ?? "").trim(),
    variavel3: String(billing.variavel3 ?? "").trim(),
    variavel4: String(billing.variavel4 ?? "").trim()
  };
}

function normalizeLead(rawLead = {}) {
  return {
    nome: String(rawLead.nome ?? "").trim(),
    ddi: keepOnlyDigits(rawLead.ddi || "55"),
    phone: keepOnlyDigits(rawLead.phone),
    unidade: String(rawLead.unidade ?? "").trim(),
    cobranca: normalizeBillingData(rawLead.cobranca),
    stage: String(rawLead.stage || "lead"),
    createdAt: Date.now()
  };
}

function scaleTabScore(tab) {
  let score = 0;

  if (tab.active) score += 100;
  if (String(tab.url ?? "").includes("/d/at-unidades")) score += 40;

  return score;
}

function pickScaleTab(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null;
  }

  return [...tabs].sort((left, right) => {
    const scoreDifference = scaleTabScore(right) - scaleTabScore(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return Number(right.lastAccessed ?? 0) - Number(left.lastAccessed ?? 0);
  })[0];
}

async function bringTabToFront(tab) {
  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.update(tab.id, { active: true });
  } catch (error) {
    console.debug("[Leads Comercial] Não foi possível ativar a aba do Scale.", error);
  }

  if (typeof tab.windowId !== "number") {
    return;
  }

  try {
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (error) {
    console.debug("[Leads Comercial] Não foi possível focar a janela do Scale.", error);
  }
}

async function sendLeadToTab(tabId, lead) {
  const message = {
    type: "LC_FILL_SCALE_LEAD",
    lead
  };

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Quando a extensão é atualizada com o Scale aberto, o content script antigo
    // deixa de responder. Nesse caso carregamos a versão atual e repetimos o envio.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });

      await new Promise((resolve) => setTimeout(resolve, 180));
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

async function openScaleForLead(rawLead) {
  const lead = normalizeLead(rawLead);

  if (!lead.phone) {
    return { ok: false, error: "Lead sem telefone." };
  }

  await chrome.storage.local.set({
    [PENDING_LEAD_STORAGE_KEY]: lead
  });

  const scaleTabs = await chrome.tabs.query({ url: SCALE_PAGE_PATTERN });
  const scaleTab = pickScaleTab(scaleTabs);

  if (scaleTab?.id) {
    await bringTabToFront(scaleTab);

    const result = await sendLeadToTab(scaleTab.id, lead);

    return {
      ok: result?.ok !== false,
      mode: "existing",
      tabId: scaleTab.id,
      modalOpen: Boolean(result?.modalOpen),
      error: result?.error || null
    };
  }

  const newTab = await chrome.tabs.create({
    url: SCALE_ENTRY_URL,
    active: true
  });

  return {
    ok: true,
    mode: "opened",
    tabId: newTab.id || null,
    modalOpen: false
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LC_OPEN_OR_FILL_SCALE") {
    return;
  }

  openScaleForLead(message.lead)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
