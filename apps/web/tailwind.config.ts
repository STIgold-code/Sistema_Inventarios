import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: "var(--fondo)",
        panel: "var(--panel)",
        "panel-alt": "var(--panel-alt)",
        tinta: "var(--tinta)",
        texto: "var(--texto)",
        "texto-sec": "var(--texto-sec)",
        "texto-ter": "var(--texto-ter)",
        borde: "var(--borde)",
        "borde-fuerte": "var(--borde-fuerte)",
        oro: "var(--oro)",
        "oro-osc": "var(--oro-osc)",
        "oro-tenue": "var(--oro-tenue)",
        exito: "var(--exito)",
        peligro: "var(--peligro)",
        info: "var(--info)",
        aviso: "var(--aviso)",
      },
      fontFamily: {
        base: ["var(--fuente-base)", "sans-serif"],
        mono: ["var(--fuente-mono)", "monospace"],
      },
      boxShadow: {
        suave: "var(--sombra)",
        media: "var(--sombra-md)",
      },
    },
  },
  plugins: [],
};

export default config;
