import { LogoutOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Result } from "antd";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

// Pantalla para quien se registró pero todavía no tiene rol: el alta la hacen los dueños del sistema (superadmin).
export default function SinRol({ onSalir }) {
  const { refrescar } = useAuth();
  const [revisando, setRevisando] = useState(false);

  const revisar = async () => {
    setRevisando(true);
    await refrescar();
    setRevisando(false);
  };

  return (
    <main className="main sin-rol">
      <Result
        status="info"
        title="Tu cuenta espera autorización"
        subTitle="Los dueños del sistema tienen que darte el rol de admin para que puedas ver y cargar información."
        extra={[
          <Button key="revisar" type="primary" icon={<ReloadOutlined />} loading={revisando} onClick={revisar}>
            Ya me autorizaron
          </Button>,
          <Button key="salir" icon={<LogoutOutlined />} onClick={onSalir}>
            Cerrar sesión
          </Button>,
        ]}
      />
    </main>
  );
}
