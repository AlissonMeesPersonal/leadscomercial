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

  const INIT_KEY = "__lc_scale_connector_v27__";

  if (window[INIT_KEY]) return;
  window[INIT_KEY] = true;

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
        unidade: String(payload.unidade || "").trim(),
        cobranca:
          payload.cobranca && typeof payload.cobranca === "object"
            ? {
                template: String(payload.cobranca.template || "").trim(),
                variavel1: String(payload.cobranca.variavel1 || "").trim(),
                variavel2: String(payload.cobranca.variavel2 || "").trim(),
                variavel3: String(payload.cobranca.variavel3 || "").trim(),
                variavel4: String(payload.cobranca.variavel4 || "").trim()
              }
            : null,
        createdAt: Date.now()
      };

      if (!lead.phone) return;

      try {
        await chrome.storage.local.set({ [LEAD_KEY]: lead });

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "LC_OPEN_OR_FILL_SCALE",
              lead
            },
            (value) => {
              const error = chrome.runtime.lastError;
              resolve(
                error
                  ? { ok: false, error: error.message }
                  : value || { ok: false }
              );
            }
          );
        });

        window.postMessage(
          {
            source: "leads-scale-connector",
            type: "SCALE_DISPATCHED",
            ok: response?.ok !== false,
            mode: response?.mode || null,
            modalOpen: Boolean(response?.modalOpen),
            error: response?.error || null
          },
          window.location.origin
        );
      } catch (error) {
        console.error("[Leads Comercial] Falha ao enviar lead para o Scale:", error);

        window.postMessage(
          {
            source: "leads-scale-connector",
            type: "SCALE_DISPATCHED",
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          },
          window.location.origin
        );
      }
    });

    return;
  }

  if (host !== "scale.26fit.com.br") return;

  let stopActiveRun = null;

  function modalLooksOpen() {
    const pageText = norm(document.body?.innerText || "");
    if (!pageText.includes("nova conversa")) return false;

    return Array.from(document.querySelectorAll("input")).some((input) => {
      const hint = norm(
        [
          input.getAttribute("placeholder"),
          input.getAttribute("aria-label"),
          input.getAttribute("name")
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        hint.includes("joao silva") ||
        hint.includes("nome") ||
        hint.includes("11999998888") ||
        hint.includes("telefone")
      );
    });
  }

  function runLead(inputLead) {
    const lead = {
      nome: String(inputLead?.nome || "").trim(),
      ddi: digits(inputLead?.ddi || "55"),
      phone: digits(inputLead?.phone || ""),
      unidade: String(inputLead?.unidade || "").trim(),
      cobranca:
        inputLead?.cobranca && typeof inputLead.cobranca === "object"
          ? {
              template: String(inputLead.cobranca.template || "").trim(),
              variavel1: String(inputLead.cobranca.variavel1 || "").trim(),
              variavel2: String(inputLead.cobranca.variavel2 || "").trim(),
              variavel3: String(inputLead.cobranca.variavel3 || "").trim(),
              variavel4: String(inputLead.cobranca.variavel4 || "").trim()
            }
          : null,
      createdAt: Number(inputLead?.createdAt || Date.now())
    };

    if (!lead.phone) return false;

    if (typeof stopActiveRun === "function") {
      try {
        stopActiveRun();
      } catch {}
    }

    stopActiveRun = startAutomation(lead);
    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "LC_FILL_SCALE_LEAD") return;

    const lead = message.lead || {};
    const modalOpen = modalLooksOpen();

    chrome.storage.local.set({
      [LEAD_KEY]: {
        nome: String(lead.nome || "").trim(),
        ddi: digits(lead.ddi || "55"),
        phone: digits(lead.phone || ""),
        unidade: String(lead.unidade || "").trim(),
        cobranca:
          lead.cobranca && typeof lead.cobranca === "object"
            ? {
                template: String(lead.cobranca.template || "").trim(),
                variavel1: String(lead.cobranca.variavel1 || "").trim(),
                variavel2: String(lead.cobranca.variavel2 || "").trim(),
                variavel3: String(lead.cobranca.variavel3 || "").trim(),
                variavel4: String(lead.cobranca.variavel4 || "").trim()
              }
            : null,
        createdAt: Date.now()
      }
    });

    const ok = runLead(lead);

    sendResponse({
      ok,
      modalOpen
    });
  });

  chrome.storage.local.get([LEAD_KEY], (result) => {
    const lead = result?.[LEAD_KEY];

    if (!lead?.phone) return;

    if (Date.now() - Number(lead.createdAt || 0) > 10 * 60 * 1000) {
      chrome.storage.local.remove([LEAD_KEY]);
      return;
    }

    runLead(lead);
  });

  function startAutomation(lead) {
    let finished = false;
    let initialLeadFilled = false;
    let templateHandled = false;
    let continueClicked = false;
    let lastActionAt = 0;
    let lastMessage = "";
    let toastTimer = null;
    let sidebarClickedAt = 0;
    let chatUnidadesClickedAt = 0;
    let unitClickedAt = 0;

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
          maxWidth: "430px",
          opacity: "1",
          transform: "translateY(0)",
          transition: "opacity .25s ease, transform .25s ease"
        });

        document.documentElement.appendChild(toast);
      }

      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
      toast.textContent = "Leads Comercial: " + message;

      if (toastTimer) {
        clearTimeout(toastTimer);
      }

      toastTimer = setTimeout(() => {
        const currentToast = document.getElementById("lc-scale-toast");
        if (!currentToast) return;

        currentToast.style.opacity = "0";
        currentToast.style.transform = "translateY(8px)";

        setTimeout(() => {
          currentToast.remove();
        }, 280);
      }, 10000);
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

    function targetUnitVariants() {
      const raw = norm(lead.unidade || "");

      if (!raw) return [];

      const variants = new Set([raw]);
      variants.add(raw.replace(/\s+-\s+(rs|sc|pr)$/g, "").trim());
      variants.add(raw.replace(/\s+do\s+sul$/g, "").trim());

      if (raw === "santa cruz do sul") variants.add("santa cruz");

      return [...variants].filter(Boolean);
    }

    function targetUnitLabel() {
      return String(lead.unidade || "").trim() || "unidade do lead";
    }

    function unitRow() {
      const variants = targetUnitVariants();
      if (!variants.length) return null;

      const matches = all(
        "button,a,[role=button],[role=menuitem],[tabindex],div,span,p,strong"
      )
        .filter((el) => {
          if (!visible(el)) return false;

          const text = norm(el.textContent);
          if (
            !variants.some(
              (variant) =>
                text === variant ||
                text.startsWith(variant + " ") ||
                variant.startsWith(text + " ")
            )
          ) {
            return false;
          }

          const rect = el.getBoundingClientRect();

          if (rect.top < 145 && rect.left > window.innerWidth * 0.55) return false;
          if (rect.top < 120) return false;
          if (rect.left > window.innerWidth * 0.78) return false;

          return true;
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const target = clickable(el);
          let score = 0;

          if (target !== el) score += 15;
          if (el.matches("button,a,[role=button],[role=menuitem],[tabindex]")) {
            score += 20;
          }
          if (rect.left < window.innerWidth * 0.55) score += 10;
          if (rect.width > 80) score += 5;

          const text = norm(el.textContent);
          if (variants.includes(text)) score += 20;

          return { el, score, area: rect.width * rect.height };
        })
        .sort((a, b) => b.score - a.score || a.area - b.area);

      const found = matches[0]?.el || null;
      return found ? bestActionAncestor(found) : null;
    }

    function unitChatLoaded() {
      const variants = targetUnitVariants();
      if (!variants.length) return false;

      return all("h1,h2,h3,strong,span,div")
        .filter(visible)
        .some((el) => {
          const text = norm(el.textContent);
          return (
            text.includes("chat") &&
            variants.some((variant) => text.includes(variant))
          );
        });
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

    function conversationModal() {
      const direct = all('[role="dialog"],[aria-modal="true"]')
        .filter((el) => {
          if (!visible(el)) return false;
          const text = norm(el.textContent);
          return (
            text.includes("nova conversa") &&
            text.includes("telefone") &&
            text.includes("continuar")
          );
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.width * ar.height - br.width * br.height;
        })[0];

      if (direct) return direct;

      const title = exactText(
        "Nova Conversa",
        "h1,h2,h3,strong,span,div"
      );

      let node = title;

      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        if (!visible(node)) continue;

        const text = norm(node.textContent);
        const inputs = node.querySelectorAll?.("input")?.length || 0;

        if (
          inputs >= 2 &&
          text.includes("cancelar") &&
          text.includes("continuar")
        ) {
          return node;
        }
      }

      return null;
    }

    function modalInputs() {
      const modal = conversationModal();
      if (!modal) return [];

      return [...modal.querySelectorAll("input")].filter(visible);
    }

    function nameInput() {
      const modal = conversationModal();
      if (!modal) return null;

      const inputs = [...modal.querySelectorAll("input")].filter(visible);

      // O Scale usa "João Silva" como placeholder do campo Nome.
      const byPlaceholder = inputs.find((input) => {
        const placeholder = norm(input.getAttribute("placeholder"));
        return placeholder === "joao silva" || placeholder.includes("joao silva");
      });

      if (byPlaceholder) return byPlaceholder;

      const byNameHint = inputs.find((input) => {
        const hint = norm(
          [
            input.getAttribute("aria-label"),
            input.getAttribute("name"),
            input.getAttribute("id")
          ].filter(Boolean).join(" ")
        );
        return hint.includes("nome") || hint.includes("name");
      });

      if (byNameHint) return byNameHint;

      return inputs[0] || null;
    }

    function phoneInput() {
      const modal = conversationModal();
      if (!modal) return null;

      const inputs = [...modal.querySelectorAll("input")].filter(visible);

      // O Scale usa "11999998888" como placeholder do telefone.
      const byPlaceholder = inputs.find((input) => {
        const placeholder = digits(input.getAttribute("placeholder"));
        return placeholder === "11999998888";
      });

      if (byPlaceholder) return byPlaceholder;

      const byType = inputs.find((input) => input.type === "tel");
      if (byType) return byType;

      const byPhoneHint = inputs.find((input) => {
        const hint = norm(
          [
            input.getAttribute("aria-label"),
            input.getAttribute("name"),
            input.getAttribute("id")
          ].filter(Boolean).join(" ")
        );
        return (
          hint.includes("telefone") ||
          hint.includes("phone") ||
          hint.includes("celular") ||
          hint.includes("whatsapp")
        );
      });

      if (byPhoneHint) return byPhoneHint;

      return inputs[1] || null;
    }

    function modalOpen() {
      return Boolean(conversationModal() && (nameInput() || phoneInput()));
    }

    function dispatchFieldEvents(input, value) {
      try {
        input.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: value
          })
        );
      } catch {}

      try {
        input.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value
          })
        );
      } catch {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setValue(input, value) {
      if (!input || value == null) return false;

      const wanted = String(value);

      try {
        input.focus();

        const previous = String(input.value || "");
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;

        // Primeiro atualiza o valor usando o setter nativo do browser,
        // ignorando wrappers próprios do React/Scale.
        if (nativeSetter) {
          nativeSetter.call(input, wanted);
        } else {
          input.value = wanted;
        }

        // Faz React perceber que houve mudança real.
        try {
          input._valueTracker?.setValue?.(previous);
        } catch {}

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // Segundo método: simula uma inserção de texto no próprio campo.
        // Algumas bibliotecas de formulário só aceitam a mudança após seleção.
        if (
          String(input.value || "") !== wanted &&
          digits(input.value) !== digits(wanted)
        ) {
          input.focus();
          try {
            input.setSelectionRange(0, String(input.value || "").length);
          } catch {}

          try {
            document.execCommand("selectAll", false);
            document.execCommand("insertText", false, wanted);
          } catch {}

          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        return (
          String(input.value || "") === wanted ||
          digits(input.value) === digits(wanted) ||
          norm(input.value).includes(norm(wanted))
        );
      } catch {
        return false;
      }
    }

    function billingTemplateExpected() {
      return (
        lead.cobranca?.template === "cobranca_mensalidade_atraso"
      );
    }

    function templateVariablesModal() {
      if (!billingTemplateExpected()) return null;

      const dialogs = all(
        '[role="dialog"],[aria-modal="true"],div'
      )
        .filter((el) => {
          if (!visible(el)) return false;

          const text = norm(el.textContent);
          return (
            text.includes("enviar template do whatsapp") &&
            text.includes("cobranca_mensalidade_atraso") &&
            text.includes("variaveis")
          );
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { el, area: rect.width * rect.height };
        })
        .sort((a, b) => a.area - b.area);

      return dialogs[0]?.el || null;
    }

    function templateVariableInputs() {
      const modal = templateVariablesModal();
      if (!modal) return [];

      const inputs = [...modal.querySelectorAll("input")]
        .filter(visible)
        .filter((input) => {
          const placeholder = norm(input.getAttribute("placeholder"));
          const aria = norm(input.getAttribute("aria-label"));

          return (
            placeholder.includes("valor da variavel") ||
            aria.includes("valor da variavel")
          );
        });

      if (inputs.length >= 4) return inputs.slice(0, 4);

      // Fallback caso o Scale altere apenas os placeholders.
      return [...modal.querySelectorAll("input")]
        .filter(visible)
        .slice(-4);
    }

    function fillBillingTemplateVariables() {
      if (templateHandled || !billingTemplateExpected()) return false;

      const inputs = templateVariableInputs();
      if (inputs.length < 4) return false;

      const values = [
        lead.cobranca?.variavel1 || "",
        lead.cobranca?.variavel2 || "",
        lead.cobranca?.variavel3 || "",
        lead.cobranca?.variavel4 || ""
      ];

      const missing = [];

      values.forEach((value, index) => {
        if (!value) {
          missing.push(index + 1);
          return;
        }

        setValue(inputs[index], value);
      });

      const completed = values.every((value, index) => {
        if (!value) return false;
        const current = String(inputs[index]?.value || "").trim();

        return (
          current === value ||
          norm(current) === norm(value)
        );
      });

      templateHandled = true;

      if (missing.length) {
        showToast(
          `Template detectado. Preenchi os dados disponíveis, mas faltam as variáveis ${missing.join(", ")} no Portal.`
        );
      } else if (completed) {
        showToast(
          "Cobrança preenchida: nome, vencimento, valor e link. Revise e clique em Enviar Template."
        );
      } else {
        showToast(
          "Template detectado. As variáveis foram enviadas aos campos; confira antes de enviar."
        );
      }

      finished = true;
      chrome.storage.local.remove([LEAD_KEY]);
      return true;
    }

    function countrySelected() {
      const modal = conversationModal();
      if (!modal) return false;

      const text = norm(modal.textContent);
      return (
        text.includes("brasil") &&
        (text.includes("+55") || text.includes("br +55"))
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
      if (!input || !lead.nome) return false;
      return norm(input.value) === norm(lead.nome);
    }

    function validPhone(input) {
      if (!input) return false;

      const current = digits(input.value);
      const expected = digits(lead.phone).slice(-11);

      return Boolean(current && current === expected);
    }

    function fillModal() {
      const modal = conversationModal();
      const name = nameInput();
      const phone = phoneInput();

      if (!modal) {
        showToast("Aguardando o modal Nova Conversa…");
        return;
      }

      if (!name || !phone) {
        showToast(
          `Modal encontrado. Nome: ${name ? "OK" : "não localizado"} · Telefone: ${phone ? "OK" : "não localizado"}`
        );
        return;
      }

      const expectedPhone = digits(lead.phone).slice(-11);

      if (!validName(name)) {
        setValue(name, lead.nome);
      }

      if (!validPhone(phone)) {
        setValue(phone, expectedPhone);
      }

      const nameOk = validName(name);
      const phoneOk = validPhone(phone);

      if (!nameOk || !phoneOk) {
        showToast(
          `Preenchendo… Nome: ${nameOk ? "OK" : "aguardando"} · Telefone: ${phoneOk ? "OK" : "aguardando"}`
        );

        setTimeout(() => {
          if (!finished && modalOpen()) {
            const currentName = nameInput();
            const currentPhone = phoneInput();

            if (currentName && !validName(currentName)) {
              setValue(currentName, lead.nome);
            }

            if (currentPhone && !validPhone(currentPhone)) {
              setValue(currentPhone, expectedPhone);
            }
          }
        }, 180);

        return;
      }

      initialLeadFilled = true;

      if (billingTemplateExpected()) {
        showToast(
          "Nome e telefone preenchidos. Clique em Continuar e escolha cobranca_mensalidade_atraso; as variáveis serão preenchidas automaticamente."
        );
        return;
      }

      showToast("Nome e telefone preenchidos. Continuar liberado.");
      finished = true;
      chrome.storage.local.remove([LEAD_KEY]);
    }

    function step() {
      if (finished) return;

      if (initialLeadFilled && billingTemplateExpected()) {
        if (fillBillingTemplateVariables()) return;

        showToast(
          "Aguardando você selecionar o template cobranca_mensalidade_atraso…"
        );
        return;
      }

      if (modalOpen()) {
        fillModal();
        return;
      }

      if (unitChatLoaded()) {
        const button = newConversationButton();

        if (button) {
          safeClick(
            button,
            "Abrindo Nova Conversa…",
            400
          );
        } else {
          showToast(
            `${targetUnitLabel()} carregada. Aguardando Nova Conversa…`
          );
        }

        return;
      }

      if (unitPanelVisible()) {
        if (!targetUnitVariants().length) {
          showToast(
            "Não recebi a unidade deste lead. Selecione a unidade manualmente e abra Nova Conversa."
          );
          return;
        }

        const row = unitRow();

        if (row) {
          if (
            !unitClickedAt ||
            Date.now() - unitClickedAt > 5000
          ) {
            unitClickedAt = Date.now();

            const clicked = safeClick(
              row,
              `Selecionando a unidade ${targetUnitLabel()}…`,
              350
            );

            // Fallback para interfaces em que o clique fica preso no texto
            // e o handler está no cartão/linha que está por baixo.
            if (!clicked) {
              coordinateClick(row);
            }

            setTimeout(() => {
              if (!unitChatLoaded() && unitPanelVisible()) {
                coordinateClick(row);
                showToast(`Reforçando a seleção da unidade ${targetUnitLabel()}…`);
              }
            }, 900);
          } else {
            showToast(
              `${targetUnitLabel()} selecionada. Aguardando o chat carregar…`
            );
          }
        } else {
          showToast(
            `Lista de unidades aberta. Aguardando ${targetUnitLabel()} aparecer…`
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
      modalLooksOpen()
        ? "Nova Conversa detectada. Preenchendo o lead agora…"
        : "Lead recebido. Aguardando o Scale ficar pronto…"
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

      const maxAttempts = billingTemplateExpected() ? 1200 : 300;

      if (finished || attempts > maxAttempts) {
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

    return () => {
      finished = true;
      clearInterval(timer);
      observer.disconnect();
    };
  }
})();
