(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("lc_auto") !== "1") return;

  const lead = {
    nome: params.get("lc_nome") || "",
    ddi: (params.get("lc_ddi") || "55").replace(/\D/g, ""),
    phone: (params.get("lc_phone") || "").replace(/\D/g, "")
  };

  function setNativeValue(element, value) {
    if (!element) return false;

    const proto =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : null;

    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (setter) setter.call(element, value);
    else element.value = value;

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function byText(selector, text) {
    const wanted = text.toLowerCase();
    return [...document.querySelectorAll(selector)].find(
      (el) => visible(el) && (el.textContent || "").trim().toLowerCase().includes(wanted)
    );
  }

  function findInputByLabel(words) {
    const labels = [...document.querySelectorAll("label")];

    for (const label of labels) {
      const txt = (label.textContent || "").toLowerCase();
      if (!words.some((word) => txt.includes(word))) continue;

      const direct = label.querySelector("input");
      if (direct && visible(direct)) return direct;

      const forId = label.getAttribute("for");
      if (forId) {
        const target = document.getElementById(forId);
        if (target instanceof HTMLInputElement && visible(target)) return target;
      }

      const wrapper = label.parentElement;
      const nearby = wrapper?.querySelector("input");
      if (nearby && visible(nearby)) return nearby;
    }

    return null;
  }

  function findNameInput() {
    return (
      findInputByLabel(["nome"]) ||
      [...document.querySelectorAll("input")].find((el) => {
        const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
        return visible(el) && (placeholder.includes("joão") || placeholder.includes("nome"));
      })
    );
  }

  function findPhoneInput() {
    return (
      findInputByLabel(["telefone", "celular", "whatsapp"]) ||
      [...document.querySelectorAll("input")].find((el) => {
        const placeholder = (el.getAttribute("placeholder") || "").replace(/\D/g, "");
        const type = (el.getAttribute("type") || "").toLowerCase();
        return visible(el) && (type === "tel" || placeholder.includes("11999998888"));
      })
    );
  }

  function ensureNewConversationOpen() {
    if (findPhoneInput()) return true;

    const trigger =
      byText("button", "nova conversa") ||
      byText('[role="button"]', "nova conversa") ||
      byText("a", "nova conversa");

    if (trigger) {
      trigger.click();
      return true;
    }

    return false;
  }

  function selectBrazilIfNeeded() {
    const countryText = [...document.querySelectorAll("button,[role=combobox]")].find((el) => {
      const txt = (el.textContent || "").toLowerCase();
      return visible(el) && (txt.includes("brasil") || txt.includes("+55"));
    });

    if (countryText) return true;

    const label = [...document.querySelectorAll("label")].find((el) =>
      (el.textContent || "").toLowerCase().includes("país")
    );

    const wrapper = label?.parentElement;
    const control = wrapper?.querySelector("button,[role=combobox]");
    if (control && visible(control)) {
      control.click();

      setTimeout(() => {
        const brasil =
          byText('[role="option"]', "brasil") ||
          byText("button", "brasil") ||
          byText("li", "brasil");

        brasil?.click();
      }, 250);

      return true;
    }

    return false;
  }

  let attempts = 0;

  const timer = setInterval(() => {
    attempts += 1;
    ensureNewConversationOpen();

    const nameInput = findNameInput();
    const phoneInput = findPhoneInput();

    if (nameInput && lead.nome) setNativeValue(nameInput, lead.nome);
    if (phoneInput && lead.phone) setNativeValue(phoneInput, lead.phone);

    selectBrazilIfNeeded();

    if (nameInput && phoneInput) {
      clearInterval(timer);

      const cleanUrl = new URL(window.location.href);
      ["lc_auto", "lc_nome", "lc_ddi", "lc_phone"].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState({}, "", cleanUrl.toString());

      console.info("[Leads Comercial] Lead preenchido no Scale:", lead.nome, lead.phone);
    } else if (attempts >= 40) {
      clearInterval(timer);
      console.warn("[Leads Comercial] Não foi possível localizar todos os campos do Scale.");
    }
  }, 500);
})();
