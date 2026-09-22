(() => {
  const STORAGE_KEY = "lc_scale_automation_v3";
  const params = new URLSearchParams(window.location.search);

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const normalizeText = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  if (params.get("lc_auto") === "1") {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lead: {
          nome: params.get("lc_nome") || "",
          ddi: digits(params.get("lc_ddi") || "55"),
          phone: digits(params.get("lc_phone") || "")
        },
        createdAt: Date.now()
      })
    );
  }

  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }

  if (!saved?.lead?.phone) return;

  const lead = saved.lead;
  let finished = false;
  let continueClicked = false;
  let lastActionAt = 0;
  let lastMessage = "";

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function roots() {
    const result = [document];
    const queue = [document];

    while (queue.length) {
      const root = queue.shift();
      try {
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            result.push(el.shadowRoot);
            queue.push(el.shadowRoot);
          }
          if (el instanceof HTMLIFrameElement) {
            try {
              if (el.contentDocument) {
                result.push(el.contentDocument);
                queue.push(el.contentDocument);
              }
            } catch {}
          }
        }
      } catch {}
    }

    return result;
  }

  function all(selector) {
    const output = [];
    const seen = new Set();

    for (const root of roots()) {
      try {
        root.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            output.push(el);
          }
        });
      } catch {}
    }

    return output;
  }

  function words(el) {
    return normalizeText(
      [
        el?.textContent,
        el?.getAttribute?.("aria-label"),
        el?.getAttribute?.("title"),
        el?.getAttribute?.("placeholder"),
        el?.getAttribute?.("data-testid"),
        el?.getAttribute?.("name")
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function findText(selector, groups) {
    return (
      all(selector).find((el) => {
        if (!visible(el)) return false;
        const text = words(el);
        return groups.some((group) => group.every((word) => text.includes(normalizeText(word))));
      }) || null
    );
  }

  function clickable(el) {
    if (!el) return null;
    return el.closest("button,a,[role=button],[role=menuitem],[tabindex]") || el;
  }

  function safeClick(el, message) {
    const target = clickable(el);
    if (!target || !visible(target)) return false;

    const now = Date.now();
    if (now - lastActionAt < 700) return false;
    lastActionAt = now;

    try {
      target.scrollIntoView({ block: "center", inline: "center" });
    } catch {}

    try {
      target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.click();
      if (message) showToast(message);
      return true;
    } catch {
      return false;
    }
  }

  function showToast(message) {
    if (message === lastMessage) return;
    lastMessage = message;

    let toast = document.getElementById("lc-scale-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lc-scale-toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "18px",
        bottom: "18px",
        zIndex: "2147483647",
        padding: "12px 16px",
        borderRadius: "12px",
        background: "#101936",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.18)",
        boxShadow: "0 12px 30px rgba(0,0,0,.28)",
        font: "600 13px Arial, sans-serif",
        maxWidth: "390px"
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = "Leads Comercial: " + message;
  }

  function cleanParams() {
    try {
      const url = new URL(location.href);
      ["lc_auto", "lc_nome", "lc_ddi", "lc_phone"].forEach((key) => url.searchParams.delete(key));
      history.replaceState(history.state, "", url.toString());
    } catch {}
  }

  function routeIsChatUnidades() {
    return location.pathname.includes("/chat-unidades");
  }

  function goToCorrectRoute() {
    if (routeIsChatUnidades()) return false;

    const url = new URL("https://scale.26fit.com.br/d/chat-unidades");
    url.searchParams.set("lc_auto", "1");
    url.searchParams.set("lc_nome", lead.nome);
    url.searchParams.set("lc_ddi", lead.ddi || "55");
    url.searchParams.set("lc_phone", lead.phone);

    showToast("Abrindo o módulo correto: Chat Unidades…");
    location.assign(url.toString());
    return true;
  }

  function modalOpen() {
    const title = findText(
      '[role="dialog"] *, [aria-modal="true"] *, h1,h2,h3,strong,span,div',
      [["nova", "conversa"]]
    );
    return Boolean(title && (findNameInput() || findPhoneInput()));
  }

  function findUnitPanel() {
    return findText("h1,h2,h3,strong,span,div", [["chat", "por", "unidade"]]);
  }

  function unitNeedsSelection() {
    return Boolean(
      findText("h1,h2,h3,p,span,div", [
        ["selecione", "uma", "unidade"],
        ["selecionar", "uma", "unidade"]
      ])
    );
  }

  function clickSantaCruzUnit() {
    const candidates = all("button,a,[role=button],[tabindex],div").filter((el) => {
      if (!visible(el)) return false;
      const text = words(el);
      if (!text.includes("santa cruz")) return false;

      const rect = el.getBoundingClientRect();
      const leftSide = rect.left < window.innerWidth * 0.48;
      const belowHeader = rect.top > 160;
      const notTopAccount = rect.top > 110;
      return leftSide && belowHeader && notTopAccount;
    });

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      const aScore =
        (a.matches("button,a,[role=button],[tabindex]") ? 10 : 0) +
        (ar.left < 600 ? 5 : 0) +
        (ar.width > 120 ? 2 : 0);

      const bScore =
        (b.matches("button,a,[role=button],[tabindex]") ? 10 : 0) +
        (br.left < 600 ? 5 : 0) +
        (br.width > 120 ? 2 : 0);

      return bScore - aScore;
    });

    if (candidates[0]) {
      return safeClick(candidates[0], "Selecionando a unidade Santa Cruz…");
    }

    return false;
  }

  function newConversationVisible() {
    return findText('button,a,[role=button]', [["nova", "conversa"]]);
  }

  function clickNewConversation() {
    const button = newConversationVisible();
    if (button) return safeClick(button, "Abrindo Nova Conversa…");
    return false;
  }

  function clickChatUnidadesFallback() {
    const item = findText(
      'button,a,[role=button],[role=menuitem],span,div',
      [["chat", "unidades"], ["chat", "por", "unidade"]]
    );

    if (item) return safeClick(item, "Entrando em Chat Unidades…");

    const chats = findText(
      'button,a,[role=button],[role=menuitem],span,div',
      [["chats"]]
    );

    if (chats) return safeClick(chats, "Abrindo o menu Chats…");

    return false;
  }

  function findInputNearLabel(labelTerms) {
    const labels = all("label,span,div,p").filter((el) => visible(el));

    for (const label of labels) {
      const text = normalizeText(label.textContent);
      if (!labelTerms.some((term) => text.includes(normalizeText(term)))) continue;

      if (label.tagName === "LABEL") {
        const nested = label.querySelector("input");
        if (nested && visible(nested)) return nested;

        const id = label.getAttribute("for");
        if (id) {
          const input = document.getElementById(id);
          if (input instanceof HTMLInputElement && visible(input)) return input;
        }
      }

      const lr = label.getBoundingClientRect();
      const nearby = all("input")
        .filter((input) => {
          if (!visible(input)) return false;
          const r = input.getBoundingClientRect();
          return r.top >= lr.top - 10 && r.top <= lr.bottom + 115 && r.left >= lr.left - 30;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

      if (nearby[0]) return nearby[0];
    }

    return null;
  }

  function findNameInput() {
    return (
      findInputNearLabel(["nome", "nome (opcional)"]) ||
      findText("input", [["joao", "silva"], ["nome"]])
    );
  }

  function findPhoneInput() {
    return (
      findInputNearLabel(["telefone", "telefone (com ddd)", "celular", "whatsapp"]) ||
      findText("input", [["11999998888"], ["telefone"]]) ||
      all('input[type="tel"]').find(visible) ||
      null
    );
  }

  function setNativeValue(input, value) {
    if (!input || !value) return false;

    try {
      input.focus();
      const proto = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      setter ? setter.call(input, "") : (input.value = "");
      input.dispatchEvent(new Event("input", { bubbles: true }));

      setter ? setter.call(input, value) : (input.value = value);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }));
      input.blur();
      return true;
    } catch {
      return false;
    }
  }

  function countrySelected() {
    return Boolean(
      findText('button,[role=combobox],[role=button],div', [
        ["brasil", "+55"],
        ["brasil"],
        ["br", "+55"]
      ])
    );
  }

  function chooseBrazil() {
    if (countrySelected()) return true;

    const label = findText("label,span,div,p", [["pais", "ddi"], ["pais"]]);
    if (!label) return false;

    let parent = label.parentElement;
    for (let i = 0; parent && i < 4; i += 1, parent = parent.parentElement) {
      const control = [...parent.querySelectorAll('button,[role=combobox],[role=button]')].find(visible);
      if (control) {
        if (!safeClick(control, "Selecionando Brasil +55…")) return false;

        setTimeout(() => {
          const brazil = findText(
            '[role=option],[role=menuitem],button,li,div',
            [["brasil", "+55"], ["brasil"], ["brazil", "+55"]]
          );
          if (brazil) safeClick(brazil, "Brasil +55 selecionado.");
        }, 300);

        return false;
      }
    }

    return false;
  }

  function nameValid(input) {
    return Boolean(input && normalizeText(input.value).includes(normalizeText(lead.nome)));
  }

  function phoneValid(input) {
    if (!input) return false;
    const current = digits(input.value);
    return current === lead.phone || current.endsWith(lead.phone);
  }

  function fillModal() {
    showToast("Nova Conversa aberta. Preenchendo o lead…");

    const name = findNameInput();
    const phone = findPhoneInput();

    if (name && !nameValid(name)) setNativeValue(name, lead.nome);
    chooseBrazil();
    if (phone && !phoneValid(phone)) setNativeValue(phone, lead.phone);

    if (!nameValid(name) || !phoneValid(phone) || !countrySelected()) return false;

    const next = findText('button,[role=button]', [["continuar"], ["continue"]]);
    if (!next || next.disabled || next.getAttribute("aria-disabled") === "true") return false;

    if (!continueClicked) {
      continueClicked = true;
      showToast("Dados preenchidos. Clicando em Continuar…");
      setTimeout(() => {
        safeClick(next, "Avançando para a próxima etapa…");
        finished = true;
        cleanParams();
        sessionStorage.removeItem(STORAGE_KEY);
      }, 600);
    }

    return true;
  }

  function step() {
    if (finished) return;

    if (!routeIsChatUnidades()) {
      goToCorrectRoute();
      return;
    }

    if (modalOpen()) {
      fillModal();
      return;
    }

    if (newConversationVisible()) {
      clickNewConversation();
      return;
    }

    if (findUnitPanel() && unitNeedsSelection()) {
      if (!clickSantaCruzUnit()) {
        showToast("Chat por Unidade aberto. Aguardando a unidade Santa Cruz aparecer…");
      }
      return;
    }

    if (findUnitPanel()) {
      showToast("Unidade carregando. Aguardando o botão Nova Conversa…");
      return;
    }

    if (!clickChatUnidadesFallback()) {
      showToast("Aguardando o menu Chat Unidades carregar…");
    }
  }

  showToast("Automação iniciada. Abrindo Chat Unidades…");

  const observer = new MutationObserver(() => step());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    step();

    if (finished || attempts > 240) {
      clearInterval(timer);
      observer.disconnect();
      if (!finished) showToast("A automação parou nesta etapa. Envie um print dessa tela para eu ajustar.");
    }
  }, 500);

  step();
})();
