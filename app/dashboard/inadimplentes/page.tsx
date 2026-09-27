"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../../components/ThemeToggle";

type SessionInfo = {
  username: string;
  displayName: string;
  role: "admin" | "commercial" | "user";
  unitId: string | null;
  unitName: string | null;
};

type Batch = {
  id: string;
  batch_date: string;
  owner_user_id: string;
  unit_id: string | null;
  source: string;
  created_at: string;
};

type DelinquentItem = {
  id: string;
  batch_id: string;
  lead_id: string;
  initial_balance: number | string;
  recovered_amount: number | string;
  payment_status: "pending" | "partial" | "paid";
  due_date: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  status: "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
  owner_user_id: string | null;
  unit_id: string | null;
  source: string;
};

type Owner = {
  id: string;
  username: string;
  display_name: string;
};

type Unit = {
  id: string;
  name: string;
  city: string;
};

type BatchSummary = {
  batch: Batch;
  total: number;
  initialBalance: number;
  recoveredAmount: number;
  openBalance: number;
  paidContacts: number;
  fullyPaid: number;
  partial: number;
  conversionRate: number;
  recoveryRate: number;
};

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";

async function supabaseRequest(path: string) {
  const access = sessionStorage.getItem(COMMERCIAL_ACCESS_KEY);

  if (!access) {
    throw new Error("Sua sessão de dados expirou. Entre novamente.");
  }

  const response = await fetch(SUPABASE_URL + path, {
    headers: {
      apikey: SUPABASE_KEY,
      "x-client-info": access
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Acesso ao banco recusado. Entre novamente."
        : "Não foi possível carregar o histórico de inadimplentes."
    );
  }

  return response;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function batchState(date: string) {
  const today = todayKey();

  if (date === today) return "today";
  if (date < today) return "closed";
  return "future";
}

function batchStateLabel(date: string) {
  const state = batchState(date);
  if (state === "today") return "Carteira de hoje";
  if (state === "closed") return "Encerrada";
  return "Agendada";
}

function paymentLabel(status: DelinquentItem["payment_status"]) {
  if (status === "paid") return "Quitado";
  if (status === "partial") return "Parcial";
  return "Pendente";
}

export default function DelinquentHistoryPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<DelinquentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [unitFilter, setUnitFilter] = useState("Todas");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function loadData(silent = false) {
    if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
      location.href = "/login";
      return;
    }

    if (!silent) setLoading(true);

    try {
      const [
        sessionResponse,
        batchResponse,
        itemResponse,
        leadResponse,
        ownerResponse,
        unitResponse
      ] = await Promise.all([
        fetch("/api/session", { cache: "no-store" }),
        supabaseRequest(
          "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc,created_at.desc"
        ),
        supabaseRequest(
          "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,due_date,created_at&order=created_at.asc"
        ),
        supabaseRequest(
          "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,status,owner_user_id,unit_id,source&demand_type=eq.delinquent"
        ),
        supabaseRequest(
          "/rest/v1/commercial_users?select=id,username,display_name&deleted_at=is.null&order=display_name.asc"
        ),
        supabaseRequest(
          "/rest/v1/commercial_units?select=id,name,city&active=eq.true&order=name.asc"
        )
      ]);

      if (!sessionResponse.ok) {
        location.href = "/login";
        return;
      }

      const [
        sessionRow,
        batchRows,
        itemRows,
        leadRows,
        ownerRows,
        unitRows
      ] = await Promise.all([
        sessionResponse.json() as Promise<SessionInfo>,
        batchResponse.json() as Promise<Batch[]>,
        itemResponse.json() as Promise<DelinquentItem[]>,
        leadResponse.json() as Promise<Lead[]>,
        ownerResponse.json() as Promise<Owner[]>,
        unitResponse.json() as Promise<Unit[]>
      ]);

      setSession(sessionRow);
      setBatches(batchRows);
      setItems(itemRows);
      setLeads(leadRows);
      setOwners(ownerRows);
      setUnits(unitRows);
      setNotice("");

      setSelectedBatchId((current) => {
        if (current && batchRows.some((batch) => batch.id === current)) {
          return current;
        }

        const todayBatch = batchRows.find(
          (batch) => batch.batch_date === todayKey()
        );

        return todayBatch?.id || batchRows[0]?.id || "";
      });
    } catch (error) {
      if (!silent) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o histórico."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();

    const timer = window.setInterval(() => {
      void loadData(true);
    }, 10000);

    const onFocus = () => void loadData(true);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const ownerById = useMemo(
    () => new Map(owners.map((owner) => [owner.id, owner] as const)),
    [owners]
  );

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  const leadById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead] as const)),
    [leads]
  );

  const itemsByBatch = useMemo(() => {
    const map = new Map<string, DelinquentItem[]>();

    for (const item of items) {
      const current = map.get(item.batch_id) || [];
      current.push(item);
      map.set(item.batch_id, current);
    }

    return map;
  }, [items]);

  const summaries = useMemo<BatchSummary[]>(() => {
    return batches.map((batch) => {
      const rows = itemsByBatch.get(batch.id) || [];
      const initialBalance = rows.reduce(
        (sum, item) => sum + numberValue(item.initial_balance),
        0
      );
      const recoveredAmount = rows.reduce(
        (sum, item) => sum + numberValue(item.recovered_amount),
        0
      );
      const paidContacts = rows.filter(
        (item) => numberValue(item.recovered_amount) > 0
      ).length;
      const fullyPaid = rows.filter(
        (item) => item.payment_status === "paid"
      ).length;
      const partial = rows.filter(
        (item) => item.payment_status === "partial"
      ).length;

      return {
        batch,
        total: rows.length,
        initialBalance,
        recoveredAmount,
        openBalance: Math.max(0, initialBalance - recoveredAmount),
        paidContacts,
        fullyPaid,
        partial,
        conversionRate: rows.length ? (paidContacts / rows.length) * 100 : 0,
        recoveryRate: initialBalance
          ? (recoveredAmount / initialBalance) * 100
          : 0
      };
    });
  }, [batches, itemsByBatch]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((summary) => {
      if (
        unitFilter !== "Todas" &&
        summary.batch.unit_id !== unitFilter
      ) {
        return false;
      }

      if (
        ownerFilter !== "Todos" &&
        summary.batch.owner_user_id !== ownerFilter
      ) {
        return false;
      }

      if (
        dateFilter &&
        summary.batch.batch_date !== dateFilter
      ) {
        return false;
      }

      return true;
    });
  }, [summaries, unitFilter, ownerFilter, dateFilter]);

  const selectedSummary =
    summaries.find((summary) => summary.batch.id === selectedBatchId) ||
    filteredSummaries[0] ||
    null;

  const selectedItems = useMemo(() => {
    if (!selectedSummary) return [];
    return itemsByBatch.get(selectedSummary.batch.id) || [];
  }, [selectedSummary, itemsByBatch]);

  const totals = useMemo(() => {
    const source = filteredSummaries;
    const days = new Set(source.map((summary) => summary.batch.batch_date)).size;
    const total = source.reduce((sum, summary) => sum + summary.total, 0);
    const initialBalance = source.reduce(
      (sum, summary) => sum + summary.initialBalance,
      0
    );
    const recoveredAmount = source.reduce(
      (sum, summary) => sum + summary.recoveredAmount,
      0
    );
    const paidContacts = source.reduce(
      (sum, summary) => sum + summary.paidContacts,
      0
    );

    return {
      days,
      total,
      initialBalance,
      recoveredAmount,
      openBalance: Math.max(0, initialBalance - recoveredAmount),
      conversionRate: total ? (paidContacts / total) * 100 : 0,
      recoveryRate: initialBalance
        ? (recoveredAmount / initialBalance) * 100
        : 0
    };
  }, [filteredSummaries]);

  const ownersUsed = useMemo(() => {
    const used = new Set(batches.map((batch) => batch.owner_user_id));
    return owners.filter((owner) => used.has(owner.id));
  }, [batches, owners]);

  function logout() {
    sessionStorage.removeItem(COMMERCIAL_ACCESS_KEY);
    location.href = "/api/logout";
  }

  return (
    <main className="dashboard-shell daily-delinquent-dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTROLE DE INADIMPLENTES</p>
          <h1>Histórico diário</h1>
          <p className="muted daily-subtitle">
            Cada importação diária fica salva como uma carteira. Dias anteriores
            são encerrados automaticamente, sem apagar o histórico.
          </p>
        </div>

        <div className="topbar-actions">
          <ThemeToggle />
          <a className="ghost-btn admin-link" href="/dashboard">
            Voltar ao painel
          </a>
          <button className="ghost-btn" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="daily-history-filters">
        <div>
          <strong>Visão das carteiras</strong>
          <span>
            {session?.role === "admin"
              ? "Administrador · todas as carteiras liberadas"
              : session?.unitName || session?.displayName || "Minha carteira"}
          </span>
        </div>

        <select
          value={unitFilter}
          onChange={(event) => setUnitFilter(event.target.value)}
          aria-label="Filtrar por unidade"
        >
          <option value="Todas">Todas as unidades</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
          aria-label="Filtrar por responsável"
        >
          <option value="Todos">Todos os responsáveis</option>
          {ownersUsed.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.display_name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          aria-label="Filtrar por data"
        />

        {(unitFilter !== "Todas" ||
          ownerFilter !== "Todos" ||
          dateFilter) && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setUnitFilter("Todas");
              setOwnerFilter("Todos");
              setDateFilter("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </section>

      <section className="metrics metrics-six daily-overview-metrics">
        <article>
          <span>Dias registrados</span>
          <strong>{totals.days}</strong>
          <small>carteiras diárias no histórico</small>
        </article>
        <article>
          <span>Importados</span>
          <strong>{totals.total}</strong>
          <small>registros nas carteiras filtradas</small>
        </article>
        <article>
          <span>Saldo inicial</span>
          <strong>{formatCurrency(totals.initialBalance)}</strong>
          <small>valor total das carteiras</small>
        </article>
        <article>
          <span>Recuperado</span>
          <strong>{formatCurrency(totals.recoveredAmount)}</strong>
          <small>{totals.recoveryRate.toFixed(1)}% do saldo</small>
        </article>
        <article>
          <span>Conversão</span>
          <strong>{totals.conversionRate.toFixed(1)}%</strong>
          <small>registros com algum pagamento</small>
        </article>
        <article>
          <span>Saldo aberto</span>
          <strong>{formatCurrency(totals.openBalance)}</strong>
          <small>restante das carteiras</small>
        </article>
      </section>

      <section className="daily-history-layout">
        <div className="daily-batches-panel">
          <div className="daily-section-heading">
            <div>
              <strong>Carteiras por dia</strong>
              <span>
                {filteredSummaries.length} carteira(s) encontrada(s)
              </span>
            </div>
            <span className="live-status">
              <span className="live-dot" aria-hidden="true" />
              Atualização automática
            </span>
          </div>

          <div className="daily-batch-list">
            {loading ? (
              <div className="daily-empty">Carregando histórico...</div>
            ) : filteredSummaries.length ? (
              filteredSummaries.map((summary) => {
                const batch = summary.batch;
                const owner = ownerById.get(batch.owner_user_id);
                const unit = batch.unit_id
                  ? unitById.get(batch.unit_id)
                  : null;
                const state = batchState(batch.batch_date);

                return (
                  <button
                    key={batch.id}
                    type="button"
                    className={
                      selectedSummary?.batch.id === batch.id
                        ? "daily-batch-card active"
                        : "daily-batch-card"
                    }
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <div className="daily-batch-card-top">
                      <div>
                        <strong>{formatDate(batch.batch_date)}</strong>
                        <span>
                          {unit?.name ||
                            unit?.city ||
                            owner?.display_name ||
                            "Carteira"}
                        </span>
                      </div>
                      <span className={`batch-state ${state}`}>
                        {batchStateLabel(batch.batch_date)}
                      </span>
                    </div>

                    <div className="daily-batch-mini-metrics">
                      <span>
                        <b>{summary.total}</b>
                        importados
                      </span>
                      <span>
                        <b>{summary.paidContacts}</b>
                        pagaram
                      </span>
                      <span>
                        <b>{summary.conversionRate.toFixed(1)}%</b>
                        conversão
                      </span>
                    </div>

                    <div className="daily-batch-money">
                      <span>
                        Recuperado
                        <strong>{formatCurrency(summary.recoveredAmount)}</strong>
                      </span>
                      <span>
                        Aberto
                        <strong>{formatCurrency(summary.openBalance)}</strong>
                      </span>
                    </div>

                    <small>
                      Responsável: {owner?.display_name || "—"}
                    </small>
                  </button>
                );
              })
            ) : (
              <div className="daily-empty">
                Nenhuma carteira encontrada com esses filtros.
              </div>
            )}
          </div>
        </div>

        <div className="daily-detail-panel">
          {selectedSummary ? (
            <>
              <div className="daily-detail-header">
                <div>
                  <span className="daily-detail-kicker">
                    CARTEIRA {batchStateLabel(selectedSummary.batch.batch_date).toUpperCase()}
                  </span>
                  <h2>{formatDate(selectedSummary.batch.batch_date)}</h2>
                  <p>
                    {unitById.get(selectedSummary.batch.unit_id || "")?.name ||
                      "Sem unidade vinculada"}
                    {" · "}
                    {ownerById.get(selectedSummary.batch.owner_user_id)
                      ?.display_name || "Responsável não identificado"}
                  </p>
                </div>

                <span
                  className={`batch-state ${batchState(
                    selectedSummary.batch.batch_date
                  )}`}
                >
                  {batchStateLabel(selectedSummary.batch.batch_date)}
                </span>
              </div>

              <section className="daily-detail-metrics">
                <article>
                  <span>Importados</span>
                  <strong>{selectedSummary.total}</strong>
                </article>
                <article>
                  <span>Pagaram</span>
                  <strong>{selectedSummary.paidContacts}</strong>
                </article>
                <article>
                  <span>Quitados</span>
                  <strong>{selectedSummary.fullyPaid}</strong>
                </article>
                <article>
                  <span>Parciais</span>
                  <strong>{selectedSummary.partial}</strong>
                </article>
                <article>
                  <span>Conversão</span>
                  <strong>{selectedSummary.conversionRate.toFixed(1)}%</strong>
                </article>
                <article>
                  <span>Recuperação</span>
                  <strong>{selectedSummary.recoveryRate.toFixed(1)}%</strong>
                </article>
              </section>

              <section className="daily-money-strip">
                <div>
                  <span>Saldo inicial</span>
                  <strong>{formatCurrency(selectedSummary.initialBalance)}</strong>
                </div>
                <div>
                  <span>Valor recuperado</span>
                  <strong className="positive">
                    {formatCurrency(selectedSummary.recoveredAmount)}
                  </strong>
                </div>
                <div>
                  <span>Saldo aberto</span>
                  <strong>{formatCurrency(selectedSummary.openBalance)}</strong>
                </div>
              </section>

              <div className="daily-detail-table-wrap">
                <table className="daily-detail-table">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Fim contrato</th>
                      <th>Saldo inicial</th>
                      <th>Recuperado</th>
                      <th>Aberto</th>
                      <th>Pagamento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item) => {
                      const lead = leadById.get(item.lead_id);
                      const initial = numberValue(item.initial_balance);
                      const recovered = numberValue(item.recovered_amount);

                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{lead?.name || "Aluno"}</strong>
                            <small>{lead?.whatsapp || lead?.email || "—"}</small>
                          </td>
                          <td>{formatDate(item.due_date)}</td>
                          <td>{formatCurrency(initial)}</td>
                          <td className="positive">
                            {formatCurrency(recovered)}
                          </td>
                          <td>
                            {formatCurrency(Math.max(0, initial - recovered))}
                          </td>
                          <td>
                            <span
                              className={`payment-pill ${item.payment_status}`}
                            >
                              {paymentLabel(item.payment_status)}
                            </span>
                          </td>
                          <td>{lead?.status || "—"}</td>
                        </tr>
                      );
                    })}

                    {!selectedItems.length && (
                      <tr>
                        <td colSpan={7} className="daily-empty-table">
                          Nenhum registro nesta carteira.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="daily-detail-empty">
              <strong>Nenhuma carteira selecionada</strong>
              <span>Importe uma carteira diária para iniciar o histórico.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
