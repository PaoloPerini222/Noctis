// Configuración de Ant Design para cada tema (claro u oscuro).
// Traduce nuestra paleta (los colores de styles/base.css) a los "tokens" de antd, para que los
// botones, tablas, formularios, etc. se vean como el resto de la app.
// Si cambiás un color en base.css, cambialo también acá (son los mismos valores).
import { theme } from "antd";

const FUENTE = '"Philosopher", Georgia, serif'; // texto corrido; los títulos y botones usan Cinzel (ver antd.css)

// Valores comunes a los dos temas.
const base = {
  fontFamily: FUENTE,
  fontSize: 15,
  borderRadius: 12,
  controlHeight: 42,
  motionDurationMid: "0.2s",
};

const oscuro = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...base,
    colorPrimary: "#d6303f", // rojo Ares
    colorInfo: "#7ba2b4",
    colorSuccess: "#8fa86a",
    colorWarning: "#d4a24a",
    colorError: "#ff6b7a",
    colorBgBase: "#0d0506",
    colorTextBase: "#f6ebe8",
    colorBgContainer: "rgba(20, 5, 8, 0.62)", // cristal casi negro con tinte rojo
    colorBgElevated: "#1d0a0d", // menús desplegables y ventanas
    colorBorder: "rgba(224, 72, 90, 0.50)",
    colorBorderSecondary: "rgba(224, 72, 90, 0.30)",
    colorTextPlaceholder: "rgba(255, 244, 241, 0.6)",
    colorTextSecondary: "rgba(255, 244, 241, 0.88)",
    colorTextTertiary: "rgba(255, 244, 241, 0.72)",
    colorTextDescription: "rgba(255, 244, 241, 0.78)",
  },
  components: {
    Button: { primaryColor: "#fff3f1", fontWeight: 700 },
    Table: {
      headerBg: "transparent",
      headerColor: "#e0c8c4",
      rowHoverBg: "rgba(214, 48, 63, 0.12)",
      borderColor: "rgba(224, 72, 90, 0.22)",
    },
    Modal: { contentBg: "rgba(18, 5, 8, 0.92)", headerBg: "transparent" },
    Segmented: { trackBg: "rgba(214, 48, 63, 0.12)", itemSelectedBg: "#d6303f", itemSelectedColor: "#fff3f1" },
    Menu: { itemBg: "transparent", itemSelectedBg: "#d6303f", itemSelectedColor: "#fff3f1", itemHoverBg: "rgba(214, 48, 63, 0.16)" },
    Collapse: { headerBg: "transparent", contentBg: "transparent" },
    Card: { colorBgContainer: "rgba(20, 5, 8, 0.62)" },
  },
};

const claro = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...base,
    colorPrimary: "#e3b324", // amarillo mostaza
    colorInfo: "#5d6f78",
    colorSuccess: "#6b7a2a",
    colorWarning: "#b0701a",
    colorError: "#b5472f",
    colorBgBase: "#f4efe0",
    colorTextBase: "#2a261b",
    colorBgContainer: "rgba(255, 252, 240, 0.65)", // cristal hueso
    colorBgElevated: "#fbf8ee",
    colorBorder: "rgba(60, 48, 20, 0.26)",
    colorBorderSecondary: "rgba(60, 48, 20, 0.14)",
    colorTextPlaceholder: "rgba(42, 38, 27, 0.58)",
    colorTextSecondary: "rgba(42, 38, 27, 0.88)",
    colorTextTertiary: "rgba(42, 38, 27, 0.72)",
    colorTextDescription: "rgba(42, 38, 27, 0.78)",
  },
  components: {
    Button: { primaryColor: "#2a261b", fontWeight: 700 },
    Table: {
      headerBg: "transparent",
      headerColor: "#5a533f",
      rowHoverBg: "rgba(227, 179, 36, 0.12)",
      borderColor: "rgba(60, 48, 20, 0.12)",
    },
    Modal: { contentBg: "rgba(252, 249, 238, 0.92)", headerBg: "transparent" },
    Segmented: { trackBg: "rgba(60, 48, 20, 0.07)", itemSelectedBg: "#e3b324", itemSelectedColor: "#2a261b" },
    Menu: { itemBg: "transparent", itemSelectedBg: "#e3b324", itemSelectedColor: "#2a261b", itemHoverBg: "rgba(60, 48, 20, 0.07)" },
    Collapse: { headerBg: "transparent", contentBg: "transparent" },
    Card: { colorBgContainer: "rgba(255, 252, 240, 0.65)" },
  },
};

// Devuelve la configuración de antd para "light" o "dark".
export const temaAnt = (tema) => (tema === "light" ? claro : oscuro);
