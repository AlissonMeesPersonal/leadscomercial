(() => {
  const STORAGE_KEY = "lc_scale_automation_v4";
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
  let sidebarClicked = false;

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
        el?.getAttribute?.("name"),
        el?.getAttribute?.("href")
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
    if (now - lastActionAt < 650) return false;
    lastActionAt = now;

    try {
      target.scrollIntoView({ block: "center", inline: "center" });
    } catch {}

    try {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    } catch {}

    try {
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

  function ensureFunctionalRoute() {
    if (!location.pathname.includes("/d/chat-unidades")) return false;

    const url = new URL("https://scale.26fit.com.br/d/at-unidades");
    url.searchParams.set("lc_auto", "1");
    url.searchParams.set("lc_nome", lead.nome);
    url.searchParams.set("lc_ddi", lead.ddi || "55");
    url.searchParams.set("lc_phone", lead.phone);

    showToast("Essa rota direta não carrega o Scale. Voltando para a tela funcional…");
    location.replace(url.toString());
    return true;
  }

  function modalOpen() {
    const title = findText(
      '[role="dialog"] *, [aria-modal="true"] *, h1,h2,h3,strong,span,div',
      [["nova", "conversa"]]
    );

    return Boolean(title && (findNameInput() || findPhoneInput()));
  }

  function chatMenuOption() {
    return findText(
      'button,a,[role=button],[role=menuitem],[tabindex],span,div',
      [
        ["chat", "unidades"],
        ["chat", "por", "unidade"],
        ["atendimento", "unidades"]
      ]
    );
  }

  function clickSidebarChatIcon() {
    const direct = findText(
      'button,a,[role=button],[tabindex]',
      [["chat"], ["conversa"], ["mensagem"]]
    );

    if (direct) {
      const r = direct.getBoundingClientRect();
      if (r.left < 110 && r.top > 120) {
        sidebarClicked = true;
        return safeClick(direct, "Abrindo o menu de chats…");
      }
    }

    const candidates = all('button,a,[role=button],[tabindex]').filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.left < 85 &&
        r.top > 140 &&
        r.top < 390 &&
        r.width <= 90 &&
        r.height <= 90
      );
    });

    const ranked = candidates
      .map((el) => {
        const r = el.getBoundingClientRect();
        const text = words(el);
        let score = 0;

        if (text.includes("chat") || text.includes("conversa") || text.includes("mensagem")) score += 30;
        if (el.querySelector("svg")) score += 10;
        if (el.querySelector("img")) score += 5;
        if (r.top > 175 && r.top < 285) score += 12;
        if (r.left < 70) score += 8;
        if (r.width >= 24 && r.height >= 24) score += 4;

        return { el, score };
      })
      .sort((a, b) => b.score - a.score);

    if (ranked[0]?.score >= 10) {
      sidebarClicked = true;
      return safeClick(ranked[0].el, "Abrindo o menu de chats…");
    }

    const points = [
      [31, 210],
      [31, 245],
      [31, 280]
    ];

    for (const [x, y] of points) {
      const el = document.elementFromPoint(x, y);
      const target = clickable(el);
      if (target && visible(target)) {
        sidebarClicked = true;
        return safeClick(target, "Abrindo o menu de chats…");
      }
    }

    return false;
  }

  function enterChatUnidades() {
    const option = chatMenuOption();
    if (option) return safeClick(option, "Entrando em Chat Unidades…");
    return false;
  }

  function findUnitPanel() {
    return findText("h1,h2,h3,strong,span,div", [
      ["chat", "por", "unidade"],
      ["unidades"],
      ["selecione", "unidade"]
    ]);
  }

  function clickSantaCruzUnit() {
    const candidates = all("button,a,[role=button],[tabindex],div,span").filter((el) => {
      if (!visible(el)) return false;
      const text = words(el);
      if (!text.includes("santa cruz")) return false;

      const r = el.getBoundingClientRect();

      if (r.top < 130 && r.left > window.innerWidth * 0.65) return false;

      return r.top > 120;
    });

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      const aScore =
        (a.matches("button,a,[role=button],[tabindex]") ? 20 : 0) +
        (ar.left < window.innerWidth * 0.65 ? 8 : 0) +
        (ar.top > 170 ? 5 : 0);

      const bScore =
        (b.matches("button,a,[role=button],[tabindex]") ? 20 : 0) +
        (br.left < window.innerWidth * 0.65 ? 8 : 0) +
        (br.top > 170 ? 5 : 0);

      return bScore - aScore;
    });

    if (candidates[0]) {
      return safeClick(candidates[0], "Selecionando a unidade Santa Cruz…");
    }

    return false;
  }

  function newConversationButton() {
    return findText(
      'button,a,[role=button],[tabindex]',
      [
        ["nova", "conversa"],
        ["novo", "contato"],
        ["iniciar", "conversa"]
      ]
    );
  }

  function clickNewConversation() {
    const button = newConversationButton();
    if (button) return safeClick(button, "Abrindo Nova Conversa…");
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
          for (const root of roots()) {
            try {
              const input = root.getElementById?.(id);
              if (input instanceof HTMLInputElement && visible(input)) return input;
            } catch {}
          }
        }
      }

      const lr = label.getBoundingClientRect();
      const nearby = all("input")
        .filter((input) => {
          if (!visible(input)) return false;
          const r = input.getBoundingClientRect();
          return r.top >= lr.top - 10 && r.top <= lr.bottom + 120 && r.left >= lr.left - 40;
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

    if (ensureFunctionalRoute()) return;

    if (modalOpen()) {
      fillModal();
      return;
    }

    if (newConversationButton()) {
      clickNewConversation();
      return;
    }

    if (findUnitPanel()) {
      if (clickSantaCruzUnit()) return;
    }

    if (chatMenuOption()) {
      enterChatUnidades();
      return;
    }

    if (!sidebarClicked) {
      if (clickSidebarChatIcon()) return;
    } else {
      const option = chatMenuOption();
      if (option) {
        enterChatUnidades();
        return;
      }

      const unit = findUnitPanel();
      if (unit) {
        clickSantaCruzUnit();
        return;
      }

      showToast("Menu de chats aberto. Aguardando a opção Chat Unidades…");
      return;
    }

    showToast("Aguardando o painel do Scale carregar…");
  }

  showToast("Automação iniciada. Abrindo o menu de chats…");

  const observer = new MutationObserver(() => step());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-expanded", "aria-selected"]
  });

  let attempts = 0;

  const timer = setInterval(() => {
    attempts += 1;
    step();

    if (finished || attempts > 240) {
      clearInterval(timer);
      observer.disconnect();

      if (!finished) {
        showToast("A automação parou nesta etapa. Envie um print dessa tela para eu ajustar.");
      }
    }
  }, 500);

  step();
})();
