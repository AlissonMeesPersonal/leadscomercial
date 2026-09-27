"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../../../components/ThemeToggle";

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
  status: "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
  owner_user_id: string | null;
  unit_id: string | null;
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

type Summary = {
  batch: Batch;
  total: number;
  contacted: number;
  interested: number;
  paidContacts: number;
  fullyPaid: number;
  partial: number;
  initialBalance: number;
  recoveredAmount: number;
  openBalance: number;
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
    throw new Error("Não foi possível carregar os dados do relatório.");
  }

  return response;
}

function num(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function shortDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function BarChart({
  data,
  valueLabel
}: {
  data: Array<{ label: string; value: number; helper?: string }>;
  valueLabel: (value: number) => string;
}) {
  const max = Math.max(...data.map((row) => row.value), 0);

  return (
    <div className="executive-bar-chart">
      {data.length ? (
        data.map((row) => {
          const width = max > 0 ? Math.max(3, (row.value / max) * 100) : 0;

          return (
            <div className="executive-bar-row" key={row.label}>
              <div className="executive-bar-label">
                <strong>{row.label}</strong>
                {row.helper && <span>{row.helper}</span>}
              </div>
              <div className="executive-bar-track">
                <span style={{ width: `${width}%` }} />
              </div>
              <b>{valueLabel(row.value)}</b>
            </div>
          );
        })
      ) : (
        <div className="executive-empty">Sem dados para este período.</div>
      )}
    </div>
  );
}

function TrendChart({
  data
}: {
  data: Array<{ label: string; recovered: number; rate: number }>;
}) {
  if (!data.length) {
    return <div className="executive-empty">Sem dados para este período.</div>;
  }

  const width = 860;
  const height = 260;
  const paddingX = 44;
  const paddingY = 28;
  const maxRecovered = Math.max(...data.map((row) => row.recovered), 1);
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const points = data.map((row, index) => {
    const x =
      data.length === 1
        ? width / 2
        : paddingX + (index / (data.length - 1)) * usableWidth;
    const y =
      paddingY +
      usableHeight -
      (Math.max(0, row.recovered) / maxRecovered) * usableHeight;

    return { ...row, x, y };
  });

  return (
    <div className="executive-trend-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Evolução diária do valor recuperado"
        className="executive-trend-svg"
      >
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          className="trend-axis"
        />
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          className="trend-line"
        />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5" className="trend-dot" />
            <text
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              className="trend-label"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="executive-trend-legend">
        {data.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{currency(row.recovered)}</strong>
            <small>{pct(row.rate)} recuperação</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DelinquentExecutiveReportPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [unitFilter, setUnitFilter] = useState("Todas");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<DelinquentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [presentationMode, setPresentationMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUnitFilter(params.get("unit") || "Todas");
    setOwnerFilter(params.get("owner") || "Todos");
    setDateFilter(params.get("date") || "");

    async function load() {
      if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
        location.href = "/login";
        return;
      }

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
            "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.asc,created_at.asc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,due_date,created_at&order=created_at.asc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_leads?select=id,name,status,owner_user_id,unit_id&demand_type=eq.delinquent"
          ),
          supabaseRequest(
            "/rest/v1/commercial_users?select=id,username,display_name&deleted_at=is.null"
          ),
          supabaseRequest(
            "/rest/v1/commercial_units?select=id,name,city&active=eq.true"
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
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o relatório."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const leadById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead] as const)),
    [leads]
  );

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  const ownerById = useMemo(
    () => new Map(owners.map((owner) => [owner.id, owner] as const)),
    [owners]
  );

  const itemsByBatch = useMemo(() => {
    const map = new Map<string, DelinquentItem[]>();

    for (const item of items) {
      const rows = map.get(item.batch_id) || [];
      rows.push(item);
      map.set(item.batch_id, rows);
    }

    return map;
  }, [items]);

  const summaries = useMemo<Summary[]>(() => {
    return batches.map((batch) => {
      const rows = itemsByBatch.get(batch.id) || [];
      const initialBalance = rows.reduce(
        (sum, item) => sum + num(item.initial_balance),
        0
      );
      const recoveredAmount = rows.reduce(
        (sum, item) => sum + num(item.recovered_amount),
        0
      );
      const paidContacts = rows.filter(
        (item) => num(item.recovered_amount) > 0
      ).length;
      const fullyPaid = rows.filter(
        (item) => item.payment_status === "paid"
      ).length;
      const partial = rows.filter(
        (item) => item.payment_status === "partial"
      ).length;
      const contacted = rows.filter((item) => {
        const status = leadById.get(item.lead_id)?.status;
        return Boolean(status && status !== "Novo");
      }).length;
      const interested = rows.filter(
        (item) => leadById.get(item.lead_id)?.status === "Interessado"
      ).length;

      return {
        batch,
        total: rows.length,
        contacted,
        interested,
        paidContacts,
        fullyPaid,
        partial,
        initialBalance,
        recoveredAmount,
        openBalance: Math.max(0, initialBalance - recoveredAmount),
        conversionRate: rows.length ? (paidContacts / rows.length) * 100 : 0,
        recoveryRate: initialBalance
          ? (recoveredAmount / initialBalance) * 100
          : 0
      };
    });
  }, [batches, itemsByBatch, leadById]);

  const filtered = useMemo(() => {
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

      if (dateFilter && summary.batch.batch_date !== dateFilter) {
        return false;
      }

      return true;
    });
  }, [summaries, unitFilter, ownerFilter, dateFilter]);

  const totals = useMemo(() => {
    const total = filtered.reduce((sum, row) => sum + row.total, 0);
    const contacted = filtered.reduce((sum, row) => sum + row.contacted, 0);
    const interested = filtered.reduce((sum, row) => sum + row.interested, 0);
    const paidContacts = filtered.reduce(
      (sum, row) => sum + row.paidContacts,
      0
    );
    const fullyPaid = filtered.reduce((sum, row) => sum + row.fullyPaid, 0);
    const initialBalance = filtered.reduce(
      (sum, row) => sum + row.initialBalance,
      0
    );
    const recoveredAmount = filtered.reduce(
      (sum, row) => sum + row.recoveredAmount,
      0
    );

    return {
      days: new Set(filtered.map((row) => row.batch.batch_date)).size,
      total,
      contacted,
      interested,
      paidContacts,
      fullyPaid,
      initialBalance,
      recoveredAmount,
      openBalance: Math.max(0, initialBalance - recoveredAmount),
      contactRate: total ? (contacted / total) * 100 : 0,
      conversionRate: total ? (paidContacts / total) * 100 : 0,
      recoveryRate: initialBalance
        ? (recoveredAmount / initialBalance) * 100
        : 0
    };
  }, [filtered]);

  const daily = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        total: number;
        contacted: number;
        paid: number;
        initial: number;
        recovered: number;
      }
    >();

    for (const summary of filtered) {
      const current = map.get(summary.batch.batch_date) || {
        label: summary.batch.batch_date,
        total: 0,
        contacted: 0,
        paid: 0,
        initial: 0,
        recovered: 0
      };

      current.total += summary.total;
      current.contacted += summary.contacted;
      current.paid += summary.paidContacts;
      current.initial += summary.initialBalance;
      current.recovered += summary.recoveredAmount;
      map.set(summary.batch.batch_date, current);
    }

    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((row) => ({
        ...row,
        conversion: row.total ? (row.paid / row.total) * 100 : 0,
        recovery: row.initial ? (row.recovered / row.initial) * 100 : 0
      }));
  }, [filtered]);

  const unitRanking = useMemo(() => {
    const map = new Map<
      string,
      { name: string; recovered: number; initial: number; total: number }
    >();

    for (const summary of filtered) {
      const key = summary.batch.unit_id || "sem-unidade";
      const unit = summary.batch.unit_id
        ? unitById.get(summary.batch.unit_id)
        : null;
      const current = map.get(key) || {
        name: unit?.name || unit?.city || "Sem unidade",
        recovered: 0,
        initial: 0,
        total: 0
      };

      current.recovered += summary.recoveredAmount;
      current.initial += summary.initialBalance;
      current.total += summary.total;
      map.set(key, current);
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        recoveryRate: row.initial ? (row.recovered / row.initial) * 100 : 0
      }))
      .sort((a, b) => b.recovered - a.recovered);
  }, [filtered, unitById]);

  const periodLabel = useMemo(() => {
    if (!filtered.length) return "Sem período";
    const dates = filtered
      .map((row) => row.batch.batch_date)
      .sort((a, b) => a.localeCompare(b));
    const first = dates[0];
    const last = dates[dates.length - 1];

    return first === last
      ? formatDate(first)
      : `${formatDate(first)} a ${formatDate(last)}`;
  }, [filtered]);

  const scopeLabel = useMemo(() => {
    const parts = [];

    if (unitFilter !== "Todas") {
      parts.push(unitById.get(unitFilter)?.name || "Unidade selecionada");
    } else {
      parts.push("Todas as unidades");
    }

    if (ownerFilter !== "Todos") {
      parts.push(ownerById.get(ownerFilter)?.display_name || "Responsável");
    }

    return parts.join(" · ");
  }, [unitFilter, ownerFilter, unitById, ownerById]);

  const networkUnitCount = useMemo(() => {
    return new Set(
      filtered
        .map((summary) => summary.batch.unit_id)
        .filter((unitId): unitId is string => Boolean(unitId))
    ).size;
  }, [filtered]);

  const funnel = [
    { label: "Importados", value: totals.total },
    { label: "Em contato", value: totals.contacted },
    { label: "Interessados", value: totals.interested },
    { label: "Com pagamento", value: totals.paidContacts },
    { label: "Quitados", value: totals.fullyPaid }
  ];

  function togglePresentation() {
    setPresentationMode((current) => !current);
  }

  function printReport() {
    window.print();
  }

  return (
    <main
      className={
        presentationMode
          ? "dashboard-shell executive-report presentation-mode"
          : "dashboard-shell executive-report"
      }
    >
      <header className="executive-report-header">
        <div className="executive-report-title-block">
          <div className="executive-brand-lockup">
            <div className="executive-brand-mark">
              26<span>FIT</span>
            </div>
            <div className="executive-brand-copy">
              <strong>PORTAL INTERNO</strong>
              <small>Rede 26Fit</small>
            </div>
          </div>

          <div className="executive-report-title-copy">
            <p className="eyebrow">REDE 26FIT · GESTÃO DE INADIMPLÊNCIA</p>
            <h1>Relatório executivo de recuperação</h1>
            <p>
              {periodLabel} · {scopeLabel}
            </p>
          </div>
        </div>

        <div className="executive-report-actions no-print">
          <ThemeToggle />
          <button className="ghost-btn" onClick={togglePresentation}>
            {presentationMode ? "Sair da apresentação" : "Modo apresentação"}
          </button>
          <button className="primary-btn" onClick={printReport}>
            Imprimir / Salvar PDF
          </button>
          <a className="ghost-btn admin-link" href="/dashboard/inadimplentes">
            Voltar
          </a>
        </div>
      </header>

      <div className="executive-network-strip">
        <span>REDE 26FIT</span>
        <i />
        <strong>Operação integrada</strong>
        <i />
        <span>Portal Interno</span>
      </div>

      <section className="executive-print-cover print-only">
        <div className="executive-print-cover-top">
          <div className="executive-brand-mark executive-brand-mark-large">
            26<span>FIT</span>
          </div>
          <div>
            <strong>PORTAL INTERNO</strong>
            <span>Rede 26Fit</span>
          </div>
        </div>

        <div className="executive-print-cover-main">
          <p>GESTÃO COMERCIAL · INADIMPLÊNCIA</p>
          <h2>Relatório executivo de recuperação</h2>
          <span>{periodLabel}</span>
        </div>

        <div className="executive-print-cover-grid">
          <div>
            <span>Escopo</span>
            <strong>{scopeLabel}</strong>
          </div>
          <div>
            <span>Unidades analisadas</span>
            <strong>{networkUnitCount || "—"}</strong>
          </div>
          <div>
            <span>Carteiras / dias</span>
            <strong>{totals.days}</strong>
          </div>
          <div>
            <span>Responsável pelo relatório</span>
            <strong>{session?.displayName || "Portal 26Fit"}</strong>
          </div>
        </div>

        <div className="executive-print-cover-footer">
          <span>Documento gerencial · Uso interno da Rede 26Fit</span>
          <strong>PORTAL 26FIT</strong>
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>

      {loading ? (
        <div className="executive-loading">Gerando relatório...</div>
      ) : (
        <>
          <div className="executive-report-page executive-overview-page">
          <section className="executive-hero">
            <div className="executive-hero-copy">
              <span>VISÃO EXECUTIVA</span>
              <h2>
                {totals.total} registros acompanhados em {totals.days} dia(s)
              </h2>
              <p>
                O Portal 26Fit consolida a atuação das unidades, o trabalho de
                cobrança, o volume recuperado e a evolução das carteiras da rede
                em uma única visão gerencial.
              </p>
            </div>

            <div className="executive-hero-highlight">
              <span>Valor recuperado</span>
              <strong>{currency(totals.recoveredAmount)}</strong>
              <small>
                {pct(totals.recoveryRate)} do saldo inicial de{" "}
                {currency(totals.initialBalance)}
              </small>
            </div>
          </section>

          <section className="executive-kpis">
            <article>
              <span>Importados</span>
              <strong>{totals.total}</strong>
              <small>{totals.days} dia(s) de carteira</small>
            </article>
            <article>
              <span>Em contato</span>
              <strong>{totals.contacted}</strong>
              <small>{pct(totals.contactRate)} da base</small>
            </article>
            <article>
              <span>Com pagamento</span>
              <strong>{totals.paidContacts}</strong>
              <small>{pct(totals.conversionRate)} de conversão</small>
            </article>
            <article>
              <span>Quitados</span>
              <strong>{totals.fullyPaid}</strong>
              <small>pagamento integral</small>
            </article>
            <article>
              <span>Recuperado</span>
              <strong>{currency(totals.recoveredAmount)}</strong>
              <small>{pct(totals.recoveryRate)} do saldo</small>
            </article>
            <article>
              <span>Saldo aberto</span>
              <strong>{currency(totals.openBalance)}</strong>
              <small>valor ainda pendente</small>
            </article>
          </section>

          </div>

          <section className="executive-grid executive-grid-two executive-print-page-start executive-operations-page">
            <article className="executive-card">
              <div className="executive-card-heading">
                <div>
                  <span>FUNIL</span>
                  <h3>Jornada da cobrança</h3>
                </div>
                <small>Do relatório até a quitação</small>
              </div>

              <div className="executive-funnel">
                {funnel.map((step, index) => {
                  const width =
                    totals.total > 0
                      ? Math.max(18, (step.value / totals.total) * 100)
                      : 18;

                  return (
                    <div className="executive-funnel-step" key={step.label}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <b>{step.value}</b>
                      </div>
                      <div className="executive-funnel-track">
                        <i style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="executive-card">
              <div className="executive-card-heading">
                <div>
                  <span>CONVERSÃO DIÁRIA</span>
                  <h3>Quantos registros geraram pagamento</h3>
                </div>
              </div>

              <BarChart
                data={daily.map((row) => ({
                  label: shortDate(row.label),
                  value: row.conversion,
                  helper: `${row.paid}/${row.total} pagaram`
                }))}
                valueLabel={(value) => pct(value)}
              />
            </article>
          </section>

          <section className="executive-card executive-full-card executive-print-page-start executive-evolution-page">
            <div className="executive-card-heading">
              <div>
                <span>EVOLUÇÃO</span>
                <h3>Valor recuperado por dia</h3>
              </div>
              <small>
                A linha mostra quanto cada carteira já recuperou até agora
              </small>
            </div>

            <TrendChart
              data={daily.map((row) => ({
                label: shortDate(row.label),
                recovered: row.recovered,
                rate: row.recovery
              }))}
            />
          </section>

          <section className="executive-grid executive-grid-two executive-print-page-start executive-network-page">
            <article className="executive-card">
              <div className="executive-card-heading">
                <div>
                  <span>UNIDADES</span>
                  <h3>Recuperação financeira</h3>
                </div>
              </div>

              <BarChart
                data={unitRanking.map((row) => ({
                  label: row.name,
                  value: row.recovered,
                  helper: `${row.total} registros · ${pct(row.recoveryRate)} recuperado`
                }))}
                valueLabel={(value) => currency(value)}
              />
            </article>

            <article className="executive-card executive-summary-card">
              <div className="executive-card-heading">
                <div>
                  <span>LEITURA EXECUTIVA</span>
                  <h3>Indicadores do período</h3>
                </div>
              </div>

              <div className="executive-insights">
                <div>
                  <span>Taxa de contato</span>
                  <strong>{pct(totals.contactRate)}</strong>
                  <p>
                    {totals.contacted} de {totals.total} registros já avançaram
                    além do status Novo.
                  </p>
                </div>
                <div>
                  <span>Conversão em pagamento</span>
                  <strong>{pct(totals.conversionRate)}</strong>
                  <p>
                    {totals.paidContacts} registros possuem valor recuperado.
                  </p>
                </div>
                <div>
                  <span>Recuperação financeira</span>
                  <strong>{pct(totals.recoveryRate)}</strong>
                  <p>
                    {currency(totals.recoveredAmount)} recuperados de{" "}
                    {currency(totals.initialBalance)}.
                  </p>
                </div>
              </div>
            </article>
          </section>

          <section className="executive-card executive-full-card executive-table-card executive-print-page-start executive-detail-page">
            <div className="executive-card-heading">
              <div>
                <span>CARTEIRAS</span>
                <h3>Detalhamento por dia</h3>
              </div>
              <small>{filtered.length} carteira(s) no recorte</small>
            </div>

            <div className="executive-table-wrap">
              <table className="executive-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Unidade</th>
                    <th>Responsável</th>
                    <th>Importados</th>
                    <th>Em contato</th>
                    <th>Pagaram</th>
                    <th>Conversão</th>
                    <th>Saldo inicial</th>
                    <th>Recuperado</th>
                    <th>Saldo aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice()
                    .sort((a, b) =>
                      b.batch.batch_date.localeCompare(a.batch.batch_date)
                    )
                    .map((summary) => (
                      <tr key={summary.batch.id}>
                        <td>{formatDate(summary.batch.batch_date)}</td>
                        <td>
                          {summary.batch.unit_id
                            ? unitById.get(summary.batch.unit_id)?.name || "—"
                            : "—"}
                        </td>
                        <td>
                          {ownerById.get(summary.batch.owner_user_id)
                            ?.display_name || "—"}
                        </td>
                        <td>{summary.total}</td>
                        <td>{summary.contacted}</td>
                        <td>{summary.paidContacts}</td>
                        <td>{pct(summary.conversionRate)}</td>
                        <td>{currency(summary.initialBalance)}</td>
                        <td className="positive">
                          {currency(summary.recoveredAmount)}
                        </td>
                        <td>{currency(summary.openBalance)}</td>
                      </tr>
                    ))}

                  {!filtered.length && (
                    <tr>
                      <td colSpan={10} className="executive-empty">
                        Nenhuma carteira encontrada para este recorte.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="executive-report-footer">
            <span>
              Rede 26Fit · Portal Interno · Gestão de Inadimplência ·{" "}
              {new Date().toLocaleString("pt-BR")}
            </span>
            <strong>Documento gerencial 26Fit</strong>
          </footer>
        </>
      )}
    </main>
  );
}
