import { alpha, createTheme, darken, getContrastRatio, lighten } from "@mui/material/styles";

/**
 * Sistema visual de la plataforma: minimalista, con mucho aire, tipografía protagonista y
 * superficies neutras. El color de marca (configurable desde el panel) se usa como acento —
 * botones principales, selección y estados — nunca como fondo de grandes superficies.
 *
 * Todos los componentes heredan de aquí: las páginas no deberían definir sombras, radios ni
 * tipografías propias.
 */
export const TOKENS = {
  tinta: "#111111",
  tintaSuave: "#5C5C5C",
  tintaTenue: "#8A8A8A",
  fondo: "#FAFAF8",
  superficie: "#FFFFFF",
  superficieSuave: "#F3F3F0",
  borde: "#E7E7E3",
  radio: 10,
  radioGrande: 16,
  anchoContenido: 1180,
};

const FUENTE = "'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif";

export const BLANCO = "#FFFFFF";
export const NEGRO = "#111111";

/** Texto pequeño sobre un fondo de color: blanco o negro, el que más contraste dé. Sobre el
 * verde de SIGRA (#7f9136) gana el negro (6:1 frente a 3,5:1 del blanco). */
export function textoLegibleSobre(fondo: string): string {
  return getContrastRatio(fondo, BLANCO) >= getContrastRatio(fondo, NEGRO) ? BLANCO : NEGRO;
}

/** Texto grande o en negrita (títulos, íconos): basta un contraste de 3:1 (WCAG), así el
 * blanco se puede usar sobre verdes medios y combinar con el negro de los textos pequeños. */
export function textoGrandeSobre(fondo: string): string {
  return getContrastRatio(fondo, BLANCO) >= 3 ? BLANCO : NEGRO;
}

/** Tonos suaves y opacos (sólidos, no transparentes) derivados del color de marca, para
 * superficies como las tarjetas sin foto o el bloque de disponibilidad. */
export function tonosSuaves(color: string) {
  return {
    fondo: lighten(color, 0.86),
    fondoMedio: lighten(color, 0.72),
    texto: darken(color, 0.38),
  };
}

export function createAppTheme(colorPrimario?: string | null, colorSecundario?: string | null) {
  const primario = colorPrimario || "#1F3A5F";
  const secundario = colorSecundario || "#2E6DA4";

  return createTheme({
    palette: {
      // El texto de botones y chips de color se elige por contraste real (no por el umbral
      // por defecto de MUI, que pondría blanco poco legible sobre verdes medios).
      primary: { main: primario, contrastText: textoLegibleSobre(primario) },
      secondary: { main: secundario, contrastText: textoLegibleSobre(secundario) },
      text: { primary: TOKENS.tinta, secondary: TOKENS.tintaSuave },
      divider: TOKENS.borde,
      background: { default: TOKENS.fondo, paper: TOKENS.superficie },
      success: { main: "#2E7D4F" },
      warning: { main: "#B7791F" },
      error: { main: "#C0392B" },
    },
    shape: { borderRadius: TOKENS.radio },
    typography: {
      fontFamily: FUENTE,
      h1: { fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05 },
      h2: { fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1 },
      h3: { fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.15 },
      h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.9rem", lineHeight: 1.2 },
      h5: { fontWeight: 650, letterSpacing: "-0.015em" },
      h6: { fontWeight: 650, letterSpacing: "-0.01em", fontSize: "1.1rem" },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600, letterSpacing: "0.01em" },
      body1: { lineHeight: 1.65 },
      body2: { lineHeight: 1.6 },
      overline: { fontWeight: 600, letterSpacing: "0.12em", fontSize: "0.72rem" },
      button: { fontWeight: 600, textTransform: "none", letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: TOKENS.fondo,
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          },
          "::selection": { backgroundColor: alpha(primario, 0.18) },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "inherit" },
        styleOverrides: {
          root: {
            backgroundColor: alpha(TOKENS.superficie, 0.92),
            backdropFilter: "saturate(180%) blur(12px)",
            borderBottom: `1px solid ${TOKENS.borde}`,
            color: TOKENS.tinta,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 18, minHeight: 40 },
          sizeSmall: { minHeight: 32, paddingInline: 12 },
          sizeLarge: { minHeight: 48, paddingInline: 26, fontSize: "1rem" },
          outlined: { borderColor: TOKENS.borde, "&:hover": { borderColor: TOKENS.tinta, backgroundColor: "transparent" } },
          text: { "&:hover": { backgroundColor: alpha(TOKENS.tinta, 0.04) } },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { "&:hover": { backgroundColor: alpha(TOKENS.tinta, 0.05) } } },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none" },
          outlined: { borderColor: TOKENS.borde, borderRadius: TOKENS.radioGrande },
        },
      },
      MuiCard: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            borderRadius: TOKENS.radioGrande,
            borderColor: TOKENS.borde,
            transition: "border-color .2s ease, box-shadow .2s ease, transform .2s ease",
          },
        },
      },
      MuiCardContent: { styleOverrides: { root: { padding: 24, "&:last-child": { paddingBottom: 24 } } } },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: TOKENS.radioGrande, boxShadow: "0 24px 64px rgba(17,17,17,.18)" } },
      },
      MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: "1.2rem", padding: "22px 24px 8px" } } },
      MuiDialogContent: { styleOverrides: { root: { padding: "8px 24px 16px" } } },
      MuiDialogActions: { styleOverrides: { root: { padding: "8px 24px 20px", gap: 8 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: TOKENS.radio,
            backgroundColor: TOKENS.superficie,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: TOKENS.borde },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: TOKENS.tintaTenue },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 500 },
          outlined: { borderColor: TOKENS.borde },
          sizeSmall: { height: 24, fontSize: "0.75rem" },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: TOKENS.radio, alignItems: "center" } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: TOKENS.borde, paddingTop: 12, paddingBottom: 12 },
          head: {
            fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em",
            color: TOKENS.tintaSuave, backgroundColor: TOKENS.superficieSuave,
          },
        },
      },
      MuiTableRow: { styleOverrides: { hover: { "&:hover": { backgroundColor: `${TOKENS.fondo} !important` } } } },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 44 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: TOKENS.radio,
            marginInline: 8,
            marginBlock: 2,
            // Texto del ítem activo en una versión oscura del color de marca: el verde medio
            // sobre su propio tinte claro no alcanza un contraste cómodo de lectura.
            "&.Mui-selected": { backgroundColor: alpha(primario, 0.12), color: darken(primario, 0.35), fontWeight: 600 },
            "&.Mui-selected .MuiListItemIcon-root": { color: darken(primario, 0.35) },
            "&.Mui-selected:hover": { backgroundColor: alpha(primario, 0.18) },
          },
        },
      },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 38, color: TOKENS.tintaSuave } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: TOKENS.tinta, fontSize: "0.75rem", borderRadius: 8 } } },
      MuiSwitch: { defaultProps: { color: "primary" } },
      MuiLink: { defaultProps: { underline: "hover" }, styleOverrides: { root: { fontWeight: 500 } } },
    },
  });
}
