(() => {
  const LEAD_KEY = "lc_pending_scale_lead";
  const host = location.hostname;

  const norm = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const digits = (value) => String(value || "").replace(/\D/g, "");

  if (host === "leadscomercial.vercel.app") {
    window.addEventListener("message", async (event) => {
      if (
        event.source !== window ||
        event.data?.source !== "leads-comercial" ||
        event.data?.type !== "START_SCALE_LEAD"
      ) return;

      const payload = event.data.payload || {};
      const lead = {
        nome: String(payload.nome || "").trim(),
        ddi: digits(payload.ddi || "55"),
        phone: digits(payload.phone || ""),
        createdAt: Date.now()
      };

      if (!lead.phone) return;

      try {
        await chrome.storage.local.set({ [LEAD_KEY]: lead });

        window.postMessage(
          {
            source: "leads-scale-connector",
            type: "LEAD_SAVED"
          },
          window.location.origin
        );
      } catch (error) {
        console.error("[Leads Comercial] Falha ao salvar lead para o Scale:", error);
      }
    });

    return;
  }

  if (host !== "scale.26fit.com.br") return;

  chrome.storage.local.get([LEAD_KEY], (result) => {
    const lead = result?.[LEAD_KEY];

    if (!lead?.phone) return;

    if (Date.now() - Number(lead.createdAt || 0) > 10 * 60 * 1000) {
      chrome.storage.local.remove([LEAD_KEY]);
      return;
    }

    startAutomation(lead);
  });

  function startAutomation(lead) {
    let finished = false;
    let continueClicked = false;
    let lastActionAt = 0;
    let lastMessage = "";
    let sidebarClickedAt = 0;
    let chatUnidadesClickedAt = 0;
    let santaCruzClickedAt = 0;

    function visible(el) {
      if (!el || !(el instanceof Element)) return false;

      const style = getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) return false;

      const rect = el.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    }

    function roots() {
      const found = [document];
      const queue = [document];

      while (queue.length) {
        const root = queue.shift();

        try {
          root.querySelectorAll("*").forEach((el) => {
            if (el.shadowRoot) {
              found.push(el.shadowRoot);
              queue.push(el.shadowRoot);
            }

            if (el instanceof HTMLIFrameElement) {
              try {
                if (el.contentDocument) {
                  found.push(el.contentDocument);
                  queue.push(el.contentDocument);
                }
              } catch {}
            }
          });
        } catch {}
      }

      return found;
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
        ]
          .filter(Boolean)
          .join(" ")
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

    function exactText(text, selector = "span,div,p,strong,a,button,[role=button],[role=menuitem]") {
      const wanted = norm(text);

      const matches = all(selector)
        .filter((el) => {
          if (!visible(el)) return false;

          const txt = norm(el.textContent);
          return txt === wanted || txt.startsWith(wanted);
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { el, area: rect.width * rect.height };
        })
        .sort((a, b) => a.area - b.area);

      return matches[0]?.el || null;
    }

    function clickable(el) {
      if (!el) return null;

      const direct = el.closest(
        "button,a,[role=button],[role=menuitem],[tabindex]"
      );

      if (direct) return direct;

      let parent = el;

      for (
        let depth = 0;
        parent && depth < 5;
        depth += 1, parent = parent.parentElement
      ) {
        if (!visible(parent)) continue;

        try {
          if (getComputedStyle(parent).cursor === "pointer") return parent;
        } catch {}
      }

      return el;
    }

    function safeClick(el, message, gap = 650) {
      const target = clickable(el);
      if (!target || !visible(target)) return false;

      const now = Date.now();
      if (now - lastActionAt < gap) return false;
      lastActionAt = now;

      try {
        target.scrollIntoView({ block: "center", inline: "center" });
      } catch {}

      try {
        // Um único clique real. A versão anterior disparava "click" duas vezes
        // (dispatchEvent + .click()), o que podia selecionar e desfazer a ação.
        target.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            pointerType: "mouse"
          })
        );
        target.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true })
        );
        target.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, cancelable: true })
        );

        if (typeof target.click === "function") {
          target.click();
        } else {
          target.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
        }

        if (message) showToast(message);
        return true;
      } catch {
        return false;
      }
    }

    function bestActionAncestor(el) {
      if (!el) return null;

      const candidates = [];
      let node = el;

      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;

        const r = node.getBoundingClientRect();
        if (r.width < 40 || r.height < 24) continue;

        let score = 0;
        const role = norm(node.getAttribute?.("role"));
        const cls = norm(node.getAttribute?.("class"));
        const testid = norm(node.getAttribute?.("data-testid"));

        if (node.matches?.("button,a,[role=button],[role=menuitem],[tabindex]")) score += 40;
        if (typeof node.onclick === "function") score += 35;
        if (role.includes("button") || role.includes("menuitem") || role.includes("option")) score += 30;
        if (testid.includes("unit") || testid.includes("unidade")) score += 20;
        if (cls.includes("cursor-pointer") || cls.includes("clickable")) score += 18;

        try {
          if (getComputedStyle(node).cursor === "pointer") score += 25;
        } catch {}

        // A linha/cartão costuma ser maior que o texto, mas evitamos containers gigantes.
        if (r.width >= 120 && r.width <= 900) score += 12;
        if (r.height >= 36 && r.height <= 140) score += 12;
        if (depth > 0 && depth <= 4) score += 8;

        candidates.push({ el: node, score, depth, area: r.width * r.height });
      }

      candidates.sort((a, b) => b.score - a.score || a.depth - b.depth || a.area - b.area);
      return candidates[0]?.el || el;
    }

    function coordinateClick(el) {
      if (!el || !visible(el)) return false;

      try {
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        const x = Math.max(1, Math.min(window.innerWidth - 1, r.left + r.width / 2));
        const y = Math.max(1, Math.min(window.innerHeight - 1, r.top + r.height / 2));
        const hit = document.elementFromPoint(x, y);

        if (!hit) return false;

        const target = bestActionAncestor(hit);
        if (!target) return false;

        target.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerType: "mouse"
          })
        );
        target.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y })
        );
        target.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y })
        );
        target.click?.();
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
          maxWidth: "430px"
        });

        document.documentElement.appendChild(toast);
      }

      toast.textContent = "Leads Comercial: " + message;
    }

    function sidebarChatIcon() {
      const semantic = findContains(
        "button,a,[role=button],[tabindex]",
        [["chat"], ["mensagem"], ["conversa"]]
      );

      if (semantic) {
        const r = semantic.getBoundingClientRect();

        if (r.left < 105 && r.top > 120 && r.top < 350) return semantic;
      }

      const candidates = all("button,a,[role=button],[tabindex]")
        .filter((el) => {
          if (!visible(el)) return false;

          const r = el.getBoundingClientRect();

          return (
            r.left < 85 &&
            r.top > 145 &&
            r.top < 330 &&
            r.width <= 90 &&
            r.height <= 90
          );
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          let score = 0;

          if (el.querySelector("svg")) score += 10;
          if (r.top > 175 && r.top < 275) score += 18;
          if (r.left < 65) score += 8;

          return { el, score };
        })
        .sort((a, b) => b.score - a.score);

      if (candidates[0]) return candidates[0].el;

      return document.elementFromPoint(28, 245);
    }

    function chatUnidadesOption() {
      const exact =
        exactText("Chat Unidades") ||
        exactText("Chat por Unidade");

      if (exact) {
        const r = exact.getBoundingClientRect();

        if (r.left < window.innerWidth * 0.45) return exact;
      }

      return findContains(
        "button,a,[role=button],[role=menuitem],[tabindex],span,div",
        [["chat", "unidades"], ["chat", "por", "unidade"]]
      );
    }

    function unitPanelVisible() {
      return Boolean(
        findContains("h1,h2,h3,strong,span,div,p", [
          ["chat", "por", "unidade"],
          ["selecione", "unidade"],
          ["selecione", "uma", "unidade"]
        ])
      );
    }

    function santaCruzRow() {
      const matches = all(
        "button,a,[role=button],[role=menuitem],[tabindex],div,span,p,strong"
      )
        .filter((el) => {
          if (!visible(el)) return false;

          const text = norm(el.textContent);
          if (text !== "santa cruz" && !text.startsWith("santa cruz")) {
            return false;
          }

          const r = el.getBoundingClientRect();

          // Ignora o seletor superior da conta.
          if (r.top < 145 && r.left > window.innerWidth * 0.55) return false;

          // A linha da unidade aparece na região esquerda/central da tela.
          if (r.top < 140) return false;
          if (r.left > window.innerWidth * 0.68) return false;

          return true;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          const target = clickable(el);
          let score = 0;

          if (target !== el) score += 15;
          if (el.matches("button,a,[role=button],[role=menuitem],[tabindex]")) {
            score += 20;
          }
          if (r.left < window.innerWidth * 0.45) score += 10;
          if (r.width > 80) score += 5;

          return { el, score, area: r.width * r.height };
        })
        .sort((a, b) => b.score - a.score || a.area - b.area);

      const found = matches[0]?.el || null;
      return found ? bestActionAncestor(found) : null;
    }

    function santaCruzChatLoaded() {
      return Boolean(
        findContains("h1,h2,h3,strong,span,div", [
          ["chat", "santa", "cruz"]
        ])
      );
    }

    function newConversationButton() {
      return (
        exactText(
          "+ Nova Conversa",
          "button,a,[role=button],span,div"
        ) ||
        exactText(
          "Nova Conversa",
          "button,a,[role=button],span,div"
        ) ||
        findContains(
          "button,a,[role=button],[tabindex]",
          [["nova", "conversa"], ["novo", "contato"]]
        )
      );
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

                if (input instanceof HTMLInputElement && visible(input)) {
                  return input;
                }
              } catch {}
            }
          }
        }

        const lr = label.getBoundingClientRect();

        const candidates = all("input")
          .filter((input) => {
            if (!visible(input)) return false;

            const r = input.getBoundingClientRect();

            return (
              r.top >= lr.top - 10 &&
              r.top <= lr.bottom + 120 &&
              r.left >= lr.left - 60
            );
          })
          .sort(
            (a, b) =>
              a.getBoundingClientRect().top -
              b.getBoundingClientRect().top
          );

        if (candidates[0]) return candidates[0];
      }

      return null;
    }

    function nameInput() {
      return (
        findInputNearLabel(["nome", "nome (opcional)"]) ||
        findContains("input", [["joao", "silva"], ["nome"]])
      );
    }

    function phoneInput() {
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

      return Boolean(title && (nameInput() || phoneInput()));
    }

    function setValue(input, value) {
      if (!input || !value) return false;

      try {
        input.focus();

        const proto =
          input instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;

        const setter = Object.getOwnPropertyDescriptor(
          proto,
          "value"
        )?.set;

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
        findContains(
          "button,[role=combobox],[role=button],div",
          [["brasil", "+55"], ["brasil"], ["br", "+55"]]
        )
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

      for (
        let i = 0;
        parent && i < 4;
        i += 1, parent = parent.parentElement
      ) {
        const control = [
          ...parent.querySelectorAll(
            "button,[role=combobox],[role=button]"
          )
        ].find(visible);

        if (!control) continue;

        if (!safeClick(control, "Selecionando Brasil +55…")) {
          return false;
        }

        setTimeout(() => {
          const brazil =
            exactText("Brasil +55") ||
            exactText("Brasil") ||
            findContains(
              "[role=option],[role=menuitem],button,li,div",
              [["brasil", "+55"], ["brasil"]]
            );

          if (brazil) {
            safeClick(
              brazil,
              "Brasil +55 selecionado.",
              250
            );
          }
        }, 350);

        return false;
      }

      return false;
    }

    function validName(input) {
      return Boolean(
        input && norm(input.value).includes(norm(lead.nome))
      );
    }

    function validPhone(input) {
      if (!input) return false;

      const current = digits(input.value);
      const expected = digits(lead.phone);

      return current === expected || current.endsWith(expected);
    }

    function fillModal() {
      showToast("Nova Conversa aberta. Preenchendo o lead…");

      const name = nameInput();
      const phone = phoneInput();

      if (name && !validName(name)) setValue(name, lead.nome);

      chooseBrazil();

      if (phone && !validPhone(phone)) {
        setValue(phone, lead.phone);
      }

      if (
        !validName(name) ||
        !validPhone(phone) ||
        !countrySelected()
      ) {
        return;
      }

      const next = findContains(
        "button,[role=button]",
        [["continuar"], ["continue"]]
      );

      if (
        !next ||
        next.disabled ||
        next.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      if (!continueClicked) {
        continueClicked = true;
        showToast(
          "Dados preenchidos. Clicando em Continuar…"
        );

        setTimeout(() => {
          safeClick(
            next,
            "Avançando para a próxima etapa…",
            250
          );

          finished = true;

          chrome.storage.local.remove([LEAD_KEY]);
        }, 650);
      }
    }

    function step() {
      if (finished) return;

      if (modalOpen()) {
        fillModal();
        return;
      }

      if (santaCruzChatLoaded()) {
        const button = newConversationButton();

        if (button) {
          safeClick(
            button,
            "Abrindo Nova Conversa…",
            400
          );
        } else {
          showToast(
            "Santa Cruz carregada. Aguardando Nova Conversa…"
          );
        }

        return;
      }

      if (unitPanelVisible()) {
        const row = santaCruzRow();

        if (row) {
          if (
            !santaCruzClickedAt ||
            Date.now() - santaCruzClickedAt > 5000
          ) {
            santaCruzClickedAt = Date.now();

            const clicked = safeClick(
              row,
              "Selecionando a unidade Santa Cruz…",
              350
            );

            // Fallback para interfaces em que o clique fica preso no texto
            // e o handler está no cartão/linha que está por baixo.
            if (!clicked) {
              coordinateClick(row);
            }

            setTimeout(() => {
              if (!santaCruzChatLoaded() && unitPanelVisible()) {
                coordinateClick(row);
                showToast("Reforçando a seleção da unidade Santa Cruz…");
              }
            }, 900);
          } else {
            showToast(
              "Santa Cruz selecionada. Aguardando o chat carregar…"
            );
          }
        } else {
          showToast(
            "Lista de unidades aberta. Aguardando Santa Cruz aparecer…"
          );
        }

        return;
      }

      const chatOption = chatUnidadesOption();

      if (chatOption) {
        if (
          !chatUnidadesClickedAt ||
          Date.now() - chatUnidadesClickedAt > 5000
        ) {
          chatUnidadesClickedAt = Date.now();

          safeClick(
            chatOption,
            "Entrando em Chat Unidades…",
            350
          );
        } else {
          showToast(
            "Chat Unidades selecionado. Aguardando a lista de unidades…"
          );
        }

        return;
      }

      if (
        !sidebarClickedAt ||
        Date.now() - sidebarClickedAt > 5000
      ) {
        const icon = sidebarChatIcon();

        if (icon) {
          sidebarClickedAt = Date.now();

          safeClick(
            icon,
            "Abrindo o menu de chats…",
            350
          );
        } else {
          showToast(
            "Aguardando o painel do Scale carregar…"
          );
        }

        return;
      }

      showToast(
        "Menu de chats aberto. Aguardando Chat Unidades…"
      );
    }

    showToast(
      "Lead recebido. Aguardando o Scale carregar com a URL limpa…"
    );

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
  }
})();
