(() => {
  const STORAGE_KEY = "lc_scale_automation_v5";
  const params = new URLSearchParams(window.location.search);

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const norm = (value) =>
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
  let menuClickedAt = 0;
  let unitClickedAt = 0;
  let sidebarOpenedAt = 0;

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function roots() {
    const result = [document];
    const queue = [document];

    while (queue.length) {
      const root = queue.shift();

      try {
        root.querySelectorAll("*").forEach((el) => {
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
        });
      } catch {}
    }

    return result;
  }

  function all(selector) {
    const result = [];
    const seen = new Set();

    for (const root of roots()) {
      try {
        root.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            result.push(el);
          }
        });
      } catch {}
    }

    return result;
  }

  function textOf(el) {
    return norm(
      [
        el?.textContent,
        el?.getAttribute?.("aria-label"),
        el?.getAttribute?.("title"),
        el?.getAttribute?.("placeholder"),
        el?.getAttribute?.("data-testid"),
        el?.getAttribute?.("name"),
        el?.getAttribute?.("href")
      ].filter(Boolean).join(" ")
    );
  }

  function findContains(selector, groups) {
    return (
      all(selector).find((el) => {
        if (!visible(el)) return false;
        const text = textOf(el);
        return groups.some((group) =>
          group.every((part) => text.includes(norm(part)))
        );
      }) || null
    );
  }

  function findExactVisibleText(text, selector = "span,div,p,strong,a,button,[role=button],[role=menuitem]") {
    const wanted = norm(text);

    const matches = all(selector)
      .filter((el) => {
        if (!visible(el)) return false;
        const own = norm(el.textContent);
        return own === wanted || own.startsWith(wanted);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, area: r.width * r.height };
      })
      .sort((a, b) => a.area - b.area);

    return matches[0]?.el || null;
  }

  function clickable(el) {
    if (!el) return null;

    const direct = el.closest("button,a,[role=button],[role=menuitem],[tabindex]");
    if (direct) return direct;

    let parent = el;
    for (let i = 0; parent && i < 5; i += 1, parent = parent.parentElement) {
      if (!visible(parent)) continue;
      const style = getComputedStyle(parent);
      if (style.cursor === "pointer") return parent;
    }

    return el;
  }

  function fireClick(el) {
    const target = clickable(el);
    if (!target || !visible(target)) return false;

    try {
      target.scrollIntoView({ block: "center", inline: "center" });
    } catch {}

    try {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    } catch {}

    try {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      if (typeof target.click === "function") target.click();
      return true;
    } catch {
      return false;
    }
  }

  function safeClick(el, message, minGap = 650) {
    const now = Date.now();
    if (now - lastActionAt < minGap) return false;

    if (!fireClick(el)) return false;

    lastActionAt = now;
    if (message) showToast(message);
    return true;
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
        maxWidth: "420px"
      });

      document.documentElement.appendChild(toast);
    }

    toast.textContent = "Leads Comercial: " + message;
  }

  function cleanParams() {
    try {
      const url = new URL(location.href);
      ["lc_auto", "lc_nome", "lc_ddi", "lc_phone"].forEach((key) =>
        url.searchParams.delete(key)
      );
      history.replaceState(history.state, "", url.toString());
    } catch {}
  }

  function recoverBadDirectRoute() {
    if (!location.pathname.includes("/d/chat-unidades")) return false;

    const url = new URL("https://scale.26fit.com.br/d/at-unidades");
    url.searchParams.set("lc_auto", "1");
    url.searchParams.set("lc_nome", lead.nome);
    url.searchParams.set("lc_ddi", lead.ddi || "55");
    url.searchParams.set("lc_phone", lead.phone);

    showToast("Voltando para a tela funcional do Scale…");
    location.replace(url.toString());
    return true;
  }

  function sidebarChatOption() {
    const exact =
      findExactVisibleText("Chat Unidades") ||
      findExactVisibleText("Chat por Unidade");

    if (exact) {
      const r = exact.getBoundingClientRect();
      if (r.left < 300) return exact;
    }

    return null;
  }

  function sidebarIsExpanded() {
    return Boolean(sidebarChatOption());
  }

  function clickSidebarIcon() {
    const semantic = findContains(
      'button,a,[role=button],[tabindex]',
      [["chat"], ["mensagem"], ["conversa"]]
    );

    if (semantic) {
      const r = semantic.getBoundingClientRect();
      if (r.left < 100 && r.top > 120 && r.top < 350) {
        sidebarOpenedAt = Date.now();
        return safeClick(semantic, "Abrindo o menu de chats…");
      }
    }

    const candidates = all('button,a,[role=button],[tabindex]')
      .filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();

        return (
          r.left < 80 &&
          r.top > 150 &&
          r.top < 320 &&
          r.width <= 90 &&
          r.height <= 90
        );
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        let score = 0;

        if (el.querySelector("svg")) score += 10;
        if (r.top > 175 && r.top < 260) score += 15;
        if (r.left < 60) score += 8;

        return { el, score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates[0]) {
      sidebarOpenedAt = Date.now();
      return safeClick(candidates[0].el, "Abrindo o menu de chats…");
    }

    const el = document.elementFromPoint(25, 210);
    if (el) {
      sidebarOpenedAt = Date.now();
      return safeClick(el, "Abrindo o menu de chats…");
    }

    return false;
  }

  function clickChatUnidadesMenu() {
    const option = sidebarChatOption();
    if (!option) return false;

    menuClickedAt = Date.now();

    return safeClick(
      option,
      "Chat Unidades selecionado. Aguardando a lista de unidades…",
      400
    );
  }

  function leafTextMatches(el, matcher) {
    if (!visible(el)) return false;
    if (el.children.length > 3) return false;
    return matcher(norm(el.textContent));
  }

  function unitPanelVisible() {
    const heading = all("h1,h2,h3,h4,strong,span,p,div").find((el) => {
      if (!leafTextMatches(el, (text) =>
        text === "chat por unidade" ||
        text === "selecione uma unidade" ||
        text === "selecione unidade"
      )) return false;

      const r = el.getBoundingClientRect();
      return r.left < window.innerWidth * 0.55 && r.top > 100;
    });

    return Boolean(heading);
  }

  function santaCruzUnitText() {
    const matches = all("span,p,strong,div,a,button,[role=button],[tabindex]")
      .filter((el) => {
        if (!leafTextMatches(el, (text) => text === "santa cruz" || text.startsWith("santa cruz "))) {
          return false;
        }

        const r = el.getBoundingClientRect();

        // Nunca usar o seletor da conta no topo direito.
        if (r.top < 150 && r.left > window.innerWidth * 0.55) return false;

        // A linha da unidade fica na metade esquerda, abaixo do cabeçalho.
        return r.left < window.innerWidth * 0.55 && r.top > 140;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, area: r.width * r.height };
      })
      .sort((a, b) => a.area - b.area);

    return matches[0]?.el || null;
  }

  function santaCruzUnitRow() {
    const text = santaCruzUnitText();
    if (!text) return null;

    let current = text;
    let best = clickable(text);

    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (!visible(current)) continue;

      const r = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      const textValue = norm(current.textContent);

      const plausibleRow =
        r.left < window.innerWidth * 0.55 &&
        r.top > 130 &&
        r.width >= 110 &&
        r.width <= 650 &&
        r.height >= 32 &&
        r.height <= 150 &&
        textValue.includes("santa cruz");

      if (!plausibleRow) continue;

      if (
        current.matches("button,a,[role=button],[tabindex]") ||
        style.cursor === "pointer"
      ) {
        best = current;
        break;
      }

      if (!best || best === text) best = current;
    }

    return best || text;
  }

  function clickSantaCruz() {
    const row = santaCruzUnitRow();
    if (!row) return false;

    unitClickedAt = Date.now();

    return safeClick(
      row,
      "Selecionando a unidade Santa Cruz…",
      400
    );
  }

  function santaCruzChatLoaded() {
    const heading = all("h1,h2,h3,h4,strong,span,p,div").find((el) => {
      if (!leafTextMatches(el, (text) =>
        text === "chat - santa cruz" ||
        text === "chat santa cruz" ||
        text.startsWith("chat - santa cruz ")
      )) return false;

      const r = el.getBoundingClientRect();

      // O título do chat deve estar na área de conteúdo, não no seletor da conta.
      return r.left > 180 && r.top > 100 && r.top < window.innerHeight * 0.65;
    });

    if (heading) return true;

    // Outra confirmação forte: o botão Nova Conversa só aparece após a unidade real carregar.
    return Boolean(newConversationButton());
  }

  function newConversationButton() {
    const exact =
      findExactVisibleText("+ Nova Conversa", "button,a,[role=button],span,div") ||
      findExactVisibleText("Nova Conversa", "button,a,[role=button],span,div");

    if (exact) return exact;

    return findContains(
      'button,a,[role=button],[tabindex]',
      [["nova", "conversa"], ["novo", "contato"], ["iniciar", "conversa"]]
    );
  }

  function clickNewConversation() {
    const button = newConversationButton();
    if (!button) return false;

    return safeClick(button, "Abrindo Nova Conversa…");
  }

  function findInputNearLabel(terms) {
    const labels = all("label,span,div,p").filter(visible);

    for (const label of labels) {
      const text = norm(label.textContent);

      if (!terms.some((term) => text.includes(norm(term)))) continue;

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

          return (
            r.top >= lr.top - 10 &&
            r.top <= lr.bottom + 120 &&
            r.left >= lr.left - 50
          );
        })
        .sort(
          (a, b) =>
            a.getBoundingClientRect().top - b.getBoundingClientRect().top
        );

      if (nearby[0]) return nearby[0];
    }

    return null;
  }

  function findNameInput() {
    return (
      findInputNearLabel(["nome", "nome (opcional)"]) ||
      findContains("input", [["joao", "silva"], ["nome"]])
    );
  }

  function findPhoneInput() {
    return (
      findInputNearLabel([
        "telefone",
        "telefone (com ddd)",
        "celular",
        "whatsapp"
      ]) ||
      findContains("input", [["11999998888"], ["telefone"]]) ||
      all('input[type="tel"]').find(visible) ||
      null
    );
  }

  function modalOpen() {
    const title = findContains(
      '[role="dialog"] *,[aria-modal="true"] *,h1,h2,h3,strong,span,div',
      [["nova", "conversa"]]
    );

    return Boolean(title && (findNameInput() || findPhoneInput()));
  }

  function setNativeValue(input, value) {
    if (!input || !value) return false;

    try {
      input.focus();

      const proto =
        input instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;

      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      setter ? setter.call(input, "") : (input.value = "");
      input.dispatchEvent(new Event("input", { bubbles: true }));

      setter ? setter.call(input, value) : (input.value = value);
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: value
        })
      );
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();

      return true;
    } catch {
      return false;
    }
  }

  function countrySelected() {
    return Boolean(
      findContains('button,[role=combobox],[role=button],div', [
        ["brasil", "+55"],
        ["brasil"],
        ["br", "+55"]
      ])
    );
  }

  function chooseBrazil() {
    if (countrySelected()) return true;

    const label = findContains("label,span,div,p", [
      ["pais", "ddi"],
      ["pais"]
    ]);

    if (!label) return false;

    let parent = label.parentElement;

    for (let i = 0; parent && i < 4; i += 1, parent = parent.parentElement) {
      const control = [...parent.querySelectorAll(
        'button,[role=combobox],[role=button]'
      )].find(visible);

      if (!control) continue;

      if (!safeClick(control, "Selecionando Brasil +55…")) return false;

      setTimeout(() => {
        const brazil =
          findExactVisibleText("Brasil +55") ||
          findExactVisibleText("Brasil") ||
          findContains('[role=option],[role=menuitem],button,li,div', [
            ["brasil", "+55"],
            ["brasil"]
          ]);

        if (brazil) safeClick(brazil, "Brasil +55 selecionado.", 250);
      }, 350);

      return false;
    }

    return false;
  }

  function nameValid(input) {
    return Boolean(
      input && norm(input.value).includes(norm(lead.nome))
    );
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

    if (
      !nameValid(name) ||
      !phoneValid(phone) ||
      !countrySelected()
    ) return false;

    const next = findContains(
      'button,[role=button]',
      [["continuar"], ["continue"]]
    );

    if (
      !next ||
      next.disabled ||
      next.getAttribute("aria-disabled") === "true"
    ) return false;

    if (!continueClicked) {
      continueClicked = true;
      showToast("Dados preenchidos. Clicando em Continuar…");

      setTimeout(() => {
        safeClick(next, "Avançando para a próxima etapa…", 250);
        finished = true;
        cleanParams();
        sessionStorage.removeItem(STORAGE_KEY);
      }, 650);
    }

    return true;
  }

  function step() {
    if (finished) return;
    if (recoverBadDirectRoute()) return;

    if (modalOpen()) {
      fillModal();
      return;
    }

    if (santaCruzChatLoaded()) {
      const button = newConversationButton();

      if (button) {
        clickNewConversation();
      } else {
        showToast("Santa Cruz selecionada. Aguardando Nova Conversa…");
      }

      return;
    }

    if (unitPanelVisible()) {
      const unit = santaCruzUnitRow();

      if (unit) {
        if (!unitClickedAt || Date.now() - unitClickedAt > 5000) {
          clickSantaCruz();
        } else {
          showToast("Santa Cruz selecionada. Aguardando o chat carregar…");
        }
      } else {
        showToast("Lista de unidades aberta. Aguardando Santa Cruz aparecer…");
      }

      return;
    }

    if (menuClickedAt) {
      const elapsed = Date.now() - menuClickedAt;

      if (elapsed < 8000) {
        showToast("Chat Unidades selecionado. Aguardando a lista de unidades…");
        return;
      }

      // Se o painel não carregou em 8 s, reabre o menu e tenta novamente.
      menuClickedAt = 0;
      sidebarOpenedAt = 0;
    }

    if (sidebarIsExpanded()) {
      clickChatUnidadesMenu();
      return;
    }

    if (!sidebarOpenedAt || Date.now() - sidebarOpenedAt > 5000) {
      clickSidebarIcon();
      return;
    }

    showToast("Aguardando o menu de chats abrir…");
  }

  showToast("Automação iniciada. Abrindo Chat Unidades…");

  const observer = new MutationObserver(() => step());

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "class",
      "aria-expanded",
      "aria-selected",
      "disabled"
    ]
  });

  let attempts = 0;

  const timer = setInterval(() => {
    attempts += 1;
    step();

    if (finished || attempts > 300) {
      clearInterval(timer);
      observer.disconnect();

      if (!finished) {
        showToast(
          "A automação parou nesta etapa. Envie um print com esta mensagem."
        );
      }
    }
  }, 500);

  step();
})();
