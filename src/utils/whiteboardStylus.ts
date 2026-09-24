/**
 * Utilitários Genéricos de Entrada para Canetas, Stylus e Mesas Digitalizadoras (W3C Pointer Events API).
 * Arquitetura agnóstica a fabricante:
 * - Huawei MatePad + Huawei M-Pencil (Prioridade Primária de Hardware)
 * - Mesas digitalizadoras desktop (Wacom, Huion, XP-Pen, Gaomon, Veikk)
 * - Samsung Galaxy Tab + S Pen
 * - iPad + Apple Pencil
 * - Microsoft Surface + Surface Pen
 */

export interface GenericPointerLike {
  pointerType: string;
  pressure?: number;
  buttons?: number;
  button?: number;
  tiltX?: number;
  tiltY?: number;
  pointerId?: number;
  width?: number;
  height?: number;
  type?: string;
}

export interface StylusDiagnostics {
  eventType: string;
  pointerType: string;
  pointerId: number;
  pressure: number;
  buttons: number;
  button: number;
  tiltX: number;
  tiltY: number;
  width: number;
  height: number;
  timestamp: number;
  isPen: boolean;
  currentToolId: string;
  rootPath: string;
  isPenMode: boolean;
}

/**
 * Detecção Genérica de Caneta/Stylus via W3C Pointer Events API.
 * Trata canetas e mesas digitalizadoras de forma neutra e padronizada.
 */
export function isGenericStylusEvent(e: GenericPointerLike): boolean {
  return e.pointerType === 'pen' || (e.pointerType as string) === 'stylus';
}

/**
 * Roteamento determinístico da ferramenta ativa ao tocar com caneta/stylus/mesa digitalizadora.
 * Impede que a caneta permaneça acidentalmente em 'hand' após toques ou gestos prévios de pan,
 * respeitando ferramentas selecionadas explicitamente como 'eraser' ou 'select'.
 */
export function resolveStylusTargetTool(selectedTool: string, currentTool: string): string {
  if (currentTool === 'hand') {
    return ['eraser', 'highlight', 'select'].includes(selectedTool) ? selectedTool : 'draw';
  }
  if (['draw', 'eraser', 'highlight', 'select'].includes(selectedTool)) {
    return selectedTool;
  }
  return 'draw';
}
