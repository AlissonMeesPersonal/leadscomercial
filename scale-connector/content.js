(() => {
  const STORAGE_KEY = "lc_scale_automation_v2";
  const params = new URLSearchParams(window.location.search);

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  if (params.get("lc_auto") === "1") {
    const lead = {
      nome: params.get("lc_nome") || "",
      ddi: digits(params.get("lc_ddi") || "55"),
      phone: digits(params.get("lc_phone") || "")
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      lead,
      createdAt: Date.now(),
      stage: "open"
    }));
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
  let lastNewConversationClick = 0;
  let lastCountryClick = 0;

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function deepRoots(root = document) {
    const roots = [root];
    const queue = [root];

    while (queue.length) {
      const current = queue.shift();

      try {
        for (const el of current.querySelectorAll("*")) {
          if (el.shadowRoot) {
            roots.push(el.shadowRoot);
            queue.push(el.shadowRoot);
          }

          if (el instanceof HTMLIFrameElement) {
            try {
              const doc = el.contentDocument;
              if (doc) {
                roots.push(doc);
                queue.push(doc);
              }
            } catch {}
          }
        }
      } catch {}
    }

    return roots;
  }

  function all(selector) {
    const out = [];
    const seen = new Set();

    for (const root of deepRoots()) {
      try {
        for (const el of root.querySelectorAll(selector)) {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        }
      } catch {}
    }

    return out;
  }

  function elementWords(el) {
    return normalizeText([
      el.textContent,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.getAttribute?.("placeholder"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("name")
    ].filter(Boolean).join(" "));
  }

  function findByWords(selector, groups) {
    return all(selector).find((el) => {
      if (!visible(el)) return false;
      const text = elementWords(el);
      return groups.some((group) => group.every((word) => text.includes(normalizeText(word))));
    }) || null;
  }

  function nearestClickable(el) {
    if (!el) return null;
    return el.closest("button, a, [role=button], [role=menuitem]") || el;
  }

  function findInputNearLabel(words) {
    const labels = all("label, span, div, p");
    const label = labels.find((el) => {
      if (!visible(el)) return false;
      const txt = normalizeText(el.textContent);
      return words.some((word) => txt === normalizeText(word) || txt.startsWith(normalizeText(word)));
    });

    if (!label) return null;

    if (label.tagName === "LABEL") {
      const direct = label.querySelector("input");
      if (direct && visible(direct)) return direct;

      const forId = label.getAttribute("for");
      if (forId) {
        for (const root of deepRoots()) {
          try {
            const target = root.getElementById?.(forId);
            if (target instanceof HTMLInputElement && visible(target)) return target;
          } catch {}
        }
      }
    }

    const labelRect = label.getBoundingClientRect();
    const candidates = all("input").filter((input) => {
      if (!visible(input)) return false;
      const r = input.getBoundingClientRect();
      const verticalDistance = r.top - labelRect.bottom;
      const horizontalOverlap = r.right >= labelRect.left && r.left <= labelRect.right + 500;
      return verticalDistance >= -10 && verticalDistance < 120 && horizontalOverlap;
    });

    return candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return Math.abs(ra.top - labelRect.bottom) - Math.abs(rb.top - labelRect.bottom);
    })[0] || null;
  }

  function findNameInput() {
    return (
      findInputNearLabel(["nome", "nome (opcional)"]) ||
      findByWords("input", [["joao", "silva"], ["nome"]])
    );
  }

  function findPhoneInput() {
    return (
      findInputNearLabel(["telefone", "telefone (com ddd)", "celular", "whatsapp"]) ||
      findByWords("input", [["11999998888"], ["telefone"], ["phone"]]) ||
      all('input[type="tel"]').find(visible) ||
      null
    );
  }

  function setNativeValue(input, value) {
    if (!input || !value) return false;

    try {
      input.focus();
      const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

      if (setter) setter.call(input, "");
      else input.value = "";

      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
        data: null
      }));

      if (setter) setter.call(input, value);
      else input.value = value;

      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
      }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
      input.blur();
      return digits(input.value).includes(digits(value)) || normalizeText(input.value).includes(normalizeText(value));
    } catch {
      try {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch {
        return false;
      }
    }
  }

  function isNewConversationModalOpen() {
    if (findNameInput() && findPhoneInput()) return true;

    const title = findByWords(
      '[role="dialog"] *, [aria-modal="true"] *, h1, h2, h3, strong, span, div',
      [["nova", "conversa"]]
    );

    return Boolean(title && visible(title));
  }

  function clickNewConversation() {
    if (isNewConversationModalOpen()) return true;

    const now = Date.now();
    if (now - lastNewConversationClick < 1200) return false;

    const direct = findByWords(
      'button, a, [role="button"], [role="menuitem"]',
      [
        ["nova", "conversa"],
        ["novo", "contato"],
        ["iniciar", "conversa"],
        ["new", "conversation"]
      ]
    );

    if (direct) {
      lastNewConversationClick = now;
      nearestClickable(direct).click();
      showToast("Abrindo Nova Conversa no Scale…");
      return true;
    }

    const headings = all("h1,h2,h3,h4,strong,span,div").filter((el) => {
      if (!visible(el)) return false;
      const txt = normalizeText(el.textContent);
      return txt === "conversas" || txt === "conversa";
    });

    for (const heading of headings) {
      let box = heading.parentElement;

      for (let depth = 0; box && depth < 5; depth += 1, box = box.parentElement) {
        const buttons = [...box.querySelectorAll("button,[role=button]")].filter(visible);

        const scored = buttons
          .map((button) => {
            const words = elementWords(button);
            const rect = button.getBoundingClientRect();
            const hrect = heading.getBoundingClientRect();
            let score = 0;

            if (words.includes("nova")) score += 10;
            if (words.includes("conversa")) score += 10;
            if (words.includes("novo")) score += 8;
            if (words.includes("adicionar")) score += 6;
            if (words.includes("add")) score += 4;
            if (rect.top <= hrect.bottom + 90) score += 3;
            if (rect.left >= hrect.left) score += 2;
            if (button.querySelector("svg")) score += 1;

            return { button, score };
          })
          .filter((item) => item.score >= 4)
          .sort((a, b) => b.score - a.score);

        if (scored[0]) {
          lastNewConversationClick = now;
          scored[0].button.click();
          showToast("Abrindo Nova Conversa no Scale…");
          return true;
        }
      }
    }

    return false;
  }

  function countryControl() {
    const alreadyBrazil = findByWords(
      'button, [role="combobox"], [role="button"], div',
      [["brasil", "+55"], ["brasil"], ["br", "+55"]]
    );

    if (alreadyBrazil) return { selected: true, control: nearestClickable(alreadyBrazil) };

    const labels = all("label, span, div, p").filter((el) => {
      if (!visible(el)) return false;
      const txt = normalizeText(el.textContent);
      return txt.includes("pais") && (txt.includes("ddi") || txt === "pais");
    });

    for (const label of labels) {
      let parent = label.parentElement;

      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        const control = [...parent.querySelectorAll('button,[role="combobox"],[role="button"]')].find(visible);
        if (control) return { selected: false, control };
      }
    }

    return { selected: false, control: null };
  }

  function selectBrazil() {
    const country = countryControl();
    if (country.selected) return true;
    if (!country.control) return false;

    const now = Date.now();
    if (now - lastCountryClick < 1000) return false;

    lastCountryClick = now;
    country.control.click();

    setTimeout(() => {
      const brazil = findByWords(
        '[role="option"], [role="menuitem"], button, li, div',
        [["brasil", "+55"], ["brasil"], ["brazil", "+55"]]
      );

      if (brazil) nearestClickable(brazil).click();
    }, 250);

    return false;
  }

  function validPhoneValue(input) {
    if (!input) return false;
    const current = digits(input.value);
    const expected = digits(lead.phone);
    return current === expected || current.endsWith(expected) || expected.endsWith(current);
  }

  function validNameValue(input) {
    if (!input) return false;
    return normalizeText(input.value).includes(normalizeText(lead.nome));
  }

  function clickContinueIfReady(nameInput, phoneInput) {
    if (continueClicked) return true;
    if (!validNameValue(nameInput) || !validPhoneValue(phoneInput)) return false;
    if (!countryControl().selected) return false;

    const button = findByWords(
      'button, [role="button"]',
      [["continuar"], ["continue"]]
    );

    if (!button || !visible(button)) return false;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;

    continueClicked = true;
    showToast("Dados conferidos. Avançando no Scale…");

    setTimeout(() => {
      nearestClickable(button).click();

      const state = {
        lead,
        createdAt: saved.createdAt,
        stage: "continued"
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 650);

    return true;
  }

  function showToast(message) {
    let toast = document.getElementById("lc-scale-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lc-scale-toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: "2147483647",
        padding: "12px 16px",
        borderRadius: "12px",
        background: "#101936",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.18)",
        boxShadow: "0 12px 30px rgba(0,0,0,.28)",
        font: "600 13px Arial, sans-serif",
        maxWidth: "360px"
      });

      document.documentElement.appendChild(toast);
    }

    toast.textContent = "Leads Comercial: " + message;
  }

  function clearAutomationParams() {
    try {
      const url = new URL(window.location.href);
      ["lc_auto", "lc_nome", "lc_ddi", "lc_phone"].forEach((key) => url.searchParams.delete(key));
      history.replaceState(history.state, "", url.toString());
    } catch {}
  }

  function step() {
    if (finished) return;

    if (!isNewConversationModalOpen()) {
      clickNewConversation();
      return;
    }

    showToast("Nova Conversa localizada. Preenchendo o contato…");

    const nameInput = findNameInput();
    const phoneInput = findPhoneInput();

    if (nameInput && !validNameValue(nameInput)) {
      setNativeValue(nameInput, lead.nome);
    }

    selectBrazil();

    if (phoneInput && !validPhoneValue(phoneInput)) {
      setNativeValue(phoneInput, lead.phone);
    }

    if (clickContinueIfReady(nameInput, phoneInput)) {
      setTimeout(() => {
        finished = true;
        clearAutomationParams();
        showToast("Contato avançado. Agora o Scale pode solicitar o template aprovado.");
      }, 1200);
    }
  }

  showToast("Automação recebida. Aguardando o Scale carregar…");

  const observer = new MutationObserver(() => step());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "value"]
  });

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    step();

    if (finished || attempts > 180) {
      clearInterval(timer);
      observer.disconnect();

      if (!finished) {
        showToast("Não consegui concluir sozinho. Deixe a tela do Scale aberta e atualize o conector.");
      }
    }
  }, 500);

  step();
})();
