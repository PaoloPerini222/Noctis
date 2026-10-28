import {
  AlertOutlined,
  AppstoreOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Menu, Tooltip } from "antd";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import usePermisos from "../hooks/usePermisos.js";
import { iniciales } from "../utils/formato.js";
import BotonTema from "./BotonTema.jsx";
import Logo from "./Logo.jsx";
import SinRol from "./SinRol.jsx";

// Secciones del panel: alimentan el menú lateral (escritorio) y la barra inferior (móvil).
export const SECCIONES = [
  { to: "/pendientes", label: "Pendientes", icono: <AlertOutlined /> },
  { to: "/eventos", label: "Eventos", icono: <CalendarOutlined /> },
  { to: "/propuestas", label: "Propuestas", icono: <FileTextOutlined /> },
  { to: "/tareas", label: "Tareas", icono: <CheckSquareOutlined /> },
  { to: "/clientes", label: "Clientes", icono: <TeamOutlined /> },
  { to: "/proveedores", label: "Proveedores", icono: <ShopOutlined /> },
  { to: "/servicios", label: "Servicios", icono: <AppstoreOutlined /> },
  { to: "/equipo", label: "Equipo", icono: <IdcardOutlined /> },
  { to: "/empresas", label: "Empresas", icono: <BankOutlined /> },
];

// Una persona puede tener varios roles: se muestran todos ("Organizador · Coordinador").
export const rolDe = (usuario) =>
  usuario?.roles?.length ? usuario.roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(" · ") : "Sin rol";

// Estilo del círculo con las iniciales del usuario.
const ESTILO_AVATAR = { background: "var(--amber)", color: "var(--on-primary)", fontWeight: 700 };

// Estructura de las páginas privadas: menú lateral fijo en escritorio, cabecera + barra inferior en móvil.
// <Outlet /> es donde React Router dibuja la página activa (Eventos, Clientes, etc.).
export default function Layout() {
  const { usuario, salir } = useAuth();
  const { soloEmpresas, tieneRol, esSuperadmin } = usePermisos();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Sin rol no hay secciones a las que entrar. Empresas es solo del superadmin, y el superadmin
  // (sin un rol de la organizadora) no ve ni entra a las demás secciones.
  const secciones = !tieneRol
    ? []
    : soloEmpresas
      ? SECCIONES.filter((s) => s.to === "/empresas")
      : SECCIONES.filter((s) => s.to !== "/empresas" || esSuperadmin);
  const inicio = soloEmpresas ? "/empresas" : "/eventos";
  if (soloEmpresas && !pathname.startsWith("/empresas")) return <Navigate to="/empresas" replace />;
  if (!esSuperadmin && pathname.startsWith("/empresas")) return <Navigate to="/eventos" replace />;

  const cerrarSesion = () => {
    salir();
    navigate("/login");
  };

  const nombre = usuario?.nombre ?? usuario?.email;

  return (
    <div className="shell">
      <aside className="side">
        <Logo to={inicio} />

        {/* Menú de Ant Design: la sección activa sale de la URL actual. */}
        <Menu
          mode="inline"
          className="menu-lateral"
          selectedKeys={[secciones.find((s) => pathname.startsWith(s.to))?.to ?? pathname]}
          items={secciones.map((s) => ({ key: s.to, icon: s.icono, label: s.label }))}
          onClick={({ key }) => navigate(key)}
        />

        <BotonTema bloque className="boton-tema--side" />

        <div className="me">
          <Avatar style={ESTILO_AVATAR}>{iniciales(usuario?.nombre)}</Avatar>
          <div className="who">
            <b>{nombre}</b>
            <span>{rolDe(usuario)}</span>
          </div>
          <Tooltip title="Cerrar sesión">
            <Button type="text" shape="circle" icon={<LogoutOutlined />} aria-label="Cerrar sesión" onClick={cerrarSesion} />
          </Tooltip>
        </div>
      </aside>

      {/* Cabecera que solo se ve en teléfono. */}
      <div className="mobile-top">
        <Logo to={inicio} />
        <BotonTema />
        <Dropdown
          trigger={["click"]}
          menu={{ items: [{ key: "salir", icon: <LogoutOutlined />, label: "Cerrar sesión", onClick: cerrarSesion }] }}
        >
          <Avatar style={{ ...ESTILO_AVATAR, cursor: "pointer" }} size={40}>
            {iniciales(usuario?.nombre)}
          </Avatar>
        </Dropdown>
      </div>

      {/* Sin rol asignado no hay nada que mostrar: se pide la autorización de la responsable. */}
      {usuario?.roles?.length ? <Outlet /> : <SinRol onSalir={cerrarSesion} />}

      {/* Barra inferior que solo se ve en teléfono. NavLink marca con "on" la sección activa. */}
      <nav className="mobile-nav">
        {secciones.map((s) => (
          <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? "on" : "")}>
            {s.icono}
            {s.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
