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
  role: "admin" | "commercial" | "user";
  unit_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
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
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [unitName, setUnitName] = useState("");
  const [unitCity, setUnitCity] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "commercial" | "user">("user");
  const [unitId, setUnitId] = useState("");

  const activeUnits = useMemo(
    () => units.filter((unit) => unit.active),
    [units]
  );

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  async function loadData() {
    if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
      location.href = "/login";
      return;
    }

    setLoading(true);

    try {
      const [unitResponse, userResponse] = await Promise.all([
        supabaseRequest(
          "/rest/v1/commercial_units?select=id,name,city,active,created_at&order=name.asc"
        ),
        supabaseRequest(
          "/rest/v1/commercial_users?select=id,username,display_name,role,unit_id,active,last_login_at,created_at&order=created_at.asc"
        )
      ]);

      const [unitRows, userRows] = await Promise.all([
        unitResponse.json() as Promise<Unit[]>,
        userResponse.json() as Promise<CommercialUser[]>
      ]);

      setUnits(unitRows);
      setUsers(userRows);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível carregar o painel."
      );
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

    if (role === "user" && !unitId) {
      setNotice("Selecione uma unidade para o usuário.");
      return;
    }

    try {
      await supabaseRequest("/rest/v1/rpc/commercial_admin_create_user", {
        method: "POST",
        body: JSON.stringify({
          p_username: username,
          p_display_name: displayName,
          p_password: password,
          p_unit_id: unitId || null,
          p_role: role
        })
      });

      setDisplayName("");
      setUsername("");
      setPassword("");
      setRole("user");
      setUnitId("");
      setNotice("Usuário criado com sucesso.");
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

  return (
    <main className="dashboard-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Usuários e unidades</h1>
          <p className="session-line">
            Cada usuário comum visualiza somente os leads vinculados à sua unidade.
          </p>
        </div>

        <div className="topbar-actions">
          <ThemeToggle />
          <a className="ghost-btn admin-link" href="/dashboard">
            Voltar aos leads
          </a>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

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
              <input
                type="password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              Perfil
              <select
                value={role}
                onChange={(event) => {
                  const next = event.target.value as "admin" | "commercial" | "user";
                  setRole(next);
                  if (next !== "user") setUnitId("");
                }}
              >
                <option value="user">Usuário da unidade</option>
                <option value="commercial">Setor Comercial</option>
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
                <th>Perfil</th>
                <th>Unidade</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const unit = user.unit_id ? unitById.get(user.unit_id) : null;
                const normalizedUsername = user.username.toLowerCase();
                const isPrimary = normalizedUsername === "alisson";
                const isCommercialSector = normalizedUsername === "comercial";

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.display_name}</strong>
                      <small>@{user.username}</small>
                    </td>
                    <td>{user.role === "admin" ? "Administrador" : user.role === "commercial" ? "Setor Comercial" : "Usuário"}</td>
                    <td>{unit ? `${unit.name} · ${unit.city}` : "Todas"}</td>
                    <td>
                      <span className={user.active ? "status-pill active" : "status-pill inactive"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString("pt-BR")
                        : "Nunca"}
                    </td>
                    <td>
                      <div className="row-actions">
                        {!isPrimary && !isCommercialSector && (
                          <>
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
                  <td colSpan={6} className="empty">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
