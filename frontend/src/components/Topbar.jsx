import { SearchOutlined } from "@ant-design/icons";
import { Input, Tag } from "antd";
import { useAuth } from "../context/AuthContext.jsx";
import { rolDe } from "./Layout.jsx";

// Barra superior de cada página del panel: buscador (el texto lo maneja la página), empresa y rol del usuario.
// Las dos etiquetas usan los colores del tema (no los de antd): empresa resaltada con el color principal, rol en neutro.
export default function Topbar({ busqueda, onBusqueda, placeholder }) {
  const { usuario } = useAuth();
  return (
    <div className="topbar">
      <Input
        className="search"
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        placeholder={placeholder}
      />
      {usuario?.empresa && (
        <Tag className="role-pill role-pill--empresa" variant="outlined">
          {usuario.empresa.toUpperCase()}
        </Tag>
      )}
      <Tag className="role-pill" variant="outlined">
        ROL · {rolDe(usuario).toUpperCase()}
      </Tag>
    </div>
  );
}
