// Reposo: solo frases neutras (el kiosco no sabe quién está enfrente). Spec §6.
export const FRASES_REPOSO: readonly string[] = [
  "ESTA HORA ES TUYA",
  "CADA REPETICIÓN CUENTA",
  "SUDA HOY, SONRÍE MAÑANA",
  "LA DISCIPLINA VENCE AL TALENTO",
  "NO TE COMPARES, SUPÉRATE",
  "TU ÚNICO RIVAL ERES TÚ",
  "UNA REPETICIÓN MÁS",
  "EL DOLOR DE HOY ES LA FUERZA DE MAÑANA",
  "CONSTANCIA ANTES QUE MOTIVACIÓN",
  "AQUÍ SE VIENE A DARLO TODO",
];

// Fase 1: todavía no existe `saludo`, así que la ficha real saluda siempre con la frase sin
// género. La "@" solo se permite en esta frase.
export const FRASE_BIENVENIDA_NEUTRA = "¡BIENVENID@, ADRENALINER!";

// Saludo de la ficha real según el género del miembro (Fase 2, simplificado: sin frases personalizadas).
// "@" solo existe en FRASE_BIENVENIDA_NEUTRA, que es la que se usa cuando no se conoce el género.
export const FRASE_BIENVENIDO = "¡BIENVENIDO, ADRENALINER!";
export const FRASE_BIENVENIDA = "¡BIENVENIDA, ADRENALINER!";
export const FRASE_CUMPLEANOS = "¡FELIZ CUMPLEAÑOS, ADRENALINER!";
