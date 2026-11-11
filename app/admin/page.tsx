"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";

type Unit = {
  id: string;
  name: string;
  city: string;
  active: boolean;
  created_at: string;
};

type CommercialUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "commercial" | "coordinator" | "user";
  unit_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
};

type LeadActivity = {
  owner_user_id: string | null;
  demand_type: "opportunity" | "delinquent" | "inactive";
  status: "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
  source: string;
  created_at: string;
};

type UserLeadStats = {
  total: number;
  imported: number;
  evo: number;
  opportunities: number;
  delinquents: number;
  inactives: number;
  converted: number;
  newestLeadAt: string | null;
};

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const access = sessionStorage.getItem(COMMERCIAL_ACCESS_KEY);

  if (!access) {
    throw new Error("Sua sessão de dados expirou. Entre novamente.");
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("x-client-info", access);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(SUPABASE_URL + path, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = "Não foi possível concluir a operação.";

    try {
      const parsed = JSON.parse(raw);
      message = parsed?.message || parsed?.details || message;
    } catch {}

    throw new Error(message);
  }

  return response;
}

export default function AdminPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<CommercialUser[]>([]);
  const [leadActivity, setLeadActivity] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [unitName, setUnitName] = useState("");
  const [unitCity, setUnitCity] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [temporaryCredential, setTemporaryCredential] = useState<{ username:string; password:string } | null>(null);
  const [adminAccess, setAdminAccess] = useState<"checking" | "verified" | "relogin" | "denied">("checking");
  const [adminAccessMessage, setAdminAccessMessage] = useState("");

  useEffect(() => {
    if (temporaryCredential) {
      document.getElementById("temporary-credentials")?.scrollIntoView({
        behavior: "smooth", block: "center"
      });
    }
  }, [temporaryCredential]);
  const [role, setRole] = useState<"admin" | "commercial" | "coordinator" | "user">("user");
  const [unitId, setUnitId] = useState("");

  const activeUnits = useMemo(
    () => units.filter((unit) => unit.active),
    [units]
  );

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  const userStats = useMemo(() => {
    const stats = new Map<string, UserLeadStats>();

    for (const user of users) {
      stats.set(user.id, {
        total: 0,
        imported: 0,
        evo: 0,
        opportunities: 0,
        delinquents: 0,
        inactives: 0,
        converted: 0,
        newestLeadAt: null
      });
    }

    for (const lead of leadActivity) {
      if (!lead.owner_user_id) continue;

      const current = stats.get(lead.owner_user_id);
      if (!current) continue;

      current.total += 1;

      if ((lead.source || "").startsWith("EVO ·")) {
        current.evo += 1;
      } else {
        current.imported += 1;
      }

      if (lead.demand_type === "opportunity") {
        current.opportunities += 1;
      } else if (lead.demand_type === "delinquent") {
        current.delinquents += 1;
      } else {
        current.inactives += 1;
      }

      if (lead.status === "Convertido") {
        current.converted += 1;
      }

      if (
        !current.newestLeadAt ||
        new Date(lead.created_at).getTime() >
          new Date(current.newestLeadAt).getTime()
      ) {
        current.newestLeadAt = lead.created_at;
      }
    }

    return stats;
  }, [users, leadActivity]);

  const adminTotals = useMemo(() => {
    const totalLeads = leadActivity.length;
    const imported = leadActivity.filter(
      (lead) => !(lead.source || "").startsWith("EVO ·")
    ).length;
    const evo = totalLeads - imported;

    return {
      activeUsers: users.filter((user) => user.active).length,
      totalLeads,
      imported,
      evo
    };
  }, [users, leadActivity]);

  async function restartAdminLogin() {
    sessionStorage.removeItem(COMMERCIAL_ACCESS_KEY);
    await fetch("/api/logout", { method:"POST" }).catch(() => undefined);
    location.replace("/login");
  }

  async function loadData() {
    setLoading(true);
    setAdminAccess("checking");
    try {
      const sessionResponse = await fetch("/api/admin/access-check", {cache:"no-store"});
      const check = await sessionResponse.json() as {
        authorized?:boolean; username?:string; reason?:string
      };
      if (!sessionResponse.ok || !check.authorized) {
        setAdminAccess(check.reason==="database_role_mismatch" || check.reason==="session_not_admin" ? "denied" : "relogin");
        setAdminAccessMessage(
          check.reason==="database_role_mismatch" || check.reason==="session_not_admin"
            ? "A sessão atual não possui o perfil Administrador confirmado no banco. Entre com sua conta administrativa ou revise o perfil cadastrado."
            : "Sua sessão administrativa precisa ser atualizada. Entre novamente com a conta Administrador."
        );
        setUnits([]); setUsers([]); setLeadActivity([]);
        return;
      }
      if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
        setAdminAccess("relogin");
        setAdminAccessMessage("O token de dados não está disponível. Entre novamente com sua conta administrativa.");
        setUnits([]); setUsers([]); setLeadActivity([]);
        return;
      }

      const [unitResponse, userResponse, leadResponse] = await Promise.all([
        supabaseRequest("/rest/v1/commercial_units?select=id,name,city,active,created_at&order=name.asc"),
        supabaseRequest("/rest/v1/commercial_users?select=id,username,display_name,role,unit_id,active,last_login_at,created_at&deleted_at=is.null&order=created_at.asc"),
        supabaseRequest("/rest/v1/commercial_leads?select=owner_user_id,demand_type,status,source,created_at&order=created_at.desc")
      ]);
      const [unitRows, userRows, leadRows] = await Promise.all([
        unitResponse.json() as Promise<Unit[]>,
        userResponse.json() as Promise<CommercialUser[]>,
        leadResponse.json() as Promise<LeadActivity[]>
      ]);

      const ownAccount=userRows.find(user=>user.username.toLowerCase()===check.username?.toLowerCase());
      if (!ownAccount || ownAccount.role!=="admin" || !ownAccount.active) {
        setAdminAccess("relogin");
        setAdminAccessMessage("O token de dados do navegador não corresponde à conta administradora. Faça login novamente para renovar as credenciais.");
        setUnits([]); setUsers([]); setLeadActivity([]);
        return;
      }

      setUnits(unitRows);
      setUsers(userRows);
      setLeadActivity(leadRows);
      setAdminAccess("verified");
      setAdminAccessMessage("");
      setNotice("");
    } catch (err) {
      setAdminAccess("relogin");
      setAdminAccessMessage(err instanceof Error ? err.message : "Não foi possível validar o acesso administrativo.");
      setUnits([]); setUsers([]); setLeadActivity([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createUnit(event: FormEvent) {
    event.preventDefault();
    setNotice("");

    try {
      await supabaseRequest("/rest/v1/rpc/commercial_admin_create_unit", {
        method: "POST",
        body: JSON.stringify({
          p_name: unitName,
          p_city: unitCity
        })
      });

      setUnitName("");
      setUnitCity("");
      setNotice("Unidade criada com sucesso.");
      await loadData();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível criar a unidade."
      );
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setTemporaryCredential(null);

    if (role === "user" && !unitId) {
      setNotice("Selecione uma unidade para o usuário.");
      return;
    }

    try {
      const setupCheck=await fetch("/api/admin/password-activation",{cache:"no-store"});
      if(!setupCheck.ok) {
        const checkData=await setupCheck.json().catch(()=>({})) as {error?:string};
        throw new Error(checkData.error || "Ative o sistema de senhas provisórias no Supabase antes de criar usuários.");
      }
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const tempPassword = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
      await supabaseRequest("/rest/v1/rpc/commercial_admin_create_user", {
        method: "POST",
        body: JSON.stringify({
          p_username: username,
          p_display_name: displayName,
          p_password: tempPassword,
          p_unit_id: unitId || null,
          // Usa a rotina de criação já existente e ativa o perfil gerencial
          // somente depois da validação do administrador no servidor.
          p_role: role === "coordinator" ? "commercial" : role
        })
      });

      if (role === "coordinator") {
        const response = await fetch("/api/admin/promote-coordinator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username })
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as {error?:string};
          throw new Error(data.error || "Conta criada, mas não foi possível ativar a permissão de coordenadora.");
        }
      }

      const setupResponse = await fetch("/api/admin/password-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      if (!setupResponse.ok) {
        const result = await setupResponse.json().catch(() => ({})) as {error?:string};
        throw new Error("Conta criada, mas a ativação da senha falhou: " + (result.error || "verifique o Supabase") + ". Não entregue a senha até corrigir a ativação.");
      }

      setTemporaryCredential({ username, password: tempPassword });
      setDisplayName("");
      setUsername("");
      setRole("user");
      setUnitId("");
      setNotice(role === "coordinator" ? "Coordenadora Comercial criada! Ela poderá acessar somente o painel gerencial." : "Usuário criado com sucesso.");
      await loadData();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível criar o usuário."
      );
    }
  }

  async function toggleUser(user: CommercialUser) {
    setNotice("");

    try {
      await supabaseRequest("/rest/v1/rpc/commercial_admin_set_user_active", {
        method: "POST",
        body: JSON.stringify({
          p_user_id: user.id,
          p_active: !user.active
        })
      });

      setNotice(
        user.active ? "Usuário desativado." : "Usuário reativado."
      );
      await loadData();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível alterar o usuário."
      );
    }
  }

  async function resetPassword(user: CommercialUser) {
    const nextPassword = window.prompt(
      `Digite a nova senha para ${user.display_name}. Mínimo de 8 caracteres.`
    );

    if (!nextPassword) return;

    setNotice("");

    try {
      await supabaseRequest("/rest/v1/rpc/commercial_admin_reset_password", {
        method: "POST",
        body: JSON.stringify({
          p_user_id: user.id,
          p_password: nextPassword
        })
      });

      setNotice("Senha atualizada. As sessões antigas desse usuário perderam o acesso ao banco.");
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível alterar a senha."
      );
    }
  }


  async function reissueCoordinatorAccess(user: CommercialUser) {
    if (!user.active || user.role !== "coordinator") return;
    if (!window.confirm(
      `Gerar uma NOVA senha provisória para ${user.display_name} (@${user.username})? A senha anterior deixará de funcionar e ela deverá definir uma nova.`
    )) return;

    setNotice("");
    setTemporaryCredential(null);
    try {
      const setupCheck = await fetch("/api/admin/password-activation", {cache:"no-store"});
      if (!setupCheck.ok) throw new Error("Configure a tabela de ativação de senhas no Supabase.");

      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const temporaryPassword = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");

      await supabaseRequest("/rest/v1/rpc/commercial_admin_reset_password", {
        method: "POST",
        body: JSON.stringify({p_user_id:user.id,p_password:temporaryPassword})
      });

      const response = await fetch("/api/admin/reissue-coordinator", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({userId:user.id})
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as {error?:string};
        throw new Error("Senha substituída, mas o cadastro obrigatório não foi confirmado. " +
          (data.error || "Verifique o Supabase.") + " Não entregue a senha.");
      }
      setTemporaryCredential({username:user.username,password:temporaryPassword});
      setNotice("Acesso provisório gerado para " + user.display_name + ". Copie os dados abaixo.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível gerar o acesso provisório.");
    }
  }

  async function deleteUser(user: CommercialUser) {
    const confirmed = window.confirm(
      `Excluir o usuário "${user.display_name}" (@${user.username})?\\n\\nO cadastro será arquivado para possível restauração pelo gestor Alisson. Os leads do usuário serão preservados.`
    );
    if (!confirmed) return;
    setNotice("");
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-user", userId: user.id })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o usuário.");
      setNotice(`Usuário ${user.display_name} excluído e registrado no histórico.`);
      await loadData();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível excluir o usuário.");
    }
  }
  return (
    <main className="dashboard-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Usuários e unidades</h1>
          <p className="session-line">
            Controle de acessos, unidades e volume de leads por usuário.
          </p>
        </div>

        <div className="topbar-actions">
          <ThemeToggle />
          <button
            className="ghost-btn"
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar dados"}
          </button>
          <a className="ghost-btn admin-link" href="/dashboard">
            Voltar aos leads
          </a>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      {adminAccess !== "verified" && (
        <section className="admin-access-warning" role="alert">
          <strong>{adminAccess === "checking" ? "Validando acesso administrativo..." : "Acesso administrativo não confirmado"}</strong>
          {adminAccess !== "checking" && (
            <>
              <p>{adminAccessMessage}</p>
              <button className="primary-btn" type="button" onClick={() => void restartAdminLogin()}>
                Entrar novamente como Administrador
              </button>
            </>
          )}
        </section>
      )}
      {adminAccess === "verified" && (
      <>
      <section className="metrics admin-metrics">
        <article>
          <span>Usuários ativos</span>
          <strong>{adminTotals.activeUsers}</strong>
        </article>
        <article>
          <span>Leads cadastrados</span>
          <strong>{adminTotals.totalLeads}</strong>
        </article>
        <article>
          <span>Leads importados</span>
          <strong>{adminTotals.imported}</strong>
        </article>
        <article>
          <span>Entradas automáticas EVO</span>
          <strong>{adminTotals.evo}</strong>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <div className="admin-card-head">
            <div>
              <p className="eyebrow">UNIDADES</p>
              <h2>Criar unidade</h2>
            </div>
            <span className="admin-count">{units.length}</span>
          </div>

          <form className="admin-form" onSubmit={createUnit}>
            <label>
              Nome da unidade
              <input
                value={unitName}
                onChange={(event) => setUnitName(event.target.value)}
                placeholder="Ex.: Santa Cruz"
                required
              />
            </label>

            <label>
              Cidade dos leads
              <input
                value={unitCity}
                onChange={(event) => setUnitCity(event.target.value)}
                placeholder="Ex.: Santa Cruz do Sul"
                required
              />
            </label>

            <button className="primary-btn" type="submit">
              Criar unidade
            </button>
          </form>

          <div className="admin-list">
            {units.map((unit) => (
              <div className="admin-list-row" key={unit.id}>
                <div>
                  <strong>{unit.name}</strong>
                  <small>{unit.city}</small>
                </div>
                <span className={unit.active ? "status-pill active" : "status-pill inactive"}>
                  {unit.active ? "Ativa" : "Inativa"}
                </span>
              </div>
            ))}

            {!loading && !units.length && (
              <div className="empty">Nenhuma unidade criada.</div>
            )}
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-card-head">
            <div>
              <p className="eyebrow">USUÁRIOS</p>
              <h2>Criar acesso</h2>
            </div>
            <span className="admin-count">{users.length}</span>
          </div>

          <form className="admin-form" onSubmit={createUser}>
            <label>
              Nome
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ex.: João Silva"
                required
              />
            </label>

            <label>
              Usuário
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Ex.: comercial.cascavel"
                autoComplete="off"
                required
              />
            </label>

            <label>
              Senha inicial
              <p className="admin-role-help">Uma senha provisória forte será gerada automaticamente após criar a conta. O usuário precisará trocá-la no primeiro acesso.</p>
            </label>

            <label>
              Perfil
              <select
                value={role}
                onChange={(event) => {
                  const next = event.target.value as "admin" | "commercial" | "coordinator" | "user";
                  setRole(next);
                  if (next !== "user") setUnitId("");
                }}
              >
                <option value="user">Usuário da unidade</option>
                <option value="commercial">Setor Comercial</option>
                <option value="coordinator">Coordenadora Comercial (somente relatórios)</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <label>
              Unidade
              <select
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                required={role === "user"}
              >
                <option value="">
                  {role === "user" ? "Selecione a unidade" : "Todas as unidades"}
                </option>
                {activeUnits.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name} · {unit.city}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-btn" type="submit">
              Criar usuário
            </button>
          </form>
          {temporaryCredential && (
            <div id="temporary-credentials" className="temporary-credentials" role="status">
              <strong>Conta criada — acesso provisório</strong>
              <div className="temporary-credentials-copy">
                <p>Leads: https://leadscomercial.vercel.app/login</p>
                <p>Usuário: {temporaryCredential.username}</p>
                <p>Senha provisória: {temporaryCredential.password}</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => {
                const accessMessage =
                  `Leads: https://leadscomercial.vercel.app/login\n` +
                  `Usuário: ${temporaryCredential.username}\n` +
                  `Senha provisória: ${temporaryCredential.password}`;
                void navigator.clipboard.writeText(accessMessage)
                  .then(() => setNotice("Dados de acesso copiados."))
                  .catch(() => setNotice("Não foi possível copiar automaticamente. Selecione o texto exibido."));
              }}>Copiar dados de acesso</button>
              <small>Compartilhe por canal seguro. Esta senha aparece apenas nesta criação e será obrigatoriamente trocada.</small>
            </div>
          )}
        </article>
      </section>

      <section className="leads-card admin-users-card">
        <div className="admin-card-head table-title">
          <div>
            <p className="eyebrow">ACESSOS CADASTRADOS</p>
            <h2>Usuários</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil / Unidade</th>
                <th>Status</th>
                <th>Acesso</th>
                <th>Leads</th>
                <th>Demandas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const unit = user.unit_id ? unitById.get(user.unit_id) : null;
                const normalizedUsername = user.username.toLowerCase();
                const isPrimary = normalizedUsername === "alisson";
                const isCommercialSector = normalizedUsername === "comercial";
                const stats = userStats.get(user.id) || {
                  total: 0,
                  imported: 0,
                  evo: 0,
                  opportunities: 0,
                  delinquents: 0,
                  converted: 0,
                  newestLeadAt: null
                };

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.display_name}</strong>
                      <small>@{user.username}</small>
                    </td>
                    <td>
                      <strong>
                        {user.role === "admin"
                          ? "Administrador"
                          : user.role === "commercial"
                            ? "Setor Comercial"
                            : user.role === "coordinator"
                              ? "Coordenadora Comercial"
                            : "Usuário"}
                      </strong>
                      <small>
                        {unit ? `${unit.name} · ${unit.city}` : "Todas as unidades"}
                      </small>
                    </td>
                    <td>
                      <span className={user.active ? "status-pill active" : "status-pill inactive"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="admin-access-cell">
                      <strong>
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString("pt-BR")
                          : "Nunca acessou"}
                      </strong>
                      <small>
                        Criado em {new Date(user.created_at).toLocaleDateString("pt-BR")}
                      </small>
                    </td>
                    <td className="admin-stat-cell">
                      <strong>{stats.total}</strong>
                      <small>
                        {stats.imported} importados · {stats.evo} EVO
                      </small>
                      {stats.newestLeadAt && (
                        <small>
                          Última entrada: {new Date(stats.newestLeadAt).toLocaleString("pt-BR")}
                        </small>
                      )}
                    </td>
                    <td className="admin-stat-cell">
                      <strong>{stats.opportunities} oportunidades</strong>
                      <small>
                        {stats.delinquents} inadimplentes · {stats.inactives} inativos
                      </small>
                      <small>{stats.converted} convertidos/reativados</small>
                    </td>
                    <td>
                      <div className="row-actions">
                        {!isPrimary && !isCommercialSector && (
                          <>
                            {user.role === "coordinator" && user.active && (
                              <button
                                className="secondary-btn compact-action"
                                type="button"
                                onClick={() => void reissueCoordinatorAccess(user)}
                                title="Gerar outra senha provisória para a coordenadora">
                                Gerar acesso provisório
                              </button>
                            )}
                            <button
                              className="secondary-btn compact-action"
                              type="button"
                              onClick={() => void resetPassword(user)}
                            >
                              Nova senha
                            </button>
                            <button
                              className={user.active ? "delete-btn" : "wa-btn compact-action"}
                              type="button"
                              onClick={() => void toggleUser(user)}
                            >
                              {user.active ? "Desativar" : "Reativar"}
                            </button>
                            <button
                              className="delete-btn compact-action"
                              type="button"
                              onClick={() => void deleteUser(user)}
                              title="Excluir este usuário"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                        {isPrimary && <small>Administrador principal</small>}
                        {isCommercialSector && <small>Acesso fixo do Setor Comercial</small>}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && !users.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
    </main>
  );
}
