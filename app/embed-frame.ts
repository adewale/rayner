/** The host loader needs only the frame's accessible name, without the player's vocabulary. */
export function frameTitle(lang = 'en'): string {
  return lang.split('-')[0]!.toLowerCase() === 'fr' ? 'Explication interactive' : 'Interactive explainer';
}
