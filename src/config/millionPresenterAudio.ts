export type PresenterCue =
  | 'intro'
  | 'nextQuestion'
  | 'correct'
  | 'wrong'
  | 'help'
  | 'stop'
  | 'millionWin';

export interface PresenterAudioConfig {
  /** Ative para `true` após colocar os arquivos de voz em `public/audio/presenter/` */
  enabled: boolean;
  /** Caminho/URL de cada fala do apresentador (ex.: "/audio/presenter/faustao-intro.mp3") */
  clips: Record<PresenterCue, string | null>;
}

/**
 * Slot reservado para falas futuras do apresentador (ex.: Faustão).
 * Para ativar depois:
 * 1. Salve os arquivos .mp3/.wav em `public/audio/presenter/`
 * 2. Preencha os caminhos abaixo e altere `enabled: true`
 */
export const MILLION_PRESENTER_AUDIO_CONFIG: PresenterAudioConfig = {
  enabled: false,
  clips: {
    intro: null,
    nextQuestion: null,
    correct: null,
    wrong: null,
    help: null,
    stop: null,
    millionWin: null,
  },
};

export const MILLION_PRESENTER_CUE_LABELS: Record<PresenterCue, string> = {
  intro: 'Abertura do programa',
  nextQuestion: 'Próxima pergunta',
  correct: 'Resposta certa',
  wrong: 'Resposta errada',
  help: 'Chamada de ajuda',
  stop: 'Decisão de parar',
  millionWin: 'Prêmio máximo (R$ 1 Milhão)',
};
