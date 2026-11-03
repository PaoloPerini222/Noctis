import { SearchOutlined } from "@ant-design/icons";
import { Input, Tag } from "antd";
import { useAuth } from "../context/AuthContext.jsx";

// Barra superior de cada página del panel: buscador (el texto lo maneja la página) y la empresa del usuario.
// La etiqueta usa los colores del tema (no los de antd): la empresa resaltada con el color principal.
export default function Topbar({ busqueda, onBusqueda, placeholder, deshabilitado = false }) {
  const { usuario } = useAuth();
  return (
    <div className="topbar">
      <Input
        className="search"
        size="large"
        allowClear
        disabled={deshabilitado}
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
    </div>
  );
}
